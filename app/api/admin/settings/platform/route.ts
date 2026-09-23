import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  requireAdminCapability,
} from '@/lib/admin/require-capability';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

import {
  getPlatformSettingsSnapshot,
  listPlatformSettingsHistory,
  PlatformSettingsConflictError,
  PlatformSettingsValidationError,
  updatePlatformSettings,
} from '@/lib/admin/platform-settings';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

const MAX_BODY_BYTES =
  32 *
  1024;


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
          'no-store, no-cache, must-revalidate, private',
        Pragma:
          'no-cache',
        'X-Content-Type-Options':
          'nosniff',
        'Referrer-Policy':
          'no-referrer',
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

  if (!origin) {
    return true;
  }

  try {
    return (
      new URL(
        origin,
      ).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}


export async function GET() {
  try {
    await requireAdminCapability(
      'settings.read',
    );

    const [
      snapshot,
      history,
    ] =
      await Promise.all([
        getPlatformSettingsSnapshot(),
        listPlatformSettingsHistory(
          20,
        ),
      ]);

    return json({
      success:
        true,
      snapshot,
      history,
    });
  } catch (
    error
  ) {
    const code =
      error instanceof Error
        ? error.message
        : '';

    return json(
      {
        success:
          false,
        code:
          code ||
          'PLATFORM_SETTINGS_READ_FAILED',
        error:
          code ===
            'ADMIN_UNAUTHENTICATED'
            ? 'Administrator authentication is required.'
            : code ===
                'ADMIN_FORBIDDEN'
              ? 'Your administrator role cannot view platform settings.'
              : 'SaMi could not load Platform Settings.',
      },
      code ===
        'ADMIN_UNAUTHENTICATED'
        ? 401
        : code ===
            'ADMIN_FORBIDDEN'
          ? 403
          : 500,
    );
  }
}


export async function PATCH(
  request:
    NextRequest,
) {
  let session:
    Awaited<
      ReturnType<
        typeof requireAdminCapability
      >
    > |
    null =
    null;

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
        'settings.manage',
      );

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
            'Platform Settings updates must use JSON.',
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
      MAX_BODY_BYTES
    ) {
      return json(
        {
          success:
            false,
          code:
            'REQUEST_TOO_LARGE',
          error:
            'The Platform Settings request is too large.',
        },
        413,
      );
    }

    let body:
      Record<string, unknown>;

    try {
      const parsed:
        unknown =
        JSON.parse(
          raw,
        );

      if (
        !parsed ||
        typeof parsed !==
          'object' ||
        Array.isArray(
          parsed,
        )
      ) {
        throw new Error(
          'invalid',
        );
      }

      body =
        parsed as
          Record<
            string,
            unknown
          >;
    } catch {
      return json(
        {
          success:
            false,
          code:
            'INVALID_REQUEST',
          error:
            'Invalid Platform Settings request.',
        },
        400,
      );
    }

    const revision =
      Number(
        body.revision,
      );

    if (
      !Number.isInteger(
        revision,
      ) ||
      revision <
        1
    ) {
      return json(
        {
          success:
            false,
          code:
            'INVALID_REVISION',
          error:
            'A valid settings revision is required.',
        },
        400,
      );
    }

    const updated =
      await updatePlatformSettings({
        expectedRevision:
          revision,
        settings:
          body.settings,
        adminId:
          session.adminId,
      });

    await recordAdminAuditEvent({
      request,
      adminId:
        session.adminId,
      sessionId:
        session.sessionId,
      eventType:
        'platform.settings.updated',
      action:
        'platform_settings_update',
      targetType:
        'platform_settings',
      targetId:
        'singleton',
      successful:
        true,
      metadata: {
        revision:
          updated.revision,
        changedKeys:
          'changedKeys' in
            updated
            ? updated.changedKeys
            : [],
      },
    });

    return json({
      success:
        true,
      snapshot:
        updated,
    });
  } catch (
    error
  ) {
    if (
      error instanceof
        PlatformSettingsValidationError
    ) {
      return json(
        {
          success:
            false,
          code:
            'PLATFORM_SETTINGS_INVALID',
          field:
            error.field,
          error:
            error.message,
        },
        400,
      );
    }

    if (
      error instanceof
        PlatformSettingsConflictError
    ) {
      return json(
        {
          success:
            false,
          code:
            'PLATFORM_SETTINGS_CONFLICT',
          error:
            'Platform Settings changed in another administrator session. Reload the latest revision before saving again.',
          snapshot:
            error.current,
        },
        409,
      );
    }

    const code =
      error instanceof Error
        ? error.message
        : '';

    if (session) {
      await recordAdminAuditEvent({
        request,
        adminId:
          session.adminId,
        sessionId:
          session.sessionId,
        eventType:
          'platform.settings.update_failed',
        action:
          'platform_settings_update',
        targetType:
          'platform_settings',
        targetId:
          'singleton',
        successful:
          false,
        failureReason:
          (
            code ||
            'PLATFORM_SETTINGS_UPDATE_FAILED'
          ).slice(
            0,
            255,
          ),
      });
    }

    return json(
      {
        success:
          false,
        code:
          code ||
          'PLATFORM_SETTINGS_UPDATE_FAILED',
        error:
          code ===
            'ADMIN_UNAUTHENTICATED'
            ? 'Administrator authentication is required.'
            : code ===
                'ADMIN_FORBIDDEN'
              ? 'Only authorized platform administrators can change Platform Settings.'
              : 'SaMi could not save Platform Settings.',
      },
      code ===
        'ADMIN_UNAUTHENTICATED'
        ? 401
        : code ===
            'ADMIN_FORBIDDEN'
          ? 403
          : 500,
    );
  }
}
