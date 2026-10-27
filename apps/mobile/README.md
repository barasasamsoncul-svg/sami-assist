# SaMi Android-first native app

This is SaMi Errands' native Android app (React Native + Expo) with iOS support from the same codebase. It is an app, not a website wrapper. It lives in `apps/mobile` and uses the existing SaMi Errands backend. The original SaMi ERP code and production app are separate and are not changed by this mobile branch.

## What is in the app

- Native sign-in and registration for customers and errand providers.
- Customer dashboard and request form with map-picked pickup/drop-off points, road-route pricing, size, item budget, priority, and cash or in-app M-PESA choice.
- Errand list and task detail screens with status, activity history, accept/start/complete, customer confirmation/dispute and cancellation actions.
- Provider application review status, availability switch, and foreground GPS updates for an assigned active errand.
- M-PESA credentials and Google Maps credentials remain server-side; the app only receives the public API base URL.

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

## Easy updates

- JavaScript and compatible UI fixes can be published to an app build with EAS Update after the EAS project and update URL are configured:
  `npm run update:preview`
- Native dependencies, Android permissions, app identity, or other native configuration changes require a new APK/AAB build.
- Use the preview channel for testing, then publish to production only after validating the live API, map routing, GPS permissions, and M-PESA callback flow.

Runtime compatibility uses the `fingerprint` policy so incompatible native builds do not receive the wrong JavaScript update. Expo documents runtime-version compatibility and update publishing in the [EAS Update guide](https://docs.expo.dev/build/updates/) and [runtime versions guide](https://docs.expo.dev/eas-update/runtime-versions/).

## Notes

Provider GPS is shared only while the provider is actively viewing SaMi with an assigned accepted/in-progress task. Background tracking is not enabled. The preview API deployment is for testing; switch `EXPO_PUBLIC_SAMI_API_URL` to the dedicated SaMi Errands production backend before public release.
