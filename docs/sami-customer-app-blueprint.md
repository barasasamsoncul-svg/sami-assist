# SaMi Customer App Blueprint

## Product definition

SaMi is an errand marketplace, not a ride-hailing app. Borrow the useful interaction patterns of established on-demand apps—clear location context, a live map, a persistent task state, direct communication and transparent fees—without using ride vocabulary, driver/vehicle concepts, passenger pickup flows or ride pricing.

This document is the product direction for the **customer app only**. Provider workflows must not be redesigned as part of customer-only work unless explicitly requested.

## Customer home

1. **Brand header:** use a typographic wordmark, “SaMi errands”, set in a confident italic serif style with navy and blue accent. No photo, raster logo or separate logo mark in the customer header. Display a recognizable bell icon with an unread badge and a hamburger control.
2. **Map-first start:** the upper home section is a real native map centered on the customer’s selected/recent location or a useful Nairobi default. A customer can tap to set a pickup point or use foreground location permission. Do not ask “Choose your location” without a map or useful location action.
3. **Plan an errand:** one intentional action starts the request form. Do not duplicate the entire request form on home. A pickup pin selected on home must carry into the request flow.
4. **Service discovery:** real category shortcuts for shopping, pickup/drop-off, documents, queues/appointments, personal errands, business errands, clothing and other legitimate tasks. Each shortcut starts a relevant request and passes its category forward.
5. **Task continuity:** show meaningful active-errand status and a link to details. Details are the place for the full itinerary, messages, calls, payment state, actions and history.
6. **Visual system:** high-quality spacing, safe areas, readable contrast, consistent native icons, useful loading/empty/error states, and no decorative controls that do nothing.

## Errand communication (essential)

Communication belongs to an individual errand and its participants—not to a generic ride.

- **Private errand chat:** durable, task-scoped messages between the customer and the assigned provider. Include timestamps, sender identity, sensible empty/loading/error states, refresh/polling or realtime updates, and a clear message composer.
- **In-app voice calls:** one-to-one audio calls from errand details using the app's call UI and WebRTC signalling. Support outgoing call, ringing, answer, decline, mute, hang up, connection/error state and recovery. Do not expose personal phone numbers as a prerequisite for app calls.
- **Contact rules:** allow calls only for the customer and assigned provider, for the same errand, during eligible statuses (assigned/accepted/in progress/completion submitted). End or disable call actions when the assignment/status no longer allows contact. Never allow administrators to join these customer-provider calls.
- **Task context:** show the errand title/code on the call screen. Calls and messages must not be described as rides, passengers, drivers or destinations for a journey.
- **Notifications:** unread badge on the bell, incoming-call awareness and errand-specific notification links. Read/decline/open actions must act on their actual server records.
- **Production prerequisites:** apply the errand-call database migration with a database-owner role; deploy the signalling endpoints; configure required STUN/TURN servers for reliable connections across mobile networks; build and verify the native WebRTC dependencies in the production APK.

## Errand request and tracking

The request flow owns the complete details: task category, description, pickup address/pin, destination when relevant, item size/value, priority, seller/goods budget where relevant and payment method. Calculate service fees from the server's pricing rules, location and distance. Keep goods/seller costs separate from SaMi's service fee. Do not turn the home screen into a second version of the request form.

After submission, the customer sees status, assigned provider (when available), route/location updates when legitimately shared, payment state, task-scoped chat/call, completion confirmation, ratings and the event history.

## Customer settings drawer

The hamburger opens a side drawer headed **Settings**, followed by vertically stacked sub-settings:
- Account security — change password, security/session information.
- Data & privacy — export data, account deletion and data-retention explanation.
- Notifications — open notification centre/preferences.
- Location & maps — app permission help/settings.
- Help & support / About SaMi — genuinely useful customer help.

Selecting a sub-setting should open the relevant section, not route every item to the top of a generic page.

## Customer account and privacy

The customer Account area is for identity, security and privacy. Do not put “My errands” or “Payments” shortcuts inside Account; those belong in their own navigation destinations. Account should show profile identity/contact details, allow password change, support a data export and provide account deletion with re-authentication and explicit confirmation. Deletion must prevent further sign-in, remove or redact eligible personal data and explain retained financial/audit data; do not claim all information is erased if legal reconciliation records must remain.

## Navigation

Customer bottom navigation: **Home · My Errands · Payments · Account**. Use recognizable vector icons. Communication actions are opened from errand details and incoming-call context, rather than adding a generic “Calls” tab detached from an errand.

## Map implementation

The customer app should use a native map SDK, not a Leaflet map embedded in a WebView. Android uses Google Maps through the native map provider; iOS uses the native Apple provider unless a Google provider is deliberately configured. The Android Google Maps SDK needs a restricted API key available in the EAS production environment and a new compatible APK after adding the native module. Restrict the key by Android package and the production signing certificate, and enable only required Maps SDK APIs. Do not publish a JavaScript update that assumes a native module exists in an installed APK that does not contain it.

## Acceptance checks

- The home is map-led; map taps and current-location permission set a real pickup point that pre-fills request creation.
- Header reads “SaMi errands” in styled italic typography, with a recognizable bell and unread count; no customer-header pictorial logo is displayed.
- Service categories launch the correct request form.
- Errand details provide task-scoped messages and in-app audio calls for assigned participants only.
- The Settings drawer is real and each section opens correctly.
- Account provides functioning password, export and deletion actions; server checks enforce re-authentication and open-errand safeguards.
- Native map and call capabilities are tested in the signed production APK, with compatible OTA updates only for JavaScript changes.
