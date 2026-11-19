# Deploy to Vercel with Supabase

## Supabase

**No terminal available?** Use [supabase/README.md](../supabase/README.md) and run the three supplied SQL files in Supabase SQL Editor instead of the npm migration/seed steps below. Vercel environment variables remain required.

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
- Open **Isticmaalayaasha**, add a cashier and a rider with temporary passwords, and sign in as each once to set their own passwords.
- Sign in: you land on **Dalab cusub**. Take a small delivery order (phone, address, items) and **Save & Print**.
- Open **Dalabyada**: it is under _Pending_. Assign a test rider; it moves to _Assigned_.
- Sign in as that rider on a phone, open the order and confirm delivery with payment collected; it moves to _Delivered_.
- Verify the receipt, stock ledger, audit log, payments by method and net revenue.
- Review real prices, contact details, delivery zones (fees), VAT rate and food photography before going live.
- Set up off-site backups, retention, monitoring and a scheduled restore exercise. Enable Supabase backups/PITR according to the selected plan.

## Payments: cash and WaafiPay mobile money

Staff choose **Cash** or **Mobile money**. For mobile money the wallet follows the payer's number:
61/77/78 Hormuud EVC Plus · 68 Somnet Jeeb · 63 Telesom ZAAD · 67 Soltelco Kaash Plus · 60/72/90 Golis SAHAL ·
70 Durdur Kayd · 62/65/66/76 Somtel eDahab · 69 NationLink e-Maal · 71/75 Amtel MyCash.

With WaafiPay connected, **Dir hadda** (after Save), **Dir codsiga lacagta** on the order page and on the rider's phone
send `API_PURCHASE` to WaafiPay; the customer's phone asks for their PIN and the payment is recorded when WaafiPay
answers `APPROVED`. One request at a time per payment (3-minute lock); declines are shown in plain words and can be
retried from another number; the amount always comes from the order on the server.

Set these on the server (Coolify → Environment Variables, or Vercel → Settings → Environment Variables), then redeploy:

| Variable               | Value                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `WAAFI_MERCHANT_UID`   | Merchant UID from WaafiPay                                                                  |
| `WAAFI_API_USER_ID`    | API user ID from WaafiPay                                                                   |
| `WAAFI_API_KEY`        | API key from WaafiPay                                                                       |
| `WAAFI_ENV`            | `sandbox` while testing, `production` for real money                                        |
| `WAAFI_WEBHOOK_SECRET` | Secret returned when you register `https://YOUR-DOMAIN/api/v1/webhooks/waafi` with WaafiPay |

The webhook records payments whose direct answer was lost (e.g. a timeout); it is verified with HMAC-SHA256 and
stale or repeated events are rejected. Settings shows whether WaafiPay is connected. Without the variables, mobile
money is recorded by hand as before. Refunds are recorded in Botan; reversing the money in WaafiPay is done in the
WaafiPay merchant portal. SMS, email and WhatsApp are not provisioned.
