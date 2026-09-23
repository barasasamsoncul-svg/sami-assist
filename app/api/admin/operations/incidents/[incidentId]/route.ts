import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  updatePlatformIncidentState,
} from '@/lib/admin/incidents';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


type Context = {
  params:
    Promise<{
      incidentId:
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


export async function PATCH(
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

  let incidentId =
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
        'incidents.manage',
      );

    const params =
      await context.params;

    incidentId =
      typeof params.incidentId ===
        'string'
        ? params.incidentId
            .trim()
        : '';

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
        note?:
          unknown;
      };

    try {
      body =
        JSON.parse(
          raw,
        ) as {
          action?:
            unknown;
          note?:
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

    const action =
      typeof body.action ===
        'string'
        ? body.action
            .trim()
            .toLowerCase()
        : '';

    if (
      action !==
        'acknowledge' &&
      action !==
        'resolve' &&
      action !==
        'ignore' &&
      action !==
        'reopen'
    ) {
      return json(
        {
          success:
            false,
          code:
            'INVALID_ACTION',
          error:
            'Select a valid incident action.',
        },
        400,
      );
    }

    const result =
      await updatePlatformIncidentState({
        incidentId,
        action,
        adminId:
          session.adminId,
        note:
          typeof body.note ===
            'string'
            ? body.note
            : null,
      });

    if (
      !result
    ) {
      return json(
        {
          success:
            false,
          code:
            'INCIDENT_STATE_CONFLICT',
          error:
            'The incident could not be changed from its current state.',
        },
        409,
      );
    }

    await recordAdminAuditEvent({
      request,
      adminId:
        session.adminId,
      sessionId:
        session.sessionId,
      eventType:
        `platform.incident.${action}`,
      action:
        `incident_${action}`,
      targetType:
        'platform_incident',
      targetId:
        incidentId,
      successful:
        true,
      metadata: {
        resultingStatus:
          result.status,
      },
    });

    return json({
      success:
        true,
      incident:
        result,
    });
  } catch (
    error
  ) {
    if (
      error instanceof
        Error &&
      error.message ===
        'ADMIN_UNAUTHENTICATED'
    ) {
      return json(
        {
          success:
            false,
          code:
            'ADMIN_UNAUTHENTICATED',
          error:
            'Administrator authentication is required.',
        },
        401,
      );
    }

    if (
      error instanceof
        Error &&
      error.message ===
        'ADMIN_FORBIDDEN'
    ) {
      return json(
        {
          success:
            false,
          code:
            'ADMIN_FORBIDDEN',
          error:
            'Your administrator role cannot manage incidents.',
        },
        403,
      );
    }

    console.error(
      '[SaMi Admin] Incident mutation failed:',
      error,
    );

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
          'platform.incident.update_failed',
        action:
          'incident_update',
        targetType:
          'platform_incident',
        targetId:
          incidentId ||
          null,
        successful:
          false,
        failureReason:
          error instanceof
            Error
            ? error.message
            : 'unknown_error',
      });
    }

    return json(
      {
        success:
          false,
        code:
          'INCIDENT_UPDATE_FAILED',
        error:
          'SaMi could not update this incident.',
      },
      500,
    );
  }
}
