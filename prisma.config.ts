import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';
config({ path: '.env.local', quiet: true });
config({ quiet: true });
export default defineConfig({
  schema: 'schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx scripts/seed.ts' },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://localhost:5432/botan',
  },
});
