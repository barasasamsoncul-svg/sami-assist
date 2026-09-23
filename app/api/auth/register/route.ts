import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getSamiMonthlyAmount,
  getSamiPricePerUserMonthly,
  SAMI_BILLING_CURRENCY,
} from '@/lib/billing/pricing';

import {
  getSamiModuleDependencyPlan,
} from '@/lib/modules/registry';

import {
  hashPassword,
} from '@/lib/auth/password';

import {
  sendVerificationEmail,
} from '@/lib/services/email';

import {
  sendSubscriptionConfirmationEmail,
  type SaMiRegistrationPlan,
} from '@/lib/services/subscription-email';

import {
  provisionTenant,
} from '@/lib/services/tenant-provisioning';

import {
  clearRegistrationDraftCookieOptions,
  readRegistrationDraft,
  REGISTRATION_DRAFT_COOKIE_NAME,
  type RegistrationDraft,
} from '@/lib/auth/registration-draft';

import {
  getSession,
  setCurrentTenantForSession,
} from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   SAMI REGISTRATION POLICY

   FREE
   ------------------------------------------------------------
   - KES 0
   - No payment method required
   - No trial
   - Workspace provisioned immediately
   - Subscription becomes active after provisioning

   STANDARD / CUSTOM
   ------------------------------------------------------------
   - First calendar month free
   - KES 0 due today
   - Workspace provisioned immediately
   - Subscription starts as trialing immediately
   - Full paid-plan entitlements during trial
   - SaMi billing provider is selected server-side by environment
   - Providers that support zero-charge setup may authorize a
     future payment method after the user's authenticated sign-in
   - First paid charge begins only after the free month
   - Subscription price and seats remain SaMi-authoritative
   ============================================================ */

const VERIFICATION_EXPIRY_MINUTES = 15;

const PAID_TRIAL_MONTHS = 1;

const MAX_SELECTED_APPS = 50;

const MAX_NAME_LENGTH = 120;

const MAX_PHONE_LENGTH = 40;

const MAX_EMAIL_LENGTH = 254;

const MAX_REGISTRATION_REQUEST_BYTES =
  32 *
  1024;

const GOOGLE_SIGNUP_COOKIE =
  'sami_google_signup_state';

const ALLOWED_PLANS =
  new Set([
    'free',
    'standard',
    'custom',
  ]);

/* ============================================================
   TYPES
   ============================================================ */

type RegistrationBody =
  Record<string, unknown>;

type RegistrationContext = {
  userId: string | null;
  tenantId: string | null;
  subscriptionId: string | null;
  userCreated: boolean;
};

type ModuleRow = {
  id: unknown;
  key: unknown;
  name?: unknown;
  version?: unknown;
  status?: unknown;
};

type PlanRow = {
  id: unknown;
  key: unknown;
  name?: unknown;
};

type GoogleSignupRow = {
  state_hash: string;
  google_subject: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  expires_at: Date | string;
};

type RegistrationRequestRow = {
  id: string;
  nonce_hash: string;
  draft_mode:
    | 'email'
    | 'google'
    | 'existing';
  status:
    | 'processing'
    | 'completed'
    | 'failed';
  user_id: string | null;
  tenant_id: string | null;
  subscription_id: string | null;
  started_at: Date | string;
  completed_at: Date | string | null;
  failed_at: Date | string | null;
  error_code: string | null;
};

type RegistrationRequestClaim =
  | {
      state: 'claimed';
      nonceHash: string;
      row: RegistrationRequestRow;
    }
  | {
      state: 'completed';
      nonceHash: string;
      row: RegistrationRequestRow;
    }
  | {
      state: 'processing';
      nonceHash: string;
      row: RegistrationRequestRow;
    }
  | {
      state: 'recovery_required';
      nonceHash: string;
      row: RegistrationRequestRow;
    };


type SubscriptionResponseRow = {
  id: string;
  status: string;
  started_at: Date | string | null;
  trial_ends_at: Date | string | null;
  current_period_start: Date | string | null;
  current_period_end: Date | string | null;
  plan_key: string;
  plan_name: string;
  tenant_name: string;
  owner_email: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_email_verified: boolean;
  owner_email_verified_at: Date | string | null;
};

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeEmail(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value
    .trim()
    .toLowerCase();
}

function normalizeName(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizePhone(
  value: unknown
): string | null {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const phone =
    value.trim();

  if (!phone) {
    return null;
  }

  return phone.slice(
    0,
    MAX_PHONE_LENGTH
  );
}

function normalizePlan(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return 'free';
  }

  return value
    .trim()
    .toLowerCase();
}

function normalizeSelectedApps(
  value: unknown
): string[] | null {
  if (
    !Array.isArray(value)
  ) {
    return null;
  }

  const apps =
    value
      .filter(
        (
          app
        ): app is string =>
          typeof app === 'string'
      )
      .map(
        (app) =>
          app
            .trim()
            .toLowerCase()
      )
      .filter(Boolean);

  return [
    ...new Set(apps),
  ];
}

/* ============================================================
   VALIDATION
   ============================================================ */

function isValidEmail(
  email: string
): boolean {
  return (
    email.length > 0 &&
    email.length <=
      MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
}

function isSameOriginRequest(
  request: NextRequest
): boolean {
  const secFetchSite =
    request.headers
      .get(
        'sec-fetch-site'
      )
      ?.trim()
      .toLowerCase();

  if (
    secFetchSite ===
      'cross-site'
  ) {
    return false;
  }

  const origin =
    request.headers
      .get(
        'origin'
      );

  if (!origin) {
    return true;
  }

  try {
    return (
      new URL(origin).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}

function isJsonRequest(
  request: NextRequest
): boolean {
  return (
    request.headers
      .get(
        'content-type'
      )
      ?.toLowerCase()
      .includes(
        'application/json'
      ) === true
  );
}

function registrationRequestTooLarge(
  request: NextRequest
): boolean {
  const value =
    request.headers
      .get(
        'content-length'
      );

  if (!value) {
    return false;
  }

  const length =
    Number(
      value
    );

  return (
    Number.isFinite(
      length
    ) &&
    length >
      MAX_REGISTRATION_REQUEST_BYTES
  );
}

/* ============================================================
   RESPONSE HELPERS
   ============================================================ */

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',

        Pragma:
          'no-cache',
      },
    }
  );
}

function errorResponse(
  status: number,
  code: string,
  error: string,
  extra: Record<
    string,
    unknown
  > = {}
) {
  return jsonResponse(
    {
      success: false,
      code,
      error,
      ...extra,
    },
    status
  );
}

/* ============================================================
   DATE
   ============================================================ */

function toIsoString(
  value:
    | Date
    | string
    | null
    | undefined
): string | null {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
}

/* ============================================================
   TENANT SLUG
   ============================================================ */

function createSlug(
  value: string
): string {
  return value
    .toLowerCase()
    .trim()
    .replace(
      /[^a-z0-9]+/g,
      '-'
    )
    .replace(
      /^-+|-+$/g,
      ''
    )
    .slice(
      0,
      80
    );
}

async function createUniqueTenantSlug(
  businessName: string
): Promise<string> {
  const baseSlug =
    createSlug(
      businessName
    ) ||
    `workspace-${crypto
      .randomBytes(4)
      .toString('hex')}`;

  let slug =
    baseSlug;

  for (
    let counter = 1;
    counter <= 100;
    counter++
  ) {
    const result =
      await queryControl(
        `
          SELECT id
          FROM tenants
          WHERE slug = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          slug,
        ]
      );

    if (
      result.rows.length ===
      0
    ) {
      return slug;
    }

    slug =
      `${baseSlug}-${counter}`;
  }

  return `${baseSlug}-${crypto
    .randomBytes(4)
    .toString('hex')}`;
}

/* ============================================================
   DATABASE ID
   ============================================================ */

function requireDatabaseId(
  value: unknown,
  entityName: string
): string {
  if (
    typeof value !==
      'string' ||
    !value.trim()
  ) {
    throw new Error(
      `Invalid ${entityName} ID returned from database.`
    );
  }

  return value;
}

/* ============================================================
   GOOGLE REGISTRATION
   ============================================================ */

function hashOpaqueToken(
  value: string
): string {
  return crypto
    .createHash('sha256')
    .update(
      value,
      'utf8'
    )
    .digest('hex');
}

function hashRegistrationNonce(
  draft: RegistrationDraft
): string {
  const material =
    draft.mode ===
        'google' &&
      draft.googleStateHash
      ? `google:${draft.googleStateHash}`
      : `draft:${draft.nonce}`;

  return crypto
    .createHash('sha256')
    .update(
      `registration:${material}`,
      'utf8'
    )
    .digest('hex');
}

function registrationRequestHasResources(
  row: RegistrationRequestRow
): boolean {
  return Boolean(
    row.user_id ||
    row.tenant_id ||
    row.subscription_id
  );
}

async function loadRegistrationRequest(
  nonceHash: string
): Promise<
  RegistrationRequestRow | null
> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          nonce_hash,
          draft_mode,
          status,
          user_id,
          tenant_id,
          subscription_id,
          started_at,
          completed_at,
          failed_at,
          error_code
        FROM registration_requests
        WHERE nonce_hash = $1
        LIMIT 1
      `,
      [
        nonceHash,
      ]
    );

  return (
    result.rows[0] ||
    null
  ) as
    RegistrationRequestRow | null;
}

async function claimRegistrationRequest(
  draft: RegistrationDraft
): Promise<
  RegistrationRequestClaim
> {
  const nonceHash =
    hashRegistrationNonce(
      draft
    );

  const inserted =
    await queryControl(
      `
        INSERT INTO registration_requests (
          nonce_hash,
          draft_mode,
          status,
          started_at,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          'processing',
          NOW(),
          NOW(),
          NOW()
        )
        ON CONFLICT (
          nonce_hash
        )
        DO NOTHING
        RETURNING
          id,
          nonce_hash,
          draft_mode,
          status,
          user_id,
          tenant_id,
          subscription_id,
          started_at,
          completed_at,
          failed_at,
          error_code
      `,
      [
        nonceHash,
        draft.mode,
      ]
    );

  if (
    inserted.rows.length ===
      1
  ) {
    return {
      state:
        'claimed',
      nonceHash,
      row:
        inserted.rows[0] as
          RegistrationRequestRow,
    };
  }

  let existing =
    await loadRegistrationRequest(
      nonceHash
    );

  if (
    !existing
  ) {
    throw new Error(
      'Registration idempotency state could not be loaded.'
    );
  }

  if (
    existing.draft_mode !==
      draft.mode
  ) {
    return {
      state:
        'recovery_required',
      nonceHash,
      row:
        existing,
    };
  }

  if (
    existing.status ===
      'completed'
  ) {
    return {
      state:
        'completed',
      nonceHash,
      row:
        existing,
    };
  }

  if (
    existing.status ===
      'failed'
  ) {
    if (
      registrationRequestHasResources(
        existing
      )
    ) {
      return {
        state:
          'recovery_required',
        nonceHash,
        row:
          existing,
      };
    }

    const retried =
      await queryControl(
        `
          UPDATE registration_requests
          SET
            status =
              'processing',
            started_at =
              NOW(),
            completed_at =
              NULL,
            failed_at =
              NULL,
            error_code =
              NULL,
            updated_at =
              NOW()
          WHERE nonce_hash = $1
            AND status =
                'failed'
            AND user_id
                IS NULL
            AND tenant_id
                IS NULL
            AND subscription_id
                IS NULL
          RETURNING
            id,
            nonce_hash,
            draft_mode,
            status,
            user_id,
            tenant_id,
            subscription_id,
            started_at,
            completed_at,
            failed_at,
            error_code
        `,
        [
          nonceHash,
        ]
      );

    if (
      retried.rows.length ===
        1
    ) {
      return {
        state:
          'claimed',
        nonceHash,
        row:
          retried.rows[0] as
            RegistrationRequestRow,
      };
    }

    existing =
      await loadRegistrationRequest(
        nonceHash
      );

    if (
      !existing
    ) {
      throw new Error(
        'Registration retry state could not be loaded.'
      );
    }

    if (
      existing.status ===
        'completed'
    ) {
      return {
        state:
          'completed',
        nonceHash,
        row:
          existing,
      };
    }

    return {
      state:
        registrationRequestHasResources(
          existing
        )
          ? 'recovery_required'
          : 'processing',
      nonceHash,
      row:
        existing,
    };
  }

  /*
   * A processing request is not stolen while it may still be
   * provisioning resources. Only a stale request that never
   * recorded any resource ID can be safely reclaimed.
   */
  const startedAt =
    new Date(
      existing.started_at
    );

  const stale =
    !Number.isNaN(
      startedAt.getTime()
    ) &&
    Date.now() -
      startedAt.getTime() >
      15 *
      60 *
      1000;

  const staleWithoutResources =
    stale &&
    !registrationRequestHasResources(
      existing
    );

  if (
    staleWithoutResources
  ) {
    const reclaimed =
      await queryControl(
        `
          UPDATE registration_requests
          SET
            started_at =
              NOW(),
            failed_at =
              NULL,
            error_code =
              NULL,
            updated_at =
              NOW()
          WHERE nonce_hash = $1
            AND status =
                'processing'
            AND user_id
                IS NULL
            AND tenant_id
                IS NULL
            AND subscription_id
                IS NULL
            AND started_at = $2
          RETURNING
            id,
            nonce_hash,
            draft_mode,
            status,
            user_id,
            tenant_id,
            subscription_id,
            started_at,
            completed_at,
            failed_at,
            error_code
        `,
        [
          nonceHash,
          existing.started_at,
        ]
      );

    if (
      reclaimed.rows.length ===
        1
    ) {
      return {
        state:
          'claimed',
        nonceHash,
        row:
          reclaimed.rows[0] as
            RegistrationRequestRow,
      };
    }

    existing =
      await loadRegistrationRequest(
        nonceHash
      );

    if (
      !existing
    ) {
      throw new Error(
        'Registration processing state could not be loaded.'
      );
    }
  }

  return {
    state:
      stale &&
      registrationRequestHasResources(
        existing
      )
        ? 'recovery_required'
        : 'processing',
    nonceHash,
    row:
      existing,
  };
}

async function updateRegistrationRequestProgress(
  nonceHash: string,
  context: RegistrationContext
) {
  await queryControl(
    `
      UPDATE registration_requests
      SET
        user_id =
          COALESCE(
            $2::uuid,
            user_id
          ),
        tenant_id =
          COALESCE(
            $3::uuid,
            tenant_id
          ),
        subscription_id =
          COALESCE(
            $4::uuid,
            subscription_id
          ),
        updated_at =
          NOW()
      WHERE nonce_hash = $1
        AND status =
            'processing'
    `,
    [
      nonceHash,
      context.userId,
      context.tenantId,
      context.subscriptionId,
    ]
  );
}

async function completeRegistrationRequest(
  nonceHash: string,
  context: RegistrationContext
) {
  if (
    !context.userId ||
    !context.tenantId ||
    !context.subscriptionId
  ) {
    throw new Error(
      'Registration cannot complete without user, workspace and subscription IDs.'
    );
  }

  const result =
    await queryControl(
      `
        UPDATE registration_requests
        SET
          status =
            'completed',
          user_id =
            $2,
          tenant_id =
            $3,
          subscription_id =
            $4,
          completed_at =
            NOW(),
          failed_at =
            NULL,
          error_code =
            NULL,
          updated_at =
            NOW()
        WHERE nonce_hash = $1
          AND status =
              'processing'
        RETURNING id
      `,
      [
        nonceHash,
        context.userId,
        context.tenantId,
        context.subscriptionId,
      ]
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new Error(
      'Registration idempotency state could not be completed.'
    );
  }
}

async function failRegistrationRequest(
  nonceHash: string,
  cleanupSucceeded: boolean
) {
  await queryControl(
    `
      UPDATE registration_requests
      SET
        status =
          'failed',
        failed_at =
          NOW(),
        error_code =
          $2,
        user_id =
          CASE
            WHEN $3::boolean
            THEN NULL
            ELSE user_id
          END,
        tenant_id =
          CASE
            WHEN $3::boolean
            THEN NULL
            ELSE tenant_id
          END,
        subscription_id =
          CASE
            WHEN $3::boolean
            THEN NULL
            ELSE subscription_id
          END,
        updated_at =
          NOW()
      WHERE nonce_hash = $1
        AND status =
            'processing'
    `,
    [
      nonceHash,
      cleanupSucceeded
        ? 'REGISTRATION_FAILED_CLEAN'
        : 'REGISTRATION_CLEANUP_REQUIRED',
      cleanupSucceeded,
    ]
  );
}


async function getGoogleSignupState(
  request: NextRequest
): Promise<
  GoogleSignupRow | null
> {
  const rawState =
    request.cookies.get(
      GOOGLE_SIGNUP_COOKIE
    )?.value;

  if (!rawState) {
    return null;
  }

  const stateHash =
    hashOpaqueToken(
      rawState
    );

  const result =
    await queryControl(
      `
        SELECT
          state_hash,
          google_subject,
          email,
          first_name,
          last_name,
          avatar_url,
          expires_at

        FROM google_signup_states

        WHERE state_hash = $1
          AND expires_at > NOW()

        LIMIT 1
      `,
      [
        stateHash,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    return null;
  }

  return result
    .rows[0] as GoogleSignupRow;
}

async function consumeGoogleSignupState(
  stateHash: string
) {
  await queryControl(
    `
      DELETE FROM google_signup_states
      WHERE state_hash = $1
    `,
    [
      stateHash,
    ]
  );
}

function clearGoogleSignupCookie(
  response: NextResponse
) {
  response.cookies.set(
    GOOGLE_SIGNUP_COOKIE,
    '',
    {
      httpOnly: true,

      secure:
        process.env.NODE_ENV ===
        'production',

      sameSite:
        'lax',

      path: '/',

      maxAge: 0,

      expires:
        new Date(0),
    }
  );

  return response;
}

/* ============================================================
   EMAIL VERIFICATION
   ============================================================ */

function generateVerificationCode():
  string {
  return crypto
    .randomInt(
      100000,
      1000000
    )
    .toString();
}

function hashVerificationCode(
  code: string
): string {
  return crypto
    .createHash('sha256')
    .update(code)
    .digest('hex');
}

async function createVerification({
  email,
  firstName,
}: {
  email: string;
  firstName: string;
}): Promise<boolean> {
  try {
    const code =
      generateVerificationCode();

    const codeHash =
      hashVerificationCode(
        code
      );

    const expiresAt =
      new Date(
        Date.now() +
          VERIFICATION_EXPIRY_MINUTES *
            60 *
            1000
      );

    /*
     * Invalidate previous unused verification codes.
     *
     * We keep their records rather than physically deleting
     * them.
     */
    await queryControl(
      `
        UPDATE email_verifications

        SET
          used_at = NOW()

        WHERE LOWER(email) = $1
          AND used_at IS NULL
          AND deleted_at IS NULL
      `,
      [
        email,
      ]
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
        email,
        codeHash,
        expiresAt,
      ]
    );

    /*
     * Email branding remains owned by lib/services/email.ts.
     */
    await sendVerificationEmail(
      email,
      code,
      firstName,
      {
        expiresInMinutes:
          VERIFICATION_EXPIRY_MINUTES,
      }
    );

    return true;
  } catch (error) {
    /*
     * Registration itself should not be destroyed merely
     * because email delivery temporarily fails.
     *
     * /api/auth/resend-verification can issue another code.
     */
    console.error(
      '[SaMi] Failed to create/send verification email:',
      error
    );

    return false;
  }
}

/* ============================================================
   CLEANUP
   ============================================================ */

async function cleanupRegistration(
  context: RegistrationContext
): Promise<boolean> {
  let cleanupSucceeded =
    true;
  if (
    context.tenantId
  ) {
    try {
      await queryControl(
        `
          DELETE FROM payment_transactions
          WHERE tenant_id = $1
        `,
        [
          context.tenantId,
        ]
      );
    } catch (error) {
      cleanupSucceeded =
        false;
      console.error(
        '[SaMi] Payment cleanup failed:',
        error
      );
    }
  }

  if (
    context.subscriptionId
  ) {
    try {
      await queryControl(
        `
          DELETE FROM subscriptions
          WHERE id = $1
        `,
        [
          context.subscriptionId,
        ]
      );
    } catch (error) {
      cleanupSucceeded =
        false;
      console.error(
        '[SaMi] Subscription cleanup failed:',
        error
      );
    }
  }

  if (
    context.tenantId
  ) {
    const cleanupQueries = [
      `
        DELETE FROM tenant_modules
        WHERE tenant_id = $1
      `,
      `
        DELETE FROM user_roles
        WHERE tenant_id = $1
      `,
      `
        DELETE FROM tenant_users
        WHERE tenant_id = $1
      `,
      `
        DELETE FROM tenants
        WHERE id = $1
      `,
    ];

    for (
      const query of
      cleanupQueries
    ) {
      try {
        await queryControl(
          query,
          [
            context.tenantId,
          ]
        );
      } catch (error) {
      cleanupSucceeded =
        false;
        console.error(
          '[SaMi] Tenant cleanup failed:',
          error
        );
      }
    }
  }

  if (
    context.userId &&
    context.userCreated
  ) {
    try {
      await queryControl(
        `
          DELETE FROM email_verifications

          WHERE email = (
            SELECT email
            FROM users
            WHERE id = $1
          )
        `,
        [
          context.userId,
        ]
      );
    } catch (error) {
      cleanupSucceeded =
        false;
      console.error(
        '[SaMi] Verification cleanup failed:',
        error
      );
    }

    try {
      await queryControl(
        `
          DELETE FROM users
          WHERE id = $1
        `,
        [
          context.userId,
        ]
      );
    } catch (error) {
      cleanupSucceeded =
        false;
      console.error(
        '[SaMi] User cleanup failed:',
        error
      );
    }
  }

  return cleanupSucceeded;
}

/* ============================================================
   PLAN PRICE

   SaMi billing is per-user.
   ============================================================ */

/* ============================================================
   BILLABLE USERS
   ============================================================ */

async function getBillableUserCount(
  tenantId: string
): Promise<number> {
  const result =
    await queryControl(
      `
        SELECT
          COUNT(*)::int AS count

        FROM tenant_users

        WHERE tenant_id = $1
          AND LOWER(
                COALESCE(
                  status,
                  ''
                )
              ) =
              'active'
          AND LOWER(
                COALESCE(
                  member_type,
                  'internal'
                )
              ) =
              'internal'
          AND deleted_at
              IS NULL
      `,
      [
        tenantId,
      ]
    );

  const count =
    Number(
      result.rows[0]?.count
    );

  if (
    !Number.isFinite(count) ||
    count < 1
  ) {
    return 1;
  }

  return count;
}

/* ============================================================
   LOAD FINAL SUBSCRIPTION
   ============================================================ */

async function getSubscriptionForResponse(
  subscriptionId: string,
  ownerUserId: string
): Promise<
  SubscriptionResponseRow | null
> {
  const result =
    await queryControl(
      `
        SELECT
          s.id,
          s.status,
          s.started_at,
          s.trial_ends_at,
          s.current_period_start,
          s.current_period_end,

          p.key AS plan_key,
          p.name AS plan_name,

          t.name AS tenant_name,

          u.email AS owner_email,
          u.first_name AS owner_first_name,
          u.last_name AS owner_last_name,
          COALESCE(
            u.email_verified,
            FALSE
          ) AS owner_email_verified,
          u.email_verified_at AS owner_email_verified_at

        FROM subscriptions s

        INNER JOIN plans p
          ON p.id = s.plan_id

        INNER JOIN tenants t
          ON t.id = s.tenant_id

        INNER JOIN tenant_users tu
          ON tu.tenant_id = s.tenant_id
         AND tu.user_id = $2
         AND tu.is_owner = TRUE
         AND LOWER(
               COALESCE(
                 tu.status,
                 ''
               )
             ) = 'active'
         AND tu.deleted_at IS NULL

        INNER JOIN users u
          ON u.id = tu.user_id
         AND u.deleted_at IS NULL

        WHERE s.id = $1
          AND s.deleted_at IS NULL
          AND p.deleted_at IS NULL
          AND t.deleted_at IS NULL

        LIMIT 1
      `,
      [
        subscriptionId,
        ownerUserId,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
}

async function buildCompletedRegistrationResponse(
  input: {
    request:
      RegistrationRequestRow;
    draft:
      RegistrationDraft;
    session:
      Awaited<
        ReturnType<
          typeof getSession
        >
      >;
  }
) {
  const {
    request,
    draft,
    session,
  } =
    input;

  if (
    !request.user_id ||
    !request.tenant_id ||
    !request.subscription_id
  ) {
    return null;
  }

  const [
    subscription,
    tenantResult,
    appResult,
  ] =
    await Promise.all([
      getSubscriptionForResponse(
        request.subscription_id,
        request.user_id
      ),

      queryControl(
        `
          SELECT
            id,
            name,
            slug,
            status
          FROM tenants
          WHERE id = $1
            AND deleted_at
                IS NULL
          LIMIT 1
        `,
        [
          request.tenant_id,
        ]
      ),

      queryControl(
        `
          SELECT
            m.key
          FROM tenant_modules tm
          INNER JOIN modules m
            ON m.id =
               tm.module_id
          WHERE tm.tenant_id = $1
            AND tm.deleted_at
                IS NULL
            AND m.deleted_at
                IS NULL
          ORDER BY
            m.key
        `,
        [
          request.tenant_id,
        ]
      ),
    ]);

  const tenant =
    tenantResult.rows[0] ||
    null;

  if (
    !subscription ||
    !tenant
  ) {
    return null;
  }

  const authoritativeEmail =
    normalizeEmail(
      subscription
        .owner_email
    );

  const authoritativeBusinessName =
    normalizeName(
      subscription
        .tenant_name
    );

  if (
    !isValidEmail(
      authoritativeEmail
    ) ||
    !authoritativeBusinessName
  ) {
    return null;
  }

  const finalPlan =
    normalizePlan(
      subscription
        .plan_key
    );

  const isPaidPlan =
    finalPlan !==
    'free';

  const billableUsers =
    await getBillableUserCount(
      request.tenant_id
    );

  const perUserMonthlyPrice =
    getSamiPricePerUserMonthly(
      finalPlan
    );

  const monthlyAmount =
    isPaidPlan
      ? getSamiMonthlyAmount(
          finalPlan,
          billableUsers,
        )
      : 0;

  const trialEndsAt =
    toIsoString(
      subscription
        .trial_ends_at
    );

  const currentPeriodStart =
    toIsoString(
      subscription
        .current_period_start
    );

  const currentPeriodEnd =
    toIsoString(
      subscription
        .current_period_end
    );

  const emailVerified =
    Boolean(
      subscription
        .owner_email_verified ||
      subscription
        .owner_email_verified_at
    );

  const provisioningSucceeded =
    String(
      tenant.status ||
      ''
    )
      .trim()
      .toLowerCase() ===
      'active';

  if (
    draft.mode ===
      'existing' &&
    provisioningSucceeded &&
    session &&
    session.user.id ===
      request.user_id
  ) {
    await setCurrentTenantForSession(
      session.sessionId,
      session.user.id,
      request.tenant_id
    );
  }

  const response =
    jsonResponse(
      {
        success:
          true,

        code:
          'REGISTRATION_ALREADY_COMPLETED',

        idempotentReplay:
          true,

        requiresPayment:
          false,

        paymentRequiredNow:
          false,

        billingSetupRequired:
          false,

        billingSetupRequiredNow:
          false,

        billingSetupRequiredAtTrialEnd:
          isPaidPlan,

        firstMonthFree:
          isPaidPlan,

        amountDueToday:
          0,

        user: {
          id:
            request.user_id,

          email:
            authoritativeEmail,

          emailVerified,

          authProvider:
            draft.mode,
        },

        tenant: {
          id:
            request.tenant_id,

          name:
            authoritativeBusinessName,

          slug:
            String(
              tenant.slug ||
              ''
            ),

          status:
            String(
              tenant.status ||
              ''
            ),
        },

        subscription: {
          id:
            request.subscription_id,

          plan:
            finalPlan,

          planName:
            subscription
              .plan_name,

          status:
            subscription
              .status,

          billingCycle:
            isPaidPlan
              ? 'monthly'
              : null,

          firstMonthFree:
            isPaidPlan,

          trialMonths:
            isPaidPlan
              ? PAID_TRIAL_MONTHS
              : 0,

          startedAt:
            toIsoString(
              subscription
                .started_at
            ),

          trialEndsAt,

          currentPeriodStart,

          currentPeriodEnd,

          firstBillingAt:
            isPaidPlan
              ? trialEndsAt
              : null,

          amountDueToday:
            0,

          perUserMonthlyPrice,

          billableUsers,

          monthlyAmount,

          currency:
            SAMI_BILLING_CURRENCY,

          paymentMethodOnFile:
            false,

          recurringBillingEnrolled:
            false,
        },

        selectedApps:
          appResult.rows
            .map(
              row =>
                String(
                  row.key ||
                  ''
                )
                  .trim()
                  .toLowerCase()
            )
            .filter(
              Boolean
            ),

        verification: {
          required:
            draft.mode ===
              'email' &&
            !emailVerified,

          email:
            authoritativeEmail,

          expiresInMinutes:
            draft.mode ===
                'email' &&
              !emailVerified
              ? VERIFICATION_EXPIRY_MINUTES
              : null,

          emailSent:
            false,
        },

        next:
          draft.mode ===
            'existing'
            ? (
                provisioningSucceeded
                  ? '/dashboard'
                  : '/workspaces/new?workspace=preparing'
              )
            : draft.mode ===
                'google'
              ? (
                  provisioningSucceeded
                    ? '/login?google=registered'
                    : '/login?workspace=preparing'
                )
              : emailVerified
                ? '/login?registered=1'
                : `/verify-email?email=${encodeURIComponent(
                    authoritativeEmail
                  )}`,

        message:
          'This workspace registration was already completed. SaMi returned the existing workspace instead of creating a duplicate.',
      },
      200
    );

  response.cookies.set(
    REGISTRATION_DRAFT_COOKIE_NAME,
    '',
    clearRegistrationDraftCookieOptions()
  );

  if (
    draft.mode ===
      'google'
  ) {
    clearGoogleSignupCookie(
      response
    );
  }

  return response;
}


/* ============================================================
   POST /api/auth/register
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  const context:
    RegistrationContext = {
      userId: null,
      tenantId: null,
      subscriptionId: null,
      userCreated: false,
    };

  let registrationRequestNonceHash:
    string | null =
    null;

  let registrationRequestClaimed =
    false;

  try {
    /* ========================================================
       1. REQUEST BOUNDARY
       ======================================================== */

    if (
      !isSameOriginRequest(
        request
      )
    ) {
      return errorResponse(
        403,
        'INVALID_ORIGIN',
        'This registration request could not be verified.'
      );
    }

    if (
      !isJsonRequest(
        request
      )
    ) {
      return errorResponse(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Registration requests must use JSON.'
      );
    }

    if (
      registrationRequestTooLarge(
        request
      )
    ) {
      return errorResponse(
        413,
        'REQUEST_TOO_LARGE',
        'The registration request is too large.'
      );
    }

    let body:
      RegistrationBody;

    try {
      const parsed:
        unknown =
        await request.json();

      if (
        !parsed ||
        typeof parsed !==
          'object' ||
        Array.isArray(parsed)
      ) {
        return errorResponse(
          400,
          'INVALID_REQUEST',
          'Invalid request body.'
        );
      }

      body =
        parsed as RegistrationBody;
    } catch {
      return errorResponse(
        400,
        'INVALID_REQUEST',
        'Invalid request body.'
      );
    }

    /* ========================================================
       2. SERVER-AUTHORITATIVE REGISTRATION DRAFT

       The browser is allowed to submit only onboarding choices
       such as plan and apps. Account identity, workspace name
       and password authority come from the encrypted HttpOnly
       draft created by /api/auth/registration-draft.
       ======================================================== */

    const draft =
      readRegistrationDraft(
        request.cookies.get(
          REGISTRATION_DRAFT_COOKIE_NAME
        )?.value
      );

    if (
      !draft
    ) {
      return errorResponse(
        409,
        'REGISTRATION_DRAFT_REQUIRED',
        'Your secure registration session is missing or expired. Start the workspace setup again.',
        {
          next:
            '/register',
        }
      );
    }

    const session =
      await getSession();

    const googleRegistration =
      draft.mode ===
        'google';

    const existingAccountRegistration =
      draft.mode ===
        'existing';

    let googleSignup:
      GoogleSignupRow | null =
      null;

    if (
      googleRegistration
    ) {
      googleSignup =
        await getGoogleSignupState(
          request
        );

      if (
        !googleSignup ||
        !googleSignup
          .google_subject ||
        googleSignup.state_hash !==
          draft.googleStateHash
      ) {
        return errorResponse(
          409,
          'GOOGLE_SIGNUP_EXPIRED',
          'Your Google registration can no longer be verified. Please start again.',
          {
            next:
              '/register',
          }
        );
      }
    }

    if (
      existingAccountRegistration
    ) {
      if (
        !session ||
        !draft.userId ||
        session.user.id !==
          draft.userId
      ) {
        return errorResponse(
          401,
          'AUTHENTICATION_REQUIRED',
          'Sign in with the SaMi account that owns this workspace setup.',
          {
            next:
              '/workspaces/new',
          }
        );
      }
    } else if (
      session
    ) {
      return errorResponse(
        409,
        'AUTHENTICATED_ACCOUNT_MISMATCH',
        'You are already signed in. Create the workspace under your current SaMi account or sign out before creating a different account.',
        {
          next:
            '/workspaces/new',
        }
      );
    }

    /* ========================================================
       3. AUTHORITATIVE ACCOUNT DATA
       ======================================================== */

    let firstName =
      normalizeName(
        googleSignup
          ?.first_name ??
        draft.firstName
      );

    let lastName =
      normalizeName(
        googleSignup
          ?.last_name ??
        draft.lastName
      );

    let email =
      normalizeEmail(
        googleSignup
          ?.email ??
        draft.email
      );

    const phone =
      normalizePhone(
        draft.phone
      );

    const businessName =
      normalizeName(
        draft.businessName
      );

    const requestedPlan =
      normalizePlan(
        body.plan
      );

    const selectedApps =
      normalizeSelectedApps(
        body.selectedApps
      );

    /* ========================================================
       4. VALIDATION
       ======================================================== */

    if (
      !firstName ||
      !lastName ||
      !email ||
      !businessName
    ) {
      return errorResponse(
        400,
        'REGISTRATION_IDENTITY_INVALID',
        'The secure registration identity is incomplete. Restart workspace setup.'
      );
    }

    if (
      firstName.length >
        MAX_NAME_LENGTH ||
      lastName.length >
        MAX_NAME_LENGTH
    ) {
      return errorResponse(
        400,
        'NAME_TOO_LONG',
        'Name fields are too long.'
      );
    }

    if (
      !isValidEmail(
        email
      )
    ) {
      return errorResponse(
        400,
        'INVALID_EMAIL',
        'The registration email is invalid.'
      );
    }

    if (
      businessName.length < 2 ||
      businessName.length >
        MAX_NAME_LENGTH
    ) {
      return errorResponse(
        400,
        'INVALID_BUSINESS_NAME',
        'Business name must be between 2 and 120 characters.'
      );
    }

    if (
      selectedApps === null ||
      selectedApps.length ===
        0
    ) {
      return errorResponse(
        400,
        'APPS_REQUIRED',
        'Please select at least one SaMi app.'
      );
    }

    if (
      selectedApps.length >
      MAX_SELECTED_APPS
    ) {
      return errorResponse(
        400,
        'TOO_MANY_APPS',
        'Too many apps selected.'
      );
    }

    if (
      !ALLOWED_PLANS.has(
        requestedPlan
      )
    ) {
      return errorResponse(
        400,
        'INVALID_PLAN',
        'Invalid subscription plan.'
      );
    }

    /* ========================================================
       5. ACCOUNT IDENTITY / MULTI-WORKSPACE OWNERSHIP

       One users row represents one SaMi identity. The same
       verified account may own or join many tenants through
       tenant_users. We never create a duplicate users row just
       because the person is creating another workspace.
       ======================================================== */

    const existingUser =
      await queryControl(
        `
          SELECT
            id,
            email,
            first_name,
            last_name,
            phone,
            status,
            email_verified,
            email_verified_at,
            deleted_at

          FROM users

          WHERE LOWER(email) = $1

          LIMIT 1
        `,
        [
          email,
        ]
      );

    const existing =
      existingUser.rows[0] ||
      null;

    if (
      existingAccountRegistration
    ) {
      if (
        !existing ||
        existing.deleted_at ||
        String(
          existing.id
        ) !==
          draft.userId ||
        String(
          existing.id
        ) !==
          session?.user.id ||
        String(
          existing.status ||
          ''
        )
          .trim()
          .toLowerCase() !==
          'active' ||
        (
          existing.email_verified !==
            true &&
          !existing
            .email_verified_at
        )
      ) {
        return errorResponse(
          409,
          'ACCOUNT_UNAVAILABLE',
          'The signed-in SaMi account is not available for creating another workspace.'
        );
      }

      context.userId =
        requireDatabaseId(
          existing.id,
          'existing user'
        );

      email =
        normalizeEmail(
          existing.email
        );

      firstName =
        normalizeName(
          existing.first_name
        ) ||
        session?.user.firstName ||
        firstName;

      lastName =
        normalizeName(
          existing.last_name
        ) ||
        session?.user.lastName ||
        lastName;
    } else if (
      existing
    ) {
      if (
        existing.deleted_at
      ) {
        return errorResponse(
          409,
          'ACCOUNT_PREVIOUSLY_DELETED',
          'An account previously associated with this email exists. Please contact SaMi support.'
        );
      }

      if (
        !existing
          .email_verified_at &&
        existing.email_verified !==
          true
      ) {
        return errorResponse(
          409,
          'EMAIL_VERIFICATION_REQUIRED',
          'An account with this email already exists and is awaiting email verification.'
        );
      }

      return errorResponse(
        409,
        'ACCOUNT_SIGN_IN_REQUIRED',
        'This email already belongs to a SaMi account. Sign in with it to create another workspace or accept workspace invitations.',
        {
          next:
            '/workspaces/new',
        }
      );
    }

    /* ========================================================
       6. VALIDATE APPS + REQUIRED DEPENDENCIES

       Registration and runtime installation share the same
       code-owned dependency graph. A root app can never enter
       a new workspace without every required dependency.
       ======================================================== */

    let resolvedApps:
      string[];

    try {
      resolvedApps =
        [
          ...new Set(
            selectedApps.flatMap(
              appKey =>
                getSamiModuleDependencyPlan(
                  appKey,
                )
                  .map(
                    manifest =>
                      manifest.key,
                  ),
            ),
          ),
        ];
    } catch (
      error
    ) {
      return errorResponse(
        400,
        'INVALID_SELECTED_APPS',
        error instanceof
          Error
          ? error.message
          : 'One or more selected SaMi apps are unavailable.'
      );
    }

    const moduleResult =
      await queryControl(
        `
          SELECT
            id,
            key,
            name,
            version,
            status

          FROM modules

          WHERE key =
            ANY($1::text[])

            AND deleted_at IS NULL
            AND status = 'active'
        `,
        [
          resolvedApps,
        ]
      );

    const moduleRows =
      moduleResult
        .rows as ModuleRow[];

    const validAppSet =
      new Set(
        moduleRows
          .map(
            (row) =>
              String(row.key)
          )
          .filter(Boolean)
      );

    const invalidApps =
      resolvedApps.filter(
        (appKey) =>
          !validAppSet.has(
            appKey
          )
      );

    if (
      invalidApps.length >
      0
    ) {
      return errorResponse(
        400,
        'INVALID_SELECTED_APPS',
        'One or more selected SaMi apps are unavailable.',
        {
          invalidApps,
        }
      );
    }

    /* ========================================================
       7. FINAL PLAN

       Free supports only one installed business app, including
       required dependencies.

       If the resolved dependency plan contains more than one
       business app, Free upgrades to Standard.

       Explicit Custom is never downgraded.
       ======================================================== */

    const finalPlan =
      requestedPlan ===
        'free' &&
      resolvedApps.length >
        1
        ? 'standard'
        : requestedPlan;

    const isPaidPlan =
      finalPlan !==
      'free';

    /* ========================================================
       8. LOAD PLAN
       ======================================================== */

    const planResult =
      await queryControl(
        `
          SELECT
            id,
            key,
            name

          FROM plans

          WHERE key = $1
            AND deleted_at IS NULL

          LIMIT 1
        `,
        [
          finalPlan,
        ]
      );

    if (
      planResult.rows
        .length ===
      0
    ) {
      throw new Error(
        `Subscription plan "${finalPlan}" is not configured.`
      );
    }

    const plan =
      planResult
        .rows[0] as PlanRow;

    const planId =
      requireDatabaseId(
        plan.id,
        'subscription plan'
      );

    /* ========================================================
       9. CLAIM REGISTRATION DRAFT

       The encrypted draft nonce is single-consumption. A
       concurrent request must never create a second workspace.
       A completed retry returns the already-created workspace.
       ======================================================== */

    const registrationClaim =
      await claimRegistrationRequest(
        draft
      );

    const activeRegistrationNonceHash =
      registrationClaim
        .nonceHash;

    registrationRequestNonceHash =
      activeRegistrationNonceHash;

    if (
      registrationClaim.state ===
        'completed'
    ) {
      const completedResponse =
        await buildCompletedRegistrationResponse({
          request:
            registrationClaim.row,
          draft,
          session,
        });

      if (
        completedResponse
      ) {
        return completedResponse;
      }

      return errorResponse(
        409,
        'REGISTRATION_RECOVERY_REQUIRED',
        'This workspace registration completed previously, but SaMi could not reconstruct its current workspace state. Contact support instead of starting another registration.'
      );
    }

    if (
      registrationClaim.state ===
        'processing'
    ) {
      return errorResponse(
        409,
        'REGISTRATION_IN_PROGRESS',
        'This workspace registration is already being processed. Please wait a moment and try again.',
        {
          retryAfterSeconds:
            3,
        }
      );
    }

    if (
      registrationClaim.state ===
        'recovery_required'
    ) {
      return errorResponse(
        409,
        'REGISTRATION_RECOVERY_REQUIRED',
        'SaMi found an incomplete registration with retained resources. Automatic retry is blocked to prevent creating a duplicate workspace. Contact support for recovery.'
      );
    }

    registrationRequestClaimed =
      true;

    if (
      context.userId
    ) {
      await updateRegistrationRequestProgress(
        activeRegistrationNonceHash,
        context
      );
    }

    /* ========================================================
       10. ACCOUNT CREDENTIAL MATERIAL

       Email/password drafts contain only a server-created
       password hash. Google receives a random unusable local
       password. Existing accounts reuse their current identity
       and credentials unchanged.
       ======================================================== */

    let passwordHash:
      string | null =
      null;

    if (
      !existingAccountRegistration
    ) {
      passwordHash =
        googleRegistration
          ? await hashPassword(
              crypto
                .randomBytes(64)
                .toString(
                  'base64url'
                )
            )
          : draft.passwordHash;
    }

    if (
      !existingAccountRegistration &&
      !passwordHash
    ) {
      throw new Error(
        'REGISTRATION_DRAFT_INVALID'
      );
    }

    /* ========================================================
       11. WORKSPACE SLUG
       ======================================================== */

    const slug =
      await createUniqueTenantSlug(
        businessName
      );

    /* ========================================================
       12. CREATE OR REUSE GLOBAL USER IDENTITY
       ======================================================== */

    const emailAlreadyVerified =
      googleRegistration ||
      existingAccountRegistration;

    if (
      !existingAccountRegistration
    ) {
      const userStatus =
        googleRegistration
          ? 'active'
          : 'pending_verification';

      const userResult =
        await queryControl(
          `
            INSERT INTO users (
              email,
              password_hash,
              first_name,
              last_name,
              full_name,
              phone,
              status,
              email_verified,
              email_verified_at,
              created_at,
              updated_at
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,

              CASE
                WHEN $8::boolean
                THEN NOW()
                ELSE NULL
              END,

              NOW(),
              NOW()
            )

            RETURNING
              id,
              email
          `,
          [
            email,

            passwordHash,

            firstName,

            lastName,

            `${firstName} ${lastName}`,

            phone,

            userStatus,

            emailAlreadyVerified,
          ]
        );

      if (
        userResult.rows
          .length ===
        0
      ) {
        throw new Error(
          'User was not created by the database.'
        );
      }

      context.userId =
        requireDatabaseId(
          userResult
            .rows[0].id,
          'user'
        );

      context.userCreated =
        true;
    }

    if (
      !context.userId
    ) {
      throw new Error(
        'Registration does not have an authoritative SaMi user.'
      );
    }

    await updateRegistrationRequestProgress(
      activeRegistrationNonceHash,
      context
    );

    /* ========================================================
       13. CREATE WORKSPACE

       Paid workspaces are NOT pending_payment anymore.

       They are provisioned immediately because the first
       month is genuinely free.
       ======================================================== */

    const tenantResult =
      await queryControl(
        `
          INSERT INTO tenants (
            name,
            slug,
            status,
            created_at,
            updated_at
          )

          VALUES (
            $1,
            $2,
            'provisioning',
            NOW(),
            NOW()
          )

          RETURNING id
        `,
        [
          businessName,
          slug,
        ]
      );

    if (
      tenantResult.rows
        .length ===
      0
    ) {
      throw new Error(
        'Tenant was not created by the database.'
      );
    }

    context.tenantId =
      requireDatabaseId(
        tenantResult
          .rows[0].id,
        'tenant'
      );

    await updateRegistrationRequestProgress(
      activeRegistrationNonceHash,
      context
    );

    /* ========================================================
       14. OWNER MEMBERSHIP
       ======================================================== */

    await queryControl(
      `
        INSERT INTO tenant_users (
          tenant_id,
          user_id,
          status,
          is_owner,
          created_at
        )

        VALUES (
          $1,
          $2,
          'active',
          TRUE,
          NOW()
        )
      `,
      [
        context.tenantId,
        context.userId,
      ]
    );

    /* ========================================================
       15. ADMIN ROLE
       ======================================================== */

    const roleResult =
      await queryControl(
        `
          SELECT id

          FROM roles

          WHERE is_system = TRUE
            AND deleted_at IS NULL

            AND (
              LOWER(
                COALESCE(
                  key,
                  ''
                )
              ) = 'admin'

              OR

              LOWER(name) =
                'admin'
            )

          LIMIT 1
        `
      );

    if (
      roleResult.rows
        .length ===
      0
    ) {
      throw new Error(
        'System administrator role is not configured.'
      );
    }

    const roleId =
      requireDatabaseId(
        roleResult
          .rows[0].id,
        'admin role'
      );

    await queryControl(
      `
        INSERT INTO user_roles (
          tenant_id,
          user_id,
          role_id,
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
        context.tenantId,
        context.userId,
        roleId,
      ]
    );

    /* ========================================================
       16. CREATE SUBSCRIPTION

       PAID:
         trialing immediately
         trial = one calendar month

       FREE:
         pending while workspace provisions
         active immediately after provisioning
       ======================================================== */

    const initialSubscriptionStatus =
      isPaidPlan
        ? 'trialing'
        : 'pending';

    const subscriptionResult =
      await queryControl(
        `
          INSERT INTO subscriptions (
            tenant_id,
            plan_id,
            status,
            started_at,
            trial_ends_at,
            current_period_start,
            current_period_end,
            created_at,
            updated_at
          )

          VALUES (
            $1,
            $2,
            $3,

            NOW(),

            CASE
              WHEN $4::boolean
              THEN NOW() + INTERVAL '1 month'
              ELSE NULL
            END,

            NOW(),

            CASE
              WHEN $4::boolean
              THEN NOW() + INTERVAL '1 month'
              ELSE NULL
            END,

            NOW(),
            NOW()
          )

          RETURNING
            id,
            status,
            started_at,
            trial_ends_at,
            current_period_start,
            current_period_end
        `,
        [
          context.tenantId,

          planId,

          initialSubscriptionStatus,

          isPaidPlan,
        ]
      );

    if (
      subscriptionResult.rows
        .length ===
      0
    ) {
      throw new Error(
        'Subscription was not created by the database.'
      );
    }

    context.subscriptionId =
      requireDatabaseId(
        subscriptionResult
          .rows[0].id,
        'subscription'
      );

    await updateRegistrationRequestProgress(
      activeRegistrationNonceHash,
      context
    );

    /* ========================================================
       17. RESERVE APPS
       ======================================================== */

    for (
      const row of
      moduleRows
    ) {
      const moduleId =
        requireDatabaseId(
          row.id,
          'module'
        );

      const moduleVersion =
        typeof row.version ===
        'string'
          ? row.version
          : null;

      await queryControl(
        `
          INSERT INTO tenant_modules (
            tenant_id,
            module_id,
            version,
            status,
            installed_at
          )

          VALUES (
            $1,
            $2,
            $3,
            'pending',
            NULL
          )

          ON CONFLICT DO NOTHING
        `,
        [
          context.tenantId,
          moduleId,
          moduleVersion,
        ]
      );
    }

    /* ========================================================
       18. PROVISION WORKSPACE IMMEDIATELY

       This applies equally to:
       - Free
       - Standard trial
       - Custom trial

       Paid customers do NOT wait for PesaPal anymore.
       ======================================================== */

    let provisioningSucceeded =
      false;

    try {
      const result =
        await provisionTenant(
          context.tenantId,
          selectedApps
        );

      provisioningSucceeded =
        Boolean(
          result.success
        ) &&
        result.appsFailed
          .length ===
          0 &&
        result.appsInstalled
          .length ===
          selectedApps.length;
    } catch (error) {
      console.error(
        '[SaMi] Workspace provisioning failed:',
        error
      );

      provisioningSucceeded =
        false;
    }

    /* ========================================================
       19. FINAL WORKSPACE / SUBSCRIPTION STATE
       ======================================================== */

    if (
      provisioningSucceeded
    ) {
      await queryControl(
        `
          UPDATE tenants

          SET
            status = 'active',
            updated_at = NOW()

          WHERE id = $1
            AND deleted_at IS NULL
        `,
        [
          context.tenantId,
        ]
      );

      await queryControl(
        `
          UPDATE tenant_modules

          SET
            status = 'installed',
            installed_at =
              COALESCE(
                installed_at,
                NOW()
              )

          WHERE tenant_id = $1
            AND status = 'pending'
        `,
        [
          context.tenantId,
        ]
      );

      if (
        isPaidPlan
      ) {
        /*
         * Paid subscription remains TRIALING.
         *
         * Do NOT:
         * - activate it
         * - remove trial_ends_at
         * - call PesaPal
         * - create payment_transactions
         */
        await queryControl(
          `
            UPDATE subscriptions

            SET
              status = 'trialing',
              updated_at = NOW()

            WHERE id = $1
              AND deleted_at IS NULL
          `,
          [
            context.subscriptionId,
          ]
        );
      } else {
        await queryControl(
          `
            UPDATE subscriptions

            SET
              status = 'active',
              trial_ends_at = NULL,
              current_period_end = NULL,
              updated_at = NOW()

            WHERE id = $1
              AND deleted_at IS NULL
          `,
          [
            context.subscriptionId,
          ]
        );
      }
    } else {
      await queryControl(
        `
          UPDATE tenants

          SET
            status =
              'provisioning_failed',

            updated_at =
              NOW()

          WHERE id = $1
            AND deleted_at IS NULL
        `,
        [
          context.tenantId,
        ]
      );

      await queryControl(
        `
          UPDATE subscriptions

          SET
            status =
              'provisioning_failed',

            updated_at =
              NOW()

          WHERE id = $1
            AND deleted_at IS NULL
        `,
        [
          context.subscriptionId,
        ]
      );
    }

    let verificationEmailSent =
      false;

    /* ========================================================
       20. BILLABLE USERS / PRICE

       Backend remains authoritative.

       At initial signup this will normally be 1, but we count
       actual active tenant memberships rather than trusting
       the browser.
       ======================================================== */

    const billableUsers =
      await getBillableUserCount(
        context.tenantId
      );

    const perUserMonthlyPrice =
      getSamiPricePerUserMonthly(
        finalPlan
      );

    if (
      isPaidPlan &&
      (
        !Number.isFinite(
          perUserMonthlyPrice
        ) ||
        perUserMonthlyPrice <=
          0
      )
    ) {
      throw new Error(
        `Invalid per-user monthly price configured for "${finalPlan}".`
      );
    }

    const monthlyAmount =
      isPaidPlan
        ? getSamiMonthlyAmount(
            finalPlan,
            billableUsers,
          )
        : 0;

    /* ========================================================
       21. AUTHORITATIVE FINAL SUBSCRIPTION
       ======================================================== */

    const subscription =
      await getSubscriptionForResponse(
        context.subscriptionId,
        context.userId
      );

    if (!subscription) {
      throw new Error(
        'Created subscription could not be loaded.'
      );
    }

    const trialEndsAt =
      toIsoString(
        subscription.trial_ends_at
      );

    const currentPeriodStart =
      toIsoString(
        subscription
          .current_period_start
      );

    const currentPeriodEnd =
      toIsoString(
        subscription
          .current_period_end
      );

    const authoritativeEmail =
      normalizeEmail(
        subscription
          .owner_email
      );

    const authoritativeFirstName =
      normalizeName(
        subscription
          .owner_first_name
      ) ||
      firstName;

    const authoritativeBusinessName =
      normalizeName(
        subscription
          .tenant_name
      );

    if (
      !isValidEmail(
        authoritativeEmail
      ) ||
      !authoritativeBusinessName
    ) {
      throw new Error(
        'Authoritative workspace owner identity could not be resolved.'
      );
    }

    /* ========================================================
       22. DURABLE REGISTRATION COMPLETION

       At this point the authoritative user, tenant, membership,
       subscription, app reservations and final provisioning state
       all exist. Mark the encrypted draft as consumed BEFORE
       sending any external email. A lost HTTP response will then
       replay the same workspace instead of creating another one.
       ======================================================== */

    await completeRegistrationRequest(
      activeRegistrationNonceHash,
      context
    );

    registrationRequestClaimed =
      false;

    /* ========================================================
       23. CONSUME GOOGLE SIGNUP STATE

       Google registration idempotency is keyed by the OAuth
       signup-state hash, so two browser drafts from the same
       Google authorization cannot create two workspaces. Once
       registration is durable, remove the temporary OAuth state.
       ======================================================== */

    if (
      googleSignup
    ) {
      try {
        await consumeGoogleSignupState(
          googleSignup.state_hash
        );
      } catch (error) {
        console.error(
          '[SaMi] Google signup state cleanup failed after durable registration:',
          error
        );
      }
    }

    /* ========================================================
       24. EXISTING ACCOUNT WORKSPACE SWITCH

       Workspace creation must not be rolled back merely because
       the current browser session could not switch context.
       The workspace remains accessible through the global
       workspace switcher.
       ======================================================== */

    if (
      existingAccountRegistration &&
      provisioningSucceeded &&
      session
    ) {
      try {
        const switched =
          await setCurrentTenantForSession(
            session.sessionId,
            session.user.id,
            context.tenantId
          );

        if (
          !switched
        ) {
          console.error(
            '[SaMi] Workspace created but current session did not switch to the new workspace.'
          );
        }
      } catch (error) {
        console.error(
          '[SaMi] Workspace created but session switching failed:',
          error
        );
      }
    }

    /* ========================================================
       25. EMAIL VERIFICATION

       External delivery happens only after durable registration.
       Email/password users receive a verification code; delivery
       failure never deletes the workspace/account.
       ======================================================== */

    if (
      draft.mode ===
        'email' &&
      context.userCreated
    ) {
      verificationEmailSent =
        await createVerification({
          email:
            authoritativeEmail,
          firstName:
            authoritativeFirstName,
        });
    }

    /* ========================================================
       26. SUBSCRIPTION / PLAN CONFIRMATION EMAIL

       The recipient and workspace label come from the exact
       Control DB owner/workspace join, never browser state.
       Delivery failure never rolls back registration.
       ======================================================== */

    try {
      await sendSubscriptionConfirmationEmail({
        email:
          authoritativeEmail,

        firstName:
          authoritativeFirstName,

        businessName:
          authoritativeBusinessName,

        plan:
          finalPlan as SaMiRegistrationPlan,

        pricePerUserMonthly:
          perUserMonthlyPrice,

        billableUsers,

        amountDueToday:
          0,

        currency:
          SAMI_BILLING_CURRENCY,

        firstBillingAt:
          isPaidPlan
            ? trialEndsAt
            : null,

        workspaceReady:
          provisioningSucceeded,
      });
    } catch (error) {
      console.error(
        '[SaMi] Subscription confirmation email failed:',
        error
      );
    }

    /* ========================================================
       27. RESPONSE
       ======================================================== */

    const response =
      jsonResponse(
        {
          success: true,

          code:
            provisioningSucceeded
              ? 'REGISTRATION_SUCCESS'
              : 'REGISTRATION_PROVISIONING_FAILED',

          /*
           * There is no payment during signup.
           *
           * Existing UI can use this field to avoid redirecting
           * to PesaPal.
           */
          requiresPayment:
            false,

          paymentRequiredNow:
            false,

          billingSetupRequired:
            false,

          billingSetupRequiredNow:
            false,

          billingSetupRequiredAtTrialEnd:
            isPaidPlan,

          firstMonthFree:
            isPaidPlan,

          amountDueToday:
            0,

          user: {
            id:
              context.userId,

            email:
              authoritativeEmail,

            emailVerified:
              Boolean(
                subscription
                  .owner_email_verified ||
                subscription
                  .owner_email_verified_at
              ),

            authProvider:
              existingAccountRegistration
                ? 'existing'
                : googleRegistration
                  ? 'google'
                  : 'email',
          },

          tenant: {
            id:
              context.tenantId,

            name:
              authoritativeBusinessName,

            slug,

            status:
              provisioningSucceeded
                ? 'active'
                : 'provisioning_failed',
          },

          subscription: {
            id:
              context.subscriptionId,

            plan:
              finalPlan,

            planName:
              subscription.plan_name,

            status:
              subscription.status,

            billingCycle:
              isPaidPlan
                ? 'monthly'
                : null,

            firstMonthFree:
              isPaidPlan,

            trialMonths:
              isPaidPlan
                ? PAID_TRIAL_MONTHS
                : 0,

            startedAt:
              toIsoString(
                subscription
                  .started_at
              ),

            trialEndsAt,

            currentPeriodStart,

            currentPeriodEnd,

            /*
             * This is when the first paid billing cycle becomes
             * due.
             *
             * It is NOT a provider payment created today.
             */
            firstBillingAt:
              isPaidPlan
                ? trialEndsAt
                : null,

            amountDueToday:
              0,

            perUserMonthlyPrice,

            billableUsers,

            monthlyAmount,

            currency:
              SAMI_BILLING_CURRENCY,

            paymentMethodOnFile:
              false,

            recurringBillingEnrolled:
              false,
          },

          selectedApps,

          verification: {
            required:
              draft.mode ===
                'email' &&
              context.userCreated,

            email:
              authoritativeEmail,

            expiresInMinutes:
              draft.mode ===
                  'email' &&
                context.userCreated
                ? VERIFICATION_EXPIRY_MINUTES
                : null,

            emailSent:
              draft.mode ===
                  'email' &&
                context.userCreated
                ? verificationEmailSent
                : false,
          },

          next:
            existingAccountRegistration
              ? (
                  provisioningSucceeded
                    ? '/dashboard'
                    : '/workspaces/new?workspace=preparing'
                )
              : googleRegistration
                ? (
                    provisioningSucceeded
                      ? '/login?google=registered'
                      : '/login?workspace=preparing'
                  )
                : `/verify-email?email=${encodeURIComponent(
                    authoritativeEmail
                  )}`,

          message:
            isPaidPlan
              ? (
                  provisioningSucceeded
                    ? `Your SaMi workspace is ready. Your first month is free and KES 0 is due today. Billing begins after the free month at KES ${monthlyAmount.toLocaleString()} per month for ${billableUsers} user${billableUsers === 1 ? '' : 's'}.`
                    : 'Your account has been created and your first month remains free, but your workspace could not be fully prepared.'
                )
              : (
                  provisioningSucceeded
                    ? 'Your SaMi workspace has been created successfully.'
                    : 'Your account has been created, but your workspace could not be fully prepared.'
                ),
        },
        201
      );

    response.cookies.set(
      REGISTRATION_DRAFT_COOKIE_NAME,
      '',
      clearRegistrationDraftCookieOptions()
    );

    if (
      googleRegistration
    ) {
      clearGoogleSignupCookie(
        response
      );
    }

    return response;
  } catch (error) {
    console.error(
      '[SaMi] Registration failed:',
      error
    );

    const cleanupSucceeded =
      await cleanupRegistration(
        context
      );

    if (
      registrationRequestNonceHash &&
      registrationRequestClaimed
    ) {
      try {
        await failRegistrationRequest(
          registrationRequestNonceHash,
          cleanupSucceeded
        );
      } catch (
        idempotencyError
      ) {
        console.error(
          '[SaMi] Registration idempotency failure-state update failed:',
          idempotencyError
        );
      }
    }

    return errorResponse(
      cleanupSucceeded
        ? 500
        : 409,
      cleanupSucceeded
        ? 'REGISTRATION_ERROR'
        : 'REGISTRATION_RECOVERY_REQUIRED',
      cleanupSucceeded
        ? 'Registration could not be completed. The partial setup was cleaned up safely, so you can try again.'
        : 'Registration stopped after a partial setup and SaMi could not prove cleanup was complete. Automatic retry is blocked to prevent a duplicate workspace.'
    );
  }
}