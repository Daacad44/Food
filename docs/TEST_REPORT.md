# Validation report — 21 October 2026

The application was built and exercised in the cloud workspace using Node 24.19.0, Next.js 16.4.2, Prisma 7.10.1, and real local PostgreSQL. Production Supabase and Vercel access were not available.

| Check                                    | Result                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Prisma schema                            | Valid; the original inline-enum and stray-token errors were corrected                                     |
| Database migrations                      | Three committed migrations applied successfully to development, isolated test and restore-check databases |
| Unit tests                               | 8 passed                                                                                                  |
| PostgreSQL/API integration tests         | 25 passed                                                                                                 |
| Production compilation                   | Passed                                                                                                    |
| TypeScript                               | Passed                                                                                                    |
| Desktop Chromium browser tests           | 4 passed                                                                                                  |
| Mobile Chromium browser tests            | 4 passed                                                                                                  |
| Encrypted backup and independent restore | Passed; all 37 application tables matched by content hash                                                 |
| Production dependency audit              | 0 reported vulnerabilities at the time of testing                                                         |

## Business and security behaviours exercised

- Server-owned pricing, valid modifier selection, integer-cent totals and invalid-discount rejection.
- Concurrent duplicate order requests produce one order; changed payloads cannot reuse an idempotency key.
- Reviewed-price changes and ordering by non-cashier staff are rejected.
- Inventory is consumed once on confirmation, cannot go negative, and is restored by auditable cancellation movements.
- Kitchen roles can prepare and mark ready, but cannot confirm orders or access finance/contact data.
- A rider sees only assigned orders and cannot progress another rider's delivery.
- Unpaid orders cannot complete. Cash capture, split cash tenders, partial/full refunds and duplicate refund retries reconcile correctly.
- Coupons are validated and usage is restored on rejection/cancellation.
- Purchase receiving increments inventory once, even if repeated.
- Cashier shift closing compares counted cash against recorded cash captures.
- Finance totals match captures less refunds, with daily reporting in Africa/Mogadishu.
- Transactional outbox events create in-app notifications once.
- Anonymous administration, cross-origin writes, client price tampering and unauthenticated capture are rejected.
- Staff password hashes and customer tracking/contact data remain restricted.
- Session logout revokes access; foreign customer addresses cannot be deleted.
- Dine-in orders require a valid table QR token or staff access.
- Partial updates preserve fields that were omitted from a request.
- Database CHECK constraints reject invalid stock values.

## Browser journeys

Each journey passed on desktop and mobile Chromium using the production build:

1. Browse a dish, choose a modifier, add it to the cart, review the server total, place a pickup order and open its private tracking page.
2. Sign in as owner, view the dashboard, edit a dish, open the kitchen display and view finance reporting.
3. Switch language, use mobile navigation, check layout overflow and verify unauthenticated staff portals require sign-in.
4. Generate a protected printable table QR, open its customer menu, place a dine-in order and receive a tracking page without staff access.

Initial browser checks found a reverse-proxy origin-validation issue and form-label/select-initialization problems. Those were corrected; the final suite passed.

## Limits of this run

- Hosted Supabase connectivity and a live Vercel deployment were not tested or performed.
- Mobile-money/card payments, provider webhooks, SMS/email/WhatsApp delivery and merchant settlement remain unconfigured. Payment-provider endpoints fail closed; no successful external transaction is claimed.
- Polling/reconnect behaviour is implemented; this is not a persistent websocket deployment.
- The backup verification was local. Production backup scheduling, off-site retention, Supabase PITR and production restoration still require hosted configuration.
- Seed menu/prices/contact information and illustrative photographs are development data. Public-launch acceptance, accessibility certification, production load testing and external security review were not performed.

The results demonstrate a working local development and test workflow; they do not certify public production readiness.

## Menu and delivery tracking update — 23 October 2026

- Prisma validation, production build and TypeScript checks passed.
- 39 unit/PostgreSQL integration tests passed, including private-link parsing, delivery response redaction and authenticated order ownership.
- 14 browser tests passed across desktop and mobile Chromium. Added journeys cover description search, available-only filtering, private-code entry, saved-order recovery, and real database-backed delivery progression from received to out-for-delivery to delivered.
- API responses show delivery milestones without revealing customer addresses, rider contact information or proof-of-delivery notes. Tracking is status-based, with five-second polling; it does not claim live GPS.
- No schema migration or production menu-data mutation is required. Staff continue to manage actual menu items and prices through the existing admin interface.
- The supplied live domain could not be inspected from this cloud environment: its outbound proxy returned HTTP 403 for the connection. These results validate the repository and local production build, not a new live deployment.
