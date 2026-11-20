SaMi Runner End-to-End Fix
==========================

Target repository revision reviewed:
  main / 9b29c9402abbb871064b32e9c55ced5d463d9059

What this patch corrects:
1. GO online now sends a GPS fix in the availability request. The server writes
   online status and the runner's idle presence position in one transaction.
   It no longer calls the active-trip-only location endpoint before going online.
2. Idle online presence uses a new Runner-only table. Active-trip tracking stays
   in runner_live_locations with its required job_id. The two purposes are not
   mixed and the customer-facing trip tracking table is not weakened.
3. Location updates while offline only recenter the map; they are not sent to
   the backend. Online idle updates go to presence; accepted/in-progress errand
   updates go to trip tracking. Tracking pauses after completion is submitted.
4. Availability rules are enforced on the server as well as the interface.
   An active trip cannot be taken offline. A runner awaiting customer
   confirmation may go offline, but cannot go online for another errand.
5. The acceptance API prevents a runner from accepting a second active errand
   and automatically takes the runner offline for new work after an offer is
   accepted. Active-trip GPS continues independently until completion is
   submitted.
6. The dashboard refreshes Runner offers/active task state every 20 seconds
   while focused and foregrounded, and signs out on an expired session.
7. The Offers screen returns to sign-in after a 401/session-expired response.

Files modified by the script:
  apps/runner/src/api.ts
  apps/runner/app/(app)/index.tsx
  app/api/runner/me/availability/route.ts
  app/api/runner/location/route.ts
  app/api/runner/jobs/[id]/accept/route.ts
  app/api/runner/jobs/[id]/status/route.ts
  apps/runner/app/(app)/runner-section.tsx

New Runner DB migration:
  apps/runner/database/migrations/2026-11-20-runner-online-presence-locations.sql

Important integration limitation still outstanding:
  The repository documents that the trusted Customer-to-Runner inbox receiver
  and Runner-to-Customer outbox delivery worker are not enabled. This patch
  does not pretend to complete cross-database dispatch, Customer confirmations,
  earnings, rating/acceptance metrics or Runner support tickets. These require
  the trusted integration service and corresponding data contracts.

Apply:
  1. Extract this ZIP into C:\dev\sami-assist-web, preserving folder paths.
  2. From repository root run:
       node .\apps\runner\scripts\Apply-SaMiRunnerEndToEndFix.mjs
  3. Run:
       cd .\apps\runner
       npm run typecheck
  4. Check the root Next.js build/tests as appropriate:
       cd ..\..
       npm run build
  5. The standard production deployment workflow applies Runner migrations
     from apps/runner/database/migrations using RUNNER_DATABASE_MIGRATION_URL.
     Verify that the new migration was applied to the SaMi Runner Neon database.
  6. After deployment and migration success, perform targeted Android native
     compilation and then the signed production APK build. The previously
     published OTA job correctly rejected this commit because native Mapbox
     files changed and the installed production APK has a different fingerprint.

Safety:
  - The script validates all anchors and stages all transformations before
    writing. It creates timestamped backups beside every modified source file.
  - It does not change eas.json, EAS project IDs, profiles, credentials,
    signing configuration, update channel, Mapbox access tokens or secrets.
  - It does not modify GitHub or push/commit any files.
