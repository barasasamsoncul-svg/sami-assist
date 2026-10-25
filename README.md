# SaMi Errands

SaMi Errands is a marketplace and operations platform for everyday errands: shopping, local pickup and drop-off, personal errands, business support, and practical coordination. It is designed around accountable execution, not simply placing a delivery order.

## Product roles

- Customers and businesses create detailed requests, review quotes, explicitly approve pricing, message participants, track status, confirm completion or raise a dispute, and rate providers.
- Providers and provider businesses maintain a service profile, describe service categories and service areas, submit for approval, control availability, accept or decline assigned work, record progress and submit completion notes.
- Operations administrators review provider applications, quote requests, require customer quote approval before assignment, manually dispatch eligible providers, oversee disputes, record customer payments/provider payouts/refunds, and reconcile financial records.

## Runtime and isolated development database

- Next.js App Router with a Node.js runtime on Vercel.
- PostgreSQL accessed server-side using the pg driver.
- Separate Neon project named SaMi Errands Development, isolated from the former SaMi database.
- Dedicated database role sami_errands_app with limited application permissions.
- Passwords use bcrypt. Sessions are random opaque values; only SHA-256 hashes are stored. Cookies are HttpOnly, SameSite=Lax and Secure in production.
- Auth attempts are rate-limited per hashed identifier. Server-side actions enforce role and resource ownership. State changes create timeline records where applicable.

## Vercel Preview

The feat/sami-errands-transformation branch uses a Preview-scoped DATABASE_URL for the isolated Errands project and a Preview-scoped one-time ADMIN_BOOTSTRAP_TOKEN. Do not put either value in source code or Production variables.

Open /admin-setup in the Preview deployment to create the first operations account. The setup token must match the server secret; the endpoint refuses a second administrator. Use a strong unique password. Customer and provider accounts can then be registered from the public landing page. Provider accounts remain pending until operations approves the profile.

Health check: /api/dispatch?action=health. It returns connectivity status and schema version, not credentials.

## Workflow controls

The lifecycle is request → operations quote → customer quote approval → manual assignment to an approved/available provider → provider accept/decline → in progress → provider completion notes → customer confirmation or dispute. Customers can cancel before provider acceptance; operations can cancel with audit history.

Payments are manual records, not a payment gateway. Recording payment does not charge a customer or transfer money. Payouts and refunds are separate ledger entries. Idempotency keys prevent replaying the same payment action, and operations can reconcile recorded entries. Confirm the real transaction with your payment provider or bank before recording it.

## Verification

npm test runs schema smoke checks, and the Vercel build runs the same tests before the optimized build. Release verification must also cover: signup/login, admin bootstrap, provider profile/approval/availability, errand creation, quote/revision/approval, assignment, accept/decline/start/completion, messaging and timeline, customer confirmation/dispute, ratings, payments/refunds and reconciliation. Test unauthorized cross-account access as well as successful paths.

A successful build and database health check do not prove every browser flow. Do not promote the Preview until those workflows have been exercised.

## Future hosting

The current Preview is a Next.js app. A later move needs a host capable of running Next.js/Node.js, or a deliberate port to PHP/MySQL if the chosen shared-hosting package only supports PHP. A domain name does not determine runtime compatibility. Migrate application data only after testing schema and export/import against the target database.

## Development safety

Changes stay on feat/sami-errands-transformation and the pull request remains a draft. Git main, its history, the original database, and production deployment are not altered by this branch.
