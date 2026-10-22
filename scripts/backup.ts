import { config } from 'dotenv';
import { Client } from 'pg';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
config({ path: '.env.local', quiet: true });
config({ quiet: true });
const sourceUrl = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL || '');
const local = sourceUrl.hostname === '127.0.0.1' && sourceUrl.port === '54329';
const verify = process.argv.includes('--restore-check');
if (verify && !local)
  throw new Error(
    'Restore verification creates a dedicated database and is restricted to the local test server',
  );
await mkdir('.local/backups', { recursive: true });
let key: Buffer;
if (process.env.BACKUP_KEY) key = Buffer.from(process.env.BACKUP_KEY, 'base64');
else if (local) {
  const file = '.local/backup-key';
  if (existsSync(file)) key = Buffer.from((await readFile(file, 'utf8')).trim(), 'base64');
  else {
    key = randomBytes(32);
    await writeFile(file, key.toString('base64'), { mode: 0o600 });
  }
} else
  throw new Error(
    'BACKUP_KEY must be configured securely (32 bytes, base64). Keep the key separate from backups.',
  );
if (key.length !== 32) throw new Error('BACKUP_KEY must decode to exactly 32 bytes');
const source = new Client({ connectionString: sourceUrl.toString() });
await source.connect();
await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
const tables = (
  await source.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename",
  )
).rows.map((r) => r.tablename as string);
const foreignKeys = (
  await source.query(
    "SELECT tc.table_name AS child, ccu.table_name AS parent FROM information_schema.table_constraints tc JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name AND tc.constraint_schema=ccu.constraint_schema WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'",
  )
).rows;
const order: string[] = [],
  pending = new Set(tables);
while (pending.size) {
  let progressed = false;
  for (const t of pending) {
    if (
      foreignKeys
        .filter((f) => f.child === t && f.parent !== t)
        .every((f) => order.includes(f.parent))
    ) {
      order.push(t);
      pending.delete(t);
      progressed = true;
    }
  }
  if (!progressed) throw new Error('Cyclic foreign keys require a pg_dump-based backup strategy');
}
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const records: Record<string, unknown[]> = {};
for (const table of order)
  records[table] = (
    await source.query(`SELECT row_to_json(t) AS row FROM public.${quote(table)} t`)
  ).rows.map((r) => r.row);
await source.query('COMMIT');
await source.end();
const snapshot = Buffer.from(
    JSON.stringify({ version: 1, createdAt: new Date().toISOString(), order, records }),
  ),
  iv = randomBytes(12),
  cipher = createCipheriv('aes-256-gcm', key, iv),
  ciphertext = Buffer.concat([cipher.update(snapshot), cipher.final()]);
const file = `.local/backups/botan-${Date.now()}.json.enc`;
await writeFile(
  file,
  JSON.stringify({
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }),
  { mode: 0o600 },
);
console.log(
  `Encrypted snapshot written: ${file} (${tables.length} tables). No credentials printed.`,
);
if (verify) {
  const envelope = JSON.parse(await readFile(file, 'utf8')),
    decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const restored = JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]).toString(),
  );
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='botan_restore_check' AND pid<>pg_backend_pid()",
  );
  await admin.query('DROP DATABASE IF EXISTS botan_restore_check');
  await admin.query('CREATE DATABASE botan_restore_check');
  await admin.end();
  const targetUrl = new URL(sourceUrl);
  targetUrl.pathname = '/botan_restore_check';
  execFileSync('node', ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: targetUrl.toString(), DIRECT_URL: targetUrl.toString() },
    stdio: 'inherit',
  });
  const target = new Client({ connectionString: targetUrl.toString() });
  await target.connect();
  await target.query('BEGIN');
  for (const table of restored.order) {
    const rows = restored.records[table];
    if (rows.length)
      await target.query(
        `INSERT INTO public.${quote(table)} SELECT * FROM jsonb_populate_recordset(NULL::public.${quote(table)},$1::jsonb)`,
        [JSON.stringify(rows)],
      );
  }
  await target.query('COMMIT');
  const canonical = (rows: unknown[]) =>
    createHash('sha256')
      .update(
        JSON.stringify(
          rows.map((row) => JSON.stringify(row, Object.keys(row as object).sort())).sort(),
        ),
      )
      .digest('hex');
  for (const table of order) {
    const rows = (
      await target.query(`SELECT row_to_json(t) AS row FROM public.${quote(table)} t`)
    ).rows.map((r) => r.row);
    if (canonical(rows) !== canonical(records[table]))
      throw new Error(`Restore content mismatch: ${table}`);
  }
  await target.end();
  console.log(
    `RESTORE VERIFIED: all ${order.length} tables match the encrypted snapshot. Source database was not modified.`,
  );
}
