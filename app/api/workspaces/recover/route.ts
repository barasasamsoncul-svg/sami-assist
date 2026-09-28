import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
  setCurrentTenantForSession,
} from '@/lib/auth/session';

import {
  queryControl,
} from '@/lib/db/control';

import {
  provisionTenant,
} from '@/lib/services/tenant-provisioning';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


function json(
  body:
    Record<string, unknown>,
  status =
    200,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',
      },
    },
  );
}


function sameOrigin(
  request:
    NextRequest,
) {
  const site =
    request.headers
      .get(
        'sec-fetch-site',
      )
      ?.trim()
      .toLowerCase();

  if (
    site ===
      'cross-site'
  ) {
    return false;
  }

  const origin =
    request.headers.get(
      'origin',
    );

  if (
    !origin
  ) {
    return true;
  }

  try {
    return (
      new URL(
        origin,
      ).origin ===
      request.nextUrl
        .origin
    );
  } catch {
    return false;
  }
}


export async function POST(
  request:
    NextRequest,
) {
  if (
    !sameOrigin(
      request,
    )
  ) {
    return json(
      {
        success:
          false,
        code:
          'INVALID_ORIGIN',
        error:
          'This workspace recovery request could not be verified.',
      },
      403,
    );
  }

  const session =
    await getSession();

  if (
    !session
  ) {
    return json(
      {
        success:
          false,
        code:
          'AUTHENTICATION_REQUIRED',
        error:
          'Sign in before recovering a workspace.',
      },
      401,
    );
  }

  let tenantId =
    '';

  try {
    const body =
      await request.json();

    tenantId =
      typeof body
        ?.tenantId ===
        'string'
        ? body.tenantId
            .trim()
        : '';
  } catch {
    return json(
      {
        success:
          false,
        code:
          'INVALID_REQUEST',
        error:
          'Choose a workspace to recover.',
      },
      400,
    );
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      tenantId,
    )
  ) {
    return json(
      {
        success:
          false,
        code:
          'INVALID_WORKSPACE',
        error:
          'Choose a valid workspace to recover.',
      },
      400,
    );
  }

  const ownership =
    await queryControl(
      `
        SELECT
          t.id::text
            AS tenant_id,
          t.name,
          t.status
        FROM tenants t
        INNER JOIN tenant_users tu
          ON tu.tenant_id =
             t.id
        WHERE t.id = $1
          AND tu.user_id = $2
          AND tu.is_owner =
              TRUE
          AND LOWER(
                COALESCE(
                  tu.status,
                  ''
                )
              ) =
              'active'
          AND tu.deleted_at
              IS NULL
          AND t.deleted_at
              IS NULL
          AND LOWER(
                COALESCE(
                  t.status,
                  ''
                )
              ) =
              'provisioning_failed'
        LIMIT 1
      `,
      [
        tenantId,
        session.user.id,
      ],
    );

  if (
    ownership.rows
      .length !==
    1
  ) {
    return json(
      {
        success:
          false,
        code:
          'WORKSPACE_RECOVERY_NOT_ALLOWED',
        error:
          'This workspace is not available for owner recovery.',
      },
      409,
    );
  }

  const appsResult =
    await queryControl(
      `
        SELECT
          LOWER(
            m.key
          ) AS key
        FROM tenant_modules tm
        INNER JOIN modules m
          ON m.id =
             tm.module_id
        WHERE tm.tenant_id = $1
          AND tm.deleted_at
              IS NULL
          AND m.deleted_at
              IS NULL
          AND LOWER(
                COALESCE(
                  m.status,
                  ''
                )
              ) =
              'active'
        ORDER BY
          LOWER(
            m.key
          )
      `,
      [
        tenantId,
      ],
    );

  const appKeys =
    [
      ...new Set(
        appsResult.rows
          .map(
            row =>
              String(
                row.key ||
                '',
              )
                .trim()
                .toLowerCase(),
          )
          .filter(
            Boolean,
          ),
      ),
    ];

  if (
    appKeys.length ===
      0
  ) {
    return json(
      {
        success:
          false,
        code:
          'WORKSPACE_RECOVERY_APPS_MISSING',
        error:
          'SaMi could not recover the original app selection for this workspace.',
      },
      409,
    );
  }

  try {
    const result =
      await provisionTenant(
        tenantId,
        appKeys,
      );

    if (
      !result.success ||
      result.appsFailed
        .length >
        0 ||
      result.appsInstalled
        .length !==
        appKeys.length
    ) {
      return json(
        {
          success:
            false,
          code:
            'WORKSPACE_RECOVERY_INCOMPLETE',
          error:
            'SaMi retried this workspace, but one or more selected apps could not be installed.',
          failedApps:
            result.appsFailed
              .map(
                item =>
                  item.appKey,
              ),
        },
        500,
      );
    }

    await queryControl(
      `
        UPDATE subscriptions s
        SET
          status =
            CASE
              WHEN LOWER(
                     COALESCE(
                       p.key,
                       ''
                     )
                   ) =
                   'free'
              THEN 'active'
              WHEN s.trial_ends_at
                   IS NOT NULL
                   AND
                   s.trial_ends_at >
                   NOW()
              THEN 'trialing'
              ELSE 'past_due'
            END,
          updated_at =
            NOW()
        FROM plans p
        WHERE s.tenant_id = $1
          AND s.plan_id =
              p.id
          AND s.deleted_at
              IS NULL
      `,
      [
        tenantId,
      ],
    );

    await setCurrentTenantForSession(
      session.sessionId,
      session.user.id,
      tenantId,
    );

    return json({
      success:
        true,
      code:
        'WORKSPACE_RECOVERED',
      workspace: {
        id:
          tenantId,
        name:
          String(
            ownership.rows[0]
              .name ||
            '',
          ),
      },
      appsInstalled:
        result.appsInstalled
          .length,
      next:
        '/dashboard',
    });
  } catch (
    error
  ) {
    console.error(
      '[SaMi] Workspace recovery failed:',
      error,
    );

    return json(
      {
        success:
          false,
        code:
          'WORKSPACE_RECOVERY_FAILED',
        error:
          'SaMi could not complete workspace recovery.',
      },
      500,
    );
  }
}
