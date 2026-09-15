import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getAdminSession,
} from '@/lib/auth/admin-session';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

import {
  AvatarError,
  getAvatarObject,
  getAvatarRecord,
  MAX_AVATAR_BYTES,
  removeAvatar,
  replaceAvatar,
} from '@/lib/account/avatar';

/* ============================================================
   CONFIG
   ============================================================ */

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

const MAX_REQUEST_BYTES =
  MAX_AVATAR_BYTES +
  512 * 1024;

/* ============================================================
   RESPONSE
   ============================================================ */

function json(
  body: Record<
    string,
    unknown
  >,
  status = 200,
  extraHeaders?: HeadersInit
) {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',

        Pragma:
          'no-cache',

        'X-Content-Type-Options':
          'nosniff',

        'Referrer-Policy':
          'no-referrer',

        ...extraHeaders,
      },
    }
  );
}

function unauthorized() {
  return json(
    {
      success:
        false,

      code:
        'UNAUTHORIZED',

      error:
        'You must be signed in as a platform administrator.',
    },
    401
  );
}

/* ============================================================
   REQUEST SECURITY
   ============================================================ */

function isSameOriginRequest(
  request: NextRequest
) {
  const fetchSite =
    request.headers
      .get(
        'sec-fetch-site'
      )
      ?.trim()
      .toLowerCase();

  if (
    fetchSite ===
    'cross-site'
  ) {
    return false;
  }

  const origin =
    request.headers.get(
      'origin'
    );

  if (!origin) {
    return true;
  }

  try {
    return (
      new URL(
        origin
      ).origin ===
      new URL(
        request.url
      ).origin
    );
  } catch {
    return false;
  }
}

function rejectCrossOrigin(
  request: NextRequest
) {
  if (
    isSameOriginRequest(
      request
    )
  ) {
    return null;
  }

  return json(
    {
      success:
        false,

      code:
        'CROSS_ORIGIN_REQUEST_REJECTED',

      error:
        'This request could not be accepted.',
    },
    403
  );
}

function getContentLength(
  request: NextRequest
) {
  const value =
    request.headers.get(
      'content-length'
    );

  if (!value) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed < 0
  ) {
    return null;
  }

  return parsed;
}

function isMultipart(
  request: NextRequest
) {
  const contentType =
    request.headers
      .get(
        'content-type'
      )
      ?.toLowerCase() ||
    '';

  return contentType.startsWith(
    'multipart/form-data'
  );
}

/* ============================================================
   ERROR MAPPING
   ============================================================ */

function avatarErrorResponse(
  error: AvatarError
) {
  switch (
    error.code
  ) {
    case 'INVALID_FILE':
    case 'UNSUPPORTED_IMAGE':
      return json(
        {
          success:
            false,

          code:
            error.code,

          error:
            error.message,
        },
        400
      );

    case 'FILE_TOO_LARGE':
      return json(
        {
          success:
            false,

          code:
            error.code,

          error:
            error.message,
        },
        413
      );

    case 'INVALID_OWNER':
      return json(
        {
          success:
            false,

          code:
            'INVALID_ADMIN_ACCOUNT',

          error:
            'The administrator account could not be resolved.',
        },
        400
      );

    case 'ACCOUNT_UNAVAILABLE':
      return json(
        {
          success:
            false,

          code:
            error.code,

          error:
            'The administrator account is not currently available.',
        },
        403
      );

    case 'AVATAR_NOT_FOUND':
      return json(
        {
          success:
            false,

          code:
            error.code,

          error:
            'No profile image is currently set.',
        },
        404
      );

    case 'STORAGE_CONFIGURATION_ERROR':
    case 'STORAGE_UNAVAILABLE':
      return json(
        {
          success:
            false,

          code:
            'AVATAR_SERVICE_UNAVAILABLE',

          error:
            'Profile image service is temporarily unavailable.',
        },
        503,
        {
          'Retry-After':
            '30',
        }
      );

    default:
      return json(
        {
          success:
            false,

          code:
            'AVATAR_REQUEST_FAILED',

          error:
            'SaMi could not process the profile image.',
        },
        500
      );
  }
}

/* ============================================================
   AUDIT
   ============================================================ */

async function auditAvatarEvent({
  request,
  adminId,
  sessionId,
  eventType,
  action,
  successful,
  failureReason,
  metadata,
}: {
  request:
    NextRequest;

  adminId:
    string;

  sessionId:
    string;

  eventType:
    string;

  action:
    string;

  successful:
    boolean;

  failureReason?:
    string | null;

  metadata?:
    Record<
      string,
      unknown
    >;
}) {
  await recordAdminAuditEvent({
    request,

    adminId,

    sessionId,

    eventType,

    action,

    targetType:
      'platform_admin',

    targetId:
      adminId,

    successful,

    failureReason:
      failureReason ??
      null,

    metadata,
  });
}

/* ============================================================
   GET

   GET /api/admin/account/avatar
   ============================================================ */

export async function GET() {
  try {
    const session =
      await getAdminSession();

    if (!session) {
      return unauthorized();
    }

    const record =
      await getAvatarRecord(
        'platform_admin',
        session.adminId
      );

    if (!record) {
      return json(
        {
          success:
            false,

          code:
            'AVATAR_NOT_FOUND',

          error:
            'No profile image is currently set.',
        },
        404
      );
    }

    const avatar =
      await getAvatarObject(
        'platform_admin',
        session.adminId
      );

    /*
     * Convert the Node Uint8Array backing data into an explicit
     * ArrayBuffer accepted by NextResponse's BodyInit typing.
     */
    const responseBody =
      avatar.body.buffer.slice(
        avatar.body.byteOffset,
        avatar.body.byteOffset +
          avatar.body.byteLength
      ) as ArrayBuffer;

    return new NextResponse(
      responseBody,
      {
        status:
          200,

        headers: {
          'Content-Type':
            avatar.mimeType,

          'Cache-Control':
            'private, no-cache, must-revalidate',

          ETag:
            `"${avatar.checksumSha256}"`,

          'X-Content-Type-Options':
            'nosniff',

          'Content-Disposition':
            'inline',

          'Referrer-Policy':
            'no-referrer',
        },
      }
    );
  } catch (
    error
  ) {
    if (
      error instanceof
      AvatarError
    ) {
      return avatarErrorResponse(
        error
      );
    }

    console.error(
      '[Admin Account Avatar GET]',
      error
    );

    return json(
      {
        success:
          false,

        code:
          'AVATAR_LOAD_FAILED',

        error:
          'SaMi could not load your profile image.',
      },
      500
    );
  }
}

/* ============================================================
   POST

   POST /api/admin/account/avatar

   multipart/form-data
   avatar=<File>
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  let session:
    Awaited<
      ReturnType<
        typeof getAdminSession
      >
    > =
    null;

  try {
    /* ========================================================
       ORIGIN
       ======================================================== */

    const originFailure =
      rejectCrossOrigin(
        request
      );

    if (
      originFailure
    ) {
      return originFailure;
    }

    /* ========================================================
       SESSION
       ======================================================== */

    session =
      await getAdminSession();

    if (!session) {
      return unauthorized();
    }

    /* ========================================================
       REQUEST SIZE
       ======================================================== */

    const contentLength =
      getContentLength(
        request
      );

    if (
      contentLength !==
        null &&
      contentLength >
        MAX_REQUEST_BYTES
    ) {
      await auditAvatarEvent({
        request,

        adminId:
          session.adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.avatar.update_failed',

        action:
          'update_profile_avatar',

        successful:
          false,

        failureReason:
          'REQUEST_TOO_LARGE',
      });

      return json(
        {
          success:
            false,

          code:
            'REQUEST_TOO_LARGE',

          error:
            'Profile image must be 5 MB or smaller.',
        },
        413
      );
    }

    /* ========================================================
       CONTENT TYPE
       ======================================================== */

    if (
      !isMultipart(
        request
      )
    ) {
      return json(
        {
          success:
            false,

          code:
            'INVALID_CONTENT_TYPE',

          error:
            'Profile image upload must use multipart form data.',
        },
        415
      );
    }

    /* ========================================================
       FORM DATA
       ======================================================== */

    let formData:
      FormData;

    try {
      formData =
        await request.formData();
    } catch {
      return json(
        {
          success:
            false,

          code:
            'INVALID_FORM_DATA',

          error:
            'The profile image upload is invalid.',
        },
        400
      );
    }

    const allowedFields =
      new Set([
        'avatar',
      ]);

    for (
      const key of
      formData.keys()
    ) {
      if (
        !allowedFields.has(
          key
        )
      ) {
        return json(
          {
            success:
              false,

            code:
              'UNSUPPORTED_FIELD',

            error:
              'The profile image request contains an unsupported field.',
          },
          400
        );
      }
    }

    const value =
      formData.get(
        'avatar'
      );

    if (
      !(
        value instanceof
        File
      )
    ) {
      return json(
        {
          success:
            false,

          code:
            'AVATAR_REQUIRED',

          error:
            'Choose a profile image to upload.',
        },
        400
      );
    }

    if (
      value.size <=
      0
    ) {
      return json(
        {
          success:
            false,

          code:
            'INVALID_FILE',

          error:
            'Choose a profile image to upload.',
        },
        400
      );
    }

    if (
      value.size >
      MAX_AVATAR_BYTES
    ) {
      await auditAvatarEvent({
        request,

        adminId:
          session.adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.avatar.update_failed',

        action:
          'update_profile_avatar',

        successful:
          false,

        failureReason:
          'FILE_TOO_LARGE',
      });

      return json(
        {
          success:
            false,

          code:
            'FILE_TOO_LARGE',

          error:
            'Profile image must be 5 MB or smaller.',
        },
        413
      );
    }

    /* ========================================================
       BUFFER
       ======================================================== */

    const arrayBuffer =
      await value.arrayBuffer();

    if (
      arrayBuffer.byteLength >
      MAX_AVATAR_BYTES
    ) {
      return json(
        {
          success:
            false,

          code:
            'FILE_TOO_LARGE',

          error:
            'Profile image must be 5 MB or smaller.',
        },
        413
      );
    }

    const buffer =
      Buffer.from(
        arrayBuffer
      );

    /* ========================================================
       REPLACE
       ======================================================== */

    const avatar =
      await replaceAvatar(
        'platform_admin',
        session.adminId,
        buffer,
        value.name
      );

    await auditAvatarEvent({
      request,

      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      eventType:
        'admin.avatar.updated',

      action:
        'update_profile_avatar',

      successful:
        true,

      metadata: {
        avatarFileId:
          avatar.id,

        mimeType:
          avatar.mimeType,

        sizeBytes:
          avatar.sizeBytes,
      },
    });

    return json({
      success:
        true,

      code:
        'AVATAR_UPDATED',

      message:
        'Your profile image has been updated.',

      avatar: {
        id:
          avatar.id,

        mimeType:
          avatar.mimeType,

        sizeBytes:
          avatar.sizeBytes,

        url:
          '/api/admin/account/avatar',
      },
    });
  } catch (
    error
  ) {
    if (
      session
    ) {
      await auditAvatarEvent({
        request,

        adminId:
          session.adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.avatar.update_failed',

        action:
          'update_profile_avatar',

        successful:
          false,

        failureReason:
          error instanceof
          AvatarError
            ? error.code
            : 'INTERNAL_ERROR',
      });
    }

    if (
      error instanceof
      AvatarError
    ) {
      return avatarErrorResponse(
        error
      );
    }

    console.error(
      '[Admin Account Avatar POST]',
      error
    );

    return json(
      {
        success:
          false,

        code:
          'AVATAR_UPDATE_FAILED',

        error:
          'SaMi could not update your profile image.',
      },
      500
    );
  }
}

/* ============================================================
   DELETE

   DELETE /api/admin/account/avatar
   ============================================================ */

export async function DELETE(
  request: NextRequest
) {
  let session:
    Awaited<
      ReturnType<
        typeof getAdminSession
      >
    > =
    null;

  try {
    /* ========================================================
       ORIGIN
       ======================================================== */

    const originFailure =
      rejectCrossOrigin(
        request
      );

    if (
      originFailure
    ) {
      return originFailure;
    }

    /* ========================================================
       SESSION
       ======================================================== */

    session =
      await getAdminSession();

    if (!session) {
      return unauthorized();
    }

    /* ========================================================
       REMOVE
       ======================================================== */

    const existed =
      await removeAvatar(
        'platform_admin',
        session.adminId
      );

    await auditAvatarEvent({
      request,

      adminId:
        session.adminId,

      sessionId:
        session.sessionId,

      eventType:
        'admin.avatar.removed',

      action:
        'remove_profile_avatar',

      successful:
        true,

      metadata: {
        previouslyExisted:
          existed,
      },
    });

    return json({
      success:
        true,

      code:
        'AVATAR_REMOVED',

      message:
        existed
          ? 'Your profile image has been removed.'
          : 'Your profile image is already removed.',

      avatar:
        null,
    });
  } catch (
    error
  ) {
    if (
      session
    ) {
      await auditAvatarEvent({
        request,

        adminId:
          session.adminId,

        sessionId:
          session.sessionId,

        eventType:
          'admin.avatar.remove_failed',

        action:
          'remove_profile_avatar',

        successful:
          false,

        failureReason:
          error instanceof
          AvatarError
            ? error.code
            : 'INTERNAL_ERROR',
      });
    }

    if (
      error instanceof
      AvatarError
    ) {
      return avatarErrorResponse(
        error
      );
    }

    console.error(
      '[Admin Account Avatar DELETE]',
      error
    );

    return json(
      {
        success:
          false,

        code:
          'AVATAR_REMOVE_FAILED',

        error:
          'SaMi could not remove your profile image.',
      },
      500
    );
  }
}