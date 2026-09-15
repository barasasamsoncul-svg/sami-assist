import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
} from '@/lib/auth/session';

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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/*
 * Multipart requests contain boundary/header overhead in addition
 * to the actual file. The avatar itself is still strictly limited
 * by MAX_AVATAR_BYTES inside the avatar domain service.
 */
const MAX_REQUEST_BYTES =
  MAX_AVATAR_BYTES + 512 * 1024;

/* ============================================================
   RESPONSE HELPERS
   ============================================================ */

function json(
  body: Record<string, unknown>,
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
      success: false,
      code: 'UNAUTHORIZED',
      error:
        'You must be signed in to manage your profile image.',
    },
    401
  );
}

/* ============================================================
   REQUEST SECURITY
   ============================================================ */

function isSameOriginRequest(
  request: NextRequest
): boolean {
  /*
   * Modern browsers send Sec-Fetch-Site.
   * Reject explicit cross-site mutation attempts.
   */
  const fetchSite =
    request.headers
      .get('sec-fetch-site')
      ?.trim()
      .toLowerCase();

  if (
    fetchSite === 'cross-site'
  ) {
    return false;
  }

  const origin =
    request.headers.get('origin');

  /*
   * Some non-browser/same-origin requests may omit Origin.
   * The session cookie is SameSite=Lax, but when Origin exists
   * we enforce an exact origin match.
   */
  if (!origin) {
    return true;
  }

  try {
    const requestOrigin =
      new URL(request.url).origin;

    return (
      new URL(origin).origin ===
      requestOrigin
    );
  } catch {
    return false;
  }
}

function rejectCrossOrigin(
  request: NextRequest
): NextResponse | null {
  if (
    isSameOriginRequest(request)
  ) {
    return null;
  }

  return json(
    {
      success: false,
      code: 'CROSS_ORIGIN_REQUEST_REJECTED',
      error:
        'This request could not be accepted.',
    },
    403
  );
}

function getContentLength(
  request: NextRequest
): number | null {
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
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    return null;
  }

  return parsed;
}

function isMultipart(
  request: NextRequest
): boolean {
  const contentType =
    request.headers
      .get('content-type')
      ?.toLowerCase() || '';

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
  switch (error.code) {
    case 'INVALID_FILE':
    case 'UNSUPPORTED_IMAGE':
      return json(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        400
      );

    case 'FILE_TOO_LARGE':
      return json(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        413
      );

    case 'INVALID_OWNER':
      /*
       * Owner IDs come from the authenticated session,
       * therefore this should not normally occur.
       */
      return json(
        {
          success: false,
          code: 'INVALID_ACCOUNT',
          error:
            'Your account could not be resolved.',
        },
        400
      );

    case 'ACCOUNT_UNAVAILABLE':
      return json(
        {
          success: false,
          code: error.code,
          error:
            'Your account is not currently available.',
        },
        403
      );

    case 'AVATAR_NOT_FOUND':
      return json(
        {
          success: false,
          code: error.code,
          error:
            'No profile image is currently set.',
        },
        404
      );

    case 'STORAGE_CONFIGURATION_ERROR':
    case 'STORAGE_UNAVAILABLE':
      return json(
        {
          success: false,
          code:
            'AVATAR_SERVICE_UNAVAILABLE',

          error:
            'Profile image service is temporarily unavailable.',
        },
        503,
        {
          'Retry-After': '30',
        }
      );

    default:
      return json(
        {
          success: false,
          code: 'AVATAR_REQUEST_FAILED',
          error:
            'SaMi could not process your profile image.',
        },
        500
      );
  }
}

/* ============================================================
   GET

   GET /api/account/avatar

   Returns the authenticated user's current private avatar.

   The R2 bucket remains private. The browser never receives
   R2 credentials or the internal object key.
   ============================================================ */

export async function GET() {
  try {
    const session =
      await getSession();

    if (!session) {
      return unauthorized();
    }

    /*
     * Check metadata first so a missing avatar produces a clean
     * 404 without making an unnecessary R2 request.
     */
    const record =
      await getAvatarRecord(
        'user',
        session.user.id
      );

    if (!record) {
      return json(
        {
          success: false,
          code: 'AVATAR_NOT_FOUND',
          error:
            'No profile image is currently set.',
        },
        404
      );
    }

    const avatar =
      await getAvatarObject(
        'user',
        session.user.id
      );

    const responseBody =
  avatar.body.buffer.slice(
    avatar.body.byteOffset,
    avatar.body.byteOffset +
      avatar.body.byteLength
  ) as ArrayBuffer;

return new NextResponse(
  responseBody,
  {
    status: 200,

    headers: {
          'Content-Type':
            avatar.mimeType,

          /*
           * This endpoint is authenticated and represents the
           * current avatar, so do not allow shared caches.
           */
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
  } catch (error) {
    if (
      error instanceof
      AvatarError
    ) {
      return avatarErrorResponse(
        error
      );
    }

    console.error(
      '[Account Avatar GET]',
      error
    );

    return json(
      {
        success: false,
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

   POST /api/account/avatar

   multipart/form-data
   field: avatar

   Uploads/replaces the current user's avatar.
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  try {
    /* ========================================================
       CSRF / ORIGIN
       ======================================================== */

    const crossOrigin =
      rejectCrossOrigin(request);

    if (crossOrigin) {
      return crossOrigin;
    }

    /* ========================================================
       SESSION
       ======================================================== */

    const session =
      await getSession();

    if (!session) {
      return unauthorized();
    }

    /* ========================================================
       REQUEST SIZE
       ======================================================== */

    const contentLength =
      getContentLength(request);

    if (
      contentLength !== null &&
      contentLength >
        MAX_REQUEST_BYTES
    ) {
      return json(
        {
          success: false,
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

    if (!isMultipart(request)) {
      return json(
        {
          success: false,
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

    let formData: FormData;

    try {
      formData =
        await request.formData();
    } catch {
      return json(
        {
          success: false,
          code:
            'INVALID_FORM_DATA',

          error:
            'The profile image upload is invalid.',
        },
        400
      );
    }

    /*
     * Only one supported field is accepted.
     *
     * This prevents clients from assuming arbitrary account
     * properties can be changed through the avatar endpoint.
     */
    const allowedFields =
      new Set(['avatar']);

    for (
      const key of
      formData.keys()
    ) {
      if (
        !allowedFields.has(key)
      ) {
        return json(
          {
            success: false,
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
      formData.get('avatar');

    if (
      !(value instanceof File)
    ) {
      return json(
        {
          success: false,
          code:
            'AVATAR_REQUIRED',

          error:
            'Choose a profile image to upload.',
        },
        400
      );
    }

    if (
      value.size <= 0
    ) {
      return json(
        {
          success: false,
          code:
            'INVALID_FILE',

          error:
            'Choose a profile image to upload.',
        },
        400
      );
    }

    /*
     * Reject before allocating the complete Buffer.
     * The domain service validates the size again.
     */
    if (
      value.size >
      MAX_AVATAR_BYTES
    ) {
      return json(
        {
          success: false,
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

       Browser-provided MIME is intentionally NOT trusted.
       lib/account/avatar.ts verifies the actual magic bytes.
       ======================================================== */

    const arrayBuffer =
      await value.arrayBuffer();

    if (
      arrayBuffer.byteLength >
      MAX_AVATAR_BYTES
    ) {
      return json(
        {
          success: false,
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
        'user',
        session.user.id,
        buffer,
        value.name
      );

    /*
     * Never expose:
     * - storageKey
     * - bucket
     * - R2 endpoint
     * - storage credentials
     */

    return json(
      {
        success: true,

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
            '/api/account/avatar',
        },
      },
      200
    );
  } catch (error) {
    if (
      error instanceof
      AvatarError
    ) {
      return avatarErrorResponse(
        error
      );
    }

    console.error(
      '[Account Avatar POST]',
      error
    );

    return json(
      {
        success: false,
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

   DELETE /api/account/avatar

   Removes the current user's avatar.

   Idempotent:
   deleting when no avatar exists still leaves the account in
   the requested state.
   ============================================================ */

export async function DELETE(
  request: NextRequest
) {
  try {
    /* ========================================================
       CSRF / ORIGIN
       ======================================================== */

    const crossOrigin =
      rejectCrossOrigin(request);

    if (crossOrigin) {
      return crossOrigin;
    }

    /* ========================================================
       SESSION
       ======================================================== */

    const session =
      await getSession();

    if (!session) {
      return unauthorized();
    }

    /* ========================================================
       REMOVE
       ======================================================== */

    const existed =
      await removeAvatar(
        'user',
        session.user.id
      );

    return json({
      success: true,

      code:
        'AVATAR_REMOVED',

      message:
        existed
          ? 'Your profile image has been removed.'
          : 'Your profile image is already removed.',

      avatar: null,
    });
  } catch (error) {
    if (
      error instanceof
      AvatarError
    ) {
      return avatarErrorResponse(
        error
      );
    }

    console.error(
      '[Account Avatar DELETE]',
      error
    );

    return json(
      {
        success: false,

        code:
          'AVATAR_REMOVE_FAILED',

        error:
          'SaMi could not remove your profile image.',
      },
      500
    );
  }
}