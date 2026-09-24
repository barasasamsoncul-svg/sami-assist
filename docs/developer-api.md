# SaMi API & Developer Access

Category 21 introduces a company-scoped developer surface for SaMi.

## Trust boundary

Developer API credentials are service credentials, not browser sessions.

Every API credential is bound to exactly one company inside one tenant database. The browser never chooses a tenant or company when authenticating a public API request. The opaque tenant identifier embedded in the API key is used only by the server to resolve the correct tenant database registry entry.

SaMi never returns database names, hosts, passwords, encryption keys, internal migration controls, raw SQL access or platform administration through the developer API.

## Secret handling

A generated key has the form:

`sami_live_<tenant-id>_<public-id>_<secret>`

The complete value is shown only when a key is created or rotated.

Only a SHA-256 hash of the high-entropy secret is persisted. Verification uses a constant-time comparison. Revocation replaces the stored hash with a random tombstone so the previous secret cannot authenticate again.

## Authorization

Workspace management uses the existing core permissions:

- `api.view` — view API credentials and request metadata.
- `api.manage` — create, rotate and revoke credentials.

Creating a key does not let the manager grant scopes they do not currently hold. The scope catalog is code-owned and fail-closed.

Current registered scopes:

- `context.read`
- `apps.read` — bounded read-only access to explicitly selected installed app records
- `files.read` (reserved for a registered endpoint)
- `audit.read` (reserved for a registered endpoint)
- `integrations.read` (reserved for a registered endpoint)

Live public endpoints are:

- `GET /api/v1/context` — requires `context.read`.
- `GET /api/v1/apps/<appKey>/records` — requires `apps.read`.

The app-record endpoint is read-only. The API credential must explicitly include the requested app in its allowed-app boundary, the app must still be installed and active, and its manifest must opt in to developer API exposure. Requests are forced to the credential's company and return only code-owned tables/resources. Secret/system fields are filtered and pages are bounded to at most 100 records.

For the 78 shared enterprise apps, readable tables come from the code-owned enterprise catalog. Dedicated apps such as Invoicing and Sales expose only tables declared by their manifest resources. Writes continue through their business services and are not exposed by this generic endpoint.

Installation alone never exposes business data. A module must explicitly opt in through its code-owned manifest contract and the endpoint must be registered in SaMi's developer endpoint registry.

## Rate limiting

Each credential has a bounded per-minute limit from 1 to 600 requests.

Counters are stored in PostgreSQL in `api_rate_limit_windows`, so limits are shared across serverless instances instead of relying on process memory.

## Request history

`api_request_logs` stores bounded operational metadata:

- request ID
- credential reference
- route key
- HTTP method
- response status
- outcome
- duration
- whether the request was rate limited
- timestamp

Request bodies, authorization headers and API secrets are not persisted.

## Rotation and revocation

Rotation replaces the secret hash immediately and returns a new complete API key once.

Revocation changes the credential status to `revoked` and destroys the old stored secret hash.

## Public request example

```http
GET /api/v1/context
Authorization: Bearer <API_KEY>
Accept: application/json
```

Successful responses include:

- `X-Request-Id`
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`

Unauthorized requests use the standard Bearer authentication challenge.


## Business app read example

```http
GET /api/v1/apps/crm/records?table=leads&limit=50&offset=0
Authorization: Bearer <API_KEY>
Accept: application/json
```

The credential must include both the `apps.read` scope and the `crm` allowed-app key. The response never accepts tenant or company IDs from the caller.
