# SaMi Runner

Independent Runner mobile application.

- Mobile app: apps/runner
- API service: apps/runner-api
- Neon project: SaMi Runner
- Neon branch: main
- Neon database: sami_runner
- Expo slug: sami-runner
- Android package: com.sami.runner
- iOS bundle: com.sami.runner

The Runner app and API use only the Runner database. They do not share the Customer database. Customer errand references are retained only as opaque integration identifiers when a trusted event is eventually received.

## Local setup

From the repository root:

    cd apps/runner
    npm install
    Copy-Item .env.example .env
    npx expo start

Set EXPO_PUBLIC_RUNNER_API_URL to the separately deployed Runner API URL.

## Native builds

The app needs its own Expo project link:

    npx eas-cli@latest init

Do not use the Customer EAS project ID or Customer production update channel.

## Initial capabilities

- Runner phone OTP sign-in
- Runner profile setup
- Verification-gated availability
- Errand offer list and accept action
- Start errand and submit completion
- Foreground location publishing while an accepted errand is active

Background location, verification document uploads, Operations review tooling and the Customer/Runner integration publisher are follow-on work.