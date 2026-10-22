# Deploy to Vercel with Supabase

## Supabase

1. Create a Supabase PostgreSQL project in a region close to your Vercel functions. The example Vercel configuration uses Frankfurt (`fra1`); adjust both to your actual region.
2. Obtain the transaction pooler connection string for serverless runtime (`DATABASE_URL`) and a direct or session-pooler connection string for migrations (`DIRECT_URL`). Use the project dashboard's actual host, username and password. URL-encode special password characters and require TLS with certificate verification (`sslmode=verify-full`). Do not put these strings in frontend code or Git.
3. Configure the variables securely in a trusted migration environment, then run `npm ci`, `npm run db:validate`, and `npm run db:migrate`. Review migrations before applying to an existing production database.
4. Set a unique `OWNER_EMAIL` and strong `OWNER_PASSWORD` for the initial seed. Run `npm run db:seed` once from that trusted environment. Repeated seeds preserve the existing password. Remove bootstrap owner credentials from routine build environments afterward.
5. Use a private database owner/server role for the API. The migration enables RLS and supplies no browser-facing policies, preventing anonymous Data API reads. Do not grant public access to application tables.
6. For food images, create a Supabase Storage image bucket with appropriate read/upload policies. Upload reviewed restaurant photos and enter their HTTPS public URLs in menu management. Storage keys stay on the server; this application does not need a public service-role key. Local illustrative asset paths are also supported.

## Vercel

Import this repository as a Next.js project. Use Node 24, `npm ci`, and `npm run build`. The build generates Prisma Client and compiles the application; it intentionally does not apply database migrations or seed production automatically.

Configure production and preview variables separately:

| Variable                        | Purpose                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                  | Supabase transaction pooler connection, with TLS and certificate verification                    |
| `DIRECT_URL`                    | Trusted migration connection; only necessary in migration environments                           |
| `SESSION_SECRET`                | At least 32 random characters, used to derive private tracking tokens; preserve across redeploys |
| `NEXT_PUBLIC_APP_URL`           | Canonical HTTPS application URL; this is the only public variable                                |
| `CRON_SECRET`                   | Independent random secret for authenticated outbox maintenance                                   |
| `OWNER_EMAIL`, `OWNER_PASSWORD` | Initial trusted seed only; not required for normal application runtime                           |
| `BACKUP_KEY`                    | Independent 32-byte base64 encryption key for an external backup job                             |

The `vercel.json` daily cron calls `/api/v1/internal/outbox`; Vercel attaches the configured cron authorization secret. Frequent updates in the UI use normal short-lived API requests. Increase notification processing frequency only when your Vercel plan supports it, or call the authenticated endpoint from a dedicated scheduler.

Do not deploy the local embedded PostgreSQL process to Vercel. No Redis or persistent websocket process is required. Use the database pooler; the driver limits each function instance to three connections.

## Verify the hosted deployment

- `/api/v1/health` must report a connected database.
- Open the customer menu, create a small pickup order, and save its private tracking link.
- Sign in to the staff portal, confirm the order, move it through kitchen preparation and readiness, collect cash, then complete it.
- Verify the receipt, stock ledger, audit log and net revenue.
- Assign a delivery to a test rider and verify an unrelated rider cannot access it.
- Review real prices, contact details, delivery zones, local opening hours, tax treatment, privacy/terms and food photography before enabling public ordering.
- Set up off-site backups, retention, monitoring and a scheduled restore exercise. Enable Supabase backups/PITR according to the selected plan.

## Provider integrations

Cash is implemented. Mobile money, card gateways, SMS, email and WhatsApp are not provisioned. Do not enable a payment method until an adapter validates raw-body signatures, enforces callback idempotency, verifies currency/amount/order ownership and reconciles refunds against actual provider responses. Never implement a webhook that trusts a client-provided `paid` flag.

The system has not been deployed to a live Vercel/Supabase project in this session because those project credentials were unavailable.
