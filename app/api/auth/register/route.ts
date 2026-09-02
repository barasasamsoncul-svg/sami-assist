import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/services/email';
import { provisionTenant } from '@/lib/services/tenant-provisioning';
import { createPesaPalOrder } from '@/lib/services/pesapal';

export const runtime = 'nodejs';

const VERIFICATION_EXPIRY_MINUTES = 15;
const TRIAL_DAYS = 15;
const BCRYPT_ROUNDS = 12;

const ALLOWED_PLANS = new Set(['free', 'standard', 'custom']);

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const phone = value.trim();

  return phone.length > 0 ? phone : null;
}

function createSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function generateVerificationCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashVerificationCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128;
}

/**
 * Safely extract a database ID.
 *
 * pg can infer returned columns as nullable depending on the query/type
 * definitions. We validate the value before using it anywhere that
 * requires a definite string.
 */
function requireDatabaseId(
  value: unknown,
  entityName: string
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `Invalid ${entityName} ID returned from database.`
    );
  }

  return value;
}

export async function POST(request: NextRequest) {
  try {
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

    const firstName = normalizeName(body.firstName);
    const lastName = normalizeName(body.lastName);
    const email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);
    const password =
      typeof body.password === 'string'
        ? body.password
        : '';

    const businessName = normalizeName(body.businessName);

    const requestedPlan =
      typeof body.plan === 'string'
        ? body.plan.trim().toLowerCase()
        : 'free';

    const rawSelectedApps = body.selectedApps;

    // ------------------------------------------------------------
    // BASIC VALIDATION
    // ------------------------------------------------------------

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
          error: 'Please enter a valid email address.',
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

    // ------------------------------------------------------------
    // SELECTED APPS
    // ------------------------------------------------------------

    if (!Array.isArray(rawSelectedApps)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please select at least one SaMi app.',
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
          .map((app) => app.trim().toLowerCase())
          .filter(Boolean)
      ),
    ];

    if (selectedApps.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please select at least one SaMi app.',
        },
        { status: 400 }
      );
    }

    if (selectedApps.length > 50) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many apps selected.',
        },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------
    // PLAN VALIDATION
    // ------------------------------------------------------------

    if (!ALLOWED_PLANS.has(requestedPlan)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid subscription plan.',
        },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------
    // CHECK EXISTING USER
    // ------------------------------------------------------------

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
      const existing = existingUser.rows[0];

      if (existing.deleted_at) {
        return NextResponse.json(
          {
            success: false,
            code: 'ACCOUNT_PREVIOUSLY_DELETED',
            error:
              'An account previously associated with this email exists. Please contact SaMi support.',
          },
          { status: 409 }
        );
      }

      if (
        !existing.email_verified_at &&
        (
          existing.status === 'pending_verification' ||
          existing.status === 'pending'
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            code: 'EMAIL_VERIFICATION_REQUIRED',
            error:
              'An account with this email already exists and is awaiting email verification.',
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          code: 'EMAIL_ALREADY_REGISTERED',
          error:
            'An account with this email already exists.',
        },
        { status: 409 }
      );
    }

    // ------------------------------------------------------------
    // VALIDATE SELECTED APPS AGAINST CONTROL DATABASE
    // ------------------------------------------------------------

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

    const validApps = moduleResult.rows.map(
      (row) => String(row.key)
    );

    const validAppSet = new Set(validApps);

    const invalidApps = selectedApps.filter(
      (appKey) => !validAppSet.has(appKey)
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

    // ------------------------------------------------------------
    // DETERMINE PLAN
    // ------------------------------------------------------------

    /*
     * Current business rule:
     *
     * One selected app  -> requested plan
     * Multiple apps     -> standard plan + payment
     */
    const requiresPayment = selectedApps.length > 1;

    const finalPlan = requiresPayment
      ? 'standard'
      : requestedPlan;

    // ------------------------------------------------------------
    // HASH PASSWORD
    // ------------------------------------------------------------

    const passwordHash = await bcrypt.hash(
      password,
      BCRYPT_ROUNDS
    );

    // ------------------------------------------------------------
    // CREATE UNIQUE TENANT SLUG
    // ------------------------------------------------------------

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
        break;
      }

      slug = `${baseSlug}-${counter}`;

      if (counter === 100) {
        slug =
          `${baseSlug}-${crypto
            .randomBytes(4)
            .toString('hex')}`;
      }
    }

    // These remain nullable only until their corresponding
    // database records are successfully created.
    let userId: string | null = null;
    let tenantId: string | null = null;
    let subscriptionId: string | null = null;

    try {
      // ----------------------------------------------------------
      // CREATE USER
      // ----------------------------------------------------------

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

      if (userResult.rows.length === 0) {
        throw new Error(
          'User was not created by the database.'
        );
      }

      userId = requireDatabaseId(
        userResult.rows[0].id,
        'user'
      );

      // ----------------------------------------------------------
      // CREATE TENANT
      // ----------------------------------------------------------

      const tenantStatus = requiresPayment
        ? 'pending_payment'
        : 'provisioning';

      const tenantResult = await queryControl(
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

      if (tenantResult.rows.length === 0) {
        throw new Error(
          'Tenant was not created by the database.'
        );
      }

      tenantId = requireDatabaseId(
        tenantResult.rows[0].id,
        'tenant'
      );

      // ----------------------------------------------------------
      // OWNER MEMBERSHIP
      // ----------------------------------------------------------

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
          tenantId,
          userId,
        ]
      );

      // ----------------------------------------------------------
      // ADMIN ROLE
      // ----------------------------------------------------------

      const roleResult = await queryControl(
        `
          SELECT id
          FROM roles
          WHERE name = 'admin'
            AND is_system = true
          LIMIT 1
        `
      );

      if (roleResult.rows.length === 0) {
        throw new Error(
          'System administrator role is not configured.'
        );
      }

      const roleId = requireDatabaseId(
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
          tenantId,
          userId,
          roleId,
        ]
      );

      // ----------------------------------------------------------
      // PLAN
      // ----------------------------------------------------------

      const planResult = await queryControl(
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

      if (planResult.rows.length === 0) {
        throw new Error(
          `Subscription plan "${finalPlan}" is not configured.`
        );
      }

      const plan = planResult.rows[0];

      const planId = requireDatabaseId(
        plan.id,
        'subscription plan'
      );

      // ----------------------------------------------------------
      // SUBSCRIPTION
      // ----------------------------------------------------------

      const subscriptionStatus = requiresPayment
        ? 'pending_payment'
        : 'pending';

      const trialEndsAt = requiresPayment
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
            planId,
            subscriptionStatus,
            trialEndsAt,
          ]
        );

      if (subscriptionResult.rows.length === 0) {
        throw new Error(
          'Subscription was not created by the database.'
        );
      }

      subscriptionId = requireDatabaseId(
        subscriptionResult.rows[0].id,
        'subscription'
      );

      // ----------------------------------------------------------
      // RESERVE SELECTED APPS
      // ----------------------------------------------------------

      for (const row of moduleResult.rows) {
        const moduleId = requireDatabaseId(
          row.id,
          'module'
        );

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
            moduleId,
            row.version || null,
          ]
        );
      }

      // ==========================================================
      // FREE PLAN
      // ==========================================================

      if (!requiresPayment) {
        // --------------------------------------------------------
        // PROVISION TENANT
        // --------------------------------------------------------

        try {
          /*
           * tenantId has already been validated above and is
           * therefore a definite string here.
           */
          await provisionTenant(
            tenantId,
            selectedApps
          );

          console.log(
            `[SaMi] Tenant ${tenantId} provisioned successfully`
          );

          // ------------------------------------------------------
          // UPDATE TENANT TO ACTIVE
          // ------------------------------------------------------

          await queryControl(
            `
              UPDATE tenants
              SET
                status = 'active',
                updated_at = NOW()
              WHERE id = $1
            `,
            [tenantId]
          );

          // ------------------------------------------------------
          // MARK MODULES AS INSTALLED
          // ------------------------------------------------------

          await queryControl(
            `
              UPDATE tenant_modules
              SET
                status = 'installed',
                installed_at = NOW()
              WHERE tenant_id = $1
                AND status = 'pending'
            `,
            [tenantId]
          );

          // ------------------------------------------------------
          // ACTIVATE SUBSCRIPTION
          // ------------------------------------------------------

          if (subscriptionId) {
            await queryControl(
              `
                UPDATE subscriptions
                SET
                  status = 'active',
                  updated_at = NOW()
                WHERE id = $1
                  AND status = 'pending'
              `,
              [subscriptionId]
            );
          }
        } catch (provisionError) {
          /*
           * Registration itself can still be completed even if
           * provisioning fails temporarily. The tenant remains
           * available for recovery/re-provisioning.
           */
          console.error(
            '[SaMi] Provisioning error:',
            provisionError
          );
        }

        // --------------------------------------------------------
        // GENERATE EMAIL VERIFICATION CODE
        // --------------------------------------------------------

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

        // --------------------------------------------------------
        // REMOVE OLD VERIFICATION CODES
        // --------------------------------------------------------

        await queryControl(
          `
            DELETE FROM email_verifications
            WHERE email = $1
          `,
          [email]
        );

        // --------------------------------------------------------
        // STORE NEW VERIFICATION CODE
        // --------------------------------------------------------

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

        // --------------------------------------------------------
        // SEND VERIFICATION EMAIL
        // --------------------------------------------------------

        try {
          await sendVerificationEmail(
            email,
            verificationCode,
            firstName
          );

          console.log(
            `[SaMi] Verification email sent to ${email}`
          );
        } catch (emailError) {
          console.error(
            '[SaMi] Failed to send verification email:',
            emailError
          );

          /*
           * Do not expose SMTP/internal errors to the client.
           * The account is still created and the user can use
           * the resend-code flow later.
           */
        }

        // --------------------------------------------------------
        // FREE PLAN RESPONSE
        // --------------------------------------------------------

        return NextResponse.json(
          {
            success: true,
            requiresPayment: false,

            user: {
              id: userId,
              email,
              emailVerified: false,
            },

            tenant: {
              id: tenantId,
              name: businessName,
              slug,
              status: 'active',
            },

            subscription: {
              id: subscriptionId,
              plan: finalPlan,
              status: 'active',
              trialDays: TRIAL_DAYS,
            },

            selectedApps,

            message:
              'Account created. We sent a verification code to your email. Please verify your email to login.',
          },
          { status: 201 }
        );
      }

      // ==========================================================
      // PAID PLAN
      // ==========================================================

      if (requiresPayment) {
        const standardPrice = parseInt(
          process.env.PESAPAL_PRICE_STANDARD_MONTHLY ||
            '2000',
          10
        );

        const customPrice = parseInt(
          process.env.PESAPAL_PRICE_CUSTOM_MONTHLY ||
            '3340',
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

        /*
         * At this point tenantId and subscriptionId have both
         * already been validated after their INSERT operations.
         */
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

            /*
             * request.nextUrl.origin is the actual origin of
             * the current request.
             *
             * This means registration does NOT depend on
             * NEXT_PUBLIC_APP_URL.
             */
            origin: request.nextUrl.origin,
          });

        return NextResponse.json(
          {
            success: true,
            requiresPayment: true,

            pesapalOrder,

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
              trialDays: 0,
            },

            selectedApps,

            message:
              'Account created. Please complete payment to activate your workspace.',
          },
          { status: 201 }
        );
      }

      // ==========================================================
      // FALLBACK
      // ==========================================================

      return NextResponse.json(
        {
          success: true,
          requiresPayment: false,

          user: {
            id: userId,
            email,
            emailVerified: false,
          },

          tenant: {
            id: tenantId,
            name: businessName,
            slug,
            status: 'active',
          },

          subscription: {
            id: subscriptionId,
            plan: finalPlan,
            status: 'active',
            trialDays: TRIAL_DAYS,
          },

          selectedApps,

          message:
            'Account created. We sent a verification code to your email. Please verify your email to login.',
        },
        { status: 201 }
      );
    } catch (error) {
      console.error(
        'Registration database error:',
        error
      );

      // ----------------------------------------------------------
      // CLEANUP TENANT
      // ----------------------------------------------------------

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

      // ----------------------------------------------------------
      // CLEANUP USER
      // ----------------------------------------------------------

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