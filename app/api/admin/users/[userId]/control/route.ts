import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  PlatformUserControlError,
  controlPlatformUser,
  type PlatformUserControlAction,
} from '@/lib/admin/user-control';

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
      userId:
        string;
    }>;
};


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


function response(
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
          'no-store, no-cache, must-revalidate, private',
        Pragma:
          'no-cache',
        'X-Content-Type-Options':
          'nosniff',
      },
    },
  );
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

  let userId =
    '';

  let action =
    '';

  try {
    if (
      !sameOrigin(
        request,
      )
    ) {
      return response(
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
        'users.security.manage',
      );

    const params =
      await context.params;

    userId =
      params.userId
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
      return response(
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
      return response(
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
        lockMinutes?:
          unknown;
      };

    try {
      body =
        JSON.parse(
          raw,
        ) as
          {
            action?:
              unknown;
            reason?:
              unknown;
            lockMinutes?:
              unknown;
          };
    } catch {
      return response(
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
        'lock' &&
      action !==
        'unlock' &&
      action !==
        'suspend' &&
      action !==
        'reactivate' &&
      action !==
        'revoke_sessions'
    ) {
      return response(
        {
          success:
            false,
          code:
            'INVALID_ACTION',
          error:
            'Select a valid user security action.',
        },
        400,
      );
    }

    const result =
      await controlPlatformUser({
        userId,
        action:
          action as
            PlatformUserControlAction,
        reason:
          body.reason,
        lockMinutes:
          body.lockMinutes,
      });

    await recordAdminAuditEvent({
      request,
      adminId:
        session.adminId,
      sessionId:
        session.sessionId,
      eventType:
        `platform.user.${action}`,
      action:
        `user_${action}`,
      targetType:
        'user',
      targetId:
        userId,
      successful:
        true,
      metadata: {
        changed:
          result.changed,
        status:
          result.status,
        sessionsRevoked:
          result.sessionsRevoked,
        reason:
          result.reason,
      },
    });

    return response({
      success:
        true,
      user:
        result,
    });
  } catch (
    error
  ) {
    const controlError =
      error instanceof
        PlatformUserControlError
        ? error
        : null;

    const code =
      controlError
        ?.code ||
      (
        error instanceof
          Error
          ? error.message
          : 'USER_CONTROL_FAILED'
      );

    const status =
      code ===
        'ADMIN_UNAUTHENTICATED'
        ? 401
        : code ===
            'ADMIN_FORBIDDEN'
          ? 403
          : code ===
              'USER_NOT_FOUND'
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
          'platform.user.control_failed',
        action:
          action
            ? `user_${action}`
            : 'user_control',
        targetType:
          'user',
        targetId:
          userId ||
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
          'platform_user_control_failed',
        title:
          'Platform user control failed',
        severity:
          status >=
            500
            ? 'error'
            : 'warning',
        operation:
          action ||
          'user_control',
        userId:
          userId ||
          null,
        adminId:
          session.adminId,
        error,
        metadata: {
          code,
        },
      });
    }

    return response(
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
                ? 'Your administrator role cannot manage user security.'
                : 'SaMi could not complete this user security action.'
          ),
      },
      status,
    );
  }
}
