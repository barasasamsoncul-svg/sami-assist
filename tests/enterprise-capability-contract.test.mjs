import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readFile,
} from 'node:fs/promises';

import path from 'node:path';

const root =
  process.cwd();

async function source(
  file,
) {
  return (
    await readFile(
      path.join(
        root,
        file,
      ),
      'utf8',
    )
  ).replace(
    /\r\n/g,
    '\n',
  );
}

test('shared enterprise modules expose only backed cross-cutting capabilities', async () => {
  const [
    contract,
    notifications,
    integrations,
  ] = await Promise.all([
    source(
      'lib/modules/enterprise-contract.ts',
    ),
    source(
      'lib/services/workspace-notifications.ts',
    ),
    source(
      'lib/integrations/registry.ts',
    ),
  ]);

  assert.match(
    contract,
    /notifications:\s*true/,
    'Enterprise modules must opt into the existing workspace notification runtime.',
  );

  assert.match(
    notifications,
    /assertRegisteredSamiModuleExtension\([\s\S]*'notifications'/s,
    'Module-sourced notifications must remain protected by the manifest capability gate.',
  );

  assert.match(
    integrations,
    /APP_INTEGRATION_PROVIDERS:\s*[\s\S]*=\s*\[\]/s,
    'App-specific integration providers must remain explicit rather than being fabricated by the shared contract.',
  );

  assert.doesNotMatch(
    contract,
    /integrationProviders:\s*true/,
    'Do not advertise app-specific integration providers until concrete provider definitions exist.',
  );

  assert.doesNotMatch(
    contract,
    /dataErasure:\s*true/,
    'Do not advertise generic data erasure until a module-aware erasure runtime is implemented.',
  );
});

test('developer API remains versioned, credential-scoped and app-bounded', async () => {
  const [
    route,
    scopes,
    registry,
  ] = await Promise.all([
    source(
      'app/api/v1/apps/[appKey]/records/route.ts',
    ),
    source(
      'lib/developer/scopes.ts',
    ),
    source(
      'lib/developer/registry.ts',
    ),
  ]);

  assert.match(
    route,
    /authenticateDeveloperRequest\([\s\S]*'apps\.read'/s,
  );

  assert.match(
    route,
    /apiVersion:[\s\S]*'v1'/s,
  );

  assert.match(
    route,
    /recordDeveloperRequest/,
  );

  assert.match(
    scopes,
    /key:\s*'apps\.read'/,
  );

  assert.match(
    registry,
    /credentialBoundary\.length ===\s*0[\s\S]*return \[\]/s,
    'An API credential with no allowed apps must continue to mean NONE, never ALL.',
  );
});
