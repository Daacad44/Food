import { config } from 'dotenv';
import { Client } from 'pg';
import { execFileSync } from 'node:child_process';
config({ path: '.env.local', quiet: true });
const url = new URL(process.env.DATABASE_URL || '');
if (url.hostname !== '127.0.0.1' || url.port !== '54329')
  throw new Error('Test reset is restricted to the local database on 127.0.0.1:54329');
url.pathname = '/postgres';
const client = new Client({ connectionString: url.toString() });
await client.connect();
await client.query(
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'botan_test' AND pid <> pg_backend_pid()",
);
await client.query('DROP DATABASE IF EXISTS botan_test');
await client.query('CREATE DATABASE botan_test');
await client.end();
url.pathname = '/botan_test';
const env = { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString() };
execFileSync('node', ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
  env,
  stdio: 'inherit',
});
execFileSync('node', ['--import', 'tsx', 'scripts/seed.ts'], { env, stdio: 'inherit' });
console.log('Isolated local test database prepared.');
