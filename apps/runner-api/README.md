
# SaMi Runner backend

Runner-specific API handlers are deployed as part of the existing root Next.js application:

- Runtime routes: `app/api/runner/**`
- Runner-only server code: `lib/runner/**`
- Database migrations: `apps/runner-api/database/migrations/`
- Neon project: SaMi Runner
- Neon branch: main
- Database: `sami_runner`
- Server environment variable: `RUNNER_DATABASE_URL`

There is one Vercel project for the SaMi repository. The Runner API is not deployed as a second Vercel project. Pushing the root application changes to `main` deploys Runner API routes with the existing SaMi web/API application.

## Database isolation

The root application's existing `DATABASE_URL` serves the existing SaMi application and Customer APIs.

Runner endpoints use the dedicated `RUNNER_DATABASE_URL` connection pool in `lib/runner/db.ts`. Runner accounts, OTP challenges, sessions, onboarding documents, availability and Runner jobs are stored in the separate `sami_runner` database.

Do not replace `DATABASE_URL` with `RUNNER_DATABASE_URL`.

## Configuration

Configure these environment variables on the existing Vercel project `sami-assist`:

### Runner database

- `RUNNER_DATABASE_URL` — connection string for Neon project SaMi Runner, branch `main`, database `sami_runner`.

### Runner email authentication

Runner authentication uses email one-time passwords through SMTP.

- `EMAIL_PROVIDER=smtp`
- `SMTP_HOST` — SMTP server hostname.
- `SMTP_PORT` — SMTP port, commonly `587` or `465`.
- `SMTP_SECURE` — `true` for implicit TLS; otherwise `false` for STARTTLS.
- `SMTP_USER` — SMTP username.
- `SMTP_PASSWORD` — SMTP password or provider-specific SMTP credential.
- `EMAIL_FROM` — sender address; defaults to `SMTP_USER` when omitted.
- `EMAIL_REPLY_TO` — optional reply-to address.
- `AUTH_EMAIL_OTP_PEPPER` — long, randomly generated server-only secret used to derive OTP codes.

### Runner sessions

- `RUNNER_SESSION_DAYS` — optional session lifetime in days. Defaults to 30; the server enforces a maximum of 90 days.

Do not expose SMTP credentials, the OTP pepper or database connection strings through `EXPO_PUBLIC_` variables.

For local development, place the server variables in the repository-root `.env.local`. The Runner Expo app separately uses `EXPO_PUBLIC_SAMI_API_URL` in `apps/runner/.env`.

The email OTP challenge expires after 10 minutes. Requests are limited to one per 60 seconds and five per hour for each email address.

## Database migrations

Apply all Runner migration files in `apps/runner-api/database/migrations/` to Neon project SaMi Runner, branch `main`, database `sami_runner`, in chronological order.

Do not apply Runner migrations to the Customer database.

The `/api/runner/health` endpoint reports Runner database connectivity and schema readiness.

## Mobile API

The Runner Expo app uses `EXPO_PUBLIC_SAMI_API_URL`, pointing to the same API base URL used by the Customer mobile app.

Runner authentication remains separate. The app stores the Runner session token in SecureStore, while the server stores only its SHA-256 token digest. Sign out revokes the server-side session when the API is reachable and clears the local credential.

## Operations and integration status

Runner registration, email verification, sessions and onboarding use the separate Runner database.

The Admin/Operations review interface for Runner applications must use authenticated server-side access to that database. It must not use the legacy Customer provider records as a substitute for Runner accounts.

Runner offers and Runner-side transitions write to the Runner database and its integration outbox. The trusted Customer-to-Runner inbox receiver and Runner-to-Customer outbox delivery worker are not yet enabled. Do not treat cross-database job matching as live until that integration boundary is completed.
