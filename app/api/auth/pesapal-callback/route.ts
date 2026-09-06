// app/api/auth/pesapal-callback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import { queryControl } from '@/lib/db/control';
import { provisionTenant } from '@/lib/services/tenant-provisioning';
import { sendVerificationEmail } from '@/lib/services/email';
import { getPesaPalTransactionStatus } from '@/lib/services/pesapal';

const VERIFICATION_EXPIRY_MINUTES = 15;
const SUBSCRIPTION_PERIOD_MONTHS = 1;

type CallbackType = 'callback' | 'ipn';

type PaymentState =
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'INVALID'
  | 'REVERSED'
  | 'UNKNOWN';

interface PaymentTransactionRow {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  provider_transaction_id: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
}

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface SubscriptionRow {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: string;
  billing_cycle: string | null;
  started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
}

interface OwnerRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  email_verified: boolean;
}

interface ModuleRow {
  key: string;
}

function getParam(
  params: URLSearchParams,
  ...names: string[]
): string | null {
  for (const name of names) {
    const value = params.get(name);

    if (value !== null && value.trim() !== '') {
      return value.trim();
    }
  }

  return null;
}

function detectCallbackType(
  notificationType: string | null
): CallbackType {
  const normalized = notificationType?.trim().toUpperCase();

  if (normalized === 'IPNCHANGE') {
    return 'ipn';
  }

  return 'callback';
}

function normalizePaymentState(
  statusCode: number | null | undefined,
  description?: string | null
): PaymentState {
  if (statusCode === 1) {
    return 'COMPLETED';
  }

  if (statusCode === 2) {
    return 'FAILED';
  }

  if (statusCode === 3) {
    return 'REVERSED';
  }

  if (statusCode === 0) {
    return 'INVALID';
  }

  const normalized = description?.trim().toUpperCase();

  if (!normalized) {
    return 'UNKNOWN';
  }

  if (
    normalized.includes('COMPLETED') ||
    normalized.includes('COMPLETE') ||
    normalized.includes('SUCCESS')
  ) {
    return 'COMPLETED';
  }

  if (
    normalized.includes('FAILED') ||
    normalized.includes('FAIL')
  ) {
    return 'FAILED';
  }

  if (normalized.includes('REVERSED')) {
    return 'REVERSED';
  }

  if (
    normalized.includes('INVALID') ||
    normalized.includes('CANCEL')
  ) {
    return 'INVALID';
  }

  if (
    normalized.includes('PENDING') ||
    normalized.includes('PROCESSING')
  ) {
    return 'PENDING';
  }

  return 'UNKNOWN';
}

function parseMetadata(
  metadata: unknown
): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  if (typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }

  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);

      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore invalid metadata.
    }
  }

  return {};
}

function normalizeApps(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

function safeEqual(
  a: string,
  b: string
): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

async function getPaymentTransaction(
  orderTrackingId: string,
  merchantReference: string
): Promise<PaymentTransactionRow | null> {
  const result = await queryControl(
    `
      SELECT
        id,
        tenant_id,
        subscription_id,
        provider_transaction_id,
        amount,
        currency,
        status,
        description,
        metadata
      FROM payment_transactions
      WHERE provider = 'pesapal'
        AND provider_transaction_id = $1
        AND metadata->>'merchantReference' = $2
      LIMIT 1
    `,
    [orderTrackingId, merchantReference]
  );

  return result.rows[0] || null;
}

async function getTenant(
  tenantId: string
): Promise<TenantRow | null> {
  const result = await queryControl(
    `
      SELECT
        id,
        name,
        slug,
        status
      FROM tenants
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [tenantId]
  );

  return result.rows[0] || null;
}

async function getSubscription(
  subscriptionId: string
): Promise<SubscriptionRow | null> {
  const result = await queryControl(
    `
      SELECT
        id,
        tenant_id,
        plan_id,
        status,
        billing_cycle,
        started_at,
        trial_ends_at,
        current_period_start,
        current_period_end
      FROM subscriptions
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [subscriptionId]
  );

  return result.rows[0] || null;
}

async function getOwner(
  tenantId: string
): Promise<OwnerRow | null> {
  const result = await queryControl(
    `
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.email_verified
      FROM users u
      INNER JOIN tenant_users tu
        ON tu.user_id = u.id
      WHERE tu.tenant_id = $1
        AND tu.is_owner = TRUE
        AND u.deleted_at IS NULL
      ORDER BY tu.created_at ASC
      LIMIT 1
    `,
    [tenantId]
  );

  return result.rows[0] || null;
}

async function getSelectedApps(
  payment: PaymentTransactionRow
): Promise<string[]> {
  const metadata = parseMetadata(payment.metadata);

  const metadataApps = normalizeApps(metadata.apps);

  if (metadataApps.length > 0) {
    return metadataApps;
  }

  const result = await queryControl(
    `
      SELECT
        m.key
      FROM tenant_modules tm
      INNER JOIN modules m
        ON m.id = tm.module_id
      WHERE tm.tenant_id = $1
        AND m.deleted_at IS NULL
        AND tm.status IN ('pending', 'installed')
      ORDER BY m.key
    `,
    [payment.tenant_id]
  );

  return result.rows
    .map((row: ModuleRow) => row.key)
    .filter(Boolean);
}

async function markPaymentPending(
  paymentId: string,
  rawStatus: unknown
): Promise<void> {
  await queryControl(
    `
      UPDATE payment_transactions
      SET
        status = 'pending',
        metadata = COALESCE(metadata, '{}'::jsonb)
          || jsonb_build_object(
            'lastPesapalStatus', $2::jsonb,
            'lastCheckedAt', NOW()
          )
      WHERE id = $1
    `,
    [
      paymentId,
      JSON.stringify(rawStatus ?? null),
    ]
  );
}

async function markPaymentCompleted(
  paymentId: string,
  statusData: Record<string, unknown>
): Promise<void> {
  await queryControl(
    `
      UPDATE payment_transactions
      SET
        status = 'completed',
        metadata = COALESCE(metadata, '{}'::jsonb)
          || jsonb_build_object(
            'pesapalStatus', $2::jsonb,
            'completedAt', NOW()
          )
      WHERE id = $1
    `,
    [
      paymentId,
      JSON.stringify(statusData),
    ]
  );
}

async function markPaymentFailed(
  paymentId: string,
  status: PaymentState,
  statusData: Record<string, unknown>
): Promise<void> {
  await queryControl(
    `
      UPDATE payment_transactions
      SET
        status = 'failed',
        metadata = COALESCE(metadata, '{}'::jsonb)
          || jsonb_build_object(
            'pesapalStatus', $2::jsonb,
            'failureState', $3,
            'failedAt', NOW()
          )
      WHERE id = $1
    `,
    [
      paymentId,
      JSON.stringify(statusData),
      status,
    ]
  );
}

async function markSubscriptionPaymentPending(
  subscriptionId: string
): Promise<void> {
  await queryControl(
    `
      UPDATE subscriptions
      SET
        status = 'pending_payment',
        updated_at = NOW()
      WHERE id = $1
        AND status NOT IN (
          'active',
          'trialing',
          'past_due'
        )
        AND deleted_at IS NULL
    `,
    [subscriptionId]
  );
}

async function markSubscriptionProvisioningFailed(
  subscriptionId: string
): Promise<void> {
  await queryControl(
    `
      UPDATE subscriptions
      SET
        status = 'provisioning_failed',
        updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
        AND status NOT IN (
          'active',
          'trialing',
          'past_due'
        )
    `,
    [subscriptionId]
  );
}

async function activateSubscription(
  subscriptionId: string
): Promise<void> {
  await queryControl(
    `
      UPDATE subscriptions
      SET
        status = 'active',
        started_at = COALESCE(started_at, NOW()),
        trial_ends_at = NULL,
        current_period_start = NOW(),
        current_period_end =
          NOW() + INTERVAL '${SUBSCRIPTION_PERIOD_MONTHS} month',
        cancelled_at = NULL,
        updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [subscriptionId]
  );
}

async function activateTenant(
  tenantId: string
): Promise<void> {
  await queryControl(
    `
      UPDATE tenants
      SET
        status = 'active',
        updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [tenantId]
  );
}

async function markTenantProvisioningFailed(
  tenantId: string
): Promise<void> {
  await queryControl(
    `
      UPDATE tenants
      SET
        status = 'provisioning_failed',
        updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
        AND status <> 'active'
    `,
    [tenantId]
  );
}

async function createSignupVerification(
  owner: OwnerRow
): Promise<void> {
  const code = crypto
    .randomInt(100000, 1000000)
    .toString();

  const codeHash = crypto
    .createHash('sha256')
    .update(code)
    .digest('hex');

  const expiresAt = new Date(
    Date.now() +
      VERIFICATION_EXPIRY_MINUTES * 60 * 1000
  );

  /*
   * IMPORTANT:
   *
   * email_verifications does NOT have:
   *   - user_id
   *   - verified_at
   *
   * It uses:
   *   - email
   *   - code_hash
   *   - expires_at
   *   - used_at
   *   - deleted_at
   *
   * Therefore old codes are invalidated through used_at.
   */

  await queryControl(
    `
      UPDATE email_verifications
      SET
        used_at = NOW()
      WHERE email = $1
        AND used_at IS NULL
        AND deleted_at IS NULL
    `,
    [owner.email]
  );

  await queryControl(
    `
      INSERT INTO email_verifications (
        email,
        code_hash,
        expires_at,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        NOW()
      )
    `,
    [
      owner.email,
      codeHash,
      expiresAt,
    ]
  );

  await sendVerificationEmail(
    owner.email,
    code,
    owner.first_name || ''
  );
}

async function processCompletedPayment(
  payment: PaymentTransactionRow,
  callbackType: CallbackType,
  origin: string
): Promise<NextResponse> {
  if (!payment.subscription_id) {
    throw new Error(
      `Payment ${payment.id} has no subscription_id`
    );
  }

  const tenant = await getTenant(payment.tenant_id);

  if (!tenant) {
    throw new Error(
      `Tenant ${payment.tenant_id} was not found`
    );
  }

  const subscription = await getSubscription(
    payment.subscription_id
  );

  if (!subscription) {
    throw new Error(
      `Subscription ${payment.subscription_id} was not found`
    );
  }

  if (subscription.tenant_id !== tenant.id) {
    throw new Error(
      'Subscription does not belong to payment tenant'
    );
  }

  /*
   * Payment completion is recorded BEFORE provisioning.
   *
   * This is intentional.
   *
   * If provisioning fails, the customer has still paid.
   * We must NOT turn a successful payment into a failed payment.
   */
  await markPaymentCompleted(
    payment.id,
    {
      processedBy: 'pesapal-callback',
      callbackType,
      processedAt: new Date().toISOString(),
    }
  );

  /*
   * Strong idempotency:
   *
   * If everything is already active, do not provision
   * the tenant again or send another verification code.
   */
  if (
    tenant.status === 'active' &&
    ['active', 'trialing', 'past_due'].includes(
      subscription.status
    )
  ) {
    if (callbackType === 'ipn') {
      return NextResponse.json({
        success: true,
        status: 'already_active',
        orderTrackingId:
          payment.provider_transaction_id,
      });
    }

    return redirectTo(
      origin,
      '/verify-email?payment=success'
    );
  }

  const selectedApps = await getSelectedApps(payment);

  if (selectedApps.length === 0) {
    await markTenantProvisioningFailed(tenant.id);
    await markSubscriptionProvisioningFailed(
      subscription.id
    );

    throw new Error(
      `No selected apps found for tenant ${tenant.id}`
    );
  }

  /*
   * Provision the physical tenant database.
   *
   * IMPORTANT:
   * The provisioning service must return success=false
   * when ANY selected app fails.
   */
  let provisioningResult;

  try {
    provisioningResult = await provisionTenant(
      tenant.id,
      selectedApps
    );
  } catch (error) {
    await markTenantProvisioningFailed(tenant.id);
    await markSubscriptionProvisioningFailed(
      subscription.id
    );

    console.error(
      '[PesaPal] Tenant provisioning failed:',
      error
    );

    if (callbackType === 'ipn') {
      return NextResponse.json(
        {
          success: false,
          payment: 'completed',
          provisioning: 'failed',
          retryable: true,
        },
        { status: 500 }
      );
    }

    return redirectTo(
      origin,
      '/auth/payment-success?provisioning=failed'
    );
  }

  /*
   * Do NOT activate anything if provisioning reported
   * failed applications.
   */
  if (
    !provisioningResult.success ||
    provisioningResult.appsFailed.length > 0 ||
    provisioningResult.appsInstalled.length !==
      selectedApps.length
  ) {
    await markTenantProvisioningFailed(tenant.id);
    await markSubscriptionProvisioningFailed(
      subscription.id
    );

    console.error(
      '[PesaPal] Provisioning incomplete:',
      {
        tenantId: tenant.id,
        selectedApps,
        appsInstalled:
          provisioningResult.appsInstalled,
        appsFailed:
          provisioningResult.appsFailed,
      }
    );

    if (callbackType === 'ipn') {
      return NextResponse.json(
        {
          success: false,
          payment: 'completed',
          provisioning: 'failed',
          retryable: true,
        },
        { status: 500 }
      );
    }

    return redirectTo(
      origin,
      '/auth/payment-success?provisioning=failed'
    );
  }

  /*
   * ONLY NOW is the tenant allowed to become active.
   */
  await activateTenant(tenant.id);

  /*
   * ONLY NOW is the paid subscription activated.
   */
  await activateSubscription(subscription.id);

  const owner = await getOwner(tenant.id);

  if (!owner) {
    console.error(
      `[PesaPal] Owner not found for tenant ${tenant.id}`
    );

    if (callbackType === 'ipn') {
      return NextResponse.json({
        success: true,
        payment: 'completed',
        provisioning: 'completed',
        subscription: 'active',
        verification: 'owner_not_found',
      });
    }

    return redirectTo(
      origin,
      '/login?payment=success'
    );
  }

  /*
   * Email verification is independent from payment.
   *
   * The account may be active internally while the user
   * still has to verify the email before login.
   */
  if (!owner.email_verified) {
    try {
      await createSignupVerification(owner);
    } catch (error) {
      /*
       * Do NOT reverse payment or subscription because
       * the email provider failed.
       *
       * The account is already provisioned and paid.
       */
      console.error(
        '[PesaPal] Failed to send verification email:',
        error
      );
    }
  }

  if (callbackType === 'ipn') {
    return NextResponse.json({
      success: true,
      payment: 'completed',
      provisioning: 'completed',
      subscription: 'active',
      tenant: 'active',
      verificationRequired:
        !owner.email_verified,
      orderTrackingId:
        payment.provider_transaction_id,
    });
  }

  return redirectTo(
    origin,
    '/verify-email?payment=success'
  );
}

function redirectTo(
  origin: string,
  path: string
): NextResponse {
  const safeOrigin =
    origin || 'http://localhost:3000';

  return NextResponse.redirect(
    new URL(path, safeOrigin)
  );
}

async function processPesapalRequest(
  request: NextRequest,
  params: URLSearchParams
): Promise<NextResponse> {
  const orderTrackingId = getParam(
    params,
    'OrderTrackingId',
    'orderTrackingId',
    'order_tracking_id'
  );

  const merchantReference = getParam(
    params,
    'OrderMerchantReference',
    'orderMerchantReference',
    'merchantReference',
    'merchant_reference'
  );

  const notificationType = getParam(
    params,
    'OrderNotificationType',
    'orderNotificationType',
    'notificationType'
  );

  const callbackType =
    detectCallbackType(notificationType);

  if (!orderTrackingId) {
    return callbackType === 'ipn'
      ? NextResponse.json(
          {
            success: false,
            error: 'Missing OrderTrackingId',
          },
          { status: 400 }
        )
      : redirectTo(
          request.nextUrl.origin,
          '/auth/payment-cancelled?reason=missing_tracking_id'
        );
  }

  if (!merchantReference) {
    return callbackType === 'ipn'
      ? NextResponse.json(
          {
            success: false,
            error: 'Missing OrderMerchantReference',
          },
          { status: 400 }
        )
      : redirectTo(
          request.nextUrl.origin,
          '/auth/payment-cancelled?reason=missing_reference'
        );
  }

  const payment = await getPaymentTransaction(
    orderTrackingId,
    merchantReference
  );

  if (!payment) {
    console.error(
      '[PesaPal] Payment transaction not found:',
      {
        orderTrackingId,
        merchantReference,
      }
    );

    return callbackType === 'ipn'
      ? NextResponse.json(
          {
            success: false,
            error: 'Payment transaction not found',
          },
          { status: 404 }
        )
      : redirectTo(
          request.nextUrl.origin,
          '/auth/payment-cancelled?reason=transaction_not_found'
        );
  }

  const storedMetadata = parseMetadata(
    payment.metadata
  );

  const storedMerchantReference =
    typeof storedMetadata.merchantReference === 'string'
      ? storedMetadata.merchantReference
      : null;

  if (
    storedMerchantReference &&
    !safeEqual(
      storedMerchantReference,
      merchantReference
    )
  ) {
    console.error(
      '[PesaPal] Merchant reference mismatch'
    );

    return callbackType === 'ipn'
      ? NextResponse.json(
          {
            success: false,
            error: 'Merchant reference mismatch',
          },
          { status: 400 }
        )
      : redirectTo(
          request.nextUrl.origin,
          '/auth/payment-cancelled?reason=reference_mismatch'
        );
  }

  /*
   * NEVER trust the callback itself for final payment status.
   *
   * Ask PesaPal directly.
   */
  const pesapalStatus =
    await getPesaPalTransactionStatus(
      orderTrackingId
    );

  const paymentState =
    normalizePaymentState(
      pesapalStatus.paymentStatusCode,
      pesapalStatus.status
    );

  const remoteAmount =
    typeof pesapalStatus.amount === 'number'
      ? pesapalStatus.amount
      : null;

  const remoteCurrency =
    typeof pesapalStatus.currency === 'string'
      ? pesapalStatus.currency.toUpperCase()
      : null;

  const localCurrency =
    payment.currency.toUpperCase();

  /*
   * Verify currency.
   */
  if (
    remoteCurrency &&
    remoteCurrency !== localCurrency
  ) {
    await markPaymentFailed(
      payment.id,
      'FAILED',
      {
        reason: 'currency_mismatch',
        remoteCurrency,
        localCurrency,
      }
    );

    return callbackType === 'ipn'
      ? NextResponse.json(
          {
            success: false,
            error: 'Currency mismatch',
          },
          { status: 400 }
        )
      : redirectTo(
          request.nextUrl.origin,
          '/auth/payment-cancelled?reason=currency_mismatch'
        );
  }

  /*
   * Verify amount.
   */
  if (
    remoteAmount !== null &&
    Number(remoteAmount) !== Number(payment.amount)
  ) {
    await markPaymentFailed(
      payment.id,
      'FAILED',
      {
        reason: 'amount_mismatch',
        remoteAmount,
        localAmount: payment.amount,
      }
    );

    return callbackType === 'ipn'
      ? NextResponse.json(
          {
            success: false,
            error: 'Amount mismatch',
          },
          { status: 400 }
        )
      : redirectTo(
          request.nextUrl.origin,
          '/auth/payment-cancelled?reason=amount_mismatch'
        );
  }

  const statusData: Record<string, unknown> = {
    status: pesapalStatus.status,
    orderTrackingId:
      pesapalStatus.orderTrackingId,
    merchantReference:
      pesapalStatus.merchantReference,
    amount: pesapalStatus.amount,
    currency: pesapalStatus.currency,
    paymentMethod:
      pesapalStatus.paymentMethod,
    confirmationCode:
      pesapalStatus.confirmationCode,
    paymentStatusCode:
      pesapalStatus.paymentStatusCode,
    createdDate:
      pesapalStatus.createdDate,
    paymentAccount:
      pesapalStatus.paymentAccount,
  };

  if (paymentState === 'PENDING') {
    await markPaymentPending(
      payment.id,
      statusData
    );

    if (callbackType === 'ipn') {
      return NextResponse.json({
        success: true,
        payment: 'pending',
        orderTrackingId,
      });
    }

    return redirectTo(
      request.nextUrl.origin,
      `/auth/payment-pending?orderTrackingId=${encodeURIComponent(
        orderTrackingId
      )}`
    );
  }

  if (
    paymentState === 'FAILED' ||
    paymentState === 'INVALID' ||
    paymentState === 'REVERSED'
  ) {
    await markPaymentFailed(
      payment.id,
      paymentState,
      statusData
    );

    if (payment.subscription_id) {
      await markSubscriptionPaymentPending(
        payment.subscription_id
      );
    }

    if (callbackType === 'ipn') {
      return NextResponse.json({
        success: true,
        payment: paymentState.toLowerCase(),
        orderTrackingId,
      });
    }

    return redirectTo(
      request.nextUrl.origin,
      '/auth/payment-cancelled'
    );
  }

  if (paymentState !== 'COMPLETED') {
    await markPaymentPending(
      payment.id,
      statusData
    );

    if (callbackType === 'ipn') {
      return NextResponse.json({
        success: true,
        payment: 'unknown',
        orderTrackingId,
      });
    }

    return redirectTo(
      request.nextUrl.origin,
      '/auth/payment-pending'
    );
  }

  return processCompletedPayment(
    payment,
    callbackType,
    request.nextUrl.origin
  );
}

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {
    return await processPesapalRequest(
      request,
      request.nextUrl.searchParams
    );
  } catch (error) {
    console.error(
      '[PesaPal Callback GET] Error:',
      error
    );

    return redirectTo(
      request.nextUrl.origin,
      '/auth/payment-cancelled?reason=processing_error'
    );
  }
}

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const contentType =
      request.headers.get('content-type') || '';

    let params: URLSearchParams;

    if (
      contentType.includes(
        'application/json'
      )
    ) {
      const body = await request.json();

      const searchParams =
        new URLSearchParams();

      if (body && typeof body === 'object') {
        for (const [key, value] of Object.entries(
          body
        )) {
          if (
            value !== null &&
            value !== undefined
          ) {
            searchParams.set(
              key,
              String(value)
            );
          }
        }
      }

      params = searchParams;
    } else {
      const body = await request.text();

      params = new URLSearchParams(body);
    }

    return await processPesapalRequest(
      request,
      params
    );
  } catch (error) {
    console.error(
      '[PesaPal Callback POST] Error:',
      error
    );

    const contentType =
      request.headers.get('content-type') || '';

    if (
      contentType.includes(
        'application/json'
      ) ||
      contentType.includes(
        'application/x-www-form-urlencoded'
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Payment processing error',
        },
        { status: 500 }
      );
    }

    return redirectTo(
      request.nextUrl.origin,
      '/auth/payment-cancelled?reason=processing_error'
    );
  }
}