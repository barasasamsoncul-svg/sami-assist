# SaMi Android-first native app

This is SaMi Errands' native Android app (React Native + Expo) with iOS support from the same codebase. It is an app, not a website wrapper. It lives in `apps/mobile` and uses the existing SaMi Errands backend. The original SaMi ERP code and production app are separate and are not changed by this mobile branch.

## What is in the app

- Native sign-in and registration, including a customer account or pending provider application.
- Customer dashboard and request form with interactive pickup/drop-off map, server-calculated road-route pricing, item-size/value handling, priority, and cash or in-app M-PESA choice.
- Errand list/detail, activity history, assignment acceptance, start, completion notes, customer confirmation or dispute, cancellation, and in-errand messaging.
- Foreground provider GPS updates while an assigned errand is accepted/in progress; customer and operations tracking refreshes live position during the active errand.
- Provider service profile editing, application status, eligible job discovery and availability controls.
- Operations control room for provider approval/suspension, errand queue visibility and eligible provider assignment.
- Notifications, payment history, and customer ratings after completion.
- M-PESA and Google server credentials stay in the backend. The app receives only the public API URL.

## Run locally on Windows

1. Install Node.js 22.13 or later.
2. Open PowerShell at the repository root, then:
   ```powershell
   cd apps/mobile
   Copy-Item .env.example .env
   npm install
   npx expo install --fix
   npx expo start
   ```
3. Scan the Expo Go QR code to open the app during development. Use a development build once native changes need to be tested. A phone must be able to reach the configured HTTPS API URL.

The environment file contains only a public API URL. Never place M-PESA consumer secrets, passkeys, callback tokens, Google server API keys, database credentials, or an admin bootstrap token in the mobile app.

## First Android APK build

The repo includes `eas.json` with an internal-test APK profile and a Google Play App Bundle profile. EAS builds require your own Expo account/project. From `apps/mobile`, initialize the app once and configure over-the-air updates:

```powershell
npx eas-cli login
npx eas-cli init
npx eas-cli update:configure
npm run build:android:apk
```

The build will be uploaded to Expo's build service and return a build page/download link when complete. The first EAS build requires you to sign in and let Expo configure Android signing credentials; no EAS account or credentials are embedded in this repository.

## Automatic app updates

The app is configured for Expo EAS Update. Once the project is linked and the GitHub settings below are configured, changes to compatible JavaScript, screens, styling, and bundled assets can be published automatically to the installed app's update channel. The app checks for updates when it opens and applies a downloaded update on a subsequent restart.

- One-time setup: from `apps/mobile`, sign in with `npx eas-cli login`, then run `npx eas-cli init` and `npx eas-cli update:configure`. This links the app to an Expo project and writes its project ID/update URL to the Expo configuration.
- In GitHub repository settings, add the repository **variable** `EXPO_PROJECT_ID` with that exact Expo project ID, and the repository **secret** `EXPO_TOKEN` with an Expo access token. The native APK workflow embeds the project ID and preview channel; the OTA workflow uses the token to publish compatible updates.
- Pushes that change `apps/mobile/**` publish to `preview` from `feat/sami-native-app` and to `production` from `main`, once those settings are in place. Manual publishing is also available with `npm run update:preview` or `npm run update:production`.
- The first APK installed by a user must be built with the EAS Update URL embedded. Existing installed APKs without that URL cannot be made OTA-capable retroactively.

OTA updates cannot change native resources already compiled into the APK. Launcher icons, Android permissions, app identity, and native-module changes still require a new APK/AAB distribution. The `fingerprint` runtime policy prevents an update from targeting a native binary that is incompatible with it. See the [official EAS Update setup guide](https://docs.expo.dev/eas-update/getting-started/) and [runtime versions guide](https://docs.expo.dev/eas-update/runtime-versions/).

## Notes

Provider GPS is shared only while the provider has an assigned accepted/in-progress task and the SaMi app screen is active. Background tracking is not enabled. Location data is only visible to authorized customer/provider/operations accounts, and stale provider positions are hidden after 90 seconds. The preview API deployment is for testing; switch `EXPO_PUBLIC_SAMI_API_URL` and the EAS profiles to the dedicated SaMi Errands production backend before public release.

Before release, validate sign-in, provider approval, request creation/pricing, route provider availability, in-app payment callbacks, tracking permissions, OTA delivery, and dispute handling on real Android hardware. The GitHub Actions native workflow builds the standalone Android APK and uploads it as the `sami-android-standalone-apk` artifact for 14 days. For a Play Store release, initialize the owner's EAS project, configure Android signing, and run `npm run build:android:play` to create the production Android App Bundle (AAB).
