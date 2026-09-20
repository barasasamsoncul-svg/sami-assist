import 'server-only';

import crypto from 'node:crypto';

import {
  getCompanyPermissionContext,
  assertAllowedCompany,
  assertCompanyPermission,
} from '@/lib/auth/company-permission-guards';
import { SAMI_PERMISSIONS } from '@/lib/auth/permission-catalog';
import { getTenantPoolByTenantId } from '@/lib/db/tenant';
import {
  deletePrivateObject,
  getObjectStorageProviderKey,
  getPrivateObjectBytes,
  ObjectStorageError,
  putPrivateObject,
} from '@/lib/storage/object-storage';
import {
  OrganizationProfileError,
} from '@/lib/services/organization-profile';

const MAX_LOGO_BYTES =
  2 * 1024 * 1024;

const ALLOWED_LOGO_TYPES =
  new Map([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
  ]);

function sanitizeFileName(
  value: string | null | undefined,
  extension: string,
) {
  const base =
    (value || 'organization-logo')
      .normalize('NFKC')
      .replace(/[\\/\u0000-\u001f\u007f]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) ||
    'organization-logo';

  return base
    .replace(/\.[a-z0-9]{1,10}$/i, '') +
    '.' +
    extension;
}

function verifyImageSignature(
  bytes: Buffer,
  mimeType: string,
) {
  const valid =
    mimeType === 'image/png'
      ? (
          bytes.length >= 8 &&
          bytes[0] === 0x89 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x4e &&
          bytes[3] === 0x47 &&
          bytes[4] === 0x0d &&
          bytes[5] === 0x0a &&
          bytes[6] === 0x1a &&
          bytes[7] === 0x0a
        )
      : mimeType === 'image/jpeg'
        ? (
            bytes.length >= 3 &&
            bytes[0] === 0xff &&
            bytes[1] === 0xd8 &&
            bytes[2] === 0xff
          )
        : mimeType === 'image/webp'
          ? (
              bytes.length >= 12 &&
              bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
              bytes.subarray(8, 12).toString('ascii') === 'WEBP'
            )
          : false;

  if (!valid) {
    throw new OrganizationProfileError(
      'INVALID_FIELD',
      'The selected logo does not match its image type.',
    );
  }
}

function organizationLogoUrl(
  companyId: string,
  fileId: string,
) {
  const query =
    new URLSearchParams({
      companyId,
      v: fileId,
    });

  return (
    '/api/workspace/organization/logo?' +
    query.toString()
  );
}

async function writeLogoAudit(
  client: import('pg').PoolClient,
  input: {
    userId: string;
    companyId: string;
    action: string;
    fileId?: string | null;
  },
) {
  try {
    await client.query(
      `
        INSERT INTO audit_logs (
          user_id,
          company_id,
          actor_type,
          action,
          resource_type,
          resource_id,
          module,
          result,
          metadata,
          created_at
        )
        VALUES (
          $1,
          $2,
          'human',
          $3,
          'company',
          $2,
          'organization',
          'success',
          $4::jsonb,
          NOW()
        )
      `,
      [
        input.userId,
        input.companyId,
        input.action,
        JSON.stringify({
          logoFileId:
            input.fileId || null,
        }),
      ],
    );
  } catch (error) {
    console.error(
      '[SaMi Organization] Logo audit write failed; logo mutation will continue:',
      error,
    );
  }
}

export async function uploadCurrentOrganizationLogo(
  input: {
    bytes: Buffer;
    mimeType: string;
    fileName?: string | null;
  },
) {
  const context =
    await getCompanyPermissionContext();

  assertCompanyPermission(
    context,
    SAMI_PERMISSIONS
      .ORGANIZATION_MANAGE,
  );

  const mimeType =
    input.mimeType
      .split(';', 1)[0]
      .trim()
      .toLowerCase();

  const extension =
    ALLOWED_LOGO_TYPES.get(
      mimeType,
    );

  if (!extension) {
    throw new OrganizationProfileError(
      'INVALID_FIELD',
      'Organization logo must be PNG, JPEG, or WebP.',
    );
  }

  if (
    input.bytes.length < 1 ||
    input.bytes.length >
      MAX_LOGO_BYTES
  ) {
    throw new OrganizationProfileError(
      'INVALID_FIELD',
      'Organization logo must be 2 MB or smaller.',
    );
  }

  verifyImageSignature(
    input.bytes,
    mimeType,
  );

  const fileId =
    crypto.randomUUID();

  const fileName =
    sanitizeFileName(
      input.fileName,
      extension,
    );

  const storageKey = [
    'organization-logos',
    context.tenantId,
    context.currentCompanyId,
    fileId + '.' + extension,
  ].join('/');

  try {
    await putPrivateObject({
      storageKey,
      body:
        input.bytes,
      mimeType,
      cacheControl:
        'private, max-age=300',
      metadata: {
        purpose:
          'organization-logo',
        tenantId:
          context.tenantId,
        companyId:
          context.currentCompanyId,
      },
    });
  } catch (error) {
    if (
      error instanceof
        ObjectStorageError
    ) {
      throw new OrganizationProfileError(
        'UPDATE_FAILED',
        'Organization logo storage is temporarily unavailable.',
      );
    }

    throw error;
  }

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const client =
    await pool.connect();

  let previous:
    {
      id: string;
      storage_key: string;
    } | null =
      null;

  try {
    await client.query(
      'BEGIN',
    );

    const current =
      await client.query(
        `
          SELECT
            c.logo_file_id,
            f.storage_key
          FROM companies c
          LEFT JOIN files f
            ON f.id =
               c.logo_file_id
          WHERE c.id = $1
            AND c.is_active = TRUE
            AND c.archived_at IS NULL
          LIMIT 1
          FOR UPDATE OF c
        `,
        [
          context
            .currentCompanyId,
        ],
      );

    if (
      current.rows.length !==
      1
    ) {
      throw new OrganizationProfileError(
        'COMPANY_NOT_FOUND',
        'The current company could not be found.',
      );
    }

    if (
      current.rows[0]
        .logo_file_id &&
      current.rows[0]
        .storage_key
    ) {
      previous = {
        id:
          String(
            current.rows[0]
              .logo_file_id,
          ),
        storage_key:
          String(
            current.rows[0]
              .storage_key,
          ),
      };
    }

    await client.query(
      `
        INSERT INTO files (
          id,
          company_id,
          name,
          file_name,
          mime_type,
          extension,
          size_bytes,
          storage_key,
          storage_provider,
          uploaded_by,
          purpose,
          is_public,
          status,
          activated_at,
          cleanup_required,
          scan_status,
          metadata,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          'organization_logo',
          FALSE,
          'active',
          NOW(),
          FALSE,
          'not_scanned',
          '{}'::jsonb,
          NOW(),
          NOW()
        )
      `,
      [
        fileId,
        context
          .currentCompanyId,
        fileName,
        mimeType,
        extension,
        input.bytes.length,
        storageKey,
        getObjectStorageProviderKey(),
        context.userId,
      ],
    );

    const logoUrl =
      organizationLogoUrl(
        context.currentCompanyId,
        fileId,
      );

    await client.query(
      `
        UPDATE companies
        SET
          logo_file_id = $2,
          logo_url = $3,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        context
          .currentCompanyId,
        fileId,
        logoUrl,
      ],
    );

    if (previous) {
      await client.query(
        `
          UPDATE files
          SET
            status = 'deleted',
            deleted_at =
              COALESCE(
                deleted_at,
                NOW()
              ),
            cleanup_required = TRUE,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
        `,
        [
          previous.id,
          context
            .currentCompanyId,
        ],
      );
    }

    await writeLogoAudit(
      client,
      {
        userId:
          context.userId,
        companyId:
          context.currentCompanyId,
        action:
          'organization.logo.updated',
        fileId,
      },
    );

    await client.query(
      'COMMIT',
    );

    if (previous) {
      try {
        await deletePrivateObject(
          previous.storage_key,
        );

        await pool.query(
          `
            UPDATE files
            SET
              cleanup_required = FALSE,
              updated_at = NOW()
            WHERE id = $1
          `,
          [
            previous.id,
          ],
        );
      } catch (error) {
        console.error(
          '[SaMi Organization] Previous logo cleanup deferred:',
          error,
        );
      }
    }

    return {
      logoUrl,
      fileId,
    };
  } catch (error) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    try {
      await deletePrivateObject(
        storageKey,
      );
    } catch {}

    if (
      error instanceof
        OrganizationProfileError
    ) {
      throw error;
    }

    console.error(
      '[SaMi Organization] Logo update failed:',
      error,
    );

    throw new OrganizationProfileError(
      'UPDATE_FAILED',
      'Organization logo could not be updated.',
    );
  } finally {
    client.release();
  }
}

export async function removeCurrentOrganizationLogo() {
  const context =
    await getCompanyPermissionContext();

  assertCompanyPermission(
    context,
    SAMI_PERMISSIONS
      .ORGANIZATION_MANAGE,
  );

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const client =
    await pool.connect();

  let previous:
    {
      id: string;
      storage_key: string;
    } | null =
      null;

  try {
    await client.query(
      'BEGIN',
    );

    const current =
      await client.query(
        `
          SELECT
            c.logo_file_id,
            f.storage_key
          FROM companies c
          LEFT JOIN files f
            ON f.id =
               c.logo_file_id
          WHERE c.id = $1
          LIMIT 1
          FOR UPDATE OF c
        `,
        [
          context
            .currentCompanyId,
        ],
      );

    if (
      current.rows.length !==
      1
    ) {
      throw new OrganizationProfileError(
        'COMPANY_NOT_FOUND',
        'The current company could not be found.',
      );
    }

    if (
      current.rows[0]
        .logo_file_id &&
      current.rows[0]
        .storage_key
    ) {
      previous = {
        id:
          String(
            current.rows[0]
              .logo_file_id,
          ),
        storage_key:
          String(
            current.rows[0]
              .storage_key,
          ),
      };
    }

    await client.query(
      `
        UPDATE companies
        SET
          logo_file_id = NULL,
          logo_url = NULL,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        context
          .currentCompanyId,
      ],
    );

    if (previous) {
      await client.query(
        `
          UPDATE files
          SET
            status = 'deleted',
            deleted_at =
              COALESCE(
                deleted_at,
                NOW()
              ),
            cleanup_required = TRUE,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
        `,
        [
          previous.id,
          context
            .currentCompanyId,
        ],
      );
    }

    await writeLogoAudit(
      client,
      {
        userId:
          context.userId,
        companyId:
          context.currentCompanyId,
        action:
          'organization.logo.removed',
        fileId:
          previous?.id || null,
      },
    );

    await client.query(
      'COMMIT',
    );
  } catch (error) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    if (
      error instanceof
        OrganizationProfileError
    ) {
      throw error;
    }

    throw new OrganizationProfileError(
      'UPDATE_FAILED',
      'Organization logo could not be removed.',
    );
  } finally {
    client.release();
  }

  if (previous) {
    try {
      await deletePrivateObject(
        previous.storage_key,
      );

      await pool.query(
        `
          UPDATE files
          SET
            cleanup_required = FALSE,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          previous.id,
        ],
      );
    } catch (error) {
      console.error(
        '[SaMi Organization] Removed logo cleanup deferred:',
        error,
      );
    }
  }

  return {
    removed:
      true,
  };
}

export async function getOrganizationLogo(
  requestedCompanyId?:
    string | null,
) {
  const context =
    await getCompanyPermissionContext();

  const companyId =
    requestedCompanyId
      ? requestedCompanyId
          .trim()
      : context
          .currentCompanyId;

  if (
    !/^[0-9a-f-]{36}$/i.test(
      companyId,
    )
  ) {
    throw new OrganizationProfileError(
      'COMPANY_NOT_FOUND',
      'The company could not be found.',
    );
  }

  if (!context.permissionContext.isOwner) {
    assertAllowedCompany(
      context,
      companyId,
    );
  }

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          f.id,
          f.storage_key,
          f.mime_type
        FROM companies c
        INNER JOIN files f
          ON f.id =
             c.logo_file_id
        WHERE c.id = $1
          AND f.company_id = c.id
          AND f.status = 'active'
          AND f.deleted_at IS NULL
        LIMIT 1
      `,
      [
        companyId,
      ],
    );

  if (
    result.rows.length !==
    1
  ) {
    throw new OrganizationProfileError(
      'COMPANY_NOT_FOUND',
      'Organization logo was not found.',
    );
  }

  try {
    return {
      bytes:
        await getPrivateObjectBytes(
          String(
            result.rows[0]
              .storage_key,
          ),
        ),

      mimeType:
        typeof result.rows[0]
          .mime_type ===
          'string'
          ? result.rows[0]
              .mime_type
          : 'application/octet-stream',

      fileId:
        String(
          result.rows[0].id,
        ),
    };
  } catch (error) {
    if (
      error instanceof
        ObjectStorageError
    ) {
      throw new OrganizationProfileError(
        'COMPANY_NOT_FOUND',
        'Organization logo was not found.',
      );
    }

    throw error;
  }
}
