SaMi Runner dashboard implementation package
============================================

What this package adds
----------------------
1. A compact dashboard header with three independent cards:
   - Online/offline status at the left.
   - Expandable earnings summary in the centre, with show/hide eye control.
   - Reverse-geocoded current locality at the right, displayed only for an authorised online Runner.
2. A Mapbox-backed, full neighbourhood map using Mapbox Standard in its night light preset.
   - Place and road labels.
   - Points of interest, including mapped shops/businesses and services.
   - Landmark icons/labels, 3D landmarks/buildings/trees, transit and pedestrian roads.
   - Subdued natural map colours blended with SaMi's deep navy overlay palette.
3. A compact/expanded bottom sheet:
   - Collapsed: Offers & Rewards only.
   - Expanded: Offers & Rewards first, Rating/Acceptance/Menu/Help in a 2x2 grid, then a round white GO button below the cards.
4. Dedicated in-app pages for Offers, Rating, Acceptance, Menu and Help.

Important data limitation
-------------------------
The current Runner API does not expose earnings totals, balance, completed-trip history,
last-trip details, Runner ratings or acceptance-rate statistics. This implementation
shows em dashes for those values rather than inventing numbers. The detail pages are
ready for those metrics when the corresponding backend endpoints are implemented.

Map data limitation
-------------------
The Mapbox Standard style displays POIs and landmark information present in Mapbox's
map data for the current area and zoom. Coverage varies by neighbourhood. This enables
mapped shops and businesses; it does not guarantee every local shop has a Mapbox record.

Files included
--------------
apps/runner/src/components/RunnerDashboardChrome.tsx
apps/runner/app/(app)/runner-section.tsx
apps/runner/scripts/Apply-SaMiRunnerDashboard.ps1

The archive contains four package files: two new UI files, the integration script, and this README.
The script then patches the existing dashboard index.tsx and Android/iOS Mapbox native view files.
It creates timestamped backups of those three existing source files before writing them.
It leaves the existing active-errand, completion, and verification-gated workspace visible; the new map-first chrome is used for approved runners with no active errand.
It does not modify EAS project settings, eas.json, signing credentials, credentials.json,
keystore files, build profiles, update channels, or project IDs.

Installation
------------
1. Extract this ZIP into the repository root, preserving the apps/runner paths.
2. Open PowerShell at C:\dev\sami-assist-web.
3. Run:

   powershell -ExecutionPolicy Bypass -File .\apps\runner\scripts\Apply-SaMiRunnerDashboard.ps1

4. Check TypeScript:

   cd .\apps\runner
   npm run typecheck

5. Regenerate the Android project without cleaning it:

   npx expo prebuild --platform android

   Do NOT add --clean.

6. Compile only the Mapbox module first:

   cd .\android
   .\gradlew.bat :sami-mapbox:compileDebugKotlin

7. Verify Release still uses the original EAS keystore:

   .\gradlew.bat :app:signingReport

   The Release SHA-256 must remain:
   DF:56:86:07:85:56:C6:C8:EF:60:EF:3E:4A:8D:C4:CE:F8:01:51:17:98:9E:37:28:27:DA:52:36:E5:54:8D:9B

8. Only after TypeScript, native compilation and signing verification pass, build locally:

   .\gradlew.bat assembleRelease --no-parallel --max-workers=2

9. Verify the resulting APK certificate before installing it over the existing app.

Do not uninstall SaMi Runner. Do not regenerate or replace the signing key.


Patch-script correction (FIXED2): the GPS reverse-geocoding insertion now targets the fresh-GPS-result block by its surrounding return structure. This avoids also matching the separate locate-map button's camera-follow action. The script still performs all validations before writing source files.
