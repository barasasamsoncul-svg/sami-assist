# SaMi Errands

SaMi Errands is a marketplace for all kinds of legitimate everyday errands—shopping, clothing purchases and returns, pickups and drop-offs, document/admin tasks, bookings and queues, personal errands, business support, local assistance and any other lawful task a customer can describe. The "other legitimate errand" category keeps the service open to new needs without constraining the product to deliveries.

## Customer pricing model (no quotation step)

1. Customer describes the errand, location, timing and any relevant details.
2. The current category fee and priority multiplier are shown before the request is submitted.
3. Customer chooses cash or in-app payment for the errand-service fee.
4. Operations assigns an approved provider directly; the customer does not wait for or approve a separate quote.
5. For shopping/clothing errands, the estimated goods budget is tracked separately. Goods are paid to the seller separately when the item is bought/received. They are not part of SaMi's service fee or commission base.
6. Provider accepts, starts, messages relevant parties, records seller payment proof if applicable, submits completion notes, and the customer confirms or disputes.
7. Operations tracks service-fee payments, provider payouts, refunds and reconciliation.

## Commission

Each service category has a configurable base service fee, SaMi commission percentage and low/standard/high/urgent multipliers. The service fee is calculated from the database pricing rule when the request is created and saved with the request, so later price changes do not retroactively change existing errands.

- Errand service fee: what the customer pays for the work of handling the errand.
- SaMi commission: the configured percentage of the errand service fee.
- Provider share: the remainder of the service fee after SaMi commission.
- Goods/seller cost: separate; paid to the seller and excluded from SaMi commission.

Administrators can manage fees, commission and priority multipliers from the Service pricing area. Pricing changes are audited.

## Roles and responsibilities

- Customers/businesses: submit freeform lawful tasks, see the service fee upfront, choose cash or in-app service payment, track updates, message participants, confirm completion or raise a dispute, and rate providers.
- Providers/provider businesses: maintain a service profile, list categories and service areas, submit for approval, control availability, accept/decline assigned tasks, update progress and submit completion notes. Seller/goods payment is a separate record.
- Operations: approve/suspend providers, assign requested errands directly, review disputes, record verified service payments, seller payments, provider payouts and refunds, and reconcile the ledger.

## Current payment status

Cash selection and service-fee/payment ledgers are implemented. In-app payment selection is saved as pending, and an operator must enter a verified transaction reference before the errand is marked paid. A live payment-gateway checkout/callback is not connected yet because it requires a selected payment provider and its merchant credentials; the app must never mark an unverified payment as successful. Seller/goods payment records are distinct from SaMi service payments.

## Runtime and database

- Next.js App Router on Vercel.
- PostgreSQL accessed server-side using pg.
- Separate Neon project SaMi Errands Development, isolated from the old SaMi database.
- Dedicated database role sami_errands_app.
- Password hashes use bcrypt; sessions use random opaque values, with only SHA-256 hashes persisted. Cookies are HttpOnly, SameSite=Lax and Secure in production.
- Authentication attempts are rate-limited by hashed identifiers. Server-side operations enforce role and resource ownership. Errand state changes are recorded in the timeline.

## Preview testing

The feat/sami-errands-transformation branch uses a Preview-only database connection and one-time first-admin token. The source code contains no secret values. Open /admin-setup on Preview to create the first admin with the private bootstrap token. This route stops working once an administrator exists.

Health check: /api/dispatch?action=health. It returns database connectivity and schema version without credentials.

Tests: npm test; the Vercel build runs the schema checks before next build. Release testing must cover signup/login, admin bootstrap, provider application/approval/availability, service fee preview, errand creation, direct assignment, accept/decline/start/completion, messages/timeline, seller payment tracking, customer confirmation/dispute/rating, cash payment recording, in-app payment-reference verification, payout/refund/reconciliation and unauthorized access checks.

A Vercel build and database health check do not prove every end-to-end browser payment flow. A live checkout cannot be tested until a gateway is configured with credentials. Do not promote to production until the end-to-end role and payment flows pass.

## Later hosting migration

The current application is Next.js and needs a compatible Node.js host, or a deliberate port if a future shared-hosting package supports PHP only. The domain name itself does not determine runtime compatibility. Migrate data only after testing schema and export/import against the final host.

## Safety of this conversion

The change stays on feat/sami-errands-transformation. main, its history, the old database and production deployment have not been switched to Errands by these changes.
