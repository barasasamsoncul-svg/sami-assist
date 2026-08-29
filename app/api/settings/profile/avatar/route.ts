
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { queryControl, withControlTransaction } from '@/lib/db/control';

type AvatarRequestBody = {
  fileId?: string;
};

/**
 * POST /api/settings/profile/avatar
 *
 * Sets the authenticated user's profile avatar.
 *
 * The actual file must already exist in the Core File Service.
 * This endpoint only attaches an authorized file to the user's profile.
 */
export async function POST(request: NextRequest) {
  try {
    // ---------------------------------------------------------
    // 1. AUTHENTICATION
    // ---------------------------------------------------------
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not authenticated',
        },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // ---------------------------------------------------------
    // 2. PARSE REQUEST
    // ---------------------------------------------------------
    let body: AvatarRequestBody;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON request body',
        },
        { status: 400 }
      );
    }

    const fileId =
      typeof body.fileId === 'string'
        ? body.fileId.trim()
        : '';

    // ---------------------------------------------------------
    // 3. VALIDATE INPUT
    // ---------------------------------------------------------
    if (!fileId) {
      return NextResponse.json(
        {
          success: false,
          error: 'File ID is required',
        },
        { status: 400 }
      );
    }

    if (fileId.length > 255) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid file ID',
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // 4. VERIFY FILE
    // ---------------------------------------------------------
    //
    // The file must:
    // - exist
    // - belong to the authenticated user
    // - be an image
    // - not be deleted
    //
    // Adjust column names to match your actual Core File Service.
    //
    const fileResult = await queryControl(
      `
        SELECT
          id,
          owner_user_id,
          tenant_id,
          mime_type,
          size_bytes,
          status,
          storage_key
        FROM files
        WHERE id = $1
        LIMIT 1
      `,
      [fileId]
    );

    const file = fileResult.rows[0];

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: 'File not found',
        },
        { status: 404 }
      );
    }

    // ---------------------------------------------------------
    // 5. OWNERSHIP CHECK
    // ---------------------------------------------------------
    if (file.owner_user_id !== userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to use this file',
        },
        { status: 403 }
      );
    }

    // ---------------------------------------------------------
    // 6. FILE STATUS CHECK
    // ---------------------------------------------------------
    if (file.status && file.status !== 'active') {
      return NextResponse.json(
        {
          success: false,
          error: 'This file is not available',
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // 7. IMAGE TYPE CHECK
    // ---------------------------------------------------------
    const allowedMimeTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);

    if (!allowedMimeTypes.has(file.mime_type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Only supported image files can be used as avatars',
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // 8. FILE SIZE CHECK
    // ---------------------------------------------------------
    //
    // Avatar maximum: 5 MB.
    //
    const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

    if (
      typeof file.size_bytes === 'number' &&
      file.size_bytes > MAX_AVATAR_SIZE
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Avatar image must be 5 MB or smaller',
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // 9. UPDATE PROFILE + AUDIT IN ONE TRANSACTION
    // ---------------------------------------------------------
    const result = await withControlTransaction(async (client) => {
      // Get previous avatar.
      const previousUserResult = await client.query(
        `
          SELECT avatar_file_id
          FROM users
          WHERE id = $1
          FOR UPDATE
        `,
        [userId]
      );

      const previousAvatarFileId =
        previousUserResult.rows[0]?.avatar_file_id ?? null;

      // Update user's avatar.
      await client.query(
        `
          UPDATE users
          SET
            avatar_file_id = $1,
            updated_at = NOW()
          WHERE id = $2
        `,
        [fileId, userId]
      );

      // Audit event.
      await client.query(
        `
          INSERT INTO audit_logs (
            user_id,
            actor_type,
            action,
            resource_type,
            resource_id,
            module,
            result,
            metadata
          )
          VALUES (
            $1,
            'human',
            'profile_picture_updated',
            'user',
            $1,
            'identity',
            'success',
            $2
          )
        `,
        [
          userId,
          JSON.stringify({
            previous_file_id: previousAvatarFileId,
            new_file_id: fileId,
            file_type: file.mime_type,
          }),
        ]
      );

      return {
        previousAvatarFileId,
      };
    });

    // ---------------------------------------------------------
    // 10. SUCCESS
    // ---------------------------------------------------------
    return NextResponse.json(
      {
        success: true,
        message: 'Profile picture updated',
        avatarFileId: fileId,
        previousAvatarFileId: result.previousAvatarFileId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Set profile avatar error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update profile picture',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settings/profile/avatar
 *
 * Removes the authenticated user's avatar reference.
 *
 * IMPORTANT:
 * This does NOT automatically delete the underlying file.
 * The Core File Service should handle file lifecycle/cleanup.
 */
export async function DELETE(request: NextRequest) {
  try {
    // ---------------------------------------------------------
    // 1. AUTHENTICATION
    // ---------------------------------------------------------
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not authenticated',
        },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // ---------------------------------------------------------
    // 2. TRANSACTION
    // ---------------------------------------------------------
    const previousAvatarFileId = await withControlTransaction(
      async (client) => {
        // Lock user row so simultaneous avatar operations
        // cannot produce inconsistent results.
        const userResult = await client.query(
          `
            SELECT avatar_file_id
            FROM users
            WHERE id = $1
            FOR UPDATE
          `,
          [userId]
        );

        if (userResult.rowCount === 0) {
          throw new Error('USER_NOT_FOUND');
        }

        const previousFileId =
          userResult.rows[0]?.avatar_file_id ?? null;

        // Nothing to remove.
        if (!previousFileId) {
          return null;
        }

        // Remove avatar reference.
        await client.query(
          `
            UPDATE users
            SET
              avatar_file_id = NULL,
              updated_at = NOW()
            WHERE id = $1
          `,
          [userId]
        );

        // Audit removal.
        await client.query(
          `
            INSERT INTO audit_logs (
              user_id,
              actor_type,
              action,
              resource_type,
              resource_id,
              module,
              result,
              metadata
            )
            VALUES (
              $1,
              'human',
              'profile_picture_removed',
              'user',
              $1,
              'identity',
              'success',
              $2
            )
          `,
          [
            userId,
            JSON.stringify({
              previous_file_id: previousFileId,
            }),
          ]
        );

        return previousFileId;
      }
    );

    // ---------------------------------------------------------
    // 3. SUCCESS
    // ---------------------------------------------------------
    return NextResponse.json(
      {
        success: true,
        message: previousAvatarFileId
          ? 'Profile picture removed'
          : 'No profile picture was set',
        removedFileId: previousAvatarFileId,
      },
      { status: 200 }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'USER_NOT_FOUND'
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'User account not found',
        },
        { status: 404 }
      );
    }

    console.error('Remove profile avatar error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to remove profile picture',
      },
      { status: 500 }
    );
  }
}