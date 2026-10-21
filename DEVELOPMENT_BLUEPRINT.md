# Botan Restaurant — Single Restaurant Development Blueprint

## Scope
One restaurant with role-separated customer, admin, kitchen, POS, rider, and finance experiences. Guest checkout supported; one future branch should require an explicit migration rather than an accidental multi-tenant rewrite.

## Architecture
- Next.js App Router + TypeScript customer + internal role-protected portal (or separate deployments from a monorepo).
- Express + TypeScript REST API, DTO schemas validated with Zod.
- PostgreSQL + Prisma ORM 7 syntax; transaction boundaries for placing orders, payments, stock deductions and order transitions.
- Redis + BullMQ for notification, retry, and outbox jobs.
- Socket.IO for live order event fanout; PostgreSQL remains the source of truth.
- Object storage for food images and receipts.
- Provider-specific payment adapters; provider availability, merchant approval and API documentation must be verified before live integrations.
- HTTPS reverse proxy, Docker, Coolify, managed backup storage and health probes.

## Backend modules
1. auth: staff login, refresh rotation, customer authentication, RBAC
2. restaurant: settings, opening hours, availability
3. catalog: categories, menu items, modifier groups, pricing
4. customers: accounts, addresses, customer history
5. checkout: price revalidation, stock availability, delivery zone validation, coupons
6. orders: creation, status state machine, order event audit, guest tracking token
7. payments: initiation, callback signature validation, refunds, reconciliation
8. kitchen: queue, fulfillment status changes, audible notifications
9. delivery: assignment, pickup, completion, return/failure
10. pos: dine-in, table QR, cashier shifts, receipts, tender splits (enhancement)
11. inventory: stock ledger, recipes, consumption and purchase receiving
12. marketing: coupons, reviews, promotions, loyalty (enhancement)
13. finance: expenses, sales reconciliation, margin reports
14. notifications: in-app, email, SMS, WhatsApp adapters and queue
15. security/audit: action logs, rate limits, session revocation

## API outline (base /api/v1)
Public:
GET /restaurant; GET /menu/categories; GET /menu/items; GET /menu/items/:slug; GET /delivery/zones
POST /checkout/quote; POST /orders; GET /orders/track/:token; POST /payments/:id/initialize
POST /auth/customer/register; POST /auth/customer/login; GET /customers/me/orders

Staff:
POST /auth/staff/login; POST /auth/refresh; POST /auth/logout
GET /admin/summary; GET /admin/orders; GET /admin/orders/:id; PATCH /admin/orders/:id/status
CRUD /admin/menu/categories; CRUD /admin/menu/items; CRUD /admin/menu/modifier-groups
CRUD /admin/delivery/zones; CRUD /admin/delivery/riders; PATCH /admin/deliveries/:id
GET /kitchen/orders; PATCH /kitchen/orders/:id/status
POST /pos/orders; GET /pos/tables; PATCH /pos/tables/:id; POST /pos/shifts; PATCH /pos/shifts/:id/close
CRUD /admin/inventory/items; POST /admin/inventory/movements; CRUD /admin/suppliers; POST /admin/purchases
CRUD /admin/coupons; GET /admin/finance/sales; CRUD /admin/expenses; GET /admin/reports
GET /admin/audit-logs; CRUD /admin/staff; PATCH /admin/restaurant/settings

Provider callbacks:
POST /webhooks/payments/:provider (raw body verification, idempotent event handling)

## Main routes
Customer: /, /menu, /menu/[slug], /cart, /checkout, /order/success, /track/[token], /offers, /about, /contact, /faq, /login, /register, /account, /account/orders, /account/addresses
Admin: /admin, /admin/orders, /admin/orders/[id], /admin/menu, /admin/categories, /admin/modifiers, /admin/customers, /admin/inventory, /admin/suppliers, /admin/purchases, /admin/staff, /admin/delivery, /admin/delivery/zones, /admin/tables, /admin/coupons, /admin/payments, /admin/expenses, /admin/reports, /admin/settings, /admin/audit
Kitchen: /kitchen (New, Preparing, Ready, History views)
POS: /pos, /pos/tables, /pos/bills, /pos/payments, /pos/shifts
Rider: /rider, /rider/orders, /rider/delivery/[id], /rider/history, /rider/profile

## Critical design rules
- `Order.status` is an operational lifecycle, `Order.paymentStatus` is financial state; do not conflate them.
- Calculate money on server in Decimal or integer minor units. Never trust client totals.
- Only accept permitted state transitions; record OrderStatusEvent with actor and timestamp.
- Idempotency key for order creation; payment initiation and callbacks must also be idempotent.
- `OrderItem` keeps immutable name, unit price and modifier snapshots.
- Guest tracking uses a cryptographically strong secret; store only its hash, with verified-phone or ownership checks for revealing sensitive details.
- Recheck availability/hours, zone, coupon and inventory at checkout. Deduct inventory at a documented fulfillment milestone exactly once. For cancelled orders, use compensating inventory movements.
- Persist a durable outbox event with domain writes so notification crashes cannot lose event delivery. Handle queue retries and DLQ.
- For cashier shifts, compare cash drawer to recorded cash tender; financial reports separately treat refunds, costs, discounts and tax.
- Follow OWASP API risks: authorize every object ID, least privilege, no cross-role leaks, input throttling.
- Backup encrypted DB daily; test restorations, audit log retention and secret rotation.
- Add schema constraints for rating 1..5, hours validation, modifier min/max, positive quantities and totals (SQL CHECK migrations), since Prisma schema alone does not enforce them.
- Keep customer phone, address and payment references protected and minimize personal data.

## Delivery milestones
### Phase 0 — Architecture and setup (2-3 days)
Monorepo, CI, lint/format, Docker, Prisma schema, seed demo data, API spec, env examples and brand design tokens.
### Phase 1 — Ordering MVP (10-15 days)
Responsive customer pages, menu CRUD, cart, guest checkout, restaurant operating hours, delivery fees, cash/manual payment, admin live orders, kitchen processing, order tracking.
### Phase 2 — Payments and operations (7-12 days)
Verified mobile money provider adapters (subject to approval), cashier POS, rider workflow, queues, notifications, printed receipts, role permissions.
### Phase 3 — Business controls (7-12 days)
Inventory and recipes, purchase receiving, expenses, dashboards, coupon engine, reports, reviews and customer profiles.
### Phase 4 — Launch readiness (5-7 days)
End-to-end tests, load checks, security review, accessibility, incident monitoring, backup restoration, privacy/terms, operational training and controlled deployment.

## Acceptance tests
- New guest buys available menu item; backend recalculates correct total; no client price tampering.
- Same idempotency key cannot create duplicate order or charge.
- Payment callback rejected without valid signature; duplicated event does not double-charge.
- Payment failed does not move order to paid; partial/full refund totals reconcile.
- Kitchen receives order, reconnects safely after being offline and processes once.
- Rider sees only assigned deliveries; guest cannot view other customer's addresses.
- Cancelled order restocks through an auditable compensating event.
- Report totals equal payment captures net of refunds, scoped to restaurant timezone.
- Restoring most recent encrypted database backup is verified.

## Suggested repository layout
apps/web/ — customer website
apps/portal/ — admin, kitchen, POS, rider
apps/api/ — Express API
apps/worker/ — BullMQ background workers
packages/db/ — Prisma schema/migrations
packages/contracts/ — Zod schemas, API types
packages/ui/ — shared UI kit
infra/ — Docker/Coolify files

## Prisma note
The schema is written in Prisma ORM 7-style syntax with `prisma-client-js`; database URL belongs in `prisma.config.ts` for versions that require it. Pin Prisma and Prisma Client to the same reviewed version and run `prisma validate`, migrations and typechecks before deployment. This is an architecture starting point, not a claim of a migrated or tested running application.
