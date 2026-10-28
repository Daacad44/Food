# Botan Restaurant

A working single-restaurant ordering and management application. Somali is the default customer language with an English toggle. The responsive design uses forest green, warm gold, cream, Space Grotesk and Inter. Fonts and sample food assets are served locally.

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

Open the application on port 3000. Staff login is `/login?staff=1`. The local database launcher generates a unique owner password and saves it to **`.local/login.txt`** with restricted permissions. It also creates `.env.local`. Neither file is tracked. Never use the local development database or credentials in production. Seeding is repeatable and preserves existing records and passwords.

## Workflows implemented

| Area       | Behaviour                                                                                                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer   | Homepage, categories, search, dish details, modifiers, cart, server-priced checkout, delivery zones, pickup, coupons, cash payment, private order tracking                                                     |
| Accounts   | Registration, customer/staff login, opaque HTTP-only sessions, rotation/logout, order history, saved addresses, completed-order reviews and manager moderation                                                 |
| Admin      | Revenue dashboard, live orders, detailed receipts, menu/category/modifier CRUD, dish-option assignments, customer list, settings and opening hours                                                             |
| Kitchen    | New/preparing/ready/history boards, elapsed timers, special instructions, optional sound, database polling and reconnect recovery                                                                              |
| POS        | Touch-friendly menu, dine-in/pickup/delivery orders, tables with printable QR codes, customer dine-in ordering, active bills, split cash tenders, printable receipts, opening/closing shifts and cash variance |
| Delivery   | Rider accounts, manager assignments, assigned-order visibility, pickup/delivery confirmations with proof notes, cash collection and delivery history                                                           |
| Inventory  | Ingredients, thresholds, recipe quantities, audited stock adjustments, one-time consumption on confirmation, compensating cancellation movements                                                               |
| Purchasing | Suppliers, purchase orders with multiple lines, atomic one-time receiving, weighted stock costs                                                                                                                |
| Finance    | Captured cash, partial/full idempotent refunds, expenses, purchases, daily revenue, top dishes, CSV export and cash reconciliation                                                                             |
| Operations | Staff roles, suspension and session revocation, audit log, durable outbox and in-app notifications, health endpoint, encrypted backup with restore verification                                                |

`OWNER`, `MANAGER`, `CASHIER`, `CHEF`, `RIDER`, `ACCOUNTANT` and customer access are enforced in the API, not just by hiding navigation. Public tracking excludes names, phone numbers, addresses, payment references and staff identities. Kitchen responses exclude customer contact and payment information.

## Architecture

### Menu and delivery tracking

- `/menu` supports category browsing, dish-name/description search and an available-only filter. Clear filters to return to the full menu. Real dishes and prices are managed at `/admin/menu`; no live restaurant menu data is invented or published by this change.
- `/track` (also `/track-order`) accepts a private tracking link or its 64-character code. It can reopen the most recent checkout saved in the same browser tab. An order number alone cannot reveal an order.
- `/track/[token]` shows preparation and delivery milestones, rider assignment/pickup/delivery timestamps, payment state, order activity and a copy-link button. Updates poll every five seconds; a failed refresh retains the last successful view with a stale-data notice. This is status tracking, not live GPS.
- Signed-in customers can track their own orders from `/account/orders`, even without the original guest tracking link. The API checks ownership and returns 404 for another customer's order.
- Tracking responses exclude customer contact/address information, rider identity/contact details, tracking-token hashes and delivery proof notes. Keep capability links private.

This implementation adapts the original blueprint to **Vercel + Supabase PostgreSQL**:

- Next.js App Router serves both the interfaces and `/api/v1` API. A permanently running Express server is unnecessary on Vercel.
- Prisma 7 and the PostgreSQL driver adapter use server-side connections. Financial values are stored as PostgreSQL Decimal and calculated in integer cents at checkout.
- Serializable transactions and database constraints protect orders, coupon limits, stock, refunds, purchasing and shifts. Concurrent operations retry serialization/uniqueness conflicts with a bounded retry count.
- Orders persist in PostgreSQL. Kitchen, rider and tracking interfaces poll every 4–5 seconds. They recover after reconnecting; there is no dependency on a persistent Socket.IO server.
- A transactional PostgreSQL outbox replaces the blueprint's standalone Redis/BullMQ worker for this serverless deployment. The Vercel daily cron and manager notification endpoint drain in-app events. No external notification delivery is claimed.
- Supabase tables have row-level security enabled with no anonymous policies. The server uses a private database connection. Browser clients never receive database credentials or query tables directly.
- Sessions use random 256-bit tokens; only hashes are stored. Production cookies are Secure, HttpOnly and SameSite=Lax. Passwords use bcrypt. Login and public write limits persist in PostgreSQL.

The server owns all order price calculations. `Idempotency-Key` prevents duplicate orders and refunds. The reviewed checkout total is checked again before placing an order. Order state and payment state remain separate.

## Driver assignment and delivery completion

Owners and managers can add drivers from **Delivery → Ku dar darawal**, or directly inside a delivery order's **Darawalka** section. The dedicated create-driver endpoint always creates an active `RIDER` account; it cannot grant another role. Set a name, email and a 12+ character password, then select that driver and click **U qoondee darawal** on the order. Dispatch is disabled until a driver is assigned; suspended drivers cannot be dispatched.

Drivers sign in using **Staff login** and open `/rider`. They can pick up only their assigned ready orders and confirm delivery with a proof note. Cash must be explicitly confirmed; only the outstanding balance of split tenders is captured. The cash captures, payment status, delivery completion, audit records and integration outbox changes commit in one transaction. Retrying completion does not collect money again.

An owner or manager may also use **Dhammee gaarsiinta → Xaqiiji in la geeyey** on a ready or dispatched delivery order, even when no app driver was assigned. This records an explicit admin confirmation instead of requiring a fictitious driver/pickup. It still requires a delivery note and either a settled payment or confirmed cash collection. Refunded orders and unsettled non-cash payments cannot be completed this way. Cashiers and kitchen staff cannot use this override.

Driver assignment is locked after dispatch and terminal order states. To review the actor, amount and completion note, use the existing audit log and order history. No additional database migration is required for this workflow.

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

No Supabase project URL, database credentials, Vercel account or payment merchant credentials were provided. The application runs and is tested with real local PostgreSQL. A live Vercel deployment and Supabase connectivity have **not** been performed.

Cash collection, split cash tenders and refunds work. EVC Plus, ZAAD, SAHAL, card payment, SMS, email and WhatsApp adapters require verified provider documentation and merchant/service credentials. Their endpoints fail closed rather than simulating a payment or accepting unsigned callbacks. Stock and prices in the seed are demonstration data. Contact details, restaurant photos, terms and operating hours must be replaced with the restaurant's actual information before public launch.

## Repository map

- `src/app/`: Next.js entry points and API router.
- `src/components/`: Customer and staff interfaces.
- `src/lib/`: Authentication, validation, ordering, inventory, accounting and persistence.
- `schema.prisma` and `prisma/migrations/`: Database design, schema migration and SQL constraints/RLS.
- `scripts/`: Local PostgreSQL, seeding, isolated test database and backup/restore.
- `tests/` and `e2e/`: Business-rule, real PostgreSQL, authorization and browser tests.

Food photos are illustrative seed assets from the Foodish dataset, not photographs of Botan's actual dishes. See [public/images/ATTRIBUTION.md](public/images/ATTRIBUTION.md).
