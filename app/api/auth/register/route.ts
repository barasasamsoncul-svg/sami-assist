import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import { provisionTenant } from '@/lib/services/tenant-provisioning';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/services/email';
import { createPesaPalOrder } from '@/lib/services/pesapal';

export const runtime = 'nodejs';

const VERIFICATION_EXPIRY_MINUTES = 15;
const BCRYPT_ROUNDS = 12;

const ALLOWED_PLANS = new Set([
  'free',
  'standard',
  'custom',
]);

function normalizeEmail(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : '';
}

function normalizeName(value: unknown): string {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

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
  return crypto
    .randomInt(100000, 1000000)
    .toString();
}

function hashVerificationCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(code)
    .digest('hex');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: string): boolean {
  if (password.length < 8) {
    return false;
  }

  if (password.length > 128) {
    return false;
  }

  return true;
}

export async function POST(request: NextRequest) {
  try {
    /*
     * ============================================================
     * 1. Parse request
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

    /*
     * ============================================================
     * 2. Validate basic fields
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

    if (businessName.length < 2 || businessName.length > 120) {
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
     * 3. Validate selected apps
     * ============================================================
     */

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

    /*
     * Prevent unreasonable payloads.
     */
    if (selectedApps.length > 50) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many apps selected.',
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * 4. Validate requested plan
     * ============================================================
     */

    if (!ALLOWED_PLANS.has(requestedPlan)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid subscription plan.',
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * 5. Check email
     * ============================================================
     */

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

      /*
       * Never automatically destroy a soft-deleted account during
       * registration. That is destructive and can remove historical
       * tenant/payment/session data.
       */
      if (existing.deleted_at) {
        return NextResponse.json(
          {
            success: false,
            error:
              'An account previously associated with this email exists. Please contact SaMi support to restore or permanently remove it.',
          },
          { status: 409 }
        );
      }

      /*
       * If the account exists but is still awaiting verification,
       * tell the client to continue verification instead of creating
       * another account.
       */
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
          error: 'An account with this email already exists.',
        },
        { status: 409 }
      );
    }

    /*
     * ============================================================
     * 6. Validate selected apps against the control database
     * ============================================================
     *
     * Do not trust app keys supplied by the browser.
     */

    const moduleResult = await queryControl(
      `
        SELECT
          id,
          key
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

    /*
     * ============================================================
     * 7. Determine subscription
     * ============================================================
     *
     * Existing SaMi behavior:
     * - one app can use the free path
     * - multiple apps require Standard
     *
     * Keep that behavior for compatibility.
     */

    const requiresPayment = selectedApps.length > 1;

    const finalPlan = requiresPayment
      ? 'standard'
      : requestedPlan;

    /*
     * A multi-app workspace cannot remain on free.
     */
    if (
      requiresPayment &&
      finalPlan === 'free'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Multiple apps require the Standard plan.',
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * 8. Hash password
     * ============================================================
     */

    const passwordHash = await bcrypt.hash(
      password,
      BCRYPT_ROUNDS
    );

    /*
     * ============================================================
     * 9. Create unique tenant slug
     * ============================================================
     */

    const baseSlug =
      createSlug(businessName) ||
      `workspace-${crypto.randomBytes(4).toString('hex')}`;

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
        slug = `${baseSlug}-${crypto
          .randomBytes(4)
          .toString('hex')}`;
      }
    }

    /*
     * ============================================================
     * 10. Create verification code
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
     * 11. Create user
     * ============================================================
     *
     * IMPORTANT:
     * The user is NOT active yet.
     */

    let userId: string | null = null;
    let tenantId: string | null = null;
    let subscriptionId: string | null = null;

    try {
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

      userId = userResult.rows[0].id;

      /*
       * ==========================================================
       * 12. Create tenant
       * ==========================================================
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

      tenantId = tenantResult.rows[0].id;

      /*
       * ==========================================================
       * 13. Connect owner to tenant
       * ==========================================================
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
       * ==========================================================
       * 14. Assign admin role
       * ==========================================================
       */

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
       * ==========================================================
       * 15. Get subscription plan
       * ==========================================================
       */

      const planResult = await queryControl(
        `
          SELECT id
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

      const planId =
        planResult.rows[0].id;

      /*
       * ==========================================================
       * 16. Create subscription
       * ==========================================================
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
                15 *
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

      subscriptionId =
        subscriptionResult.rows[0].id;

      /*
       * ==========================================================
       * 17. Reserve/install selected modules
       * ==========================================================
       *
       * They remain pending until verification/payment/provisioning
       * is complete.
       */

      for (const row of moduleResult.rows) {
        await queryControl(
          `
            INSERT INTO tenant_modules (
              tenant_id,
              module_id,
              status,
              installed_at
            )
            VALUES (
              $1,
              $2,
              $3,
              NULL
            )
            ON CONFLICT DO NOTHING
          `,
          [
            tenantId,
            row.id,
            'pending',
          ]
        );
      }

      /*
       * ==========================================================
       * 18. Remove previous verification codes
       * ==========================================================
       */

      await queryControl(
        `
          DELETE FROM email_verifications
          WHERE email = $1
        `,
        [email]
      );

      /*
       * ==========================================================
       * 19. Store verification code
       * ==========================================================
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
       * 20. Send verification email
       * ==========================================================
       *
       * Registration should NOT report success if we know that
       * the verification email could not be sent.
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
         * Cleanup the newly-created registration because the user
         * cannot complete the required verification flow.
         */

        if (tenantId) {
          await queryControl(
            `
              DELETE FROM tenants
              WHERE id = $1
            `,
            [tenantId]
          );
        }

        if (userId) {
          await queryControl(
            `
              DELETE FROM users
              WHERE id = $1
            `,
            [userId]
          );
        }

        return NextResponse.json(
          {
            success: false,
            code: 'VERIFICATION_EMAIL_FAILED',
            error:
              'We could not send your verification email. Please try again.',
          },
          { status: 503 }
        );
      }

      /*
       * ==========================================================
       * 21. Payment path
       * ==========================================================
       */

      if (requiresPayment) {
        const standardPrice = Number(
          process.env
            .PESAPAL_PRICE_STANDARD_MONTHLY ||
            2000
        );

        const customPrice = Number(
          process.env
            .PESAPAL_PRICE_CUSTOM_MONTHLY ||
            3340
        );

        const amount =
          finalPlan === 'standard'
            ? standardPrice
            : customPrice;
if (!tenantId) {
  throw new Error('Tenant was not created.');
}

if (!subscriptionId) {
  throw new Error('Subscription was not created.');
}

const pesapalOrder = await createPesaPalOrder({
  tenantId,
  subscriptionId,
  amount,
  email,
  firstName,
  lastName,
  businessName,
  plan: finalPlan,
  selectedApps,
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
       * 22. Free/trial path
       * ==========================================================
       *
       * DO NOT provision before email verification.
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
            status: 'pending_verification',
          },

          subscription: {
            id: subscriptionId,
            plan: finalPlan,
            status: 'pending',
          },

          selectedApps,

          message:
            'Account created. We sent a verification code to your email. Please verify your email to continue.',
        },
        { status: 201 }
      );
    } catch (error) {
      console.error(
        'Registration database error:',
        error
      );

      /*
       * Best-effort cleanup.
       *
       * We intentionally do not perform a dangerous broad deletion
       * of an existing account.
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