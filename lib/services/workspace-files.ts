import 'server-only';

import crypto from 'node:crypto';
import type { PoolClient } from 'pg';

import { getSession } from '@/lib/auth/session';
import {
  getPermissionContext,
  permissionContextHas,
  type PermissionContext,
} from '@/lib/auth/permission-context';
import { SAMI_PERMISSIONS } from '@/lib/auth/permission-catalog';
import { requireCompanyAccess } from '@/lib/services/company-access';
import { getTenantPoolByTenantId } from '@/lib/db/tenant';
import {
  createPrivateDownloadUrl,
  createPrivateUploadUrl,
  deletePrivateObject,
  getObjectStorageProviderKey,
  headPrivateObject,
  ObjectStorageError,
} from '@/lib/storage/object-storage';

export const MAX_WORKSPACE_FILE_BYTES = 100 * 1024 * 1024;
export const WORKSPACE_FILE_UPLOAD_TTL_SECONDS = 10 * 60;

const MAX_FILE_NAME_LENGTH = 255;
const DEFAULT_LIST_LIMIT = 40;
const MAX_LIST_LIMIT = 100;

const BLOCKED_EXTENSIONS = new Set([
  'app', 'bat', 'cmd', 'com', 'cpl', 'dll', 'dmg', 'exe', 'hta',
  'jar', 'msi', 'msp', 'ps1', 'psm1', 'scr', 'vbe', 'vbs', 'wsf',
]);

export type WorkspaceFileErrorCode =
  | 'UNAUTHENTICATED'
  | 'WORKSPACE_CONTEXT_CHANGED'
  | 'COMPANY_REQUIRED'
  | 'COMPANY_ACCESS_DENIED'
  | 'FILES_VIEW_REQUIRED'
  | 'FILES_MANAGE_REQUIRED'
  | 'INVALID_FILE_ID'
  | 'INVALID_FILE_NAME'
  | 'INVALID_FILE_SIZE'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'INVALID_MIME_TYPE'
  | 'INVALID_CURSOR'
  | 'FILE_NOT_FOUND'
  | 'UPLOAD_NOT_PENDING'
  | 'UPLOAD_EXPIRED'
  | 'UPLOAD_INCOMPLETE'
  | 'UPLOAD_VALIDATION_FAILED'
  | 'STORAGE_UNAVAILABLE';

export class WorkspaceFileError extends Error {
  readonly code: WorkspaceFileErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: WorkspaceFileErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'WorkspaceFileError';
    this.code = code;
    this.details = details;
  }
}

export type WorkspaceFileAuditContext = {
  userAgent?: string | null;
  correlationId?: string | null;
};

export type WorkspaceFileSummary = {
  id: string;
  name: string;
  mimeType: string;
  extension: string | null;
  sizeBytes: number;
  status: string;
  purpose: string;
  uploadedBy: string | null;
  createdAt: string;
  activatedAt: string | null;
};

type FileRequestContext = {
  permissions: PermissionContext;
  tenantId: string;
  userId: string;
  companyId: string;
};

type FileRow = {
  id: string;
  company_id: string | null;
  name: string;
  file_name: string;
  mime_type: string | null;
  extension: string | null;
  size_bytes: string | number | null;
  storage_key: string;
  storage_provider: string;
  storage_etag: string | null;
  uploaded_by: string | null;
  purpose: string | null;
  status: string;
  upload_expires_at: Date | string | null;
  activated_at: Date | string | null;
  created_at: Date | string;
};

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function requireFileId(value: unknown): string {
  if (!isUuid(value)) {
    throw new WorkspaceFileError('INVALID_FILE_ID', 'Choose a valid file.');
  }
  return value;
}

function isoDate(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeOriginalName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new WorkspaceFileError('INVALID_FILE_NAME', 'Choose a valid file name.');
  }

  const name =
    value
      .normalize('NFKC')
      .replace(/\\/g, '/')
      .split('/')
      .pop()
      ?.replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || '';

  if (!name || name === '.' || name === '..' || name.length > MAX_FILE_NAME_LENGTH) {
    throw new WorkspaceFileError(
      'INVALID_FILE_NAME',
      'File name must be between 1 and 255 characters.',
    );
  }

  return name;
}

function fileExtension(fileName: string): string | null {
  const index = fileName.lastIndexOf('.');
  if (index <= 0 || index === fileName.length - 1) return null;
  const extension = fileName.slice(index + 1).trim().toLowerCase();
  if (!extension || extension.length > 20 || !/^[a-z0-9]+$/.test(extension)) {
    return null;
  }
  return extension;
}

function safeMimeType(value: unknown): string {
  if (typeof value !== 'string') {
    throw new WorkspaceFileError('INVALID_MIME_TYPE', 'File type is invalid.');
  }

  const mimeType = value.split(';', 1)[0].trim().toLowerCase();
  if (
    !mimeType ||
    mimeType.length > 150 ||
    !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+*-]+$/i.test(mimeType)
  ) {
    throw new WorkspaceFileError('INVALID_MIME_TYPE', 'File type is invalid.');
  }

  return mimeType;
}

function safeFileSize(value: unknown): number {
  const size = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new WorkspaceFileError('INVALID_FILE_SIZE', 'File size is invalid.');
  }
  if (size > MAX_WORKSPACE_FILE_BYTES) {
    throw new WorkspaceFileError('FILE_TOO_LARGE', 'Files must be 100 MB or smaller.');
  }
  return size;
}

function safePurpose(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'attachment';
  if (typeof value !== 'string') return 'attachment';
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .slice(0, 100) || 'attachment';
}

function assertSupportedExtension(fileName: string) {
  const extension = fileExtension(fileName);
  if (extension && BLOCKED_EXTENSIONS.has(extension)) {
    throw new WorkspaceFileError(
      'UNSUPPORTED_FILE_TYPE',
      'This executable file type is not accepted by workspace storage.',
    );
  }
}

function assertPermission(context: PermissionContext, mode: 'view' | 'manage') {
  if (context.isOwner) return;

  const canManage = permissionContextHas(context, SAMI_PERMISSIONS.FILES_MANAGE);
  if (mode === 'manage' && !canManage) {
    throw new WorkspaceFileError(
      'FILES_MANAGE_REQUIRED',
      'You do not have permission to manage workspace files.',
    );
  }

  if (
    mode === 'view' &&
    !canManage &&
    !permissionContextHas(context, SAMI_PERMISSIONS.FILES_VIEW)
  ) {
    throw new WorkspaceFileError(
      'FILES_VIEW_REQUIRED',
      'You do not have permission to view workspace files.',
    );
  }
}

async function resolveFileContext(mode: 'view' | 'manage'): Promise<FileRequestContext> {
  const [permissions, session] = await Promise.all([
    getPermissionContext(),
    getSession(),
  ]);

  if (!session) {
    throw new WorkspaceFileError('UNAUTHENTICATED', 'Sign in to access workspace files.');
  }

  if (
    session.id !== permissions.sessionId ||
    session.user.id !== permissions.userId ||
    session.currentTenantId !== permissions.tenantId
  ) {
    throw new WorkspaceFileError(
      'WORKSPACE_CONTEXT_CHANGED',
      'Your selected workspace changed. Please try again.',
    );
  }

  assertPermission(permissions, mode);

  const companyId = session.currentCompanyId;
  if (!companyId) {
    throw new WorkspaceFileError(
      'COMPANY_REQUIRED',
      'Select a company before working with files.',
    );
  }

  try {
    await requireCompanyAccess(permissions.tenantId, permissions.userId, companyId);
  } catch {
    throw new WorkspaceFileError(
      'COMPANY_ACCESS_DENIED',
      'You do not have access to the selected company.',
    );
  }

  return {
    permissions,
    tenantId: permissions.tenantId,
    userId: permissions.userId,
    companyId,
  };
}

function mapFile(row: FileRow): WorkspaceFileSummary {
  return {
    id: String(row.id),
    name: typeof row.name === 'string' ? row.name : row.file_name,
    mimeType:
      typeof row.mime_type === 'string'
        ? row.mime_type
        : 'application/octet-stream',
    extension: typeof row.extension === 'string' ? row.extension : null,
    sizeBytes: Number(row.size_bytes || 0),
    status: String(row.status),
    purpose: typeof row.purpose === 'string' ? row.purpose : 'attachment',
    uploadedBy: typeof row.uploaded_by === 'string' ? row.uploaded_by : null,
    createdAt: isoDate(row.created_at) || new Date(0).toISOString(),
    activatedAt: isoDate(row.activated_at),
  };
}

async function recordAudit(
  client: PoolClient,
  context: FileRequestContext,
  fileId: string,
  action: string,
  result: 'success' | 'failed',
  metadata: Record<string, unknown>,
  audit?: WorkspaceFileAuditContext,
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
          user_agent,
          created_at
        )
        VALUES (
          $1,
          $2,
          'human',
          $3,
          'file',
          $4,
          'core.files',
          $5,
          $6::jsonb,
          $7,
          NOW()
        )
      `,
      [
        context.userId,
        context.companyId,
        action,
        fileId,
        result,
        JSON.stringify({
          correlationId: audit?.correlationId || null,
          ...metadata,
        }),
        audit?.userAgent || null,
      ],
    );
  } catch (error) {
    console.error('[SaMi Files] Audit write failed:', error);
  }
}

function createObjectKey(
  context: FileRequestContext,
  fileId: string,
  extension: string | null,
): string {
  const now = new Date();
  const suffix = extension || 'bin';
  return [
    'workspace-files',
    context.tenantId,
    context.companyId,
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    fileId + '.' + suffix,
  ].join('/');
}

async function loadFileRow(
  context: FileRequestContext,
  fileId: string,
  statuses: readonly string[],
): Promise<FileRow> {
  const pool = await getTenantPoolByTenantId(context.tenantId);
  const result = await pool.query(
    `
      SELECT
        id,
        company_id,
        name,
        file_name,
        mime_type,
        extension,
        size_bytes,
        storage_key,
        storage_provider,
        storage_etag,
        uploaded_by,
        purpose,
        status,
        upload_expires_at,
        activated_at,
        created_at
      FROM files
      WHERE id = $1
        AND company_id = $2
        AND deleted_at IS NULL
        AND status = ANY($3::text[])
      LIMIT 1
    `,
    [fileId, context.companyId, statuses],
  );

  if (result.rows.length === 0) {
    throw new WorkspaceFileError('FILE_NOT_FOUND', 'The file could not be found.');
  }

  return result.rows[0] as FileRow;
}

async function failPendingUpload(
  context: FileRequestContext,
  row: FileRow,
  reason: string,
) {
  let cleanupRequired = false;

  try {
    await deletePrivateObject(row.storage_key);
  } catch {
    cleanupRequired = true;
  }

  const pool = await getTenantPoolByTenantId(context.tenantId);
  await pool.query(
    `
      UPDATE files
      SET
        status = 'failed',
        cleanup_required = $3,
        metadata =
          COALESCE(metadata, '{}'::jsonb) ||
          jsonb_build_object('failureReason', $4::text),
        updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
        AND status = 'pending_upload'
    `,
    [row.id, context.companyId, cleanupRequired, reason],
  );
}

export async function createWorkspaceFileUploadIntent(
  input: {
    fileName: unknown;
    mimeType: unknown;
    sizeBytes: unknown;
    purpose?: unknown;
  },
  audit?: WorkspaceFileAuditContext,
) {
  const context = await resolveFileContext('manage');
  const fileName = safeOriginalName(input.fileName);
  assertSupportedExtension(fileName);

  const mimeType = safeMimeType(input.mimeType);
  const sizeBytes = safeFileSize(input.sizeBytes);
  const purpose = safePurpose(input.purpose);
  const extension = fileExtension(fileName);
  const fileId = crypto.randomUUID();
  const storageKey = createObjectKey(context, fileId, extension);
  const provider = getObjectStorageProviderKey();
  const expiresAt = new Date(Date.now() + WORKSPACE_FILE_UPLOAD_TTL_SECONDS * 1000);

  const pool = await getTenantPoolByTenantId(context.tenantId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

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
          is_public,
          purpose,
          status,
          upload_expires_at,
          cleanup_required,
          scan_status,
          metadata,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $3, $4, $5, $6, $7, $8, $9,
          FALSE, $10, 'pending_upload', $11, FALSE, 'not_scanned',
          '{}'::jsonb, NOW(), NOW()
        )
      `,
      [
        fileId,
        context.companyId,
        fileName,
        mimeType,
        extension,
        sizeBytes,
        storageKey,
        provider,
        context.userId,
        purpose,
        expiresAt,
      ],
    );

    await recordAudit(
      client,
      context,
      fileId,
      'file.upload.requested',
      'success',
      { fileName, mimeType, sizeBytes, purpose },
      audit,
    );

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }

  try {
    const upload = await createPrivateUploadUrl({
      storageKey,
      mimeType,
      expiresInSeconds: WORKSPACE_FILE_UPLOAD_TTL_SECONDS,
    });

    return {
      file: {
        id: fileId,
        name: fileName,
        mimeType,
        extension,
        sizeBytes,
        purpose,
        status: 'pending_upload',
        uploadExpiresAt: expiresAt.toISOString(),
      },
      upload,
    };
  } catch (error) {
    await pool.query(
      `
        UPDATE files
        SET
          status = 'failed',
          metadata =
            COALESCE(metadata, '{}'::jsonb) ||
            '{"failureReason":"presign_failed"}'::jsonb,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND status = 'pending_upload'
      `,
      [fileId, context.companyId],
    );

    if (error instanceof ObjectStorageError) {
      throw new WorkspaceFileError(
        'STORAGE_UNAVAILABLE',
        'Workspace file storage is temporarily unavailable.',
      );
    }

    throw error;
  }
}

export async function completeWorkspaceFileUpload(
  fileId: string,
  audit?: WorkspaceFileAuditContext,
): Promise<WorkspaceFileSummary> {
  const context = await resolveFileContext('manage');
  const id = requireFileId(fileId);
  const row = await loadFileRow(context, id, ['pending_upload']);

  const expiresAt = isoDate(row.upload_expires_at);
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    await failPendingUpload(context, row, 'upload_expired');
    throw new WorkspaceFileError(
      'UPLOAD_EXPIRED',
      'This upload request has expired. Start the upload again.',
    );
  }

  let head;
  try {
    head = await headPrivateObject(row.storage_key);
  } catch (error) {
    if (
      error instanceof ObjectStorageError &&
      error.code === 'STORAGE_OBJECT_NOT_FOUND'
    ) {
      throw new WorkspaceFileError(
        'UPLOAD_INCOMPLETE',
        'The file has not finished uploading yet.',
      );
    }

    if (error instanceof ObjectStorageError) {
      throw new WorkspaceFileError(
        'STORAGE_UNAVAILABLE',
        'Workspace file storage is temporarily unavailable.',
      );
    }

    throw error;
  }

  const expectedSize = Number(row.size_bytes || 0);
  const expectedType = (row.mime_type || '').split(';', 1)[0].trim().toLowerCase();
  const actualType = (head.contentType || '').split(';', 1)[0].trim().toLowerCase();

  if (
    head.sizeBytes !== expectedSize ||
    (expectedType && actualType !== expectedType)
  ) {
    await failPendingUpload(
      context,
      row,
      head.sizeBytes !== expectedSize ? 'size_mismatch' : 'content_type_mismatch',
    );
    throw new WorkspaceFileError(
      'UPLOAD_VALIDATION_FAILED',
      'The uploaded object does not match the requested file.',
    );
  }

  const pool = await getTenantPoolByTenantId(context.tenantId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await client.query(
      `
        UPDATE files
        SET
          status = 'active',
          storage_etag = $3,
          activated_at = NOW(),
          upload_expires_at = NULL,
          cleanup_required = FALSE,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND status = 'pending_upload'
          AND deleted_at IS NULL
        RETURNING
          id, company_id, name, file_name, mime_type, extension, size_bytes,
          storage_key, storage_provider, storage_etag, uploaded_by, purpose,
          status, upload_expires_at, activated_at, created_at
      `,
      [id, context.companyId, head.etag],
    );

    if (result.rows.length !== 1) {
      throw new WorkspaceFileError(
        'UPLOAD_NOT_PENDING',
        'This upload is no longer waiting for completion.',
      );
    }

    await recordAudit(
      client,
      context,
      id,
      'file.upload.completed',
      'success',
      { sizeBytes: expectedSize, mimeType: expectedType },
      audit,
    );

    await client.query('COMMIT');
    return mapFile(result.rows[0] as FileRow);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

function encodeCursor(value: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(value: unknown): { createdAt: string; id: string } | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 500) {
    throw new WorkspaceFileError('INVALID_CURSOR', 'The file list cursor is invalid.');
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      typeof parsed?.createdAt !== 'string' ||
      Number.isNaN(new Date(parsed.createdAt).getTime()) ||
      !isUuid(parsed?.id)
    ) {
      throw new Error('invalid');
    }
    return { createdAt: new Date(parsed.createdAt).toISOString(), id: parsed.id };
  } catch {
    throw new WorkspaceFileError('INVALID_CURSOR', 'The file list cursor is invalid.');
  }
}

function normalizeListLimit(value: unknown): number {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIST_LIMIT);
}

export async function listWorkspaceFiles(
  input: { limit?: unknown; cursor?: unknown } = {},
) {
  const context = await resolveFileContext('view');
  const limit = normalizeListLimit(input.limit);
  const cursor = decodeCursor(input.cursor);
  const pool = await getTenantPoolByTenantId(context.tenantId);

  const result = await pool.query(
    `
      SELECT
        id, company_id, name, file_name, mime_type, extension, size_bytes,
        storage_key, storage_provider, storage_etag, uploaded_by, purpose,
        status, upload_expires_at, activated_at, created_at
      FROM files
      WHERE company_id = $1
        AND status = 'active'
        AND deleted_at IS NULL
        AND (
          $2::timestamptz IS NULL
          OR (created_at, id) < ($2::timestamptz, $3::uuid)
        )
      ORDER BY created_at DESC, id DESC
      LIMIT $4
    `,
    [
      context.companyId,
      cursor?.createdAt || null,
      cursor?.id || null,
      limit + 1,
    ],
  );

  const rows = result.rows as FileRow[];
  const hasMore = rows.length > limit;
  const visible = rows.slice(0, limit);
  const last = visible[visible.length - 1];

  return {
    files: visible.map(mapFile),
    nextCursor:
      hasMore && last
        ? encodeCursor({
            createdAt: isoDate(last.created_at)!,
            id: String(last.id),
          })
        : null,
  };
}

export async function getWorkspaceFile(fileId: string): Promise<WorkspaceFileSummary> {
  const context = await resolveFileContext('view');
  return mapFile(
    await loadFileRow(context, requireFileId(fileId), ['active']),
  );
}

export async function createWorkspaceFileDownload(
  fileId: string,
  audit?: WorkspaceFileAuditContext,
) {
  const context = await resolveFileContext('view');
  const row = await loadFileRow(context, requireFileId(fileId), ['active']);

  try {
    const signed = await createPrivateDownloadUrl({
      storageKey: row.storage_key,
      fileName: row.file_name,
      expiresInSeconds: 120,
    });

    const pool = await getTenantPoolByTenantId(context.tenantId);
    const client = await pool.connect();
    try {
      await recordAudit(
        client,
        context,
        row.id,
        'file.download.authorized',
        'success',
        { fileName: row.file_name },
        audit,
      );
    } finally {
      client.release();
    }

    return signed;
  } catch (error) {
    if (error instanceof ObjectStorageError) {
      throw new WorkspaceFileError(
        'STORAGE_UNAVAILABLE',
        'Workspace file storage is temporarily unavailable.',
      );
    }
    throw error;
  }
}

export async function deleteWorkspaceFile(
  fileId: string,
  audit?: WorkspaceFileAuditContext,
) {
  const context = await resolveFileContext('manage');
  const id = requireFileId(fileId);
  const pool = await getTenantPoolByTenantId(context.tenantId);
  const client = await pool.connect();

  let storageKey: string | null = null;
  let alreadyDeleted = false;

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        SELECT id, storage_key, status
        FROM files
        WHERE id = $1
          AND company_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [id, context.companyId],
    );

    if (result.rows.length === 0) {
      throw new WorkspaceFileError('FILE_NOT_FOUND', 'The file could not be found.');
    }

    const current = result.rows[0] as {
      id: string;
      storage_key: string;
      status: string;
    };

    if (current.status === 'deleted') {
      alreadyDeleted = true;
    } else {
      storageKey = current.storage_key;

      await client.query(
        `
          UPDATE files
          SET
            status = 'deleted',
            deleted_at = COALESCE(deleted_at, NOW()),
            cleanup_required = TRUE,
            upload_expires_at = NULL,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
        `,
        [id, context.companyId],
      );

      await client.query(
        `
          UPDATE file_links
          SET deleted_at = COALESCE(deleted_at, NOW())
          WHERE file_id = $1
            AND deleted_at IS NULL
        `,
        [id],
      );

      await recordAudit(
        client,
        context,
        id,
        'file.deleted',
        'success',
        { cleanupPending: true },
        audit,
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }

  if (alreadyDeleted || !storageKey) {
    return { deleted: true, cleanupPending: false, alreadyDeleted: true };
  }

  let cleanupPending = false;
  try {
    await deletePrivateObject(storageKey);
    await pool.query(
      `
        UPDATE files
        SET cleanup_required = FALSE, updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND status = 'deleted'
      `,
      [id, context.companyId],
    );
  } catch (error) {
    cleanupPending = true;
    console.error('[SaMi Files] Object cleanup deferred:', { fileId: id, error });
  }

  return { deleted: true, cleanupPending, alreadyDeleted: false };
}
