import 'server-only';

import { getTenantPoolByTenantId } from '@/lib/db/tenant';
import { requireCompanyAccess } from '@/lib/services/company-access';

/**
 * Category 14 trusted attachment bridge.
 *
 * This service deliberately has no browser-facing route.
 * The calling module must authorize its own business record first,
 * then may link/unlink a file through these helpers.
 */

export type WorkspaceFileLinkInput = {
  tenantId: string;
  userId: string;
  companyId: string;
  fileId: string;
  moduleKey?: string | null;
  model: string;
  recordId: string;
  purpose?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) {
    throw new Error('Invalid ' + label + ' identifier.');
  }
  return value;
}

function safeKey(value: string | null | undefined, fallback = '') {
  return (value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .slice(0, 150);
}

export async function linkWorkspaceFileForAuthorizedCaller(
  input: WorkspaceFileLinkInput,
) {
  const tenantId = requireUuid(input.tenantId, 'workspace');
  const userId = requireUuid(input.userId, 'user');
  const companyId = requireUuid(input.companyId, 'company');
  const fileId = requireUuid(input.fileId, 'file');
  const recordId = requireUuid(input.recordId, 'record');
  const model = safeKey(input.model);

  if (!model) {
    throw new Error('A model is required to link a workspace file.');
  }

  const moduleKey = safeKey(input.moduleKey || null) || null;
  const purpose = safeKey(input.purpose || null, 'attachment') || 'attachment';

  await requireCompanyAccess(tenantId, userId, companyId);

  const pool = await getTenantPoolByTenantId(tenantId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const file = await client.query(
      `
        SELECT id
        FROM files
        WHERE id = $1
          AND company_id = $2
          AND status = 'active'
          AND deleted_at IS NULL
        LIMIT 1
        FOR SHARE
      `,
      [fileId, companyId],
    );

    if (file.rows.length !== 1) {
      throw new Error('The file is not available in this company.');
    }

    const existing = await client.query(
      `
        SELECT id
        FROM file_links
        WHERE company_id = $1
          AND file_id = $2
          AND model = $3
          AND record_id = $4
          AND purpose = $5
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [companyId, fileId, model, recordId, purpose],
    );

    if (existing.rows.length === 1) {
      await client.query('COMMIT');
      return {
        id: String(existing.rows[0].id),
        created: false,
      };
    }

    const inserted = await client.query(
      `
        INSERT INTO file_links (
          company_id,
          file_id,
          module_key,
          model,
          record_id,
          purpose,
          created_by,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id
      `,
      [companyId, fileId, moduleKey, model, recordId, purpose, userId],
    );

    await client.query('COMMIT');

    return {
      id: String(inserted.rows[0].id),
      created: true,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function unlinkWorkspaceFileForAuthorizedCaller(
  input: WorkspaceFileLinkInput,
) {
  const tenantId = requireUuid(input.tenantId, 'workspace');
  const userId = requireUuid(input.userId, 'user');
  const companyId = requireUuid(input.companyId, 'company');
  const fileId = requireUuid(input.fileId, 'file');
  const recordId = requireUuid(input.recordId, 'record');
  const model = safeKey(input.model);
  const purpose = safeKey(input.purpose || null, 'attachment') || 'attachment';

  await requireCompanyAccess(tenantId, userId, companyId);

  const pool = await getTenantPoolByTenantId(tenantId);
  const result = await pool.query(
    `
      UPDATE file_links
      SET deleted_at = COALESCE(deleted_at, NOW())
      WHERE company_id = $1
        AND file_id = $2
        AND model = $3
        AND record_id = $4
        AND purpose = $5
        AND deleted_at IS NULL
      RETURNING id
    `,
    [companyId, fileId, model, recordId, purpose],
  );

  return {
    removed: result.rows.length > 0,
  };
}

export async function listWorkspaceRecordFilesForAuthorizedCaller(
  input: {
    tenantId: string;
    userId: string;
    companyId: string;
    model: string;
    recordId: string;
  },
) {
  const tenantId = requireUuid(input.tenantId, 'workspace');
  const userId = requireUuid(input.userId, 'user');
  const companyId = requireUuid(input.companyId, 'company');
  const recordId = requireUuid(input.recordId, 'record');
  const model = safeKey(input.model);

  await requireCompanyAccess(tenantId, userId, companyId);

  const pool = await getTenantPoolByTenantId(tenantId);
  const result = await pool.query(
    `
      SELECT
        f.id,
        f.name,
        f.file_name,
        f.mime_type,
        f.extension,
        f.size_bytes,
        f.uploaded_by,
        f.created_at,
        fl.purpose,
        fl.module_key
      FROM file_links fl
      INNER JOIN files f
        ON f.id = fl.file_id
      WHERE fl.company_id = $1
        AND fl.model = $2
        AND fl.record_id = $3
        AND fl.deleted_at IS NULL
        AND f.company_id = $1
        AND f.status = 'active'
        AND f.deleted_at IS NULL
      ORDER BY fl.created_at DESC, fl.id DESC
    `,
    [companyId, model, recordId],
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name || row.file_name),
    mimeType: typeof row.mime_type === 'string' ? row.mime_type : null,
    extension: typeof row.extension === 'string' ? row.extension : null,
    sizeBytes: Number(row.size_bytes || 0),
    uploadedBy: typeof row.uploaded_by === 'string' ? row.uploaded_by : null,
    purpose: typeof row.purpose === 'string' ? row.purpose : 'attachment',
    moduleKey: typeof row.module_key === 'string' ? row.module_key : null,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}
