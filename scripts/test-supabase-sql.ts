import { config } from 'dotenv';
import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { compare } from 'bcryptjs';
config({ path: '.env.local', quiet: true });
const url = new URL(process.env.DATABASE_URL || '');
assert(
  url.hostname === '127.0.0.1' && url.port === '54329',
  'SQL setup verification is restricted to local test PostgreSQL',
);
url.pathname = '/postgres';
const admin = new Client({ connectionString: url.toString() });
await admin.connect();
await admin.query(
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='botan_sql_check' AND pid<>pg_backend_pid()",
);
await admin.query('DROP DATABASE IF EXISTS botan_sql_check');
await admin.query('CREATE DATABASE botan_sql_check');
await admin.end();
url.pathname = '/botan_sql_check';
const client = new Client({ connectionString: url.toString() });
await client.connect();
const schema = await readFile('supabase/01-schema.sql', 'utf8');
const seed = await readFile('supabase/02-demo-data.sql', 'utf8');
const owner = await readFile('supabase/03-admin.sql', 'utf8');
// A non-Botan table must retain its original RLS setting and data.
await client.query(
  'CREATE TABLE public.unrelated_demo (id integer); INSERT INTO public.unrelated_demo VALUES (42)',
);
await client.query(schema);
await client.query(schema);
assert.equal(
  (await client.query('SELECT count(*)::int AS count FROM "_prisma_migrations"')).rows[0].count,
  3,
);
assert.equal(
  (
    await client.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid='public.unrelated_demo'::regclass",
    )
  ).rows[0].relrowsecurity,
  false,
);
assert.equal((await client.query('SELECT id FROM unrelated_demo')).rows[0].id, 42);
await client.query('DROP TABLE unrelated_demo');
await client.query(seed);
await client.query(seed);
assert.equal(
  (await client.query('SELECT count(*)::int AS count FROM "MenuItem"')).rows[0].count,
  10,
);
assert.equal(
  (await client.query('SELECT count(*)::int AS count FROM "DiningTable"')).rows[0].count,
  8,
);
assert.equal(
  (await client.query('SELECT count(*)::int AS count FROM "ModifierOption"')).rows[0].count,
  2,
);
await client.query('UPDATE "MenuItem" SET "basePrice"=8.75 WHERE slug=\'beef-burger\'');
await client.query('UPDATE "InventoryItem" SET "quantityOnHand"=76');
await client.query(seed);
assert.equal(
  Number(
    (await client.query('SELECT "basePrice" FROM "MenuItem" WHERE slug=\'beef-burger\'')).rows[0]
      .basePrice,
  ),
  8.75,
);
assert.equal(
  Number(
    (await client.query('SELECT "quantityOnHand" FROM "InventoryItem"')).rows[0].quantityOnHand,
  ),
  76,
);
await assert.rejects(client.query(owner), /Choose a NEW password/);
await client.query('ROLLBACK');
const password = randomBytes(24).toString('hex');
await client.query(owner.replace("'REPLACE_WITH_A_NEW_PASSWORD';", `'${password}';`));
const hash = (
  await client.query('SELECT "passwordHash" FROM "StaffUser" WHERE email=\'botan@gmail.com\'')
).rows[0].passwordHash;
assert(
  await compare(password, hash),
  'pgcrypto bcrypt hashes must match application authentication',
);
await client.query(
  owner.replace("'REPLACE_WITH_A_NEW_PASSWORD';", `'${randomBytes(24).toString('hex')}';`),
);
assert.equal(
  (await client.query('SELECT "passwordHash" FROM "StaffUser" WHERE email=\'botan@gmail.com\''))
    .rows[0].passwordHash,
  hash,
);
await client.end();
const env = { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString() };
execFileSync('node', ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
  env,
  stdio: 'inherit',
});
execFileSync(
  'node',
  [
    'node_modules/prisma/build/index.js',
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema',
    'schema.prisma',
    '--exit-code',
  ],
  { env, stdio: 'inherit' },
);
process.env.DATABASE_URL = url.toString();
process.env.DIRECT_URL = url.toString();
const { POST, GET, PATCH } = await import('../src/app/api/v1/[...path]/route');
const { db } = await import('../src/lib/db');
let cookie = '';
async function api(
  path: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const request = new Request('http://localhost:3000/api/v1/' + path, {
    method,
    headers: { 'content-type': 'application/json', cookie, ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const handler = method === 'GET' ? GET : method === 'PATCH' ? PATCH : POST;
  const response = await handler(request, { params: Promise.resolve({ path: path.split('/') }) });
  assert(
    response.ok,
    `SQL-bootstrapped application request failed: ${method} ${path} (${response.status})`,
  );
  return response;
}
const login = await api('auth/staff/login', 'POST', { email: 'botan@gmail.com', password });
cookie = login.headers.get('set-cookie')!.split(';')[0];
const menu = await (await api('menu/items')).json();
assert.equal(menu.length, 10);
await api('health');
const burger = menu.find((item: { slug: string }) => item.slug === 'beef-burger');
const order = await (
  await api(
    'orders',
    'POST',
    {
      items: [
        { menuItemId: burger.id, quantity: 1, modifierOptionIds: [], specialInstructions: '' },
      ],
      type: 'PICKUP',
      guestName: 'SQL setup test',
      guestPhone: '+252610000001',
    },
    { 'idempotency-key': randomUUID() },
  )
).json();
for (const status of ['CONFIRMED', 'PREPARING', 'READY'])
  await api(`admin/orders/${order.id}/status`, 'PATCH', { status });
const details = await (await api('admin/orders/' + order.id)).json();
await api(`payments/${details.payments[0].id}/capture`, 'POST', {});
await api(`admin/orders/${order.id}/status`, 'PATCH', { status: 'COMPLETED' });
const tracked = await (await api('orders/track/' + order.token)).json();
assert.equal(tracked.status, 'COMPLETED');
assert.equal(tracked.paymentStatus, 'PAID');
await db.$disconnect();
console.log(
  'SQL SETUP VERIFIED: repeatable schema/seed, preserved existing data, bcrypt staff login, Prisma migration compatibility, menu, checkout, stock, cash capture and tracking. No hosted database was changed.',
);
