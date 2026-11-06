# SaMi Runner backend

Runner-specific API handlers are deployed as part of the existing root Next.js application:

- Runtime routes: `app/api/runner/**`
- Runner-only server code: `lib/runner/**`
- Database migration: `apps/runner-api/database/migrations/`
- Neon project: SaMi Runner
- Neon branch: main
- Database: sami_runner
- Server environment variable: `RUNNER_DATABASE_URL`

There is one Vercel project for the SaMi repository. The Runner API is not deployed as a second Vercel project. Pushing the root application changes to `main` deploys Runner API routes with the existing SaMi web/API application.

## Database isolation

The root app's existing `DATABASE_URL` continues to serve the existing SaMi web and Customer APIs. Runner endpoints use the dedicated `RUNNER_DATABASE_URL` pool in `lib/runner/db.ts`. They do not query Customer tables or use the Customer DB connection.

The Runner database stores an opaque `customer_errand_ref` for future authenticated integration events; it does not create cross-database foreign keys.

## Configuration

Configure `RUNNER_DATABASE_URL` as an encrypted environment variable on the existing Vercel project `sami-assist`. Do not replace or edit `DATABASE_URL`.

Configure the Runner Twilio Verify values on that same Vercel project:
- `RUNNER_TWILIO_API_KEY`
- `RUNNER_TWILIO_API_SECRET`
- `RUNNER_TWILIO_VERIFY_SERVICE_SID`
- Optional `RUNNER_SESSION_DAYS` (default 30)

Local root API development uses these variables in the repository-root `.env.local`.

## Database

The schema is in `database/migrations/2026-11-07-runner-initial-schema.sql`. Apply it only to Neon project SaMi Runner, branch main, database sami_runner.

The `/api/runner/health` endpoint reports Runner database connectivity and schema readiness.

## Mobile API

The Runner Expo app uses `EXPO_PUBLIC_SAMI_API_URL`, the same API base URL as the Customer mobile app. Its session token and server-side authentication remain Runner-specific.

## Integration status

Runner offers and Runner-side transitions write to the Runner database and its integration outbox. The trusted Customer-to-Runner inbox receiver and Runner-to-Customer outbox delivery worker are not yet enabled; this app foundation must not be treated as live matching until that boundary is completed.