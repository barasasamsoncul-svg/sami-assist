# SaMi native app — production

SaMi is a native React Native + Expo mobile app for the live SaMi service. The production Android app and production API are configured on the `main` branch. Production builds use the Expo project `sami-mobile`, package ID `com.sami.errands`, the live API, a persistent EAS-managed Android signing key, and the `production` EAS Update channel.

## App capabilities

- Customer sign-in and registration, errand requests, pickup/drop-off maps, and server-calculated pricing.
- Errand status, history, messages, cancellation, completion confirmation and disputes.
- Provider applications, eligibility, availability, accepting and completing errands.
- Operations controls for provider review, request queue and assignment.
- Location sharing for an assigned provider while an errand is active, plus notifications, payment history and ratings.

M-PESA, database and other server credentials remain on the backend. The app only contains the public production API URL.

## Production delivery

The GitHub Actions workflow builds an installable, production-channel Android APK from `main`, runs type and Expo health checks, uses EAS-managed signing credentials, and uploads the APK as an artifact. The signing key is generated and stored with EAS if this project has not configured one yet; subsequent builds reuse that same key.

Compatible JavaScript and interface changes are published to the `production` OTA channel. The installed app checks for updates when it launches. Native dependency, permission, package identity or other native configuration changes require a new production APK, signed with the same key so Android can update the app in place.

**Important:** the earlier test APK was signed with a temporary key and cannot be upgraded with a different production signing key. If that test APK is installed, it may need to be uninstalled once when moving to the first permanent production build. Future releases should update over the existing production installation; routine compatible UI/code updates should not require reinstalling.

## Safe configuration

The Android package ID is `com.sami.errands`. Keep it unchanged after release. The runtime version follows Expo's fingerprint policy so an incompatible native build does not receive an incompatible OTA update. Never commit keystores, passwords, M-PESA credentials, database credentials or server API keys.

For developer checks, install dependencies inside `apps/mobile`, then run `npm run typecheck` and `npx expo-doctor`. The production release workflow runs these checks in GitHub Actions.
