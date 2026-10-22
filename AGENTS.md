# Botan development

- Use the existing checkout. Cloud tasks are isolated; do not create a worktree unless explicitly requested.
- Deployment target is Vercel with Supabase PostgreSQL. The original blueprint's Coolify/Express/Redis/Socket.IO deployment was adapted to Next.js routes, PostgreSQL outbox and short polling.
- Node 24; use the committed npm lockfile. In this cloud machine set `npm_config_cache=/workspace/.npm-cache` if the home cache is unavailable.
- Keep credentials out of Git and logs. `.env.local`, `.local/` and generated test output are ignored.
- Start local PostgreSQL with `npm run db:local`, then migrate/seed before starting the app. Unique local login credentials are in `.local/login.txt`; do not dump the file into tool output.
- Tests use an isolated local database. `npm test` refuses to reset remote databases. Run `npm test`, `npm run build`, `npm run test:e2e`, and `npm run typecheck` for changes affecting ordering or authentication.
- Preserve integer-cent arithmetic at API boundaries and Decimal fields in PostgreSQL. Keep financial writes, order transitions, coupons, stock and outbox in serializable transactions.
- Enforce role and object ownership in API code. Never expose staff hashes or customer contact information through tracking and kitchen endpoints.
- Payment integrations fail closed until real provider documentation and credentials are available. Do not simulate successful online payments.
