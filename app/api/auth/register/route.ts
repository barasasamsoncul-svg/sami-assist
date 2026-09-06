import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import { queryControl } from '@/lib/db/control';
import { sendVerificationEmail } from '@/lib/services/email';
import { provisionTenant } from '@/lib/services/tenant-provisioning';
import { createPesaPalOrder } from '@/lib/services/pesapal';

export const runtime = 'nodejs';

/**
 * SaMi Registration API
 *
 * Flow
 * ----
 *
 * Email registration
 *
 *   Register
 *      ↓
 *   Select Apps
 *      ↓
 *   Select Plan
 *      ↓
 *   POST /api/auth/register
 *      ↓
 *   Validate account + apps + plan
 *      ↓
 *   Create user
 *      ↓
 *   Create tenant
 *      ↓
 *   Create owner membership
 *      ↓
 *   Assign admin role
 *      ↓
 *   Create subscription
 *      ↓
 *   Reserve selected modules
 *      ↓
 *   ┌─────────────────────────────┐
 *   │                             │
 *   │ FREE                        │ PAID
 *   │                             │
 *   ▼                             ▼
 *   Provision tenant              Create PesaPal order
 *   Activate tenant               Keep tenant pending_payment
 *   Activate subscription         Keep subscription pending_payment
 *   Generate verification code    Return payment redirect
 *   Send verification email
 *   │
 *   ▼
 *   /auth/verify-email
 *
 * Important:
 *
 * The frontend is NOT trusted for subscription enforcement.
 *
 * Current MVP business rule:
 *
 *   1 selected app  → requested plan
 *   >1 selected app → standard plan + payment
 *
 * The backend enforces this independently of Select Plan.
 */

const VERIFICATION_EXPIRY_MINUTES = 15;
const TRIAL_DAYS = 15;
const BCRYPT_ROUNDS = 12;

const MAX_SELECTED_APPS = 50;
const MAX_NAME_LENGTH = 120;
const MAX_PHONE_LENGTH = 40;

const ALLOWED_PLANS = new Set([
  'free',
  'standard',
  'custom',
]);

type RegistrationBody = Record<string, unknown>;

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

/* -------------------------------------------------------------------------- */
/* Normalization                                                              */
/* -------------------------------------------------------------------------- */

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase();
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ');
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const phone = value.trim();

  if (!phone) {
    return null;
  }

  return phone.slice(0, MAX_PHONE_LENGTH);
}

function normalizePlan(value: unknown): string {
  if (typeof value !== 'string') {
    return 'free';
  }

  return value.trim().toLowerCase();
}

function normalizeSelectedApps(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .filter(
      (app): app is string =>
        typeof app === 'string'
    )
    .map((app) => app.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(normalized)];
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    password.length <= 128
  );
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

function createSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function generateVerificationCode(): string {
  return crypto
    .randomInt(100000, 1000000)
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

function requireDatabaseId(
  value: unknown,
  entityName: string
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new Error(
      `Invalid ${entityName} ID returned from database.`
    );
  }

  return value;
}

/* -------------------------------------------------------------------------- */
/* Tenant slug                                                                */
/* -------------------------------------------------------------------------- */

async function createUniqueTenantSlug(
  businessName: string
): Promise<string> {
  const baseSlug =
    createSlug(businessName) ||
    `workspace-${crypto
      .randomBytes(4)
      .toString('hex')}`;

  let slug = baseSlug;

  for (let counter = 1; counter <= 100; counter++) {
    const existingTenant = await queryControl(
      `
        SELECT id
        FROM tenants
        WHERE slug = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [slug]
    );

    if (existingTenant.rows.length === 0) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
  }

  return `${baseSlug}-${crypto
    .randomBytes(4)
    .toString('hex')}`;
}

/* -------------------------------------------------------------------------- */
/* Cleanup                                                                    */
/* -------------------------------------------------------------------------- */

async function cleanupRegistration(
  context: RegistrationContext
): Promise<void> {
  /**
   * Delete the tenant first because tenant-related rows normally
   * reference it.
   *
   * We explicitly clean dependent records instead of assuming
   * every Control DB foreign key uses ON DELETE CASCADE.
   */

  if (context.subscriptionId) {
    try {
      await queryControl(
        `
          DELETE FROM subscriptions
          WHERE id = $1
        `,
        [context.subscriptionId]
      );
    } catch (error) {
      console.error(
        '[SaMi] Subscription cleanup failed:',
        error
      );
    }
  }

  if (context.tenantId) {
    try {
      await queryControl(
        `
          DELETE FROM tenant_modules
          WHERE tenant_id = $1
        `,
        [context.tenantId]
      );
    } catch (error) {
      console.error(
        '[SaMi] Tenant module cleanup failed:',
        error
      );
    }

    try {
      await queryControl(
        `
          DELETE FROM user_roles
          WHERE tenant_id = $1
        `,
        [context.tenantId]
      );
    } catch (error) {
      console.error(
        '[SaMi] User role cleanup failed:',
        error
      );
    }

    try {
      await queryControl(
        `
          DELETE FROM tenant_users
          WHERE tenant_id = $1
        `,
        [context.tenantId]
      );
    } catch (error) {
      console.error(
        '[SaMi] Tenant membership cleanup failed:',
        error
      );
    }

    try {
      await queryControl(
        `
          DELETE FROM tenants
          WHERE id = $1
        `,
        [context.tenantId]
      );
    } catch (error) {
      console.error(
        '[SaMi] Tenant cleanup failed:',
        error
      );
    }
  }

  if (context.userId) {
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
        [context.userId]
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
        [context.userId]
      );
    } catch (error) {
      console.error(
        '[SaMi] User cleanup failed:',
        error
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* POST                                                                       */
/* -------------------------------------------------------------------------- */

export async function POST(
  request: NextRequest
) {
  const context: RegistrationContext = {
    userId: null,
    tenantId: null,
    subscriptionId: null,
  };

  try {
    /* ---------------------------------------------------------------------- */
    /* Parse request                                                          */
    /* ---------------------------------------------------------------------- */

    let body: RegistrationBody;

    try {
      const parsed = await request.json();

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid request body.',
          },
          { status: 400 }
        );
      }

      body = parsed as RegistrationBody;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body.',
        },
        { status: 400 }
      );
    }

    /* ---------------------------------------------------------------------- */
    /* Extract fields                                                         */
    /* ---------------------------------------------------------------------- */

    const firstName = normalizeName(
      body.firstName
    );

    const lastName = normalizeName(
      body.lastName
    );

    const email = normalizeEmail(
      body.email
    );

    const phone = normalizePhone(
      body.phone
    );

    const password =
      typeof body.password === 'string'
        ? body.password
        : '';

    const businessName = normalizeName(
      body.businessName
    );

    const requestedPlan = normalizePlan(
      body.plan
    );

    const selectedApps =
      normalizeSelectedApps(
        body.selectedApps
      );

    /* ---------------------------------------------------------------------- */
    /* Basic validation                                                       */
    /* ---------------------------------------------------------------------- */

    if (
      !firstName ||
      !lastName ||
      !email ||
      !password ||
      !businessName
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'First name, last name, email, password and business name are required.',
        },
        { status: 400 }
      );
    }

    if (
      firstName.length > MAX_NAME_LENGTH ||
      lastName.length > MAX_NAME_LENGTH
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Name fields are too long.',
        },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Please enter a valid email address.',
        },
        { status: 400 }
      );
    }

    if (!isValidPassword(password)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Password must be between 8 and 128 characters.',
        },
        { status: 400 }
      );
    }

    if (
      businessName.length < 2 ||
      businessName.length > MAX_NAME_LENGTH
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Business name must be between 2 and 120 characters.',
        },
        { status: 400 }
      );
    }

    if (
      selectedApps === null ||
      selectedApps.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Please select at least one SaMi app.',
        },
        { status: 400 }
      );
    }

    if (
      selectedApps.length >
      MAX_SELECTED_APPS
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Too many apps selected.',
        },
        { status: 400 }
      );
    }

    if (
      !ALLOWED_PLANS.has(requestedPlan)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Invalid subscription plan.',
        },
        { status: 400 }
      );
    }

    /* ---------------------------------------------------------------------- */
    /* Existing user check                                                    */
    /* ---------------------------------------------------------------------- */

    const existingUser = await queryControl(
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
      [email]
    );

    if (existingUser.rows.length > 0) {
      const existing =
        existingUser.rows[0];

      if (existing.deleted_at) {
        return NextResponse.json(
          {
            success: false,
            code:
              'ACCOUNT_PREVIOUSLY_DELETED',
            error:
              'An account previously associated with this email exists. Please contact SaMi support.',
          },
          { status: 409 }
        );
      }

      if (
        !existing.email_verified_at &&
        (
          existing.status ===
            'pending_verification' ||
          existing.status === 'pending'
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            code:
              'EMAIL_VERIFICATION_REQUIRED',
            error:
              'An account with this email already exists and is awaiting email verification.',
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          code:
            'EMAIL_ALREADY_REGISTERED',
          error:
            'An account with this email already exists.',
        },
        { status: 409 }
      );
    }

    /* ---------------------------------------------------------------------- */
    /* Validate modules against Control DB                                    */
    /* ---------------------------------------------------------------------- */

    const moduleResult = await queryControl(
      `
        SELECT
          id,
          key,
          name,
          version,
          status
        FROM modules
        WHERE key = ANY($1::text[])
          AND deleted_at IS NULL
      `,
      [selectedApps]
    );

    const moduleRows =
      moduleResult.rows as ModuleRow[];

    const validApps = moduleRows
      .map((row) => String(row.key))
      .filter(Boolean);

    const validAppSet =
      new Set(validApps);

    const invalidApps =
      selectedApps.filter(
        (appKey) =>
          !validAppSet.has(appKey)
      );

    if (invalidApps.length > 0) {
      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_SELECTED_APPS',
          error:
            'One or more selected SaMi apps are unavailable.',
          invalidApps,
        },
        { status: 400 }
      );
    }

    /* ---------------------------------------------------------------------- */
    /* Determine final plan                                                   */
    /* ---------------------------------------------------------------------- */

    /**
     * Server-side business rule.
     *
     * One app:
     *   respect requested plan.
     *
     * Multiple apps:
     *   Standard is required.
     *
     * This prevents a modified frontend request from bypassing
     * the current pricing/application rule.
     */

    const requiresPayment =
      selectedApps.length > 1;

    const finalPlan = requiresPayment
      ? 'standard'
      : requestedPlan;

    /* ---------------------------------------------------------------------- */
    /* Password hash                                                          */
    /* ---------------------------------------------------------------------- */

    const passwordHash =
      await bcrypt.hash(
        password,
        BCRYPT_ROUNDS
      );

    /* ---------------------------------------------------------------------- */
    /* Unique tenant slug                                                     */
    /* ---------------------------------------------------------------------- */

    const slug =
      await createUniqueTenantSlug(
        businessName
      );

    /* ---------------------------------------------------------------------- */
    /* CREATE USER                                                             */
    /* ---------------------------------------------------------------------- */

    const userResult = await queryControl(
      `
        INSERT INTO users (
          email,
          password_hash,
          first_name,
          last_name,
          full_name,
          phone,
          status,
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
          'pending_verification',
          NULL,
          NOW(),
          NOW()
        )
        RETURNING id, email
      `,
      [
        email,
        passwordHash,
        firstName,
        lastName,
        `${firstName} ${lastName}`,
        phone,
      ]
    );

    if (
      userResult.rows.length === 0
    ) {
      throw new Error(
        'User was not created by the database.'
      );
    }

    context.userId =
      requireDatabaseId(
        userResult.rows[0].id,
        'user'
      );

    /* ---------------------------------------------------------------------- */
    /* CREATE TENANT                                                           */
    /* ---------------------------------------------------------------------- */

    const tenantStatus =
      requiresPayment
        ? 'pending_payment'
        : 'provisioning';

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
            $3,
            NOW(),
            NOW()
          )
          RETURNING id
        `,
        [
          businessName,
          slug,
          tenantStatus,
        ]
      );

    if (
      tenantResult.rows.length === 0
    ) {
      throw new Error(
        'Tenant was not created by the database.'
      );
    }

    context.tenantId =
      requireDatabaseId(
        tenantResult.rows[0].id,
        'tenant'
      );

    /* ---------------------------------------------------------------------- */
    /* OWNER MEMBERSHIP                                                       */
    /* ---------------------------------------------------------------------- */

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
          true,
          NOW()
        )
      `,
      [
        context.tenantId,
        context.userId,
      ]
    );

    /* ---------------------------------------------------------------------- */
    /* ADMIN ROLE                                                             */
    /* ---------------------------------------------------------------------- */

    const roleResult =
      await queryControl(
        `
          SELECT id
          FROM roles
          WHERE name = 'admin'
            AND is_system = true
          LIMIT 1
        `
      );

    if (
      roleResult.rows.length === 0
    ) {
      throw new Error(
        'System administrator role is not configured.'
      );
    }

    const roleId =
      requireDatabaseId(
        roleResult.rows[0].id,
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

    /* ---------------------------------------------------------------------- */
    /* LOAD PLAN                                                               */
    /* ---------------------------------------------------------------------- */

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
        [finalPlan]
      );

    if (
      planResult.rows.length === 0
    ) {
      throw new Error(
        `Subscription plan "${finalPlan}" is not configured.`
      );
    }

    const plan =
      planResult.rows[0] as PlanRow;

    const planId =
      requireDatabaseId(
        plan.id,
        'subscription plan'
      );

    /* ---------------------------------------------------------------------- */
    /* CREATE SUBSCRIPTION                                                    */
    /* ---------------------------------------------------------------------- */

    const subscriptionStatus =
      requiresPayment
        ? 'pending_payment'
        : 'pending';

    const trialEndsAt =
      requiresPayment
        ? null
        : new Date(
            Date.now() +
              TRIAL_DAYS *
                24 *
                60 *
                60 *
                1000
          );

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
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            NOW(),
            $4,
            NOW(),
            NOW(),
            NOW()
          )
          RETURNING id
        `,
        [
          context.tenantId,
          planId,
          subscriptionStatus,
          trialEndsAt,
        ]
      );

    if (
      subscriptionResult.rows.length ===
      0
    ) {
      throw new Error(
        'Subscription was not created by the database.'
      );
    }

    context.subscriptionId =
      requireDatabaseId(
        subscriptionResult.rows[0].id,
        'subscription'
      );

    /* ---------------------------------------------------------------------- */
    /* RESERVE SELECTED MODULES                                               */
    /* ---------------------------------------------------------------------- */

    for (const row of moduleRows) {
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

    /* ====================================================================== */
    /* FREE PLAN                                                              */
    /* ====================================================================== */

    if (!requiresPayment) {
      let provisioningSucceeded =
        false;

      try {
        await provisionTenant(
          context.tenantId,
          selectedApps
        );

        provisioningSucceeded = true;

        console.log(
          `[SaMi] Tenant ${context.tenantId} provisioned successfully.`
        );
      } catch (provisionError) {
        /**
         * Important:
         *
         * Do NOT pretend the tenant is active when provisioning
         * failed.
         *
         * The account can still exist so that an administrator or
         * recovery worker can provision it later.
         */

        console.error(
          '[SaMi] Tenant provisioning failed:',
          provisionError
        );

        await queryControl(
          `
            UPDATE tenants
            SET
              status = 'provisioning_failed',
              updated_at = NOW()
            WHERE id = $1
          `,
          [context.tenantId]
        );
      }

      if (provisioningSucceeded) {
        await queryControl(
          `
            UPDATE tenants
            SET
              status = 'active',
              updated_at = NOW()
            WHERE id = $1
          `,
          [context.tenantId]
        );

        await queryControl(
          `
            UPDATE tenant_modules
            SET
              status = 'installed',
              installed_at = NOW()
            WHERE tenant_id = $1
              AND status = 'pending'
          `,
          [context.tenantId]
        );

        if (context.subscriptionId) {
          await queryControl(
            `
              UPDATE subscriptions
              SET
                status = 'active',
                updated_at = NOW()
              WHERE id = $1
                AND status = 'pending'
            `,
            [context.subscriptionId]
          );
        }
      }

      /* -------------------------------------------------------------------- */
      /* Generate email verification code                                     */
      /* -------------------------------------------------------------------- */

      const verificationCode =
        generateVerificationCode();

      const verificationHash =
        hashVerificationCode(
          verificationCode
        );

      const verificationExpiresAt =
        new Date(
          Date.now() +
            VERIFICATION_EXPIRY_MINUTES *
              60 *
              1000
        );

      /* -------------------------------------------------------------------- */
      /* Remove previous verification codes                                   */
      /* -------------------------------------------------------------------- */

      await queryControl(
        `
          DELETE FROM email_verifications
          WHERE email = $1
        `,
        [email]
      );

      /* -------------------------------------------------------------------- */
      /* Store verification code                                              */
      /* -------------------------------------------------------------------- */

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
          verificationHash,
          verificationExpiresAt,
        ]
      );

      /* -------------------------------------------------------------------- */
      /* Send verification email                                              */
      /* -------------------------------------------------------------------- */

      let verificationEmailSent =
        false;

      try {
        await sendVerificationEmail(
          email,
          verificationCode,
          firstName
        );

        verificationEmailSent = true;

        console.log(
          `[SaMi] Verification email sent to ${email}.`
        );
      } catch (emailError) {
        console.error(
          '[SaMi] Failed to send verification email:',
          emailError
        );
      }

      /* -------------------------------------------------------------------- */
      /* FREE RESPONSE                                                        */
      /* -------------------------------------------------------------------- */

      return NextResponse.json(
        {
          success: true,
          requiresPayment: false,

          user: {
            id: context.userId,
            email,
            emailVerified: false,
          },

          tenant: {
            id: context.tenantId,
            name: businessName,
            slug,
            status:
              provisioningSucceeded
                ? 'active'
                : 'provisioning_failed',
          },

          subscription: {
            id: context.subscriptionId,
            plan: finalPlan,
            status:
              provisioningSucceeded
                ? 'active'
                : 'pending',
            trialDays: TRIAL_DAYS,
          },

          selectedApps,

          verification: {
            required: true,
            email,
            expiresInMinutes:
              VERIFICATION_EXPIRY_MINUTES,
            emailSent:
              verificationEmailSent,
          },

          message:
            provisioningSucceeded
              ? 'Account created. We sent a verification code to your email. Please verify your email to login.'
              : 'Account created. Your workspace is being prepared. We sent a verification code to your email. Please verify your email to continue.',
        },
        { status: 201 }
      );
    }

    /* ====================================================================== */
    /* PAID PLAN                                                              */
    /* ====================================================================== */

    if (requiresPayment) {
      const standardPriceRaw =
        process.env
          .PESAPAL_PRICE_STANDARD_MONTHLY ||
        '2000';

      const customPriceRaw =
        process.env
          .PESAPAL_PRICE_CUSTOM_MONTHLY ||
        '3340';

      const standardPrice =
        Number.parseInt(
          standardPriceRaw,
          10
        );

      const customPrice =
        Number.parseInt(
          customPriceRaw,
          10
        );

      const amount =
        finalPlan === 'standard'
          ? standardPrice
          : customPrice;

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        throw new Error(
          'Invalid PesaPal subscription amount configured.'
        );
      }

      /**
       * At this point:
       *
       * tenantId       → validated
       * subscriptionId → validated
       */

      const pesapalOrder =
        await createPesaPalOrder({
          tenantId:
            context.tenantId,
          subscriptionId:
            context.subscriptionId,
          amount,
          email,
          firstName,
          lastName,
          businessName,
          plan: finalPlan,
          selectedApps,

          /**
           * Use the origin of the request.
           *
           * This prevents registration from depending on
           * NEXT_PUBLIC_APP_URL.
           */
          origin:
            request.nextUrl.origin,
        });

      return NextResponse.json(
        {
          success: true,
          requiresPayment: true,

          pesapalOrder,

          user: {
            id: context.userId,
            email,
            emailVerified: false,
          },

          tenant: {
            id: context.tenantId,
            name: businessName,
            slug,
            status: 'pending_payment',
          },

          subscription: {
            id: context.subscriptionId,
            plan: finalPlan,
            status: 'pending_payment',
            trialDays: 0,
          },

          selectedApps,

          verification: {
            required: true,
            email,
          },

          message:
            'Account created. Please complete payment to activate your workspace.',
        },
        { status: 201 }
      );
    }

    /* ====================================================================== */
    /* SAFETY FALLBACK                                                        */
    /* ====================================================================== */

    throw new Error(
      'Registration reached an invalid subscription state.'
    );
  } catch (error) {
    console.error(
      '[SaMi] Registration failed:',
      error
    );

    /* ---------------------------------------------------------------------- */
    /* Cleanup                                                                */
    /* ---------------------------------------------------------------------- */

    await cleanupRegistration(
      context
    );

    /* ---------------------------------------------------------------------- */
    /* Generic client response                                                */
    /* ---------------------------------------------------------------------- */

    return NextResponse.json(
      {
        success: false,
        error:
          'Registration could not be completed. Please try again.',
      },
      { status: 500 }
    );
  }
}