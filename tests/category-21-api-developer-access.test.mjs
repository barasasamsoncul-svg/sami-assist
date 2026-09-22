import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root =
  process.cwd();

async function source(
  file,
) {
  return readFile(
    path.join(
      root,
      file,
    ),
    'utf8',
  );
}

function compact(
  value,
) {
  return value.replace(
    /\s+/g,
    ' ',
  );
}

test('Category 21: tenant core advances additively from 1.7.0 to 1.8.0', async () => {
  const [
    manifest,
    migration,
    core,
  ] =
    await Promise.all([
      source(
        'lib/schema/tenant-migrations/manifest.ts',
      ),
      source(
        'lib/schema/tenant-migrations/migrations/008-core-1.7.0-to-1.8.0.sql',
      ),
      source(
        'lib/schema/tenant-core.sql',
      ),
    ]);

  assert.match(
    manifest,
    /CURRENT_TENANT_CORE_VERSION\s*=\s*['"]1\.8\.0['"]/s,
  );

  assert.match(
    manifest,
    /core-1\.7\.0-to-1\.8\.0/,
  );

  assert.match(
    manifest,
    /008-core-1\.7\.0-to-1\.8\.0\.sql/,
  );

  assert.doesNotMatch(
    migration,
    /DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s+TABLE/i,
    'Category 21 tenant migration must remain additive.',
  );

  for (
    const table
    of [
      'api_credentials',
      'api_rate_limit_windows',
      'api_request_logs',
    ]
  ) {
    assert.match(
      migration,
      new RegExp(
        `CREATE TABLE IF NOT EXISTS ${table}`,
      ),
    );

    assert.match(
      core,
      new RegExp(
        `CREATE TABLE IF NOT EXISTS \\{schema\\}\\.${table}`,
      ),
    );
  }

  assert.match(
    migration,
    /VALUES \('1\.8\.0'/,
  );

  assert.match(
    core,
    /VALUES \('1\.8\.0'\)/,
  );
});

test('Category 21: API credentials store only a high-entropy secret hash and reveal keys only at create or rotate', async () => {
  const [
    credentials,
    service,
    migration,
  ] =
    await Promise.all([
      source(
        'lib/developer/credentials.ts',
      ),
      source(
        'lib/services/workspace-developer.ts',
      ),
      source(
        'lib/schema/tenant-migrations/migrations/008-core-1.7.0-to-1.8.0.sql',
      ),
    ]);

  assert.match(
    credentials,
    /randomBytes\(\s*SECRET_BYTES/s,
  );

  assert.match(
    credentials,
    /createHash\(\s*['"]sha256['"]/s,
  );

  assert.match(
    credentials,
    /timingSafeEqual/,
  );

  assert.match(
    service,
    /secretHash\s*=\s*hashDeveloperSecret/s,
  );

  assert.match(
    service,
    /apiKey:\s*formatDeveloperApiKey/s,
  );

  assert.doesNotMatch(
    migration,
    /secret\s+(TEXT|VARCHAR)/i,
    'The database must never persist a recoverable API secret.',
  );

  assert.match(
    migration,
    /secret_hash CHAR\(64\) NOT NULL/,
  );
});

test('Category 21: browser credential management derives tenant and company from trusted session context', async () => {
  const service =
    await source(
      'lib/services/workspace-developer.ts',
    );

  assert.match(
    service,
    /getPermissionContext\(\)/,
  );

  assert.match(
    service,
    /getSession\(\)/,
  );

  assert.match(
    service,
    /session\.currentCompanyId/,
  );

  assert.match(
    service,
    /requireCompanyAccess/,
  );

  assert.match(
    service,
    /API_VIEW/,
  );

  assert.match(
    service,
    /API_MANAGE/,
  );

  assert.doesNotMatch(
    service,
    /input\.tenantId|body\.tenantId|input\.companyId|body\.companyId/,
  );
});

test('Category 21: credential authority cannot exceed the manager current scope or app access', async () => {
  const service =
    await source(
      'lib/services/workspace-developer.ts',
    );

  assert.match(
    service,
    /getAccessibleDeveloperScopes/,
  );

  assert.match(
    service,
    /allowedScopeSet/,
  );

  assert.match(
    service,
    /accessibleAppSet/,
  );

  assert.match(
    service,
    /An API credential cannot be granted an app you cannot currently access/,
  );
});

test('Category 21: public API authentication is independent of browser sessions and fails closed', async () => {
  const auth =
    await source(
      'lib/developer/auth.ts',
    );

  assert.match(
    auth,
    /Authorization|authorization/,
  );

  assert.match(
    auth,
    /Bearer\\s\+/,
  );

  assert.match(
    auth,
    /getTenantPoolByTenantId/,
  );

  assert.match(
    auth,
    /developerSecretMatches/,
  );

  assert.match(
    auth,
    /API_KEY_INVALID/,
  );

  assert.doesNotMatch(
    auth,
    /getSession\(|cookies\(/,
  );
});


test('Category 21: invalid-tenant handling stays inside authentication and cleanup stays inside request logging', async () => {
  const auth =
    await source(
      'lib/developer/auth.ts',
    );

  const rateStart =
    auth.indexOf(
      'async function recordRateLimit(',
    );

  const authenticateStart =
    auth.indexOf(
      'export async function authenticateDeveloperRequest(',
    );

  const recordStart =
    auth.indexOf(
      'export async function recordDeveloperRequest(',
    );

  const jsonStart =
    auth.indexOf(
      'export function developerApiJson(',
    );

  assert.ok(
    rateStart >= 0 &&
    authenticateStart > rateStart &&
    recordStart > authenticateStart &&
    jsonStart > recordStart,
  );

  const rateBlock =
    auth.slice(
      rateStart,
      authenticateStart,
    );

  const authenticateBlock =
    auth.slice(
      authenticateStart,
      recordStart,
    );

  const recordBlock =
    auth.slice(
      recordStart,
      jsonStart,
    );

  assert.doesNotMatch(
    rateBlock,
    /requestId/,
    'The rate-limit helper must not depend on authentication-local request state.',
  );

  assert.match(
    authenticateBlock,
    /try\s*\{[\s\S]*getTenantPoolByTenantId[\s\S]*catch\s*\{[\s\S]*API_KEY_INVALID[\s\S]*requestId/s,
    'Unknown tenant resolution must fail closed inside the authentication request context.',
  );

  assert.match(
    recordBlock,
    /DELETE FROM api_request_logs[\s\S]*context\.companyId/s,
    'Request-history retention cleanup must remain inside recordDeveloperRequest.',
  );
});

test('Category 21: rate limiting is durable across serverless instances and bounded', async () => {
  const [
    auth,
    migration,
  ] =
    await Promise.all([
      source(
        'lib/developer/auth.ts',
      ),
      source(
        'lib/schema/tenant-migrations/migrations/008-core-1.7.0-to-1.8.0.sql',
      ),
    ]);

  assert.match(
    auth,
    /INSERT INTO api_rate_limit_windows/,
  );

  assert.match(
    auth,
    /ON CONFLICT/,
  );

  assert.match(
    auth,
    /API_RATE_LIMITED/,
  );

  assert.match(
    migration,
    /rate_limit_per_minute >= 1/,
  );

  assert.match(
    migration,
    /rate_limit_per_minute <= 600/,
  );

  assert.match(
    auth,
    /INTERVAL '1 day'/,
  );
});

test('Category 21: request history stores metadata but never bodies or authorization headers', async () => {
  const [
    auth,
    migration,
    docs,
  ] =
    await Promise.all([
      source(
        'lib/developer/auth.ts',
      ),
      source(
        'lib/schema/tenant-migrations/migrations/008-core-1.7.0-to-1.8.0.sql',
      ),
      source(
        'docs/developer-api.md',
      ),
    ]);

  assert.match(
    auth,
    /INSERT INTO api_request_logs/,
  );

  assert.match(
    migration,
    /request_id UUID NOT NULL UNIQUE/,
  );

  assert.match(
    migration,
    /duration_ms INTEGER/,
  );

  assert.doesNotMatch(
    migration,
    /request_body|authorization_header|bearer_token|secret_value/i,
  );

  assert.match(
    docs,
    /Request bodies, authorization headers and API secrets are not persisted/,
  );

  assert.match(
    auth,
    /INTERVAL '90 days'/,
  );
});

test('Category 21: rotation invalidates the previous secret and revocation destroys the stored hash', async () => {
  const service =
    await source(
      'lib/services/workspace-developer.ts',
    );

  assert.match(
    service,
    /operation ===\s*['"]rotate['"]/s,
  );

  assert.match(
    service,
    /secret_hash = \$3/,
  );

  assert.match(
    service,
    /rotated_at =\s*NOW\(\)/s,
  );

  assert.match(
    service,
    /operation ===\s*['"]revoke['"]/s,
  );

  assert.match(
    service,
    /tombstone\s*=\s*hashDeveloperSecret/s,
  );

  assert.match(
    service,
    /status =\s*['"]revoked['"]/s,
  );
});

test('Category 21: expired credentials are rejected by authentication and displayed as effectively expired', async () => {
  const [
    auth,
    service,
  ] =
    await Promise.all([
      source(
        'lib/developer/auth.ts',
      ),
      source(
        'lib/services/workspace-developer.ts',
      ),
    ]);

  assert.match(
    auth,
    /row\.expires_at[\s\S]*Date\.now\(\)/,
  );

  assert.match(
    service,
    /expires_at <= NOW\(\)[\s\S]*THEN 'expired'/,
  );

  assert.match(
    service,
    /Only an active API credential can be rotated/,
  );
});

test('Category 21: API scope catalog is code-owned and begins read-only', async () => {
  const scopes =
    await source(
      'lib/developer/scopes.ts',
    );

  for (
    const key
    of [
      'context.read',
      'files.read',
      'audit.read',
      'integrations.read',
    ]
  ) {
    assert.match(
      scopes,
      new RegExp(
        key.replace(
          '.',
          '\\.',
        ),
      ),
    );
  }

  assert.doesNotMatch(
    scopes,
    /operation:\s*['"]write['"]/,
  );
});

test('Category 21: first live API v1 endpoint requires context.read and emits request and rate-limit metadata', async () => {
  const route =
    await source(
      'app/api/v1/context/route.ts',
    );

  assert.match(
    route,
    /authenticateDeveloperRequest\([\s\S]*['"]context\.read['"]/,
  );

  assert.match(
    route,
    /recordDeveloperRequest/,
  );

  assert.match(
    route,
    /developerApiJson/,
  );

  assert.match(
    route,
    /apiVersion:\s*['"]v1['"]/,
  );
});

test('Category 21: module APIs are code-owned, opt-in and fail closed when no app boundary is selected', async () => {
  const [
    registry,
    types,
    firstParty,
  ] =
    await Promise.all([
      source(
        'lib/developer/registry.ts',
      ),
      source(
        'lib/modules/types.ts',
      ),
      source(
        'lib/modules/first-party.ts',
      ),
    ]);

  assert.match(
    types,
    /apiEndpoints: boolean/,
  );

  assert.match(
    registry,
    /MODULE_DEVELOPER_ENDPOINTS/,
  );

  assert.match(
    registry,
    /extensions[\s\S]*apiEndpoints/s,
  );

  assert.match(
    registry,
    /credentialBoundary\.length ===\s*0/s,
  );

  assert.equal(
    (
      firstParty.match(
        /apiEndpoints: false/g,
      ) ||
      []
    ).length,
    36,
    'All current first-party apps must fail closed for public API exposure.',
  );
});

test('Category 21: workspace management routes are same-origin protected and no-cache', async () => {
  const [
    rootRoute,
    credentialRoute,
    helper,
  ] =
    await Promise.all([
      source(
        'app/api/workspace/developer/route.ts',
      ),
      source(
        'app/api/workspace/developer/[credentialId]/route.ts',
      ),
      source(
        'lib/services/workspace-developer-api.ts',
      ),
    ]);

  assert.match(
    rootRoute,
    /rejectDeveloperCrossOrigin/,
  );

  assert.match(
    credentialRoute,
    /rejectDeveloperCrossOrigin/,
  );

  assert.match(
    helper,
    /sec-fetch-site/,
  );

  assert.match(
    helper,
    /Cache-Control[\s\S]*no-store/s,
  );
});

test('Category 21: Developer workspace and global search are permission-aware', async () => {
  const [
    page,
    navigation,
    sidebar,
    search,
  ] =
    await Promise.all([
      source(
        'app/developer/page.tsx',
      ),
      source(
        'app/api/workspace/navigation/route.ts',
      ),
      source(
        'app/components/workspace/WorkspaceSidebar.tsx',
      ),
      source(
        'lib/search/workspace-search.ts',
      ),
    ]);

  assert.match(
    page,
    /API_VIEW/,
  );

  assert.match(
    page,
    /API_MANAGE/,
  );

  assert.match(
    navigation,
    /apiView/,
  );

  assert.match(
    navigation,
    /apiManage/,
  );

  assert.match(
    sidebar,
    /href="\/developer"/,
  );

  assert.match(
    search,
    /page:developer/,
  );

  assert.match(
    search,
    /Developer Access/,
  );
});

test('Category 21: Developer mobile experience uses progressive disclosure rather than one long page', async () => {
  const client =
    await source(
      'app/developer/DeveloperClient.tsx',
    );

  assert.match(
    client,
    /type MobileSection/,
  );

  assert.match(
    client,
    /Overview/,
  );

  assert.match(
    client,
    /Create/,
  );

  assert.match(
    client,
    /Keys/,
  );

  assert.match(
    client,
    /Requests/,
  );

  assert.match(
    client,
    /hidden lg:block/,
  );
});

test('Workspace notification drawer uses an opaque raised panel surface', async () => {
  const notifications =
    await source(
      'app/components/workspace/WorkspaceNotificationCenter.tsx',
    );

  assert.match(
    compact(
      notifications,
    ),
    /aside className="absolute inset-y-0 right-0 isolate[^"]*bg-white[^"]*dark:bg-\[#11141a\]"/,
  );

  assert.match(
    notifications,
    /flex h-full flex-col bg-white dark:bg-\[#11141a\]/,
  );
});

test('Category 21: documentation keeps infrastructure and secret boundaries explicit', async () => {
  const docs =
    await source(
      'docs/developer-api.md',
    );

  assert.match(
    docs,
    /never returns database names, hosts, passwords, encryption keys, internal migration controls, raw SQL access or platform administration/i,
  );

  assert.match(
    docs,
    /complete value is shown only when a key is created or rotated/i,
  );

  assert.match(
    docs,
    /Installation alone never exposes business data/i,
  );
});

test('Category 21: full-suite gate includes Developer Access regression coverage', async () => {
  const packageJson =
    JSON.parse(
      await source(
        'package.json',
      ),
    );

  assert.equal(
    packageJson.scripts[
      'test:category21'
    ],
    'node --test tests/category-21-api-developer-access.test.mjs',
  );

  assert.match(
    packageJson.scripts[
      'test:all'
    ],
    /test:category21/,
  );
});
