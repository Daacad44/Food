import EmbeddedPostgres from 'embedded-postgres';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
await mkdir('.local', { recursive: true });
if (process.env.VERCEL) throw new Error('Local PostgreSQL must not run on Vercel');
const databaseDir = process.cwd() + '/.local/postgres';
const passwordFile = '.local/db-password';
let password: string;
if (existsSync(passwordFile)) password = (await readFile(passwordFile, 'utf8')).trim();
else {
  password = randomBytes(24).toString('hex');
  await writeFile(passwordFile, password, { mode: 0o600 });
}
const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'botan',
  password,
  port: 54329,
  persistent: true,
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: console.error,
});
if (!existsSync(databaseDir + '/PG_VERSION')) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const result = await client.query("SELECT 1 FROM pg_database WHERE datname='botan'");
await client.end();
if (!result.rowCount) await pg.createDatabase('botan');
if (!existsSync('.env.local')) {
  const ownerPassword = randomBytes(18).toString('base64url');
  await writeFile(
    '.env.local',
    `DATABASE_URL=postgresql://botan:${password}@127.0.0.1:54329/botan\nDIRECT_URL=postgresql://botan:${password}@127.0.0.1:54329/botan\nSESSION_SECRET=${randomBytes(48).toString('hex')}\nCRON_SECRET=${randomBytes(32).toString('hex')}\nOWNER_EMAIL=owner@botan.local\nOWNER_PASSWORD=${ownerPassword}\nNEXT_PUBLIC_APP_URL=http://localhost:3000\n`,
    { mode: 0o600 },
  );
  await writeFile(
    '.local/login.txt',
    `Local development only\nEmail: owner@botan.local\nPassword: ${ownerPassword}\n`,
    { mode: 0o600 },
  );
}
console.log(
  'Local PostgreSQL ready on 127.0.0.1:54329. Local credentials: .local/login.txt. Run npm run db:migrate && npm run db:seed in another terminal.',
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
setInterval(() => {}, 60000);
