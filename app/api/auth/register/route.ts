import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import {
  queryControl,
} from '@/lib/db/control';

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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   SAMI REGISTRATION POLICY

   FREE
   ------------------------------------------------------------
   - KES 0
   - No PesaPal
   - No trial
   - Workspace provisioned immediately
   - Subscription becomes active after provisioning

   STANDARD / CUSTOM
   ------------------------------------------------------------
   - First calendar month free
   - KES 0 due today
   - NO PesaPal transaction during signup
   - Workspace provisioned immediately
   - Subscription starts as trialing immediately
   - Full paid-plan entitlements during trial
   - First payment becomes due after one calendar month
   - First successful PesaPal payment creates recurring
     enrollment
   - Later monthly payments can run automatically through
     PesaPal recurring billing
   ============================================================ */

const VERIFICATION_EXPIRY_MINUTES = 15;

const PAID_TRIAL_MONTHS = 1;

const BILLING_CURRENCY = 'KES';

const MAX_SELECTED_APPS = 50;

const MAX_NAME_LENGTH = 120;

const MAX_PHONE_LENGTH = 40;

const MAX_EMAIL_LENGTH = 254;

const MAX_PASSWORD_LENGTH = 128;

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
  included_apps?: unknown;
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

type SubscriptionResponseRow = {
  id: string;
  status: string;
  started_at: Date | string | null;
  trial_ends_at: Date | string | null;
  current_period_start: Date | string | null;
  current_period_end: Date | string | null;
  plan_key: string;
  plan_name: string;
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

function isValidPassword(
  password: string
): boolean {
  return (
    password.length >= 8 &&
    password.length <=
      MAX_PASSWORD_LENGTH
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

function isGoogleRegistration(
  body: RegistrationBody
): boolean {
  return (
    body.googleAuth ===
      true ||
    body.authProvider ===
      'google'
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
): Promise<void> {
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
        console.error(
          '[SaMi] Tenant cleanup failed:',
          error
        );
      }
    }
  }

  if (
    context.userId
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
      console.error(
        '[SaMi] User cleanup failed:',
        error
      );
    }
  }
}

/* ============================================================
   PLAN PRICE

   SaMi billing is per-user.
   ============================================================ */

function getPerUserMonthlyPrice(
  plan: string
): number {
  if (
    plan === 'standard'
  ) {
    return Number(
      process.env
        .PESAPAL_PRICE_STANDARD_MONTHLY ||
        2000
    );
  }

  if (
    plan === 'custom'
  ) {
    return Number(
      process.env
        .PESAPAL_PRICE_CUSTOM_MONTHLY ||
        3340
    );
  }

  return 0;
}

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
          AND status = 'active'
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
  subscriptionId: string
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
          p.name AS plan_name

        FROM subscriptions s

        INNER JOIN plans p
          ON p.id = s.plan_id

        WHERE s.id = $1
          AND s.deleted_at IS NULL
          AND p.deleted_at IS NULL

        LIMIT 1
      `,
      [
        subscriptionId,
      ]
    );

  return (
    result.rows[0] ||
    null
  );
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
    };

  try {
    /* ========================================================
       1. REQUEST
       ======================================================== */

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
       2. AUTH PROVIDER
       ======================================================== */

    const googleRegistration =
      isGoogleRegistration(
        body
      );

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
        !googleSignup
      ) {
        return errorResponse(
          400,
          'GOOGLE_SIGNUP_EXPIRED',
          'Your Google registration has expired. Please start again.'
        );
      }

      if (
        !googleSignup.google_subject
      ) {
        return errorResponse(
          400,
          'GOOGLE_SIGNUP_INVALID',
          'Google registration could not be verified.'
        );
      }
    }

    /* ========================================================
       3. ACCOUNT DATA
       ======================================================== */

    let firstName =
      normalizeName(
        body.firstName
      );

    let lastName =
      normalizeName(
        body.lastName
      );

    let email =
      normalizeEmail(
        body.email
      );

    const phone =
      normalizePhone(
        body.phone
      );

    const businessName =
      normalizeName(
        body.businessName
      );

    const password =
      typeof body.password ===
      'string'
        ? body.password
        : '';

    if (
      googleSignup
    ) {
      /*
       * Google identity values come from the authenticated
       * server-side OAuth state, never from sessionStorage.
       */
      email =
        normalizeEmail(
          googleSignup.email
        );

      firstName =
        normalizeName(
          googleSignup.first_name
        ) ||
        firstName;

      lastName =
        normalizeName(
          googleSignup.last_name
        ) ||
        lastName;
    }

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
        'REQUIRED_FIELDS_MISSING',
        'First name, last name, email and business name are required.'
      );
    }

    if (
      !googleRegistration &&
      !password
    ) {
      return errorResponse(
        400,
        'PASSWORD_REQUIRED',
        'Password is required.'
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
        'Please enter a valid email address.'
      );
    }

    if (
      !googleRegistration &&
      !isValidPassword(
        password
      )
    ) {
      return errorResponse(
        400,
        'PASSWORD_WEAK',
        'Password must be between 8 and 128 characters.'
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
       5. EXISTING USER
       ======================================================== */

    const existingUser =
      await queryControl(
        `
          SELECT
            id,
            email,
            status,
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

    if (
      existingUser.rows
        .length >
      0
    ) {
      const existing =
        existingUser.rows[0];

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
        (
          existing.status ===
            'pending_verification' ||
          existing.status ===
            'pending'
        )
      ) {
        return errorResponse(
          409,
          'EMAIL_VERIFICATION_REQUIRED',
          'An account with this email already exists and is awaiting email verification.'
        );
      }

      return errorResponse(
        409,
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists.'
      );
    }

    /* ========================================================
       6. VALIDATE APPS
       ======================================================== */

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
          selectedApps,
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
      selectedApps.filter(
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

       Free supports only one business app.

       Selecting multiple apps while Free is selected upgrades
       the workspace to Standard.

       Explicit Custom is never downgraded.
       ======================================================== */

    const finalPlan =
      requestedPlan ===
        'free' &&
      selectedApps.length >
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
            name,
            included_apps

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
       9. PLAN APP LIMIT
       ======================================================== */

    if (
      plan.included_apps !==
        null &&
      plan.included_apps !==
        undefined
    ) {
      const includedApps =
        Number(
          plan.included_apps
        );

      if (
        !Number.isFinite(
          includedApps
        )
      ) {
        throw new Error(
          `Plan "${finalPlan}" has invalid included_apps configuration.`
        );
      }

      /*
       * -1 = unlimited.
       */
      if (
        includedApps >= 0 &&
        selectedApps.length >
          includedApps
      ) {
        return errorResponse(
          400,
          'PLAN_APP_LIMIT_EXCEEDED',
          'The selected apps exceed this plan’s allowance.',
          {
            plan:
              finalPlan,

            includedApps,

            selectedApps:
              selectedApps.length,
          }
        );
      }
    }

    /* ========================================================
       10. PASSWORD HASH
       ======================================================== */

    const passwordSecret =
      googleRegistration
        ? crypto
            .randomBytes(64)
            .toString(
              'base64url'
            )
        : password;

    const passwordHash =
      await hashPassword(
        passwordSecret
      );

    /* ========================================================
       11. WORKSPACE SLUG
       ======================================================== */

    const slug =
      await createUniqueTenantSlug(
        businessName
      );

    /* ========================================================
       12. CREATE USER
       ======================================================== */

    const emailAlreadyVerified =
      googleRegistration;

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
       18. CONSUME GOOGLE SIGNUP STATE

       Core registration now exists.

       Consume the OAuth signup state before starting physical
       workspace provisioning so the state cannot be replayed.
       ======================================================== */

    if (
      googleSignup
    ) {
      await consumeGoogleSignupState(
        googleSignup.state_hash
      );
    }

    /* ========================================================
       19. PROVISION WORKSPACE IMMEDIATELY

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
       20. FINAL WORKSPACE / SUBSCRIPTION STATE
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

    /* ========================================================
       21. EMAIL VERIFICATION

       Google identity is already verified.

       Email/password registrations receive their verification
       code immediately.

       There is no PesaPal gate before verification anymore.
       ======================================================== */

    let verificationEmailSent =
      false;

    if (
      !googleRegistration
    ) {
      verificationEmailSent =
        await createVerification({
          email,
          firstName,
        });
    }

    /* ========================================================
       22. BILLABLE USERS / PRICE

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
      getPerUserMonthlyPrice(
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
        ? perUserMonthlyPrice *
          billableUsers
        : 0;

    /* ========================================================
       23. AUTHORITATIVE FINAL SUBSCRIPTION
       ======================================================== */

    const subscription =
      await getSubscriptionForResponse(
        context.subscriptionId
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

    /* ========================================================
       24. SUBSCRIPTION / PLAN CONFIRMATION EMAIL

       This is intentionally separate from email verification.

       EMAIL/PASSWORD:
       - verification email
       - subscription/plan confirmation email

       GOOGLE:
       - Google identity is already verified
       - subscription/plan confirmation email only

       IMPORTANT:
       Email delivery must never roll back an otherwise
       successful registration.
       ======================================================== */

    try {
      await sendSubscriptionConfirmationEmail({
        email,

        firstName,

        businessName,

        plan:
          finalPlan as SaMiRegistrationPlan,

        pricePerUserMonthly:
          perUserMonthlyPrice,

        billableUsers,

        amountDueToday:
          0,

        currency:
          BILLING_CURRENCY,

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
       25. RESPONSE
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

            email,

            emailVerified:
              googleRegistration,

            authProvider:
              googleRegistration
                ? 'google'
                : 'email',
          },

          tenant: {
            id:
              context.tenantId,

            name:
              businessName,

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
             * It is NOT a PesaPal payment created today.
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
              BILLING_CURRENCY,

            paymentMethodOnFile:
              false,

            recurringBillingEnrolled:
              false,
          },

          selectedApps,

          verification: {
            required:
              !googleRegistration,

            email,

            expiresInMinutes:
              googleRegistration
                ? null
                : VERIFICATION_EXPIRY_MINUTES,

            emailSent:
              googleRegistration
                ? false
                : verificationEmailSent,
          },

          next:
            googleRegistration
              ? (
                  provisioningSucceeded
                    ? '/login?google=registered'
                    : '/login?workspace=preparing'
                )
              : `/verify-email?email=${encodeURIComponent(
                  email
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

    await cleanupRegistration(
      context
    );

    return errorResponse(
      500,
      'REGISTRATION_ERROR',
      'Registration could not be completed. Please try again.'
    );
  }
}