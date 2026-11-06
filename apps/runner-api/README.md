# SaMi Runner API

Independent Next.js API service for the SaMi Runner mobile app.

## Isolation

- Deploy root directory: apps/runner-api
- Database: Neon project SaMi Runner
- Neon branch: main
- Database: sami_runner
- Connection variable: RUNNER_DATABASE_URL

Do not set RUNNER_DATABASE_URL to the Customer production connection string. The Runner API never imports Customer server libraries and never queries the Customer database.

Customer errand references are stored as opaque text identifiers. Future integration will use authenticated inbox/outbox events, not direct cross-database queries.

## Environment variables

Copy .env.example into the Runner API deployment environment. Set RUNNER_DATABASE_URL and the three RUNNER_TWILIO variables. RUNNER_SESSION_DAYS is optional and defaults to 30.

The mobile app requires EXPO_PUBLIC_RUNNER_API_URL pointing to this service.

## Local development

    npm install
    npm run dev

## Database

The initial schema is in database/migrations/2026-11-07-runner-initial-schema.sql.

Apply it only to the SaMi Runner Neon project, main branch, sami_runner database. /api/health reports whether the schema is ready.

## Deployment

Create a separate Vercel project with root directory apps/runner-api. Configure the Runner environment variables in that project only. Do not change the existing Customer Vercel project or its environment variables.

The first service includes Runner OTP authentication, profile setup, verification-gated availability, offers, accept/start/submit-completion actions and foreground location updates.

The inbox/outbox tables are foundations only. The live Customer-to-Runner event receiver, Runner-to-Customer publisher and signed integration contract are not enabled yet.