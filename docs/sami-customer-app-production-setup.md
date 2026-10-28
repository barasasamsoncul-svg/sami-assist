# SaMi customer app: native maps, messaging and in-app calls

This release adds customer-first home navigation, an interactive native map, privacy/account controls, participant-restricted errand messaging and errand-linked audio calling.

## Native Google Maps

The mobile app uses `react-native-maps` (native Google Maps on Android, native Apple map provider on iOS). It does not use a Leaflet WebView.

Before the production APK can be built:

1. In Google Cloud, enable **Maps SDK for Android** in a project with billing enabled.
2. Create an API key and restrict it to the Android package `com.sami.errands` and the production signing certificate's **SHA-1** fingerprint. Keep the key restricted to Maps SDK for Android.
3. Add the key as a GitHub Actions secret named `GOOGLE_MAPS_API_KEY`. The native build workflow transfers it to the EAS `production` environment as a sensitive variable.
4. Run the signed production Android build. Native maps cannot be delivered to the currently installed APK using OTA alone.

Do not commit a Google Maps key to this repository. The key is embedded in the APK, so Android app + API restrictions are mandatory.

## In-app voice calls

Calls are scoped to one errand and permitted only for its customer and assigned provider. They use WebRTC audio, an authenticated signalling API, ring/answer/decline/end states, microphone mute, and no exposure of either participant's personal phone number.

The production database owner must apply:

`database/migrations/2026-10-28-sami-errand-voice-calls.sql`

The application account intentionally does not create or alter production tables on an authenticated request. Until the migration is applied, calling returns a clear service-unavailable response. The full schema also includes these tables for new installations.

For reliable calls across restrictive mobile networks, configure a TURN service in the production Vercel environment:

- `TURN_SERVER_URL`: one or more comma-separated TURN/TURNS URLs from the chosen provider.
- `TURN_SHARED_SECRET`: a randomly generated secret of at least 32 characters.

The API issues short-lived HMAC credentials to authenticated call participants. Without TURN configuration, calls can fall back to public STUN servers, which will not connect on every NAT/firewall combination; do not treat that as production-grade reliability.

## Messaging and incoming calls

Errand chat is available when a provider has been assigned. The mobile errand detail refreshes status and messages while the errand is active. Incoming calls are represented as errand notifications; opening the errand shows its incoming-call controls.

The call screen and native WebRTC library require a new signed APK after applying the Google Maps key. Ordinary JavaScript-only changes after that compatible build can use the production OTA channel.
