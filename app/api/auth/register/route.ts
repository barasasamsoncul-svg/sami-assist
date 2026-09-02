import { NextRequest, NextResponse } from 'next/server';
import { queryControl } from '@/lib/db/control';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/services/email';
import { provisionTenant } from '@/lib/services/tenant-provisioning';
import { z } from 'zod';

export const runtime = 'nodejs';

const VERIFICATION_EXPIRY_MINUTES = 15;
const TRIAL_DAYS = 15;
const BCRYPT_ROUNDS = 12;
const MAX_APPS = 50;
const MAX_BUSINESS_NAME_LENGTH = 120;
const MIN_BUSINESS_NAME_LENGTH = 2;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

const ALLOWED_PLANS = new Set(['free', 'standard', 'custom']);

// Validation schema using Zod
const registerSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(80, 'First name too long'),
  lastName: z.string().min(1, 'Last name is required').max(80, 'Last name too long'),
  email: z.string().email('Invalid email address').max(254, 'Email too long'),
  phone: z.string().optional().nullable(),
  password: z.string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH, `Password must be less than ${PASSWORD_MAX_LENGTH} characters`),
  businessName: z.string()
    .min(MIN_BUSINESS_NAME_LENGTH, `Business name must be at least ${MIN_BUSINESS_NAME_LENGTH} characters`)
    .max(MAX_BUSINESS_NAME_LENGTH, `Business name must be less than ${MAX_BUSINESS_NAME_LENGTH} characters`),
  plan: z.string().optional().default('free'),
  selectedApps: z.array(z.string()).min(1, 'Select at least one app'),
});

type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Normalize email addresses consistently.
 */
function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

/**
 * Normalize names.
 */
function normalizeName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * Normalize phone number.
 */
function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
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
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Hash verification code before storing it.
 */
function hashVerificationCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Rate limiting check
 */
async function checkRateLimit(email: string): Promise<{ allowed: boolean; message?: string }> {
  const recentAttempts = await queryControl(
    `
      SELECT COUNT(*) as count
      FROM audit_logs
      WHERE action = 'registration_attempt'
        AND metadata->>'email' = $1
        AND created_at > NOW() - INTERVAL '1 hour'
    `,
    [email]
  );

  const count = parseInt(recentAttempts.rows[0]?.count || '0');
  if (count >= 5) {
    return { allowed: false, message: 'Too many registration attempts. Please try again later.' };
  }

  return { allowed: true };
}

/**
 * Log registration attempt
 */
async function logRegistrationAttempt(email: string, success: boolean, error?: string) {
  await queryControl(
    `
      INSERT INTO audit_logs (
        action,
        resource_type,
        result,
        metadata,
        created_at
      )
      VALUES (
        'registration_attempt',
        'user',
        $1,
        $2,
        NOW()
      )
    `,
    [
      success ? 'success' : 'failure',
      JSON.stringify({ email, error: error || null }),
    ]
  );
}

export async function POST(request: NextRequest) {
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
        { success: false, error: 'Invalid request body.' },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * 2. VALIDATE REQUEST
     * ============================================================
     */

    let validatedData: RegisterInput;

    try {
      validatedData = registerSchema.parse({
        firstName: normalizeName(body.firstName),
        lastName: normalizeName(body.lastName),
        email: normalizeEmail(body.email),
        phone: normalizePhone(body.phone),
        password: typeof body.password === 'string' ? body.password : '',
        businessName: normalizeName(body.businessName),
        plan: typeof body.plan === 'string' ? body.plan.trim().toLowerCase() : 'free',
        selectedApps: Array.isArray(body.selectedApps)
          ? body.selectedApps.filter((app): app is string => typeof app === 'string')
          : [],
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.issues[0]?.message || 'Validation failed';
        return NextResponse.json(
          { success: false, error: firstError },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'Invalid input' },
        { status: 400 }
      );
    }

    const { firstName, lastName, email, phone, password, businessName, plan: requestedPlan, selectedApps } = validatedData;

    /*
     * ============================================================
     * 3. RATE LIMITING
     * ============================================================
     */

    const rateLimit = await checkRateLimit(email);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: rateLimit.message },
        { status: 429 }
      );
    }

    /*
     * ============================================================
     * 4. VALIDATE SELECTED APPS (MAX LIMIT)
     * ============================================================
     */

    if (selectedApps.length > MAX_APPS) {
      return NextResponse.json(
        { success: false, error: `Too many apps selected. Maximum ${MAX_APPS} allowed.` },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * 5. VALIDATE PLAN
     * ============================================================
     */

    if (!ALLOWED_PLANS.has(requestedPlan)) {
      return NextResponse.json(
        { success: false, error: 'Invalid subscription plan.' },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * 6. CHECK EXISTING USER
     * ============================================================
     */

    const existingUser = await queryControl(
      `
        SELECT id, email, status, email_verified_at, deleted_at
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
            error: 'An account previously associated with this email exists. Please contact SaMi support.',
          },
          { status: 409 }
        );
      }

      if (!existing.email_verified_at && (existing.status === 'pending_verification' || existing.status === 'pending')) {
        return NextResponse.json(
          {
            success: false,
            code: 'EMAIL_VERIFICATION_REQUIRED',
            error: 'An account with this email already exists and is awaiting email verification.',
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
     * 7. VALIDATE APPS AGAINST CONTROL DATABASE
     * ============================================================
     */

    const moduleResult = await queryControl(
      `
        SELECT id, key, name, version, status
        FROM modules
        WHERE key = ANY($1::text[])
          AND deleted_at IS NULL
      `,
      [selectedApps]
    );

    const validApps = moduleResult.rows.map((row) => String(row.key));
    const validAppSet = new Set(validApps);
    const invalidApps = selectedApps.filter((appKey) => !validAppSet.has(appKey));

    if (invalidApps.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'One or more selected SaMi apps are unavailable.',
          invalidApps,
        },
        { status: 400 }
      );
    }

    /*
     * ============================================================
     * 8. DETERMINE PLAN
     * ============================================================
     */

    const requiresPayment = selectedApps.length > 1;
    const finalPlan = requiresPayment ? 'standard' : requestedPlan;

    /*
     * ============================================================
     * 9. HASH PASSWORD
     * ============================================================
     */

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    /*
     * ============================================================
     * 10. CREATE UNIQUE TENANT SLUG
     * ============================================================
     */

    const baseSlug = createSlug(businessName) || `workspace-${crypto.randomBytes(4).toString('hex')}`;
    let slug = baseSlug;

    for (let counter = 1; counter <= 100; counter++) {
      const existingTenant = await queryControl(
        `
          SELECT id
          FROM tenants
          WHERE slug = $1 AND deleted_at IS NULL
          LIMIT 1
        `,
        [slug]
      );

      if (existingTenant.rows.length === 0) break;
      slug = `${baseSlug}-${counter}`;

      if (counter === 100) {
        slug = `${baseSlug}-${crypto.randomBytes(4).toString('hex')}`;
      }
    }

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
       * ----------------------------------------------------------
       * TENANT
       * ----------------------------------------------------------
       */

      const tenantStatus = requiresPayment ? 'pending_payment' : 'provisioning';

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
        [businessName, slug, tenantStatus]
      );

      tenantId = tenantResult.rows[0].id;

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
        [tenantId, userId, 'active', true]
      );

      /*
       * ----------------------------------------------------------
       * ADMIN ROLE
       * ----------------------------------------------------------
       */

      const roleResult = await queryControl(
        `
          SELECT id
          FROM roles
          WHERE name = 'admin' AND is_system = true
          LIMIT 1
        `
      );

      if (roleResult.rows.length === 0) {
        throw new Error('System administrator role is not configured.');
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
        [tenantId, userId, roleResult.rows[0].id]
      );

      /*
       * ----------------------------------------------------------
       * PLAN
       * ----------------------------------------------------------
       */

      const planResult = await queryControl(
        `
          SELECT id, key, name, included_apps
          FROM plans
          WHERE key = $1 AND deleted_at IS NULL
          LIMIT 1
        `,
        [finalPlan]
      );

      if (planResult.rows.length === 0) {
        throw new Error(`Subscription plan "${finalPlan}" is not configured.`);
      }

      const plan = planResult.rows[0];

      /*
       * ----------------------------------------------------------
       * SUBSCRIPTION
       * ----------------------------------------------------------
       */

      const subscriptionStatus = requiresPayment ? 'pending_payment' : 'pending';
      const trialEndsAt = requiresPayment
        ? null
        : new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

      const subscriptionResult = await queryControl(
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
        [tenantId, plan.id, subscriptionStatus, trialEndsAt]
      );

      subscriptionId = subscriptionResult.rows[0].id;

      /*
       * ----------------------------------------------------------
       * RESERVE SELECTED APPS
       * ----------------------------------------------------------
       */

      for (const row of moduleResult.rows) {
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
          [tenantId, row.id, row.version || null]
        );
      }

      /*
       * ==========================================================
       * 12. FREE PLAN: PROVISION + SEND EMAIL
       * ==========================================================
       */

      if (!requiresPayment) {
        // Provision tenant
        try {
          if (tenantId === null) {
            throw new Error('Tenant was not created.');
          }

          await provisionTenant(tenantId, selectedApps);
          console.log(`[SaMi] Tenant ${tenantId} provisioned successfully`);

          // Update tenant to active
          await queryControl(
            `
              UPDATE tenants
              SET status = 'active', updated_at = NOW()
              WHERE id = $1
            `,
            [tenantId]
          );

          // Update tenant_modules to installed
          await queryControl(
            `
              UPDATE tenant_modules
              SET status = 'installed', installed_at = NOW()
              WHERE tenant_id = $1 AND status = 'pending'
            `,
            [tenantId]
          );

          // Update subscription to active (only if subscriptionId is not null)
          if (subscriptionId !== null) {
            await queryControl(
              `
                UPDATE subscriptions
                SET status = 'active', updated_at = NOW()
                WHERE id = $1 AND status = 'pending'
              `,
              [subscriptionId]
            );
          }
        } catch (provisionError) {
          console.error('[SaMi] Provisioning error:', provisionError);
          // Don't fail registration, just log error
        }

        // Generate verification code
        const verificationCode = generateVerificationCode();
        const verificationHash = hashVerificationCode(verificationCode);
        const verificationExpiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MINUTES * 60 * 1000);

        // Remove old verification codes
        await queryControl(
          `
            DELETE FROM email_verifications
            WHERE email = $1
          `,
          [email]
        );

        // Store verification code
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
          [email, verificationHash, verificationExpiresAt]
        );

        // Send verification email
        try {
          await sendVerificationEmail(email, verificationCode, firstName);
          console.log(`[SaMi] Verification email sent to ${email}`);
        } catch (emailError) {
          console.error('[SaMi] Failed to send verification email:', emailError);
          // Don't fail registration, just log error
        }
      }

      /*
       * ==========================================================
       * 13. LOG SUCCESS
       * ==========================================================
       */

      await logRegistrationAttempt(email, true);

      /*
       * ==========================================================
       * 14. RETURN RESPONSE
       * ==========================================================
       */

      return NextResponse.json(
        {
          success: true,
          requiresPayment: requiresPayment,
          user: {
            id: userId,
            email,
            emailVerified: false,
          },
          tenant: {
            id: tenantId,
            name: businessName,
            slug,
            status: requiresPayment ? 'pending_payment' : 'active',
          },
          subscription: {
            id: subscriptionId,
            plan: finalPlan,
            status: requiresPayment ? 'pending_payment' : 'active',
            trialDays: requiresPayment ? 15 : TRIAL_DAYS,
          },
          selectedApps,
          message: requiresPayment
            ? 'Account created. Please complete payment to activate your workspace.'
            : 'Account created. We sent a verification code to your email. Please verify your email to login.',
        },
        { status: 201 }
      );
    } catch (error) {
      /*
       * ==========================================================
       * REGISTRATION DATABASE ERROR
       * ==========================================================
       */

      console.error('Registration database error:', error);

      await logRegistrationAttempt(email, false, error instanceof Error ? error.message : 'Unknown error');

      // Best-effort cleanup
      if (tenantId) {
        try {
          await queryControl(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
        } catch (cleanupError) {
          console.error('Tenant cleanup failed:', cleanupError);
        }
      }

      if (userId) {
        try {
          await queryControl(`DELETE FROM users WHERE id = $1`, [userId]);
        } catch (cleanupError) {
          console.error('User cleanup failed:', cleanupError);
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Registration could not be completed. Please try again.',
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

    console.error('Unexpected registration error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Registration failed. Please try again.',
      },
      { status: 500 }
    );
  }
}