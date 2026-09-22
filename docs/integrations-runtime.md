# SaMi Integrations Runtime

Category 20 provides the platform control plane for external services and external business applications.

## Product model

SaMi separates three concepts:

1. **Connections** — organization-managed service connections such as Google Workspace, Microsoft 365 and Slack.
2. **Webhook/event integrations** — verified inbound events that can feed SaMi Automation.
3. **External apps** — approved cloud or internal business applications surfaced through the SaMi app launcher.

Native SaMi modules remain Category 13 modules. External apps never become native modules merely because they appear in the same launcher.

## Authority

Integration administration follows:

```text
session
→ workspace
→ current company
→ integrations.view / integrations.manage
→ accessible module extensions
→ code-owned provider/runtime handler
```

Assigned employees may launch an external app without receiving `integrations.view` or `integrations.manage`. Administration and consumption are intentionally separate.

Automation continues to apply its own authority chain. An integration never grants Automation extra permission.

## Credential security

OAuth/API credentials are server-only.

SaMi uses AES-256-GCM with a versioned environment keyring.

Example deployment configuration:

```text
SAMI_INTEGRATION_ENCRYPTION_KEY_VERSION=v1
SAMI_INTEGRATION_ENCRYPTION_KEY_V1=<32-byte key encoded as 64 hex chars or base64>
```

The browser never receives stored OAuth access or refresh tokens.

Changing the active key version allows new credentials to use a new key while older payloads remain decryptable by their recorded version until intentionally rotated.

## OAuth providers

Core provider definitions currently include:

- Google Workspace
- Microsoft 365
- Slack

Provider client credentials are deployment configuration, never workspace settings:

```text
SAMI_PUBLIC_APP_URL=https://app.example.com

SAMI_GOOGLE_OAUTH_CLIENT_ID=...
SAMI_GOOGLE_OAUTH_CLIENT_SECRET=...

SAMI_MICROSOFT_OAUTH_CLIENT_ID=...
SAMI_MICROSOFT_OAUTH_CLIENT_SECRET=...

SAMI_SLACK_OAUTH_CLIENT_ID=...
SAMI_SLACK_OAUTH_CLIENT_SECRET=...
```

OAuth state is one-time, expiring and bound to the initiating user, workspace company and callback URI. PKCE is used where the provider contract enables it.

A provider is shown as connectable only when both its OAuth credentials and the SaMi integration encryption keyring are configured.

Google and Microsoft currently establish trusted identity connections for future code-owned provider extensions. SaMi does not advertise a sync button until a real sync handler exists.

Slack currently exposes a real code-owned Automation action for sending a message using the connected workspace token.

## Module-provided integrations

Category 13 manifests now include:

```text
extensions.integrationProviders
```

The default is false for first-party modules.

A future module-contributed provider must:

- exist in code
- declare its module key
- belong to an installed/access-authorized module
- have `integrationProviders=true`

Database metadata cannot create executable providers.

## Inbound webhooks

Managers can create a custom inbound webhook.

The secret is shown once. SaMi stores only its SHA-256 hash.

Public ingress:

```text
POST /api/integrations/webhooks/inbound/{tenantId}/{endpointKey}
Authorization: Bearer <webhook-secret>
X-SaMi-Event-Key: lead.created
X-SaMi-Event-Id: provider-event-id
Content-Type: application/json
```

Protections include:

- constant-time secret comparison
- 256 KB body limit
- per-endpoint event allow-list
- 120 deliveries/minute endpoint guard
- external-event idempotency
- payload digest storage
- delivery/event history
- no database/API credential exposure

Verified events can trigger `integrations.webhook.received` Automation workflows.

The workflow uses the user who activated it as `run_as_user_id`. That user's live workspace/company/app permissions are revalidated before actions execute.

## External app launcher

External applications may be assigned by:

- selected users
- all active internal users with company access
- structured rules

Current structured rule inputs are:

- one or more SaMi role keys
- one or more email domains
- match all / match any

There is no arbitrary JavaScript or expression language.

Assigned external apps appear in:

- the full Apps launcher
- the compact app switcher
- global Search

They are visibly marked as external and open the approved URL outside SaMi.

The schema reserves SAML/OIDC metadata for future enterprise SSO, but Category 20 currently exposes bookmark-style external app launching only. SaMi must not claim SSO until a real SaMi identity-provider flow is implemented and tested.

## Health and sync

Connection health is code-owned:

- Google: OpenID user-info check
- Microsoft 365: Microsoft Graph `/me`
- Slack: `auth.test`

Health results update connection status without exposing credentials.

The sync runtime also uses a code-owned handler registry. If a provider has no registered sync handler, SaMi does not show a Sync action and will not create a fake successful sync job.

## Automation actions

Implemented integration Automation capabilities:

- Trigger: `integrations.webhook.received`
- Action: `integrations.slack.send_message`

The Slack action accepts only a connected current-company Slack connection, a Slack conversation/channel ID and message text. It does not accept an arbitrary HTTP destination.

## Tenant schema

Category 20 advances tenant core:

```text
1.6.0 → 1.7.0
```

It adds:

- `integration_connections`
- `integration_credentials`
- `integration_oauth_states`
- `integration_sync_jobs`
- `integration_webhook_endpoints`
- `integration_webhook_deliveries`
- `integration_events`
- `integration_external_apps`
- `integration_external_app_assignments`
- `integration_assignment_rules`

It also adds `run_as_user_id` to Automation workflows so event-driven integration workflows retain an explicit authority principal.
