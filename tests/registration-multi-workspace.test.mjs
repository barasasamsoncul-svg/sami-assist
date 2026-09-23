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
  return readFile(
    path.join(
      root,
      file,
    ),
    'utf8',
  );
}


test('Registration: sensitive identity state lives in an encrypted HttpOnly server draft', async () => {
  const [
    draft,
    route,
    env,
  ] =
    await Promise.all([
      source(
        'lib/auth/registration-draft.ts',
      ),
      source(
        'app/api/auth/registration-draft/route.ts',
      ),
      source(
        'docs/platform-env.example',
      ),
    ]);

  assert.match(
    draft,
    /aes-256-gcm/,
  );

  assert.match(
    draft,
    /httpOnly:[\s\S]*true/s,
  );

  assert.match(
    draft,
    /sameSite:[\s\S]*'lax'/s,
  );

  assert.match(
    draft,
    /SAMI_REGISTRATION_DRAFT_SECRET/,
  );

  assert.match(
    route,
    /hashPassword/,
    'Email/password registration must hash the password before it enters the encrypted server draft.',
  );

  assert.match(
    env,
    /SAMI_REGISTRATION_DRAFT_SECRET=/,
  );

  assert.doesNotMatch(
    env,
    /NEXT_PUBLIC_SAMI_REGISTRATION_DRAFT_SECRET/,
  );
});


test('Registration: browser storage never persists plaintext account credentials', async () => {
  const [
    registerClient,
    googleComplete,
    selectPlan,
  ] =
    await Promise.all([
      source(
        'app/register/RegisterClient.tsx',
      ),
      source(
        'app/google-complete/page.tsx',
      ),
      source(
        'app/select-plan/page.tsx',
      ),
    ]);

  assert.doesNotMatch(
    registerClient,
    /sessionStorage\.setItem\([\s\S]{0,500}password/i,
  );

  assert.doesNotMatch(
    googleComplete,
    /sessionStorage\.setItem\([\s\S]{0,500}sami_account_form/i,
  );

  assert.doesNotMatch(
    selectPlan,
    /readAccountForm/,
  );

  assert.doesNotMatch(
    selectPlan,
    /\.\.\.account/,
    'Final workspace creation must not resend a browser account object.',
  );

  assert.match(
    selectPlan,
    /const payload = \{[\s\S]*plan:[\s\S]*selectedApps:[\s\S]*apps[\s\S]*\};/s,
  );
});


test('Registration: an existing verified identity creates another workspace instead of another users row', async () => {
  const [
    draftRoute,
    registerRoute,
    workspacePage,
    workspaceClient,
    registerPage,
  ] =
    await Promise.all([
      source(
        'app/api/auth/registration-draft/route.ts',
      ),
      source(
        'app/api/auth/register/route.ts',
      ),
      source(
        'app/workspaces/new/page.tsx',
      ),
      source(
        'app/workspaces/new/NewWorkspaceClient.tsx',
      ),
      source(
        'app/register/page.tsx',
      ),
    ]);

  assert.match(
    draftRoute,
    /source ===[\s\S]*'existing'/s,
  );

  assert.match(
    draftRoute,
    /session\.user\.id ===[\s\S]*existing\.id/s,
  );

  assert.match(
    registerRoute,
    /existingAccountRegistration/,
  );

  assert.match(
    registerRoute,
    /context\.userId =[\s\S]*existing\.id/s,
  );

  assert.match(
    registerRoute,
    /if \([\s\S]*!existingAccountRegistration[\s\S]*INSERT INTO users/s,
    'An authenticated existing account must not create a second global user.',
  );

  assert.match(
    workspacePage,
    /getSession/,
  );

  assert.match(
    workspacePage,
    /\/login\?next=%2Fworkspaces%2Fnew/,
  );

  assert.match(
    workspaceClient,
    /source:[\s\S]*'existing'/s,
  );

  assert.match(
    registerPage,
    /redirectIfAuthenticated\([\s\S]*'\/workspaces\/new'/s,
  );
});


test('Registration: rollback never deletes a reused existing SaMi identity', async () => {
  const registerRoute =
    await source(
      'app/api/auth/register/route.ts',
    );

  const cleanupStart =
    registerRoute.indexOf(
      'async function cleanupRegistration',
    );

  const cleanupEnd =
    registerRoute.indexOf(
      '/* ============================================================',
      cleanupStart +
        20,
    );

  const cleanup =
    registerRoute.slice(
      cleanupStart,
      cleanupEnd,
    );

  assert.match(
    cleanup,
    /context\.userId[\s\S]*context\.userCreated/s,
  );

  assert.match(
    cleanup,
    /DELETE FROM users/,
  );

  assert.doesNotMatch(
    cleanup,
    /if \(\s*context\.userId\s*\)\s*\{[\s\S]*DELETE FROM users/s,
    'A pre-existing user must survive tenant-registration rollback.',
  );
});


test('Registration: final identity and subscription email recipient are loaded from the new workspace owner in Control DB', async () => {
  const registerRoute =
    await source(
      'app/api/auth/register/route.ts',
    );

  assert.match(
    registerRoute,
    /readRegistrationDraft/,
  );

  assert.doesNotMatch(
    registerRoute,
    /body\.(email|firstName|lastName|password|businessName)/,
    'Final registration must not trust browser identity fields.',
  );

  assert.match(
    registerRoute,
    /INNER JOIN tenants t[\s\S]*INNER JOIN tenant_users tu[\s\S]*INNER JOIN users u/s,
  );

  assert.match(
    registerRoute,
    /u\.email AS owner_email/,
  );

  assert.match(
    registerRoute,
    /t\.name AS tenant_name/,
  );

  assert.match(
    registerRoute,
    /sendSubscriptionConfirmationEmail\(\{[\s\S]*email:[\s\S]*authoritativeEmail[\s\S]*firstName:[\s\S]*authoritativeFirstName[\s\S]*businessName:[\s\S]*authoritativeBusinessName/s,
  );

  assert.match(
    registerRoute,
    /verification:[\s\S]*email:[\s\S]*authoritativeEmail/s,
  );
});


test('Registration: existing workspace creation switches the authenticated session into the new tenant', async () => {
  const registerRoute =
    await source(
      'app/api/auth/register/route.ts',
    );

  assert.match(
    registerRoute,
    /setCurrentTenantForSession/,
  );

  assert.match(
    registerRoute,
    /existingAccountRegistration[\s\S]*provisioningSucceeded[\s\S]*setCurrentTenantForSession/s,
  );

  assert.match(
    registerRoute,
    /session\.sessionId[\s\S]*session\.user\.id[\s\S]*context\.tenantId/s,
  );
});


test('Registration: Google registration is bound to server OAuth state and existing Google identities continue to workspace creation', async () => {
  const [
    draftRoute,
    registerRoute,
    googleCallback,
    googleComplete,
  ] =
    await Promise.all([
      source(
        'app/api/auth/registration-draft/route.ts',
      ),
      source(
        'app/api/auth/register/route.ts',
      ),
      source(
        'app/api/auth/google/callback/route.ts',
      ),
      source(
        'app/google-complete/page.tsx',
      ),
    ]);

  assert.match(
    draftRoute,
    /google_signup_states/,
  );

  assert.match(
    registerRoute,
    /googleSignup\.state_hash !==[\s\S]*draft\.googleStateHash/s,
  );

  assert.match(
    googleComplete,
    /source:[\s\S]*'google'/s,
  );

  assert.match(
    googleCallback,
    /intent ===[\s\S]*'register'[\s\S]*'\/workspaces\/new'/s,
  );
});


test('Registration: draft endpoint is rate-limited, same-origin and bounded', async () => {
  const route =
    await source(
      'app/api/auth/registration-draft/route.ts',
    );

  assert.match(
    route,
    /checkRateLimit/,
  );

  assert.match(
    route,
    /registration_draft_public/,
  );

  assert.match(
    route,
    /registration_draft_email/,
  );

  assert.match(
    route,
    /sec-fetch-site/,
  );

  assert.match(
    route,
    /INVALID_ORIGIN/,
  );

  assert.match(
    route,
    /MAX_REQUEST_BYTES/,
  );

  assert.match(
    route,
    /UNSUPPORTED_MEDIA_TYPE/,
  );
});


test('Registration: Apps and Plan pages verify the secure draft before continuing', async () => {
  const [
    route,
    apps,
    plan,
  ] =
    await Promise.all([
      source(
        'app/api/auth/registration-draft/route.ts',
      ),
      source(
        'app/select-apps/page.tsx',
      ),
      source(
        'app/select-plan/page.tsx',
      ),
    ]);

  assert.match(
    route,
    /export async function GET/,
  );

  assert.match(
    route,
    /REGISTRATION_DRAFT_REQUIRED/,
  );

  assert.match(
    apps,
    /\/api\/auth\/registration-draft/,
  );

  assert.match(
    apps,
    /draftReady/,
  );

  assert.match(
    plan,
    /\/api\/auth\/registration-draft/,
  );

  assert.match(
    plan,
    /draftReady/,
  );
});


test('Registration: workspace settings exposes switch and create controls for multi-workspace identities', async () => {
  const [
    api,
    settings,
  ] =
    await Promise.all([
      source(
        'app/api/workspace/route.ts',
      ),
      source(
        'app/settings/components/WorkspaceSettings.tsx',
      ),
    ]);

  assert.match(
    api,
    /listAccessibleWorkspaces/,
  );

  assert.match(
    api,
    /switch_workspace/,
  );

  assert.match(
    settings,
    /Your workspaces/,
  );

  assert.match(
    settings,
    /href="\/workspaces\/new"/,
  );

  assert.match(
    settings,
    /switchToWorkspace/,
  );

  assert.match(
    settings,
    /'switch_workspace'/,
  );
});


test('Registration: existing public email path explains multi-workspace sign-in instead of generic duplicate-user failure', async () => {
  const [
    draftRoute,
    registerClient,
    registerRoute,
  ] =
    await Promise.all([
      source(
        'app/api/auth/registration-draft/route.ts',
      ),
      source(
        'app/register/RegisterClient.tsx',
      ),
      source(
        'app/api/auth/register/route.ts',
      ),
    ]);

  assert.match(
    draftRoute,
    /ACCOUNT_SIGN_IN_REQUIRED/,
  );

  assert.match(
    draftRoute,
    /create another workspace or accept workspace invitations/,
  );

  assert.match(
    registerClient,
    /Sign in & create workspace/,
  );

  assert.match(
    registerClient,
    /\/workspaces\/new/,
  );

  assert.doesNotMatch(
    registerRoute,
    /EMAIL_ALREADY_REGISTERED/,
  );
});


test('Registration: one secure draft can provision at most one workspace', async () => {
  const [
    route,
    migration,
  ] =
    await Promise.all([
      source(
        'app/api/auth/register/route.ts',
      ),
      source(
        'lib/schema/control-migrations/003-registration-request-idempotency.sql',
      ),
    ]);

  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS registration_requests/,
  );

  assert.match(
    migration,
    /UNIQUE \(nonce_hash\)/,
  );

  assert.match(
    route,
    /claimRegistrationRequest/,
  );

  assert.match(
    route,
    /ON CONFLICT \([\s\S]*nonce_hash[\s\S]*\)[\s\S]*DO NOTHING/s,
  );

  assert.match(
    route,
    /REGISTRATION_IN_PROGRESS/,
  );

  assert.match(
    route,
    /REGISTRATION_ALREADY_COMPLETED/,
  );

  assert.match(
    route,
    /buildCompletedRegistrationResponse/,
    'A lost HTTP response must replay the existing workspace instead of creating another one.',
  );
});


test('Registration: idempotency progress follows user, tenant and subscription creation', async () => {
  const route =
    await source(
      'app/api/auth/register/route.ts',
    );

  const progressCalls =
    route.match(
      /updateRegistrationRequestProgress\(/g,
    ) ||
    [];

  assert.ok(
    progressCalls.length >=
      4,
    'The helper declaration plus user/tenant/subscription progress calls must be present.',
  );

  assert.match(
    route,
    /completeRegistrationRequest\([\s\S]*activeRegistrationNonceHash[\s\S]*context/s,
  );

  assert.match(
    route,
    /status =[\s\S]*'completed'[\s\S]*completed_at/s,
  );
});


test('Registration: failed registration retries only after proven cleanup', async () => {
  const route =
    await source(
      'app/api/auth/register/route.ts',
    );

  assert.match(
    route,
    /cleanupRegistration\([\s\S]*Promise<boolean>/s,
  );

  assert.match(
    route,
    /REGISTRATION_FAILED_CLEAN/,
  );

  assert.match(
    route,
    /REGISTRATION_CLEANUP_REQUIRED/,
  );

  assert.match(
    route,
    /registrationRequestHasResources/,
  );

  assert.match(
    route,
    /status =[\s\S]*'failed'[\s\S]*user_id[\s\S]*IS NULL[\s\S]*tenant_id[\s\S]*IS NULL[\s\S]*subscription_id[\s\S]*IS NULL/s,
    'A failed draft is retryable only when no retained registration resource remains.',
  );
});


test('Registration: global workspace switcher is available to every authenticated member', async () => {
  const [
    api,
    switcher,
    shell,
  ] =
    await Promise.all([
      source(
        'app/api/account/workspaces/route.ts',
      ),
      source(
        'app/components/workspace/WorkspaceTenantSwitcher.tsx',
      ),
      source(
        'app/components/workspace/WorkspaceShell.tsx',
      ),
    ]);

  assert.match(
    api,
    /listAccessibleWorkspaces/,
  );

  assert.match(
    api,
    /setCurrentTenantForSession/,
  );

  assert.match(
    api,
    /WORKSPACE_SWITCH_DENIED/,
  );

  assert.match(
    api,
    /account_workspace_switch/,
  );

  assert.match(
    switcher,
    /Create another workspace/,
  );

  assert.match(
    switcher,
    /\/api\/account\/workspaces/,
  );

  assert.match(
    shell,
    /WorkspaceTenantSwitcher/,
  );
});


test('Registration: billing seat count includes active internal members only', async () => {
  const registerRoute =
    await source(
      'app/api/auth/register/route.ts',
    );

  const start =
    registerRoute.indexOf(
      'async function getBillableUserCount',
    );

  const end =
    registerRoute.indexOf(
      '/* ============================================================',
      start +
        20,
    );

  const block =
    registerRoute.slice(
      start,
      end,
    );

  assert.match(
    block,
    /member_type[\s\S]*internal/s,
  );

  assert.match(
    block,
    /deleted_at[\s\S]*IS NULL/s,
  );
});


test('Registration: onboarding pricing matches the canonical Category 22 contract', async () => {
  const selectPlan =
    await source(
      'app/select-plan/page.tsx',
    );

  assert.match(
    selectPlan,
    /price:[\s\S]*'KES 2,500'/s,
  );

  assert.match(
    selectPlan,
    /price:[\s\S]*'KES 4,500'/s,
  );

  assert.doesNotMatch(
    selectPlan,
    /KES 2,000|KES 3,340/,
  );
});


test('Registration: registration confirmation uses provider-neutral language', async () => {
  const selectPlan =
    await source(
      'app/select-plan/page.tsx',
    );

  assert.doesNotMatch(
    selectPlan,
    /Continue to PesaPal/,
  );

  assert.match(
    selectPlan,
    /secure billing provider/,
  );
});
