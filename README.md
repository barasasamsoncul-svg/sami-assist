# SaMi Errands

This branch replaces the former SaMi business workspace with a focused errands marketplace for customers, independent providers and operations administrators.

## Core flow
Customer request → operations quote → manual provider assignment → provider accepts or declines → provider starts work → completion notes → customer confirms or disputes → operations records payment or payout.

The current category set includes shopping and essentials, pickup and delivery, personal errands, business support, local assistance and other legitimate tasks. Regulated or risky requests require human review.

## Runtime and database
- Next.js App Router, deployed on Vercel.
- PostgreSQL accessed server-side with the pg driver.
- Separate Neon project: SaMi Errands Development. The old SaMi database is not used by this application.
- Passwords use bcrypt hashes. Sessions are random opaque tokens; only SHA-256 session-token hashes are stored in PostgreSQL and cookies are HttpOnly, SameSite=Lax and Secure in production.

## Preview environment
Set DATABASE_URL and ADMIN_BOOTSTRAP_TOKEN in Vercel Preview only for the feat/sami-errands-transformation git branch. DATABASE_URL must be the Neon connection string for the SaMi Errands Development project and must require SSL. ADMIN_BOOTSTRAP_TOKEN must be a unique random string of at least 32 characters. Do not commit these secrets.

GET /api/dispatch?action=health checks database connectivity and the migration marker without returning any credential.

## First administrator
After Preview is deployed, open /admin-setup and use the bootstrap token plus an admin name, email and strong password. The route is disabled unless the token matches and no admin exists yet; it cannot add a second admin. Provider signups begin pending and must be approved by operations.

## Tests
Run npm test for schema smoke checks and npm run build for a production build. Then verify in Preview: customer signup/login, provider signup, administrator bootstrap, provider approval, errand request creation, quote, assignment, accept/start/complete, customer confirmation/dispute and manual payment recording. A successful build alone does not establish that these database workflows work.

## Deployment and migration
Only the feat/sami-errands-transformation branch is replaced. Git main and its production deployment remain untouched. A future hosting move must target a host compatible with Next.js/Node.js or be handled as a separate PHP/MySQL port; a domain purchase alone does not change runtime compatibility. Export/import the database only after testing the target host and schema migration.
