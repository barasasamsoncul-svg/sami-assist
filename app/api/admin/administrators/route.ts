import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  requireAdminRole,
} from '@/lib/auth/admin-session';

import {
  provisionPlatformAdmin,
} from '@/lib/auth/admin-provisioning';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

import {
  queryControl,
} from '@/lib/db/control';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type CreateAdministratorBody = {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  role?: unknown;
};

type AdministratorRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  status: string;
  email_verified: boolean;
  email_verified_at: Date | string | null;
  two_factor_required: boolean;
  two_factor_enabled: boolean;
  failed_login_attempts: number;
  locked_until: Date | string | null;
  last_login_at: Date | string | null;
  last_login_ip: string | null;
  password_changed_at: Date | string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const ADMIN_ROLES = [
  'super_admin',
  'security_admin',
  'support_admin',
  'billing_admin',
  'operations_admin',
  'developer_admin',
  'read_only_admin',
] as const;

const ADMIN_STATUSES = [
  'invited',
  'active',
  'suspended',
  'locked',
  'disabled',
] as const;

/* ============================================================
   RESPONSE
   ============================================================ */

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders?: Record<string, string>
) {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate, private',

        Pragma:
          'no-cache',

        Expires:
          '0',

        'X-Content-Type-Options':
          'nosniff',

        ...extraHeaders,
      },
    }
  );
}

/* ============================================================
   CSRF / ORIGIN
   ============================================================ */

function getAllowedOrigins(
  request: NextRequest
): Set<string> {
  const origins =
    new Set<string>();

  try {
    origins.add(
      request.nextUrl.origin
    );
  } catch {
    // Ignore malformed request URL.
  }

  const appUrl =
    process.env.APP_URL
      ?.trim();

  if (appUrl) {
    try {
      origins.add(
        new URL(
          appUrl
        ).origin
      );
    } catch {
      // Deployment configuration issue.
    }
  }

  return origins;
}

function isTrustedMutationRequest(
  request: NextRequest
): boolean {
  const origin =
    request.headers.get(
      'origin'
    );

  const secFetchSite =
    request.headers.get(
      'sec-fetch-site'
    );

  if (
    secFetchSite ===
    'cross-site'
  ) {
    return false;
  }

  if (origin) {
    try {
      return getAllowedOrigins(
        request
      ).has(
        new URL(
          origin
        ).origin
      );
    } catch {
      return false;
    }
  }

  if (secFetchSite) {
    return (
      secFetchSite ===
        'same-origin' ||
      secFetchSite ===
        'none'
    );
  }

  return true;
}

/* ============================================================
   INFRASTRUCTURE ERROR
   ============================================================ */

function isDatabaseAvailabilityError(
  error: unknown
): boolean {
  if (
    !error ||
    typeof error !==
      'object'
  ) {
    return false;
  }

  const candidate =
    error as {
      code?: unknown;
      message?: unknown;
    };

  const code =
    typeof candidate.code ===
      'string'
      ? candidate.code
      : '';

  const message =
    typeof candidate.message ===
      'string'
      ? candidate.message
          .toLowerCase()
      : '';

  const codes =
    new Set([
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'EHOSTUNREACH',
      'ENETUNREACH',
      '08000',
      '08001',
      '08003',
      '08004',
      '08006',
      '08007',
      '08P01',
      '57P01',
      '57P02',
      '57P03',
    ]);

  return (
    codes.has(
      code
    ) ||
    message.includes(
      'connection terminated'
    ) ||
    message.includes(
      'connection refused'
    ) ||
    message.includes(
      'connection reset'
    ) ||
    message.includes(
      'timed out'
    ) ||
    message.includes(
      'timeout'
    ) ||
    message.includes(
      'database is unavailable'
    )
  );
}

/* ============================================================
   SAFE AUDIT
   ============================================================ */

async function safeRecordAudit(
  input: Parameters<
    typeof recordAdminAuditEvent
  >[0]
) {
  try {
    await recordAdminAuditEvent(
      input
    );
  } catch (error) {
    console.error(
      '[Admin Administrators API] Audit failed:',
      error instanceof Error
        ? error.message
        : 'Unknown audit error'
    );
  }
}

/* ============================================================
   SERIALIZATION
   ============================================================ */

function serializeAdministrator(
  row: AdministratorRow
) {
  return {
    id:
      row.id,

    firstName:
      row.first_name,

    lastName:
      row.last_name,

    fullName:
      `${row.first_name} ${row.last_name}`
        .trim(),

    email:
      row.email,

    role:
      row.role,

    status:
      row.status,

    emailVerified:
      Boolean(
        row.email_verified
      ),

    emailVerifiedAt:
      row.email_verified_at,

    twoFactorRequired:
      Boolean(
        row.two_factor_required
      ),

    twoFactorEnabled:
      Boolean(
        row.two_factor_enabled
      ),

    failedLoginAttempts:
      Number(
        row.failed_login_attempts ||
          0
      ),

    lockedUntil:
      row.locked_until,

    lastLoginAt:
      row.last_login_at,

    lastLoginIp:
      row.last_login_ip,

    passwordChangedAt:
      row.password_changed_at,

    createdBy:
      row.created_by,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

/* ============================================================
   GET /api/admin/administrators
   ============================================================ */

export async function GET(
  request: NextRequest
) {
  try {
    const session =
      await requireAdminRole([
        'super_admin',
      ]);

    if (
      session.status !==
        'active' ||
      !session.emailVerified
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            'ADMIN_SECURITY_REQUIREMENTS_NOT_MET',

          error:
            'Your administrator account cannot perform this action.',
        },
        403
      );
    }

    const searchParams =
      request.nextUrl
        .searchParams;

    const rawQuery =
      searchParams
        .get('q')
        ?.trim() ||
      '';

    const query =
      rawQuery.slice(
        0,
        120
      );

    const rawRole =
      searchParams
        .get('role')
        ?.trim() ||
      '';

    const role =
      ADMIN_ROLES.includes(
        rawRole as
          (typeof ADMIN_ROLES)[number]
      )
        ? rawRole
        : '';

    const rawStatus =
      searchParams
        .get('status')
        ?.trim() ||
      '';

    const status =
      ADMIN_STATUSES.includes(
        rawStatus as
          (typeof ADMIN_STATUSES)[number]
      )
        ? rawStatus
        : '';

    const requestedPage =
      Number(
        searchParams.get(
          'page'
        ) ||
          1
      );

    const requestedLimit =
      Number(
        searchParams.get(
          'limit'
        ) ||
          25
      );

    const page =
      Number.isInteger(
        requestedPage
      ) &&
      requestedPage > 0
        ? requestedPage
        : 1;

    const limit =
      Number.isInteger(
        requestedLimit
      )
        ? Math.min(
            100,
            Math.max(
              1,
              requestedLimit
            )
          )
        : 25;

    const offset =
      (page - 1) *
      limit;

    const filters:
      string[] = [
        'a.deleted_at IS NULL',
      ];

    const values:
      unknown[] = [];

    if (query) {
      values.push(
        `%${query}%`
      );

      const index =
        values.length;

      filters.push(
        `(
          a.first_name ILIKE $${index}
          OR a.last_name ILIKE $${index}
          OR a.email ILIKE $${index}
          OR CONCAT(a.first_name, ' ', a.last_name) ILIKE $${index}
        )`
      );
    }

    if (role) {
      values.push(
        role
      );

      filters.push(
        `a.role = $${values.length}`
      );
    }

    if (status) {
      values.push(
        status
      );

      filters.push(
        `a.status = $${values.length}`
      );
    }

    const whereClause =
      filters.join(
        '\nAND '
      );

    const countResult =
      await queryControl(
        `
          SELECT
            COUNT(*)::int AS total

          FROM
            platform_admins a

          WHERE
            ${whereClause}
        `,
        values
      );

    const total =
      Number(
        countResult.rows[0]
          ?.total ||
          0
      );

    const listValues = [
      ...values,
      limit,
      offset,
    ];

    const limitIndex =
      listValues.length -
      1;

    const offsetIndex =
      listValues.length;

    const administratorsResult =
      await queryControl(
        `
          SELECT
            a.id,
            a.first_name,
            a.last_name,
            a.email,
            a.role,
            a.status,
            a.email_verified,
            a.email_verified_at,
            a.two_factor_required,
            a.two_factor_enabled,
            a.failed_login_attempts,
            a.locked_until,
            a.last_login_at,
            a.last_login_ip,
            a.password_changed_at,
            a.created_by,
            a.created_at,
            a.updated_at

          FROM
            platform_admins a

          WHERE
            ${whereClause}

          ORDER BY
            CASE
              WHEN a.status = 'active'
              THEN 0

              WHEN a.status = 'invited'
              THEN 1

              ELSE 2
            END,

            a.created_at DESC

          LIMIT
            $${limitIndex}

          OFFSET
            $${offsetIndex}
        `,
        listValues
      );

    const summaryResult =
      await queryControl(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE deleted_at IS NULL
            )::int AS total,

            COUNT(*) FILTER (
              WHERE deleted_at IS NULL
                AND status = 'active'
            )::int AS active,

            COUNT(*) FILTER (
              WHERE deleted_at IS NULL
                AND status = 'invited'
            )::int AS invited,

            COUNT(*) FILTER (
              WHERE deleted_at IS NULL
                AND status = 'locked'
            )::int AS locked,

            COUNT(*) FILTER (
              WHERE deleted_at IS NULL
                AND status = 'suspended'
            )::int AS suspended,

            COUNT(*) FILTER (
              WHERE deleted_at IS NULL
                AND status = 'disabled'
            )::int AS disabled,

            COUNT(*) FILTER (
              WHERE deleted_at IS NULL
                AND two_factor_enabled = TRUE
            )::int AS two_factor_enabled

          FROM
            platform_admins
        `
      );

    const summary =
      summaryResult.rows[0] ||
      {};

    return jsonResponse({
      success:
        true,

      administrators:
        administratorsResult
          .rows
          .map(
            row =>
              serializeAdministrator(
                row as
                  AdministratorRow
              )
          ),

      summary: {
        total:
          Number(
            summary.total ||
              0
          ),

        active:
          Number(
            summary.active ||
              0
          ),

        invited:
          Number(
            summary.invited ||
              0
          ),

        locked:
          Number(
            summary.locked ||
              0
          ),

        suspended:
          Number(
            summary.suspended ||
              0
          ),

        disabled:
          Number(
            summary.disabled ||
              0
          ),

        twoFactorEnabled:
          Number(
            summary.two_factor_enabled ||
              0
          ),
      },

      pagination: {
        page,
        limit,
        total,

        totalPages:
          Math.max(
            1,
            Math.ceil(
              total /
                limit
            )
          ),
      },

      filters: {
        query,
        role:
          role ||
          null,

        status:
          status ||
          null,
      },
    });
  } catch (error) {
    if (
      error instanceof
        Error &&
      error.message ===
        'ADMIN_UNAUTHENTICATED'
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            'ADMIN_UNAUTHENTICATED',

          error:
            'Administrator authentication is required.',
        },
        401
      );
    }

    if (
      error instanceof
        Error &&
      error.message ===
        'ADMIN_FORBIDDEN'
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            'ADMIN_FORBIDDEN',

          error:
            'Only a Super Administrator can manage Platform Administrators.',
        },
        403
      );
    }

    if (
      isDatabaseAvailabilityError(
        error
      )
    ) {
      console.error(
        '[Admin Administrators API] Database temporarily unavailable:',
        error instanceof Error
          ? error.message
          : 'Unknown database error'
      );

      return jsonResponse(
        {
          success:
            false,

          code:
            'SERVICE_TEMPORARILY_UNAVAILABLE',

          error:
            'SaMi is temporarily unable to load Platform Administrators.',
        },
        503,
        {
          'Retry-After':
            '30',
        }
      );
    }

    console.error(
      '[Admin Administrators API] GET failed:',
      error instanceof Error
        ? error.message
        : 'Unknown administrators error'
    );

    return jsonResponse(
      {
        success:
          false,

        code:
          'ADMINISTRATORS_LOAD_FAILED',

        error:
          'SaMi could not load Platform Administrators.',
      },
      500
    );
  }
}

/* ============================================================
   POST /api/admin/administrators
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  let actorAdminId:
    string | null =
    null;

  let actorSessionId:
    string | null =
    null;

  try {
    if (
      !isTrustedMutationRequest(
        request
      )
    ) {
      await safeRecordAudit({
        request,

        eventType:
          'admin.identity.provision_denied',

        action:
          'provision_platform_admin',

        targetType:
          'platform_admin',

        successful:
          false,

        failureReason:
          'untrusted_origin',
      });

      return jsonResponse(
        {
          success:
            false,

          code:
            'UNTRUSTED_REQUEST',

          error:
            'This administrator request could not be verified.',
        },
        403
      );
    }

    const session =
      await requireAdminRole([
        'super_admin',
      ]);

    actorAdminId =
      session.adminId;

    actorSessionId =
      session.sessionId;

    if (
      session.status !==
        'active' ||
      !session.emailVerified
    ) {
      await safeRecordAudit({
        request,

        adminId:
          session.adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.identity.provision_denied',

        action:
          'provision_platform_admin',

        targetType:
          'platform_admin',

        successful:
          false,

        failureReason:
          'actor_security_state_invalid',

        metadata: {
          actorRole:
            session.role,

          actorStatus:
            session.status,

          actorEmailVerified:
            session.emailVerified,
        },
      });

      return jsonResponse(
        {
          success:
            false,

          code:
            'ADMIN_SECURITY_REQUIREMENTS_NOT_MET',

          error:
            'Your administrator account cannot perform this action.',
        },
        403
      );
    }

    const contentType =
      request.headers.get(
        'content-type'
      ) ||
      '';

    if (
      !contentType
        .toLowerCase()
        .startsWith(
          'application/json'
        )
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            'UNSUPPORTED_CONTENT_TYPE',

          error:
            'This endpoint requires a JSON request.',
        },
        415
      );
    }

    const contentLength =
      Number(
        request.headers.get(
          'content-length'
        ) ||
          0
      );

    if (
      Number.isFinite(
        contentLength
      ) &&
      contentLength >
        16 * 1024
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            'REQUEST_TOO_LARGE',

          error:
            'The request is too large.',
        },
        413
      );
    }

    let body:
      CreateAdministratorBody;

    try {
      const parsed:
        unknown =
        await request.json();

      if (
        !parsed ||
        typeof parsed !==
          'object' ||
        Array.isArray(
          parsed
        )
      ) {
        return jsonResponse(
          {
            success:
              false,

            code:
              'INVALID_REQUEST',

            error:
              'Invalid request body.',
          },
          400
        );
      }

      body =
        parsed as
          CreateAdministratorBody;
    } catch {
      return jsonResponse(
        {
          success:
            false,

          code:
            'INVALID_REQUEST',

          error:
            'Invalid request body.',
        },
        400
      );
    }

    const result =
      await provisionPlatformAdmin({
        request,

        actorAdminId:
          session.adminId,

        actorRole:
          session.role,

        firstName:
          body.firstName,

        lastName:
          body.lastName,

        email:
          body.email,

        role:
          body.role,
      });

    if (
      !result.success
    ) {
      switch (
        result.code
      ) {
        case 'FORBIDDEN':
          return jsonResponse(
            {
              success:
                false,

              code:
                result.code,

              error:
                result.message,
            },
            403
          );

        case 'INVALID_FIRST_NAME':
        case 'INVALID_LAST_NAME':
        case 'INVALID_EMAIL':
        case 'INVALID_ROLE':
          return jsonResponse(
            {
              success:
                false,

              code:
                result.code,

              error:
                result.message,
            },
            400
          );

        case 'ADMIN_ALREADY_EXISTS':
          return jsonResponse(
            {
              success:
                false,

              code:
                result.code,

              error:
                result.message,
            },
            409
          );

        case 'PROVISIONING_FAILED':
          return jsonResponse(
            {
              success:
                false,

              code:
                result.code,

              error:
                result.message,
            },
            500
          );
      }
    }

    const verificationPending =
      result.code ===
      'ADMIN_PROVISIONED_VERIFICATION_PENDING';

    return jsonResponse(
      {
        success:
          true,

        code:
          result.code,

        message:
          result.message,

        admin:
          result.admin,

        verification: {
          sent:
            result.verificationSent,

          pending:
            verificationPending,

          cooldown:
            result.verificationCooldown,

          retryAfterSeconds:
            result.retryAfterSeconds,
        },
      },
      201
    );
  } catch (error) {
    if (
      error instanceof
        Error &&
      error.message ===
        'ADMIN_UNAUTHENTICATED'
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            'ADMIN_UNAUTHENTICATED',

          error:
            'Administrator authentication is required.',
        },
        401
      );
    }

    if (
      error instanceof
        Error &&
      error.message ===
        'ADMIN_FORBIDDEN'
    ) {
      if (
        actorAdminId
      ) {
        await safeRecordAudit({
          request,

          adminId:
            actorAdminId,

          sessionId:
            actorSessionId,

          eventType:
            'admin.identity.provision_denied',

          action:
            'provision_platform_admin',

          targetType:
            'platform_admin',

          successful:
            false,

          failureReason:
            'insufficient_privileges',
        });
      }

      return jsonResponse(
        {
          success:
            false,

          code:
            'ADMIN_FORBIDDEN',

          error:
            'You do not have permission to provision Platform Administrators.',
        },
        403
      );
    }

    if (
      isDatabaseAvailabilityError(
        error
      )
    ) {
      console.error(
        '[Admin Administrators API] Database temporarily unavailable:',
        error instanceof Error
          ? error.message
          : 'Unknown database error'
      );

      return jsonResponse(
        {
          success:
            false,

          code:
            'SERVICE_TEMPORARILY_UNAVAILABLE',

          error:
            'SaMi is temporarily unable to provision Platform Administrators.',
        },
        503,
        {
          'Retry-After':
            '30',
        }
      );
    }

    console.error(
      '[Admin Administrators API] Provision failed:',
      error instanceof Error
        ? error.message
        : 'Unknown provisioning error'
    );

    return jsonResponse(
      {
        success:
          false,

        code:
          'ADMINISTRATOR_PROVISIONING_ERROR',

        error:
          'SaMi could not provision the Platform Administrator.',
      },
      500
    );
  }
}