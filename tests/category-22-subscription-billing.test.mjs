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

function compact(
  value,
) {
  return value.replace(
    /\s+/g,
    ' ',
  );
}

test('Category 22: plan policy centralizes commercial entitlements and Custom-only capabilities', async () => {
  const policy =
    await source(
      'lib/billing/plan-policy.ts',
    );

  assert.match(
    policy,
    /free:[\s\S]*maxInstalledBusinessApps:[\s\S]*1/s,
  );

  assert.match(
    policy,
    /free:[\s\S]*maxActiveInternalUsers:[\s\S]*1/s,
  );

  assert.match(
    policy,
    /standard:[\s\S]*allBusinessApps:[\s\S]*true/s,
  );

  assert.match(
    policy,
    /custom:[\s\S]*multiCompany:[\s\S]*true/s,
  );

  assert.match(
    policy,
    /custom:[\s\S]*developerApi:[\s\S]*enabled:[\s\S]*true/s,
  );

  assert.match(
    policy,
    /custom:[\s\S]*customization:[\s\S]*enabled:[\s\S]*true/s,
  );

  assert.match(
    policy,
    /cost_controlled/,
    'Costly Custom AI must not be modeled as literal unlimited usage.',
  );

  assert.match(
    policy,
    /plan_controlled/,
    'Storage/cloud allowance must remain explicit and enforceable by Usage & Entitlements.',
  );
});

test('Category 22: subscription prices are server-authoritative and environment configurable', async () => {
  const pricing =
    await source(
      'lib/billing/pricing.ts',
    );

  assert.match(
    pricing,
    /SAMI_BILLING_STANDARD_PRICE_PER_USER_MONTHLY/,
  );

  assert.match(
    pricing,
    /SAMI_BILLING_CUSTOM_PRICE_PER_USER_MONTHLY/,
  );

  assert.doesNotMatch(
    pricing,
    /PESAPAL_PRICE_STANDARD_MONTHLY|PESAPAL_PRICE_CUSTOM_MONTHLY/,
    'Provider-specific legacy price variables must not override SaMi plan pricing.',
  );

  assert.match(
    pricing,
    /standard:[\s\S]*2500/s,
  );

  assert.match(
    pricing,
    /custom:[\s\S]*4500/s,
  );

  assert.match(
    pricing,
    /getSamiMonthlyAmount/,
  );

  const policy =
    await source(
      'lib/billing/plan-policy.ts',
    );

  assert.match(
    policy,
    /billingBasis:[\s\S]*'per_active_internal_user'/s,
  );
});

test('Category 22: billing provider is selected by environment behind one provider registry', async () => {
  const [
    contract,
    registry,
    stripe,
    paystack,
    pesapal,
  ] =
    await Promise.all([
      source(
        'lib/billing/provider.ts',
      ),
      source(
        'lib/billing/registry.ts',
      ),
      source(
        'lib/billing/providers/stripe.ts',
      ),
      source(
        'lib/billing/providers/paystack.ts',
      ),
      source(
        'lib/billing/providers/pesapal.ts',
      ),
    ]);

  assert.match(
    registry,
    /SAMI_BILLING_PROVIDER/,
  );

  assert.match(
    registry,
    /'pesapal'/,
    'Unset provider must preserve current PesaPal production behavior during rollout.',
  );

  assert.match(
    contract,
    /savePaymentMethodWithoutCharge/,
  );

  assert.match(
    contract,
    /automaticRecurring/,
  );

  assert.match(
    contract,
    /variableRecurringAmount/,
  );

  assert.match(
    contract,
    /updateRecurringQuantity/,
  );

  assert.match(
    stripe,
    /key:[\s\S]*'stripe'/s,
  );

  assert.match(
    stripe,
    /savePaymentMethodWithoutCharge:[\s\S]*true/s,
  );

  assert.match(
    stripe,
    /automaticRecurring:[\s\S]*true/s,
  );

  assert.match(
    stripe,
    /variableRecurringAmount:[\s\S]*true/s,
  );

  assert.match(
    stripe,
    /setupIntents[\s\S]*usage:[\s\S]*'off_session'/s,
  );

  assert.match(
    stripe,
    /findOrCreatePlanProduct/,
    'Stripe recurring inline prices must use a real Product ID.',
  );

  assert.match(
    stripe,
    /product:[\s\S]*product\.id/s,
  );

  assert.match(
    paystack,
    /mpesaCheckout:[\s\S]*true/s,
  );

  assert.match(
    pesapal,
    /automaticRecurring:[\s\S]*false/s,
    'The generic PesaPal adapter must not advertise automatic recurring until that contract is implemented end-to-end.',
  );

  assert.match(
    pesapal,
    /variableRecurringAmount:[\s\S]*false/s,
    'PesaPal must not claim variable recurring support that SaMi cannot safely depend on.',
  );
});

test('Category 22: recurring provider profiles pin existing mandates to their original provider', async () => {
  const [
    migration,
    profiles,
    service,
  ] =
    await Promise.all([
      source(
        'lib/schema/control-migrations/001-category-22-subscription-billing-profiles.sql',
      ),
      source(
        'lib/billing/profiles.ts',
      ),
      source(
        'lib/services/workspace-billing.ts',
      ),
    ]);

  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS subscription_billing_profiles/,
  );

  assert.match(
    migration,
    /provider_subscription_id/,
  );

  assert.match(
    migration,
    /idx_subscription_billing_profiles_one_active/,
  );

  assert.match(
    profiles,
    /pg_advisory_xact_lock/,
    'Provider-profile replacement must serialize per subscription.',
  );

  assert.match(
    service,
    /BILLING_PROVIDER_MIGRATION_REQUIRED/,
  );

  assert.match(
    service,
    /existing\.provider !==[\s\S]*provider\.key/s,
    'Changing the environment provider must not silently migrate an existing recurring mandate.',
  );
});

test('Category 22: paid-trial automatic billing setup verifies provider state server-side before creating recurring billing', async () => {
  const [
    service,
    route,
    stripeUi,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-billing.ts',
      ),
      source(
        'app/api/workspace/billing/setup/route.ts',
      ),
      source(
        'app/settings/components/StripeRecurringSetup.tsx',
      ),
    ]);

  assert.match(
    service,
    /startWorkspaceRecurringBillingSetup/,
  );

  assert.match(
    service,
    /completeWorkspaceRecurringBillingSetup/,
  );

  assert.match(
    service,
    /getPaymentMethodSetupStatus/,
  );

  assert.match(
    service,
    /setup\.status !==[\s\S]*'succeeded'/s,
  );

  assert.match(
    service,
    /chargedToday:[\s\S]*false/s,
  );

  assert.match(
    route,
    /rejectBillingCrossOrigin/,
  );

  assert.match(
    stripeUi,
    /confirmSetup/,
  );

  assert.match(
    stripeUi,
    /No charge is made today/,
  );
});

test('Category 22: verified provider webhooks are the only authority that applies successful payment access', async () => {
  const [
    stripeWebhook,
    paystack,
    pesapalCallback,
    application,
  ] =
    await Promise.all([
      source(
        'app/api/billing/stripe/webhook/route.ts',
      ),
      source(
        'app/api/billing/paystack/callback/route.ts',
      ),
      source(
        'app/api/auth/pesapal-callback/route.ts',
      ),
      source(
        'lib/billing/payment-application.ts',
      ),
    ]);

  assert.match(
    stripeWebhook,
    /constructEvent/,
  );

  assert.match(
    stripeWebhook,
    /STRIPE_WEBHOOK_SECRET/,
  );

  assert.match(
    paystack,
    /x-paystack-signature/,
  );

  assert.match(
    paystack,
    /timingSafeEqual/,
  );

  assert.match(
    paystack,
    /transaction\/verify/,
  );

  assert.match(
    pesapalCallback,
    /billingPurpose[\s\S]*'one_time'/s,
  );

  assert.match(
    pesapalCallback,
    /getCurrentSamiCheckoutAmount/,
  );

  assert.match(
    pesapalCallback,
    /billing_contract_mismatch/,
  );

  assert.match(
    pesapalCallback,
    /applyVerifiedCheckoutPayment/,
    'PesaPal one-time checkout must use the same verified payment application as other providers.',
  );

  assert.match(
    application,
    /applyVerifiedCheckoutPayment/,
  );

  assert.match(
    application,
    /applyVerifiedRecurringInvoice/,
  );

  assert.match(
    application,
    /amountsMatch/,
  );

  assert.match(
    application,
    /subscriptionAppliedAt/,
  );

  assert.doesNotMatch(
    application,
    /request\.json|searchParams|cookie/i,
    'Payment application must consume verified provider facts, not browser payment claims.',
  );
});

test('Category 22: recurring invoices must match the SaMi billing profile before extending access', async () => {
  const application =
    await source(
      'lib/billing/payment-application.ts',
    );

  assert.match(
    application,
    /price_per_user_monthly/,
  );

  assert.match(
    application,
    /seat_quantity/,
  );

  assert.match(
    application,
    /expected =[\s\S]*price \*[\s\S]*seats/s,
  );

  assert.match(
    application,
    /Recurring provider invoice does not match SaMi current billing profile/,
  );

  assert.match(
    application,
    /current_period_end/,
  );
});

test('Category 22: billing reconciliation follows provider pinning and live seats/prices', async () => {
  const [
    reconcile,
    route,
  ] =
    await Promise.all([
      source(
        'lib/billing/reconcile.ts',
      ),
      source(
        'app/api/internal/billing/reconcile/route.ts',
      ),
    ]);

  assert.match(
    reconcile,
    /getBillingProvider\([\s\S]*row\.provider/s,
  );

  assert.match(
    reconcile,
    /getSamiPricePerUserMonthly/,
  );

  assert.match(
    reconcile,
    /billableUsers/,
  );

  assert.match(
    reconcile,
    /member_type/,
    'Recurring reconciliation must bill active internal users only.',
  );

  assert.match(
    reconcile,
    /'internal'/,
  );

  assert.match(
    reconcile,
    /updateRecurringSubscription/,
  );

  assert.match(
    route,
    /SAMI_BILLING_WORKER_SECRET/,
  );

  assert.match(
    route,
    /timingSafeEqual/,
  );

  assert.doesNotMatch(
    route,
    /getSession|cookies\(/,
    'Internal billing reconciliation must not rely on a browser session.',
  );
});

test('Category 22: paid seat counting consistently uses active internal users', async () => {
  const [
    service,
    reconcile,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-billing.ts',
      ),
      source(
        'lib/billing/reconcile.ts',
      ),
    ]);

  for (
    const sourceText
    of [
      service,
      reconcile,
    ]
  ) {
    assert.match(
      sourceText,
      /member_type/,
    );

    assert.match(
      sourceText,
      /'internal'/,
    );
  }
});


test('Category 22: dependency resolution occurs before subscription app entitlement checks', async () => {
  const [
    lifecycle,
    registration,
    dependencyPlan,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-app-lifecycle.ts',
      ),
      source(
        'app/api/auth/register/route.ts',
      ),
      source(
        'lib/modules/dependency-plan.ts',
      ),
    ]);

  const compactLifecycle =
    compact(
      lifecycle,
    );

  assert.match(
    compactLifecycle,
    /resolveInstallPlan[\s\S]*assertInstallPlanEntitled/,
  );

  assert.match(
    lifecycle,
    /APP_PLAN_UPGRADE_REQUIRED/,
  );

  assert.match(
    registration,
    /getSamiModuleDependencyPlan/,
  );

  assert.match(
    registration,
    /resolvedApps/,
  );

  assert.doesNotMatch(
    registration,
    /included_apps/,
    'Legacy database app counts must not override the central plan policy.',
  );

  assert.match(
    dependencyPlan,
    /dependency cycle/,
  );
});

test('Category 22: Custom-only multi-company and Developer API are enforced below the UI', async () => {
  const [
    organization,
    developer,
    developerAuth,
  ] =
    await Promise.all([
      source(
        'lib/services/organization-profile.ts',
      ),
      source(
        'lib/services/workspace-developer.ts',
      ),
      source(
        'lib/developer/auth.ts',
      ),
    ]);

  assert.match(
    organization,
    /MULTI_COMPANY_PLAN_REQUIRED/,
  );

  assert.match(
    organization,
    /companies[\s\S]*multiCompany/s,
  );

  assert.match(
    developer,
    /API_PLAN_REQUIRED/,
  );

  assert.match(
    developer,
    /developerApi[\s\S]*enabled/s,
  );

  assert.match(
    developerAuth,
    /assertDeveloperSubscriptionEntitlement/,
    'Existing API credentials must be rechecked against current plan entitlement on every request.',
  );
});

test('Category 22: plan changes are capacity-checked and paid-period changes are scheduled at renewal', async () => {
  const [
    service,
    migration,
    transition,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-billing.ts',
      ),
      source(
        'lib/schema/control-migrations/001-category-22-subscription-billing-profiles.sql',
      ),
      source(
        'lib/billing/plan-transition.ts',
      ),
    ]);

  assert.match(
    service,
    /assertPlanCapacity/,
  );

  assert.match(
    service,
    /Required app dependencies count toward this allowance/,
  );

  assert.match(
    service,
    /Archive extra companies/,
  );

  assert.match(
    service,
    /scheduled_plan_id/,
  );

  assert.match(
    service,
    /scheduled_plan_effective_at/,
  );

  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS scheduled_plan_id/,
  );

  assert.match(
    transition,
    /SUBSCRIPTION_PLAN_CHANGE_APPLIED/,
  );

  assert.match(
    transition,
    /scheduled_plan_effective_at <=[\s\S]*NOW\(\)/s,
  );
});

test('Category 22: paid trial onboarding is shared across password, 2FA and Google login without overriding deep links', async () => {
  const [
    onboarding,
    login,
    twoFactor,
    google,
  ] =
    await Promise.all([
      source(
        'lib/billing/onboarding.ts',
      ),
      source(
        'app/api/auth/login/route.ts',
      ),
      source(
        'app/api/auth/login/2fa/route.ts',
      ),
      source(
        'app/api/auth/google/callback/route.ts',
      ),
    ]);

  assert.match(
    onboarding,
    /requestedNext !==[\s\S]*'\/dashboard'/s,
  );

  assert.match(
    onboarding,
    /membership[\s\S]*isOwner/s,
  );

  assert.match(
    onboarding,
    /savePaymentMethodWithoutCharge/,
  );

  assert.match(
    login,
    /getBillingOnboardingNext/,
  );

  assert.match(
    twoFactor,
    /getBillingOnboardingNext/,
  );

  assert.match(
    google,
    /getBillingOnboardingNext/,
  );
});

test('Category 22: overdue billing follows grace, dunning, suspension and automatic recovery boundaries', async () => {
  const [
    access,
    pageGuard,
    permissions,
    shellAccess,
    shellUi,
    recoveryPage,
    reconcile,
  ] = await Promise.all([
    source(
      'lib/billing/access.ts',
    ),
    source(
      'lib/auth/require-page-session.ts',
    ),
    source(
      'lib/auth/permission-context.ts',
    ),
    source(
      'lib/auth/workspace-shell.ts',
    ),
    source(
      'app/components/workspace/WorkspaceShell.tsx',
    ),
    source(
      'app/subscription-required/page.tsx',
    ),
    source(
      'lib/billing/reconcile.ts',
    ),
  ]);

  assert.match(
    access,
    /SAMI_BILLING_PAST_DUE_GRACE_DAYS/,
  );

  assert.match(
    access,
    /DEFAULT_PAST_DUE_GRACE_DAYS\s*=\s*14/,
    'SaMi must use a safe default dunning grace when no env override is configured.',
  );

  assert.match(
    access,
    /getSubscriptionSuspensionWindow/,
  );

  assert.match(
    access,
    /suspended:/,
  );

  assert.match(
    access,
    /payment_recovery/,
  );

  assert.match(
    access,
    /business_apps/,
  );

  assert.match(
    access,
    /messages/,
  );

  assert.match(
    access,
    /automation/,
  );

  assert.match(
    access,
    /integrations/,
  );

  assert.match(
    pageGuard,
    /access\.suspended/,
    'Past due alone must not bypass the configured grace period.',
  );

  assert.doesNotMatch(
    pageGuard,
    /access\.pastDue\s*&&/,
  );

  assert.match(
    pageGuard,
    /redirect\([\s\S]*['"]\/subscription-required['"]/s,
  );

  assert.match(
    permissions,
    /subscriptionAccess\.suspended/,
    'The API permission boundary must hard-lock only after grace expires.',
  );

  assert.match(
    permissions,
    /recoveryPermissions/,
  );

  assert.match(
    permissions,
    /BILLING_VIEW/,
  );

  assert.match(
    permissions,
    /SETTINGS_VIEW/,
  );

  assert.match(
    shellAccess,
    /subscription[\s\S]*\.suspended/s,
  );

  assert.match(
    shellUi,
    /showDunningWarning/,
  );

  assert.match(
    shellUi,
    /subscriptionSuspended/,
  );

  assert.match(
    shellUi,
    /Workspace temporarily suspended/,
  );

  assert.match(
    recoveryPage,
    /temporarily locked/,
  );

  assert.match(
    recoveryPage,
    /Open Billing/,
  );

  assert.match(
    recoveryPage,
    /Automatic restoration/,
  );

  assert.match(
    reconcile,
    /getSubscriptionSuspensionWindow/,
  );

  assert.match(
    reconcile,
    /final_warning/,
  );

  assert.match(
    reconcile,
    /billing\.suspended/,
  );
});



test('Category 22: public pricing uses the same canonical server price contract', async () => {
  const landing =
    await source(
      'app/page.tsx',
    );

  assert.match(
    landing,
    /getSamiPricePerUserMonthly/,
  );

  assert.match(
    landing,
    /STANDARD_PRICE/,
  );

  assert.match(
    landing,
    /CUSTOM_PRICE/,
  );

  assert.doesNotMatch(
    landing,
    /KSh 2,000|KSh 3,340/,
    'The public site must not show stale pre-Category-22 prices.',
  );
});

test('Category 22: billing state changes notify workspace owners through critical channels', async () => {
  const [
    notifications,
    application,
    reconcile,
    transition,
  ] = await Promise.all([
    source(
      'lib/billing/notifications.ts',
    ),
    source(
      'lib/billing/payment-application.ts',
    ),
    source(
      'lib/billing/reconcile.ts',
    ),
    source(
      'lib/billing/plan-transition.ts',
    ),
  ]);

  assert.match(
    notifications,
    /notifyWorkspaceOwnersOfBillingEvent/,
  );

  assert.match(
    notifications,
    /critical:[\s\S]*true/s,
  );

  assert.match(
    notifications,
    /forceEmail:[\s\S]*true/s,
    'Critical billing events must use transactional email.',
  );

  assert.match(
    notifications,
    /forceSms:[\s\S]*true/s,
    'Critical billing events must use transactional SMS.',
  );

  assert.match(
    application,
    /billing\.payment_succeeded/,
  );

  assert.match(
    application,
    /billing\.payment_failed/,
  );

  assert.match(
    reconcile,
    /billing\.due_soon/,
    'Owners must receive limited reminders before a paid workspace reaches suspension.',
  );

  assert.match(
    reconcile,
    /reminderBucket/,
  );

  assert.match(
    reconcile,
    /billing\.past_due/,
  );

  assert.match(
    transition,
    /billing\.plan_changed/,
  );
});


test('Category 22: Billing UI is provider-aware and mobile-compact', async () => {
  const billing =
    await source(
      'app/settings/components/BillingSettings.tsx',
    );

  assert.match(
    billing,
    /type MobileSection/,
  );

  assert.match(
    billing,
    /Overview/,
  );

  assert.match(
    billing,
    /Plans/,
  );

  assert.match(
    billing,
    /Payments/,
  );

  assert.match(
    billing,
    /hidden lg:block/,
  );

  assert.match(
    billing,
    /state\.collection\.providerName/,
  );

  assert.match(
    billing,
    /change_plan/,
  );

  assert.match(
    billing,
    /Set up automatic billing/,
  );
});

test('Category 22: overdue reconciliation runs automatically with an authenticated scheduler', async () => {
  const [
    route,
    vercel,
  ] =
    await Promise.all([
      source(
        'app/api/internal/billing/reconcile/route.ts',
      ),
      source(
        'vercel.json',
      ),
    ]);

  assert.match(
    route,
    /CRON_SECRET/,
  );

  assert.match(
    route,
    /SAMI_BILLING_WORKER_SECRET/,
  );

  assert.match(
    route,
    /authorization/,
  );

  assert.match(
    route,
    /timingSafeEqual/,
  );

  assert.match(
    route,
    /export async function GET/,
  );

  const config =
    JSON.parse(
      vercel,
    );

  assert.deepEqual(
    config.crons,
    [
      {
        path:
          '/api/internal/billing/reconcile',
        schedule:
          '0 6 * * *',
      },
    ],
  );
});


test('Category 22: control migration is additive and never stores provider secrets', async () => {
  const migration =
    await source(
      'lib/schema/control-migrations/001-category-22-subscription-billing-profiles.sql',
    );

  assert.doesNotMatch(
    migration,
    /DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s+TABLE/i,
  );

  assert.doesNotMatch(
    migration,
    /secret|api_key|access_token|refresh_token|card_number|cvv/i,
    'Control billing profile must persist references, not provider secrets or card data.',
  );
});

test('Category 22: full-suite gate includes subscription billing regression coverage', async () => {
  const packageJson =
    JSON.parse(
      await source(
        'package.json',
      ),
    );

  assert.equal(
    packageJson.scripts[
      'test:category22'
    ],
    'node --test tests/category-22-subscription-billing.test.mjs',
  );

  assert.match(
    packageJson.scripts[
      'test:all'
    ],
    /test:category22/,
  );
});
