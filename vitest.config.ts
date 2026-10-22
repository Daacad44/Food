import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = '/botan_test';
  process.env.DATABASE_URL = url.toString();
  process.env.DIRECT_URL = url.toString();
}
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
});
