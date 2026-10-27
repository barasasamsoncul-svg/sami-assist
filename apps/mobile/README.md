# SaMi mobile app

This is the native Android/iOS client for SaMi Errands. It is an Expo + React Native app, separate from the Next.js website and uses the same SaMi Errands API and database. The existing SaMi ERP work is not modified by this app.

## Run it locally

1. Install Node.js 22.13 or later.
2. Open a terminal in apps/mobile.
3. Copy .env.example to .env and set EXPO_PUBLIC_SAMI_API_URL to the current SaMi Errands API deployment.
4. Run npm install.
5. Run npx expo install --fix to align native package versions with this Expo SDK.
6. Run npx expo start and scan the QR code with an Expo Go build that supports SDK 57.

PowerShell example: Copy-Item .env.example .env

For local API development, use the reachable LAN address of your development machine; localhost on a physical phone refers to the phone, not your PC. Use HTTPS for deployed APIs.

## Authentication and security

The app requests a native-only session token from the SaMi API and stores it with Expo SecureStore. Authenticated API calls send it as a Bearer token. Tokens are hashed before being stored in the backend database and expire after 14 days. Do not commit .env files or real credentials.

M-PESA credentials and Google routing/geocoding credentials stay on the server in Vercel Environment Variables. Only the public API base URL belongs in this app's environment file.

## Updating the app

Source changes live under apps/mobile and can be reviewed in GitHub independently from the web UI. During development, Expo Fast Refresh applies local edits quickly. After a development build and EAS project are configured, JavaScript/UI updates can be published with EAS Update when they are compatible with the installed native binary. Changes to native dependencies or permissions require a new app build. Store distribution/build credentials and EAS project IDs still need to be configured before shipping.

## Current scope

The initial app shell includes sign-in and registration, a customer dashboard, errand list, request creation with an OpenStreetMap-backed map picker and server-calculated road route, and provider foreground GPS sharing for an active accepted/in-progress assignment. Payment checkout and end-to-end device validation should be completed before production release.
