import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return readFile(path.join(root, file), 'utf8');
}

function compact(value) {
  return value.replace(/\s+/g, ' ');
}

test('Category 1: registration retains complete identity/workspace provisioning flow', async () => {
  const register = compact(await source('app/api/auth/register/route.ts'));

  assert.match(register, /INSERT INTO users/i);
  assert.match(register, /INSERT INTO tenants/i);
  assert.match(register, /INSERT INTO tenant_users/i);
  assert.match(register, /INSERT INTO subscriptions/i);
  assert.match(register, /INSERT INTO tenant_modules/i);
  assert.match(register, /provisionTenant/);
  assert.match(register, /email_verifications/i);
  assert.match(register, /createHash\(['"]sha256['"]\)/i);

  const forgot = compact(await source('app/api/auth/forgot-password/route.ts'));
  assert.match(
    forgot,
    /If the email exists, a password reset link has been sent\./,
    'Forgot-password must remain anti-enumeration safe.',
  );
});

test('Category 1: email verification and Google identity routes remain present', async () => {
  const files = [
    'app/api/auth/verify-email/route.ts',
    'app/api/auth/resend-verification/route.ts',
    'app/api/auth/google/route.ts',
    'app/api/auth/google/callback/route.ts',
    'app/api/auth/reset-password/route.ts',
    'app/api/auth/change-password/route.ts',
  ];

  for (const file of files) {
    assert.ok((await source(file)).length > 100, `${file} is unexpectedly empty.`);
  }
});

test('Category 2: personal account surfaces remain separate from workspace management', async () => {
  const files = [
    'app/api/account/route.ts',
    'app/api/account/profile/route.ts',
    'app/api/account/avatar/route.ts',
    'app/api/account/preferences/route.ts',
    'app/api/account/email-change/request/route.ts',
    'app/api/account/email-change/verify/route.ts',
  ];

  for (const file of files) {
    assert.ok((await source(file)).length > 100, `${file} is unexpectedly empty.`);
  }

  const account = compact(await source('app/api/account/route.ts'));
  assert.doesNotMatch(
    account,
    /INSERT INTO tenants/i,
    'Personal account API must not create workspaces.',
  );
});

test('Category 3: sessions use opaque hashed tokens and secure cookies', async () => {
  const sessions = compact(await source('lib/auth/session.ts'));

  assert.match(sessions, /randomBytes/);
  assert.match(sessions, /createHash\(['"]sha256['"]\)/i);
  assert.match(sessions, /httpOnly:\s*true/i);
  assert.match(sessions, /sameSite:\s*['"]lax['"]/i);
  assert.match(sessions, /__Host-sami_session/);
  assert.match(sessions, /repairSessionTenant/);
  assert.match(sessions, /revoke/i);

  for (const file of [
    'app/api/account/sessions/route.ts',
    'app/api/account/sessions/[sessionId]/route.ts',
    'app/api/auth/logout/route.ts',
    'app/api/auth/logout-all/route.ts',
  ]) {
    assert.ok((await source(file)).length > 100, `${file} is unexpectedly empty.`);
  }
});

test('Category 4: security primitives are implemented centrally', async () => {
  const [twoFactor, recovery, rateLimit, challenges, securityAction] =
    await Promise.all([
      source('lib/auth/two-factor.ts'),
      source('lib/auth/recovery-codes.ts'),
      source('lib/auth/rate-limit.ts'),
      source('lib/auth/login-challenges.ts'),
      source('lib/auth/security-action.ts'),
    ]);

  assert.match(twoFactor, /TOTP|totp/i);
  assert.match(twoFactor, /recovery/i);
  assert.match(recovery, /hash/i);
  assert.match(rateLimit, /blocked_until|blockedUntil/i);
  assert.match(challenges, /challenge/i);
  assert.ok(securityAction.length > 1000);
});

test('Category 5: workspace management uses canonical permissions while structural lifecycle stays owner-only', async () => {
  const workspace = compact(await source('app/api/workspace/route.ts'));

  assert.match(workspace, /getPermissionContext/);
  assert.match(workspace, /SAMI_PERMISSIONS\.WORKSPACE_MANAGE/);
  assert.match(workspace, /canManageLifecycle:\s*identity\.isOwner/);
  assert.match(workspace, /canTransferOwnership:\s*identity\.isOwner/);
  assert.match(workspace, /setCurrentTenantForSession/);
  assert.match(workspace, /tenant_users/i);
});

test('Category 6: every workspace receives a physical PostgreSQL database and a registry record', async () => {
  const provisioning = compact(await source('lib/services/tenant-provisioning.ts'));
  const registry = compact(await source('lib/db/registry.ts'));

  assert.match(provisioning, /CREATE DATABASE/);
  assert.match(provisioning, /INSERT INTO tenant_databases/i);
  assert.match(provisioning, /schema_version/i);
  assert.match(provisioning, /verifyTenantDatabase/i);
  assert.match(registry, /tenant_id\s*=\s*\$1/i);
  assert.match(registry, /status\s*=\s*['"]active['"]/i);
});

test('Category 6: migrations are versioned, locked and auditable', async () => {
  const migrations = compact(await source('lib/services/tenant-migrations.ts'));
  const manifest = compact(await source('lib/schema/tenant-migrations/manifest.ts'));

  assert.match(migrations, /tenant_database_migrations/i);
  assert.match(migrations, /checksum/i);
  assert.match(migrations, /migration lock|tenant-migration/i);
  assert.match(manifest, /CURRENT_TENANT_CORE_VERSION/);
});

test('Category 6: tenant health is distinct from lifecycle state', async () => {
  const health = compact(await source('lib/services/tenant-health.ts'));

  assert.match(health, /health_status/i);
  assert.match(health, /last_health_check_at/i);
  assert.match(health, /healthy/i);
  assert.match(health, /unreachable/i);
});

test('Category 6: independent logical backup provider exists and cannot overwrite production during restore', async () => {
  const provider = compact(
    await source('lib/services/postgres-logical-backup-provider.ts'),
  );
  const recovery = compact(await source('lib/services/tenant-recovery.ts'));

  assert.match(provider, /pg_dump/);
  assert.match(provider, /pg_restore/);
  assert.match(provider, /PutObjectCommand/);
  assert.match(provider, /HeadObjectCommand/);
  assert.match(provider, /target database already exists/i);
  assert.match(provider, /fresh database/i);

  assert.match(recovery, /postgres-logical-backup-provider/);
  assert.match(recovery, /restoreTenantRecoveryPoint/);
  assert.match(recovery, /deleteTenantRecoveryPoint/);
  assert.match(
    recovery,
    /registry cutover is a separate explicit administrative action/i,
  );
});

test('Foundation boundary: local backup copies are not tracked by future commits', async () => {
  const gitignore = await source('.gitignore');
  assert.match(gitignore, /^\.sami-backups\/$/m);
});
