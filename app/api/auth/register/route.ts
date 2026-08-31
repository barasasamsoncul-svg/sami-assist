
import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { provisionTenant } from '@/lib/services/tenant-provisioning';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/services/email';
import { createPesaPalOrder } from '@/lib/services/pesapal';

export const runtime = 'nodejs';

const VERIFICATION_EXPIRY_MINUTES = 15;
const TRIAL_DAYS = 15;
const BCRYPT_ROUNDS = 12;

const ALLOWED_PLANS = new Set([
  'free',
  'standard',
  'custom',
]);

/**
 * Normalize email addresses consistently.
 */
function normalizeEmail(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : '';
}

/**
 * Normalize names.
 */
function normalizeName(value: unknown): string {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

/**
 * Normalize phone number.
 */
function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const phone = value.trim();

  return phone.length > 0 ? phone : null;
}

/**
 * Create a URL-safe workspace slug.
 */
function createSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Generate cryptographically secure 6-digit code.
 */
function generateVerificationCode(): string {
  return crypto
    .randomInt(100000, 1000000)
    .toString();
}

/**
 * Hash verification code before storing it.
 */
function hashVerificationCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(code)
    .digest('hex');
}

/**
 * Validate email format.
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate password length.
 *
 * Authentication policy can be strengthened later with
 * breached-password checking and password history.
 */
function isValidPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    password.length <= 128
  );
}

/**
 * Validate tenant ID format before using it in follow-up
 * operations.
 */
function isValidTenantId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 128
  );
}

export async function POST(
  request: NextRequest
) {
  try {
    /*
     * ============================================================
     * 1. PARSE REQUEST
     * ============================================================
     */

    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body.',
        },
        { status: 400 }
      );
    }

    const firstName =
      normalizeName(body.firstName);

    const lastName =
      normalizeName(body.lastName);

    const email =
      normalizeEmail(body.email);

    const phone =
      normalizePhone(body.phone);

    const password =
      typeof body.password === 'string'
        ? body.password
        : '';

    const businessName =
      normalizeName(body.businessName);

    const requestedPlan =
      typeof body.plan === 'string'
        ? body.plan.trim().toLowerCase()
        : 'free';

    const rawSelectedApps =
      body.selectedApps;

    /*
     * ============================================================
     * 2. BASIC VALIDATION
     * ============================================================
     */

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
      businessName.length > 120
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

    /*
     * ============================================================
     * 3. VALIDATE SELECTED APPS
     * ============================================================
     */

    if (!Array.isArray(rawSelectedApps)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Please select at least one SaMi app.',
        },
        { status: 400 }
      );
    }

    const selectedApps = [
      ...new Set(
        rawSelectedApps
          .filter(
            (app): app is string =>
              typeof app === 'string'
          )
          .map((app) =>
            app.trim().toLowerCase()
          )
          .filter(Boolean)
      ),
    ];

    if (selectedApps.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Please select at least one SaMi app.',
        },
        { status: 400 }
      );
    }

    if (selectedApps.length > 50) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Too many apps selected.',
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * 4. VALIDATE PLAN
     * ============================================================
     */

    if (!ALLOWED_PLANS.has(requestedPlan)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Invalid subscription plan.',
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * 5. CHECK EXISTING USER
     * ============================================================
     */

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
        [email]
      );

    if (existingUser.rows.length > 0) {
      const existing =
        existingUser.rows[0];

      /*
       * Never automatically destroy soft-deleted accounts.
       */
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

      /*
       * Existing but unverified account.
       */
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

    /*
     * ============================================================
     * 6. VALIDATE APPS AGAINST CONTROL DATABASE
     * ============================================================
     */

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
          WHERE key = ANY($1::text[])
            AND deleted_at IS NULL
        `,
        [selectedApps]
      );

    const validApps =
      moduleResult.rows.map(
        (row) => String(row.key)
      );

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
          error:
            'One or more selected SaMi apps are unavailable.',
          invalidApps,
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * 7. DETERMINE PLAN
     * ============================================================
     *
     * Current SaMi business rule:
     *
     * One app:
     *   free / standard / custom
     *
     * Multiple apps:
     *   standard
     */

    const requiresPayment =
      selectedApps.length > 1;

    const finalPlan =
      requiresPayment
        ? 'standard'
        : requestedPlan;

    /*
     * ============================================================
     * 8. HASH PASSWORD
     * ============================================================
     */

    const passwordHash =
      await bcrypt.hash(
        password,
        BCRYPT_ROUNDS
      );

    /*
     * ============================================================
     * 9. CREATE UNIQUE TENANT SLUG
     * ============================================================
     */

    const baseSlug =
      createSlug(businessName) ||
      `workspace-${crypto.randomBytes(4).toString('hex')}`;

    let slug = baseSlug;

    for (
      let counter = 1;
      counter <= 100;
      counter++
    ) {
      const existingTenant =
        await queryControl(
          `
            SELECT id
            FROM tenants
            WHERE slug = $1
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [slug]
        );

      if (
        existingTenant.rows.length === 0
      ) {
        break;
      }

      slug =
        `${baseSlug}-${counter}`;

      if (counter === 100) {
        slug =
          `${baseSlug}-${crypto
            .randomBytes(4)
            .toString('hex')}`;
      }
    }

    /*
     * ============================================================
     * 10. CREATE VERIFICATION CODE
     * ============================================================
     */

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

    /*
     * ============================================================
     * 11. CREATE ACCOUNT RECORDS
     * ============================================================
     */

    let userId: string | null = null;
    let tenantId: string | null = null;
    let subscriptionId: string | null = null;

    try {
      /*
       * ----------------------------------------------------------
       * USER
       * ----------------------------------------------------------
       */

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
            'pending_verification',
          ]
        );

      userId =
        userResult.rows[0].id;

      /*
       * ----------------------------------------------------------
       * TENANT
       * ----------------------------------------------------------
       */

      const tenantStatus =
        requiresPayment
          ? 'pending_payment'
          : 'pending_verification';

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

      tenantId =
        tenantResult.rows[0].id;

      function isValidTenantId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0
  );
}

      /*
       * ----------------------------------------------------------
       * OWNER MEMBERSHIP
       * ----------------------------------------------------------
       */

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
            $3,
            $4,
            NOW()
          )
        `,
        [
          tenantId,
          userId,
          'pending_verification',
          true,
        ]
      );

      /*
       * ----------------------------------------------------------
       * ADMIN ROLE
       * ----------------------------------------------------------
       */

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
          tenantId,
          userId,
          roleResult.rows[0].id,
        ]
      );

      /*
       * ----------------------------------------------------------
       * PLAN
       * ----------------------------------------------------------
       */

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
        planResult.rows[0];

      /*
       * ----------------------------------------------------------
       * SUBSCRIPTION
       * ----------------------------------------------------------
       */

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
            tenantId,
            plan.id,
            subscriptionStatus,
            trialEndsAt,
          ]
        );

      subscriptionId =
        subscriptionResult.rows[0].id;

      /*
       * ----------------------------------------------------------
       * RESERVE SELECTED APPS
       * ----------------------------------------------------------
       *
       * Apps stay pending until:
       *
       * verification
       * +
       * payment where required
       * +
       * provisioning
       */

      for (
        const row of moduleResult.rows
      ) {
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
            tenantId,
            row.id,
            row.version || null,
          ]
        );
      }

      /*
       * ----------------------------------------------------------
       * REMOVE OLD VERIFICATION CODES
       * ----------------------------------------------------------
       */

      await queryControl(
        `
          DELETE FROM email_verifications
          WHERE email = $1
        `,
        [email]
      );

      /*
       * ----------------------------------------------------------
       * STORE NEW VERIFICATION CODE
       * ----------------------------------------------------------
       */

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

      /*
       * ==========================================================
       * 12. SEND VERIFICATION EMAIL
       * ==========================================================
       */

      try {
        await sendVerificationEmail(
          email,
          verificationCode,
          firstName
        );
      } catch (emailError) {
        console.error(
          'Verification email failed:',
          emailError
        );

        /*
         * Best-effort cleanup.
         */

        if (tenantId) {
          try {
            await queryControl(
              `
                DELETE FROM tenants
                WHERE id = $1
              `,
              [tenantId]
            );
          } catch (cleanupError) {
            console.error(
              'Tenant cleanup failed:',
              cleanupError
            );
          }
        }

        if (userId) {
          try {
            await queryControl(
              `
                DELETE FROM users
                WHERE id = $1
              `,
              [userId]
            );
          } catch (cleanupError) {
            console.error(
              'User cleanup failed:',
              cleanupError
            );
          }
        }

        return NextResponse.json(
          {
            success: false,
            code:
              'VERIFICATION_EMAIL_FAILED',
            error:
              'We could not send your verification email. Please try again.',
          },
          { status: 503 }
        );
      }

      /*
       * ==========================================================
       * 13. PAYMENT REQUIRED
       * ==========================================================
       */

      if (requiresPayment) {
        const standardPrice =
          Number(
            process.env
              .PESAPAL_PRICE_STANDARD_MONTHLY ||
              2000
          );

        const customPrice =
          Number(
            process.env
              .PESAPAL_PRICE_CUSTOM_MONTHLY ||
              3340
          );

        const amount =
          finalPlan === 'standard'
            ? standardPrice
            : customPrice;

        if (!tenantId) {
          throw new Error(
            'Tenant was not created.'
          );
        }

        if (!subscriptionId) {
          throw new Error(
            'Subscription was not created.'
          );
        }

        const pesapalOrder =
          await createPesaPalOrder({
            tenantId,
            subscriptionId,
            amount,
            email,
            firstName,
            lastName,
            businessName,
            plan: finalPlan,
            selectedApps,
            origin: request.nextUrl.origin, 
          });

        return NextResponse.json(
          {
            success: true,
            requiresPayment: true,
            verificationRequired: true,

            user: {
              id: userId,
              email,
              emailVerified: false,
            },

            tenant: {
              id: tenantId,
              name: businessName,
              slug,
              status: 'pending_payment',
            },

            subscription: {
              id: subscriptionId,
              plan: finalPlan,
              status: 'pending_payment',
            },

            selectedApps,

            pesapalOrder,

            message:
              'Account created. Please verify your email and complete payment to activate your workspace.',
          },
          { status: 201 }
        );
      }

      /*
       * ==========================================================
       * 14. FREE / TRIAL RESPONSE
       * ==========================================================
       */

      return NextResponse.json(
        {
          success: true,
          requiresPayment: false,
          verificationRequired: true,

          user: {
            id: userId,
            email,
            emailVerified: false,
          },

          tenant: {
            id: tenantId,
            name: businessName,
            slug,
            status:
              'pending_verification',
          },

          subscription: {
            id: subscriptionId,
            plan: finalPlan,
            status: 'pending',
            trialDays: TRIAL_DAYS,
          },

          selectedApps,

          message:
            'Account created. We sent a verification code to your email. Please verify your email to continue.',
        },
        { status: 201 }
      );

    } catch (error) {
      /*
       * ==========================================================
       * REGISTRATION DATABASE ERROR
       * ==========================================================
       */

      console.error(
        'Registration database error:',
        error
      );

      /*
       * Best-effort cleanup.
       *
       * We only delete records created during this registration.
       */

      if (tenantId) {
        try {
          await queryControl(
            `
              DELETE FROM tenants
              WHERE id = $1
            `,
            [tenantId]
          );
        } catch (cleanupError) {
          console.error(
            'Tenant cleanup failed:',
            cleanupError
          );
        }
      }

      if (userId) {
        try {
          await queryControl(
            `
              DELETE FROM users
              WHERE id = $1
          `,
            [userId]
          );
        } catch (cleanupError) {
          console.error(
            'User cleanup failed:',
            cleanupError
          );
        }
      }

      return NextResponse.json(
        {
          success: false,
          error:
            'Registration could not be completed. Please try again.',
        },
        { status: 500 }
      );
    }

  } catch (error) {
    /*
     * ============================================================
     * UNEXPECTED ERROR
     * ============================================================
     */

    console.error(
      'Unexpected registration error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          'Registration failed. Please try again.',
      },
      { status: 500 }
    );
  }
}