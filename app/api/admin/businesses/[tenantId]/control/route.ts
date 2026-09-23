import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  PlatformWorkspaceControlError,
  controlPlatformWorkspace,
  type PlatformWorkspaceControlAction,
} from '@/lib/admin/workspace-control';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

import {
  capturePlatformIncident,
} from '@/lib/observability/platform-incidents';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


type Context = {
  params:
    Promise<{
      tenantId:
        string;
    }>;
};


function json(
  body:
    Record<
      string,
      unknown
    >,
  status =
    200,
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


export async function POST(
  request:
    NextRequest,
  context:
    Context,
) {
  let session:
    Awaited<
      ReturnType<
        typeof requireAdminCapability
      >
    > |
    null =
    null;

  let tenantId =
    '';

  let action =
    '';

  try {
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
            'This administrator request could not be verified.',
        },
        403,
      );
    }

    session =
      await requireAdminCapability(
        'tenants.manage',
      );

    const params =
      await context.params;

    tenantId =
      params.tenantId
        .trim();

    const contentType =
      request.headers
        .get(
          'content-type',
        )
        ?.toLowerCase() ||
      '';

    if (
      !contentType.includes(
        'application/json',
      )
    ) {
      return json(
        {
          success:
            false,
          code:
            'UNSUPPORTED_MEDIA_TYPE',
          error:
            'This endpoint requires JSON.',
        },
        415,
      );
    }

    const raw =
      await request.text();

    if (
      Buffer.byteLength(
        raw,
        'utf8',
      ) >
        8 *
        1024
    ) {
      return json(
        {
          success:
            false,
          code:
            'REQUEST_TOO_LARGE',
          error:
            'The request is too large.',
        },
        413,
      );
    }

    let body:
      {
        action?:
          unknown;
        reason?:
          unknown;
      };

    try {
      body =
        JSON.parse(
          raw,
        ) as {
          action?:
            unknown;
          reason?:
            unknown;
        };
    } catch {
      return json(
        {
          success:
            false,
          code:
            'INVALID_REQUEST',
          error:
            'Invalid request body.',
        },
        400,
      );
    }

    action =
      typeof body.action ===
        'string'
        ? body.action
            .trim()
            .toLowerCase()
        : '';

    if (
      action !==
        'health_check' &&
      action !==
        'maintenance_on' &&
      action !==
        'maintenance_off' &&
      action !==
        'suspend' &&
      action !==
        'reactivate'
    ) {
      return json(
        {
          success:
            false,
          code:
            'INVALID_ACTION',
          error:
            'Select a valid workspace operation.',
        },
        400,
      );
    }

    const result =
      await controlPlatformWorkspace({
        tenantId,
        action:
          action as
            PlatformWorkspaceControlAction,
        reason:
          body.reason,
      });

    await recordAdminAuditEvent({
      request,
      adminId:
        session.adminId,
      sessionId:
        session.sessionId,
      eventType:
        `platform.workspace.${action}`,
      action:
        `workspace_${action}`,
      targetType:
        'tenant',
      targetId:
        tenantId,
      successful:
        true,
      metadata: {
        changed:
          result.changed,
        workspaceStatus:
          result.workspaceStatus,
        sessionsCleared:
          result.sessionsCleared,
        reason:
          result.reason,
      },
    });

    return json({
      success:
        true,
      workspace:
        result,
    });
  } catch (
    error
  ) {
    const controlError =
      error instanceof
        PlatformWorkspaceControlError
        ? error
        : null;

    const code =
      controlError
        ?.code ||
      (
        error instanceof
          Error
          ? error.message
          : 'WORKSPACE_CONTROL_FAILED'
      );

    const status =
      code ===
        'ADMIN_UNAUTHENTICATED'
        ? 401
        : code ===
            'ADMIN_FORBIDDEN'
          ? 403
          : code ===
              'WORKSPACE_NOT_FOUND'
            ? 404
            : controlError
              ? 400
              : 500;

    if (
      session
    ) {
      await recordAdminAuditEvent({
        request,
        adminId:
          session.adminId,
        sessionId:
          session.sessionId,
        eventType:
          'platform.workspace.control_failed',
        action:
          action
            ? `workspace_${action}`
            : 'workspace_control',
        targetType:
          'tenant',
        targetId:
          tenantId ||
          null,
        successful:
          false,
        failureReason:
          code,
      });

      await capturePlatformIncident({
        source:
          'platform_admin',
        category:
          'platform_workspace_control_failed',
        title:
          'Platform workspace control failed',
        severity:
          status >=
            500
            ? 'error'
            : 'warning',
        operation:
          action ||
          'workspace_control',
        tenantId:
          tenantId ||
          null,
        adminId:
          session.adminId,
        error,
        metadata: {
          code,
        },
      });
    }

    return json(
      {
        success:
          false,
        code,
        error:
          controlError
            ?.message ||
          (
            status ===
              401
              ? 'Administrator authentication is required.'
              : status ===
                  403
                ? 'Your administrator role cannot manage workspaces.'
                : 'SaMi could not complete this workspace operation.'
          ),
      },
      status,
    );
  }
}
