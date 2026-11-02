# Botan Restaurant · Delivery

A staff-only delivery ordering system for one restaurant. Staff sign in and land straight on the order screen, take a
delivery order, assign a rider and follow every order through **Pending → Assigned → Delivered**. There is no customer
website, kitchen board or POS, and no dependency on an outside ordering service (DaljirConnect was removed). Somali is
the interface language.

## Run locally

For hosted setup without a terminal, use the [Supabase SQL Editor instructions](supabase/README.md). The three SQL files create the schema, demo data and an owner account while retaining Prisma migration compatibility.

Requires Node.js 24 and npm. No hosted database credentials are needed for local development.

```sh
npm ci
npm run db:local
```

Keep the database process running. In another terminal:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Open the application on port 3000; it opens on the staff login. The local database launcher generates a unique owner password and saves it to **`.local/login.txt`** with restricted permissions. It also creates `.env.local`. Neither file is tracked. Never use the local development database or credentials in production. Seeding is repeatable and preserves existing records and passwords.

## What it does

| Area            | Behaviour                                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login           | Staff email + password. Owners, managers and order takers land on **Dalab cusub**; riders on the rider portal; accountants on reports.                                                                                  |
| Taking an order | Menu by category with photos and search, modifiers, quantities. Customer phone (a returning number fills in name and address), address, area (sets the fee), delivery fee, rider, discount %, VAT on/off, comment.      |
| Payment         | Cash, EVC Plus, ZAAD or SAHAL with the payer's phone, marked _La qaaday_ (received) or _Lama qaadin_ (to collect). Recorded by hand for now; `src/lib/payments.ts` is ready for provider APIs. Split payments, refunds. |
| Save / Print    | **Save** or **Save & Print** (80 mm receipt). The server re-prices every order; a changed total is rejected. Idempotency keys stop double orders.                                                                       |
| Orders board    | Tabs **Pending · Assigned · Delivered · Cancelled** with counts, date range and search by phone, name, address or order number. Assign or change the rider from the list or the order page.                             |
| Delivery        | Riders sign in on their phone, see only their orders and confirm delivery with a note and the money collected. Staff can confirm delivery for a rider without the app. Managers cancel (stock is returned).             |
| Back office     | Menu, categories, modifiers, delivery areas and fees, riders, staff, pantry (stock deducted per order), suppliers and purchases, expenses, payments, reports (incl. revenue by payment method), audit log, settings.    |

Roles are enforced in the API: `OWNER`, `MANAGER`, `OPERATOR` (order taker), `RIDER`, `ACCOUNTANT`. Cashier accounts
became order takers; former kitchen accounts are suspended by the migration until an owner reviews them.

## Architecture

This implementation adapts the original blueprint to **Vercel + Supabase PostgreSQL**:

- Next.js App Router serves both the interfaces and `/api/v1` API. A permanently running Express server is unnecessary on Vercel.
- Prisma 7 and the PostgreSQL driver adapter use server-side connections. Financial values are stored as PostgreSQL Decimal and calculated in integer cents at checkout.
- Serializable transactions and database constraints protect orders, stock, rider assignment, payments, refunds and purchasing. Concurrent operations retry serialization/uniqueness conflicts with a bounded retry count.
- Orders persist in PostgreSQL. The orders board and rider portal poll every few seconds; there is no dependency on a persistent Socket.IO server.
- A transactional PostgreSQL outbox replaces the blueprint's standalone Redis/BullMQ worker for this serverless deployment. The Vercel daily cron and manager notification endpoint drain in-app events. No external notification delivery is claimed.
- Supabase tables have row-level security enabled with no anonymous policies. The server uses a private database connection. Browser clients never receive database credentials or query tables directly.
- Sessions use random 256-bit tokens; only hashes are stored. Production cookies are Secure, HttpOnly and SameSite=Lax. Passwords use bcrypt. Login and public write limits persist in PostgreSQL.

The server owns all order price calculations. `Idempotency-Key` prevents duplicate orders and refunds. The reviewed checkout total is checked again before placing an order. Order state and payment state remain separate.

## Test

Start the local database first.

```sh
npm run db:validate
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run db:backup -- --restore-check
npm audit --omit=dev
```

`npm test` recreates **only** the dedicated `botan_test` database on the local server at `127.0.0.1:54329`, migrates/seeds it, and runs unit and PostgreSQL integration tests. It refuses remote database resets. Browser tests use the production build against that test database on port 3001, on desktop and mobile Chromium. Run `npm test` before browser tests. The Playwright config uses `/usr/bin/chromium` when installed; otherwise install the matching Playwright Chromium browser.

The encrypted backup command takes a repeatable-read snapshot, encrypts it with AES-256-GCM, migrates a separate local restore database, restores every table in dependency order, and compares the contents of all tables. Local keys and snapshots are stored under `.local/`. For hosted backups, supply a 32-byte base64 `BACKUP_KEY` securely and retain it separately from encrypted backups. Configure scheduled off-site backups and Supabase point-in-time recovery according to the production plan; the local restore test does not establish hosted disaster recovery.

See [docs/TEST_REPORT.md](docs/TEST_REPORT.md) for the recorded run and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for deployment.

## External integrations and production configuration

No Supabase project URL, database credentials or Vercel account were provided; the application runs and is tested
with real local PostgreSQL. EVC Plus, ZAAD and SAHAL are recorded manually; automating them needs each provider's
API documentation and merchant credentials (see `src/lib/payments.ts` and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).
Their endpoints fail closed until then. Seed stock and prices are demonstration data.

## Repository map

- `src/app/`: Next.js entry points and API router.
- `src/components/`: Login, order screen (`order-entry.tsx`), orders board (`orders-board.tsx`), receipt, rider portal and back office (`admin.tsx`).
- `src/lib/`: Authentication, validation, ordering and rider assignment, payments, inventory, accounting and persistence.
- `schema.prisma` and `prisma/migrations/`: Database design, schema migration and SQL constraints/RLS.
- `scripts/`: Local PostgreSQL, seeding, isolated test database and backup/restore.
- `tests/` and `e2e/`: Business-rule, real PostgreSQL, authorization and browser tests.

Food photos are illustrative seed assets from the Foodish dataset, not photographs of Botan's actual dishes. See [public/images/ATTRIBUTION.md](public/images/ATTRIBUTION.md).
