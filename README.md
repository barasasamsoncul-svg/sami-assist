# SaMi

## Brand system

- **Brand name:** SaMi. Use only “SaMi” as the customer-facing product and company mark; do not add a category suffix to the wordmark.
- **Parent-company identity:** SaMi Technologies may be used on formal corporate materials, but the product itself is branded simply as **SaMi**.
- **Wordmark:** use the shared `components/Brand.tsx` component. It displays the SaMi mark and wordmark only.
- **Tagline:** “Everyday help, organised.”
- **Primary identity:** original SaMi custom blue wordmark (`#4A7AFF` through deep navy `#0A1A40`), royal-blue actions, light-blue surfaces, and amber highlights. UI surfaces stay light with high-contrast text.
- **Voice:** calm, direct, practical and accountable. SaMi supports legitimate personal, local and business tasks, not only delivery work.
- **Product promise:** clear service fees upfront, goods/seller costs kept separate, visible progress, and accountable hand-offs.
- **Consistency:** keep the brand mark, page metadata, manifest, app icon, marketing footer and authenticated workspace aligned. Avoid alternative spellings and extra suffixes in the brand name.

SaMi is a marketplace for all kinds of legitimate everyday errands—shopping, clothing purchases and returns, pickups and drop-offs, document/admin tasks, bookings and queues, personal errands, business support, local assistance and any other lawful task a customer can describe. The "other legitimate errand" category keeps the service open to new needs without constraining the product to deliveries.

## Customer pricing model (no quotation step)

1. The customer describes the errand, location, timing and relevant details.
2. The estimated service fee is shown before submission and combines the category base fee, road distance from the selected map route, item-size handling fee, configured high-value handling surcharge, and priority multiplier.
3. The customer chooses cash or M-PESA in-app payment for the errand-service fee. M-PESA checkout becomes available once Daraja credentials are configured.
4. Approved, available providers can see open requests that match their listed service categories and accept one directly; operations can still manually assign a provider when needed. A provider can hold one active assignment at a time.
5. For shopping and clothing errands, the estimated goods budget is tracked separately. The seller is paid separately when the goods are bought/received. Goods are not part of SaMi's service fee or commission base.
6. The provider accepts, starts, messages relevant parties, records separate seller-payment details if applicable, submits completion notes, and the customer confirms or disputes.
7. Operations tracks service-fee payments, provider payouts from confirmed in-app collections, refunds and reconciliation. The interface refreshes active request/payment state while work is underway.

## Commission

Each category has configurable base fee, distance rate per kilometre, handling fees for small/medium/large/bulky items, an item-value surcharge threshold and percentage, SaMi commission rate, and low/standard/high/urgent multipliers. The formula is: (base fee + route distance × rate/km + item-size handling + high-value handling surcharge) × priority multiplier. Value surcharge applies only to the portion of the estimated goods value above the configured threshold. The resulting service fee, distance, size and surcharge breakdown, commission, and provider share are saved with the request; future pricing changes do not retroactively change an existing errand.

- Errand service fee: what the customer pays for the work of handling the errand.
- SaMi commission: the configured percentage of the service fee.
- Provider share: the remaining part of the service fee after SaMi commission.
- Goods/seller cost: separate; paid to the seller and excluded from SaMi commission.

Administrators manage the base fee, commission, distance rate, item-size charges, high-value threshold/rate and priority multipliers for each category from Service pricing. Pricing changes are written to an audit table. When both pickup and destination points are selected on the map, the server recalculates the road distance before saving the request and deriving the service fee. A manually entered distance remains available for requests without route coordinates.

## Maps, road routes and provider tracking

- The request form contains an interactive map: search for a street or landmark, use the device's current location, click the map, or drag the pickup/drop-off markers.
- With both points selected, SaMi obtains a road route and uses its distance for service-fee pricing. It stores the pickup/drop-off coordinates and the calculated road distance/duration with the errand.
- Approved providers sharing location from an active accepted/in-progress task send their current GPS position to SaMi. The latest location is only returned through the assigned errand's access-controlled detail endpoint; it is not a public tracking link. Sharing works while the provider's browser/app is open, HTTPS is active, and location permission is granted.
- The default map uses OpenStreetMap tiles and an OSRM-compatible driving router, with Nominatim for user-triggered address search. This requires no map API key for initial development. Public OSM services are best-effort and rate-limited; use a suitable hosted/self-managed map provider for sustained production traffic and retain the required map attribution.
- Optional Google endpoints are supported for road routing and geocoding when their API keys are configured. Set `GOOGLE_ROUTES_API_KEY` or `GOOGLE_GEOCODING_API_KEY`; `GOOGLE_MAPS_API_KEY` can serve as the shared server-side key when the relevant Google APIs are enabled. Alternatively change `MAP_ROUTING_BASE_URL` and `MAP_GEOCODING_BASE_URL` to compatible endpoints. `NEXT_PUBLIC_MAP_TILE_URL` selects the tile URL template.
- The location migration is additive and runs lazily against the SaMi Errands database. It adds coordinate and route columns and creates the current provider-location table; it does not touch the separate SaMi ERP database.

For local development, copy `.env.example` to `.env.local` and fill in your local values. `.env.local` is ignored by Git. Configure the same server-side variables in the relevant Vercel Preview/Production environment before deploying there. Never commit API credentials or put server-side Google/M-PESA secrets in a `NEXT_PUBLIC_*` variable.

```dotenv
NEXT_PUBLIC_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
MAP_ROUTING_BASE_URL=https://router.project-osrm.org
MAP_GEOCODING_BASE_URL=https://nominatim.openstreetmap.org
MAP_CONTACT_EMAIL=
GOOGLE_ROUTES_API_KEY=
GOOGLE_GEOCODING_API_KEY=
GOOGLE_MAPS_API_KEY=
```

## Payment model

### Cash
The assigned provider can record the cash service fee after the work is performed, and operations can reconcile the ledger. Seller/goods payments are separate records; recording them never increases SaMi service revenue.

### M-PESA in-app payment
The app has a server-side Daraja STK Push checkout and callback path. The customer initiates a phone prompt for the errand-service fee only. The callback must match the stored checkout attempt, the callback token, the expected amount, mobile number and a transaction receipt before the service fee is marked paid. A returned "checkout accepted" response by itself does not count as payment. Failed attempts remain unpaid; mismatched callbacks are held for operations verification.

M-PESA checkout intentionally remains disabled until these server-only Vercel Preview variables are configured:

- MPESA_ENV (sandbox first; production only after go-live setup)
- MPESA_SHORTCODE
- MPESA_CONSUMER_KEY
- MPESA_CONSUMER_SECRET
- MPESA_PASSKEY
- MPESA_CALLBACK_TOKEN (long random secret for authenticating the callback)
- MPESA_TRANSACTION_TYPE (CustomerPayBillOnline or CustomerBuyGoodsOnline)

MPESA_CALLBACK_URL is optional; the checkout route defaults to the current deployment's /api/payments/mpesa/callback. The callback URL must be publicly reachable over HTTPS for Safaricom to deliver its result. Never put credentials in source code or in browser-visible NEXT_PUBLIC_ variables.

The Preview currently has only the database and initial-admin environment values, so live M-PESA checkout is not yet enabled or end-to-end tested. Cash and service-fee records remain available. Do not mark an in-app payment paid based solely on a customer's claim or on an STK request being accepted.

## Roles and responsibilities

- Customers/businesses: submit freeform lawful tasks, see the service fee upfront, choose a payment method, track updates, message participants, confirm completion or raise a dispute, and rate providers.
- Providers/provider businesses: maintain a service profile, list categories and service areas, submit for approval, control availability, see eligible open requests, accept one request atomically, update progress and submit completion notes. Seller/goods payment is tracked separately.
- Operations: approve/suspend providers, assign requested errands directly, review disputes, manage fees and commissions, record/reconcile cash payments and payouts, verify exceptions, and manage refunds.

## Runtime and database

- Next.js App Router on Vercel.
- PostgreSQL accessed server-side using pg.
- Separate Neon project SaMi Development, isolated from the old SaMi database.
- Dedicated, least-privilege database role sami_errands_app.
- Password hashes use bcrypt; sessions use random opaque values, with only SHA-256 hashes persisted. Cookies are HttpOnly, SameSite=Lax and Secure in production.
- Authentication attempts are rate-limited by hashed identifiers. Server-side operations enforce role and resource ownership. Errand and pricing state changes are audited.

## Preview and verification

The feat/sami-errands-transformation branch uses a Preview-scoped database connection and a one-time first-admin token. The source code contains no credential values. Open /admin-setup on the latest Preview deployment. The page calls /api/dispatch?action=bootstrapStatus and explicitly reports when the token is missing, the database cannot be checked, or an admin already exists. If ADMIN_BOOTSTRAP_TOKEN is changed in Vercel, redeploy this branch before using that token; a deployment retains the environment values it was built with. The endpoint stops creating users once an admin exists.

Health check: /api/dispatch?action=health. It returns database connectivity and schema version without credentials. Service pricing: /api/dispatch?action=pricing.

Tests: npm test; the Vercel build runs the workflow/schema tests before next build. Tests cover the no-quotation workflow, route/item/value-based service pricing, interactive map controls, server-side road-distance calculation, pickup/drop-off coordinate persistence, scoped provider GPS updates, separate seller goods, admin bootstrap diagnostics, pricing audit and the M-PESA callback validation. Preview checks performed so far: successful production build, connected isolated database, nine readable category pricing rules, and a public SaMi landing page with the old business-workspace branding removed. Full role workflows, actual M-PESA checkout/callback, and payment reconciliation still require end-to-end tests.

## Later hosting migration

The current application is Next.js and needs a compatible Node.js host, or a deliberate port if a future shared-hosting package supports PHP only. The domain name itself does not determine runtime compatibility. Migrate data only after testing schema and export/import against the final host.

## Conversion safety

Changes remain in the feat/sami-errands-transformation branch and draft PR. The old production deployment and its database have not been switched by this feature branch.
