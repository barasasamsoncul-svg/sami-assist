import crypto from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  listAccessibleWorkspaces,
} from '@/lib/auth/account-context';

import {
  checkRateLimit,
} from '@/lib/auth/rate-limit';

import {
  getSession,
  getSessionRequestMetadata,
  setCurrentTenantForSession,
} from '@/lib/auth/session';

import {
  queryControl,
} from '@/lib/db/control';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


const SWITCH_WINDOW_MS =
  10 *
  60 *
  1000;

const SWITCH_BLOCK_MS =
  10 *
  60 *
  1000;


function json(
  body:
    Record<
      string,
      unknown
    >,
  status =
    200,
  headers:
    Record<
      string,
      string
    > = {},
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
        'X-Content-Type-Options':
          'nosniff',
        ...headers,
      },
    },
  );
}


function isUuid(
  value:
    unknown,
): value is string {
  return (
    typeof value ===
      'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}


function requireSameOrigin(
  request:
    NextRequest,
) {
  const secFetchSite =
    request.headers
      .get(
        'sec-fetch-site',
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


async function auditWorkspaceSwitch(
  input: {
    tenantId:
      string;
    userId:
      string;
    previousTenantId:
      string | null;
    request:
      NextRequest;
  },
) {
  const metadata =
    getSessionRequestMetadata(
      input.request,
    );

  try {
    await queryControl(
      `
        INSERT INTO audit_logs (
          tenant_id,
          user_id,
          actor_type,
          action,
          resource_type,
          resource_id,
          module,
          result,
          metadata,
          ip_address,
          user_agent,
          correlation_id,
          event_type,
          entity_type,
          entity_id
        )
        VALUES (
          $1,
          $2,
          'human',
          'workspace.switched',
          'workspace',
          $1,
          'workspace',
          'success',
          $3::jsonb,
          $4,
          $5,
          $6,
          'workspace.switched',
          'workspace',
          $1
        )
      `,
      [
        input.tenantId,
        input.userId,
        JSON.stringify({
          previousWorkspaceId:
            input.previousTenantId,
          currentWorkspaceId:
            input.tenantId,
          source:
            'account_workspace_switcher',
        }),
        metadata
          .ipAddress
          .slice(
            0,
            45,
          ),
        metadata
          .userAgent,
        crypto
          .randomUUID(),
      ],
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Account Workspaces] Switch audit failed:',
      error,
    );
  }
}


export async function GET() {
  try {
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
            'UNAUTHENTICATED',
          error:
            'Sign in to view your SaMi workspaces.',
        },
        401,
      );
    }

    const workspaces =
      await listAccessibleWorkspaces(
        session.user
          .id,
      );

    return json({
      success:
        true,
      currentWorkspaceId:
        session
          .currentTenantId,
      workspaces,
    });
  } catch (
    error
  ) {
    console.error(
      '[SaMi Account Workspaces] Load failed:',
      error,
    );

    return json(
      {
        success:
          false,
        code:
          'WORKSPACES_LOAD_FAILED',
        error:
          'SaMi could not load your workspaces.',
      },
      500,
    );
  }
}


export async function POST(
  request:
    NextRequest,
) {
  try {
    if (
      !requireSameOrigin(
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
            'This workspace switch request could not be verified.',
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
            'UNAUTHENTICATED',
          error:
            'Sign in to switch workspaces.',
        },
        401,
      );
    }

    let body:
      {
        tenantId?:
          unknown;
      };

    try {
      body =
        await request.json();
    } catch {
      return json(
        {
          success:
            false,
          code:
            'INVALID_REQUEST',
          error:
            'Choose a valid workspace.',
        },
        400,
      );
    }

    if (
      !isUuid(
        body.tenantId,
      )
    ) {
      return json(
        {
          success:
            false,
          code:
            'INVALID_WORKSPACE',
          error:
            'Choose a valid workspace.',
        },
        400,
      );
    }

    const targetTenantId =
      body.tenantId
        .trim();

    const rate =
      await checkRateLimit({
        identifier:
          `${session.user.id}:${session.sessionId}`,
        action:
          'account_workspace_switch',
        maxAttempts:
          30,
        windowMs:
          SWITCH_WINDOW_MS,
        blockMs:
          SWITCH_BLOCK_MS,
      });

    if (
      !rate.allowed
    ) {
      return json(
        {
          success:
            false,
          code:
            'WORKSPACE_SWITCH_RATE_LIMITED',
          error:
            'Too many workspace switches. Please wait and try again.',
          retryAfterSeconds:
            rate
              .retryAfterSeconds,
        },
        429,
        rate.retryAfterSeconds
          ? {
              'Retry-After':
                String(
                  rate
                    .retryAfterSeconds,
                ),
            }
          : {},
      );
    }

    const workspaces =
      await listAccessibleWorkspaces(
        session.user
          .id,
      );

    const target =
      workspaces.find(
        workspace =>
          workspace.id ===
          targetTenantId,
      );

    if (
      !target
    ) {
      return json(
        {
          success:
            false,
          code:
            'WORKSPACE_SWITCH_DENIED',
          error:
            'You do not have active access to that workspace.',
        },
        403,
      );
    }

    if (
      session
        .currentTenantId ===
      targetTenantId
    ) {
      return json({
        success:
          true,
        code:
          'WORKSPACE_ALREADY_SELECTED',
        currentWorkspaceId:
          targetTenantId,
        workspace:
          target,
      });
    }

    const previousTenantId =
      session
        .currentTenantId;

    const switched =
      await setCurrentTenantForSession(
        session.sessionId,
        session.user.id,
        targetTenantId,
      );

    if (
      !switched
    ) {
      return json(
        {
          success:
            false,
          code:
            'WORKSPACE_SWITCH_FAILED',
          error:
            'SaMi could not switch to that workspace.',
        },
        409,
      );
    }

    await auditWorkspaceSwitch({
      tenantId:
        targetTenantId,
      userId:
        session.user.id,
      previousTenantId,
      request,
    });

    return json({
      success:
        true,
      code:
        'WORKSPACE_SWITCHED',
      message:
        `Switched to ${target.name}.`,
      currentWorkspaceId:
        targetTenantId,
      workspace:
        target,
    });
  } catch (
    error
  ) {
    console.error(
      '[SaMi Account Workspaces] Switch failed:',
      error,
    );

    return json(
      {
        success:
          false,
        code:
          'WORKSPACE_SWITCH_FAILED',
        error:
          'SaMi could not switch workspaces.',
      },
      500,
    );
  }
}
