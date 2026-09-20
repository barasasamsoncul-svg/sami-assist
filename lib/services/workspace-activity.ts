import 'server-only';

import { queryControl } from '@/lib/db/control';
import { getTenantPoolByTenantId } from '@/lib/db/tenant';
import { getSession } from '@/lib/auth/session';
import {
  getPermissionContext,
  permissionContextHas,
  type PermissionContext,
} from '@/lib/auth/permission-context';
import { SAMI_PERMISSIONS } from '@/lib/auth/permission-catalog';
import { requireCompanyAccess } from '@/lib/services/company-access';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 120;
const MAX_JSON_BYTES = 32 * 1024;

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'secret',
  'clientsecret',
  'client_secret',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'sessiontoken',
  'session_token',
  'authorization',
  'cookie',
  'set-cookie',
  'credential',
  'credentials',
  'apikey',
  'api_key',
  'accesskey',
  'access_key',
  'privatekey',
  'private_key',
]);

export type WorkspaceActivityErrorCode =
  | 'UNAUTHENTICATED'
  | 'WORKSPACE_CONTEXT_CHANGED'
  | 'COMPANY_REQUIRED'
  | 'COMPANY_ACCESS_DENIED'
  | 'ACTIVITY_VIEW_REQUIRED'
  | 'AUDIT_VIEW_REQUIRED'
  | 'INVALID_CURSOR'
  | 'INVALID_FILTER'
  | 'INVALID_AUDIT_EVENT';

export class WorkspaceActivityError extends Error {
  readonly code: WorkspaceActivityErrorCode;

  constructor(
    code: WorkspaceActivityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceActivityError';
    this.code = code;
  }
}

type ActivityContext = {
  permissions: PermissionContext;
  tenantId: string;
  userId: string;
  companyId: string;
  canAudit: boolean;
};

type AuditRow = {
  id: string;
  user_id: string | null;
  company_id: string | null;
  actor_type: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  module: string | null;
  result: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  correlation_id: string | null;
  event_type: string | null;
  category?: string | null;
  severity?: string | null;
  summary?: string | null;
  entity_type: string | null;
  entity_id: string | null;
  changes?: Record<string, unknown> | null;
  request_method?: string | null;
  request_path?: string | null;
  created_at: Date | string;
  scope?: 'company' | 'workspace';
};

type ActorProfile = {
  id: string;
  name: string;
  email: string;
};

export type WorkspaceActivityItem = {
  id: string;
  scope: 'company' | 'workspace';
  actor: {
    id: string | null;
    type: string;
    name: string;
    email: string | null;
  };
  action: string;
  eventType: string;
  label: string;
  summary: string | null;
  category: string;
  severity: string;
  module: string | null;
  result: string | null;
  entity: {
    type: string | null;
    id: string | null;
  };
  createdAt: string;
  details?: {
    metadata: Record<string, unknown>;
    changes: Record<string, unknown>;
    ipAddress: string | null;
    userAgent: string | null;
    correlationId: string | null;
    requestMethod: string | null;
    requestPath: string | null;
  };
};

export type RecordWorkspaceAuditEventInput = {
  tenantId: string;
  companyId?: string | null;
  userId?: string | null;
  actorType?: 'human' | 'system' | 'ai' | 'integration';
  action: string;
  eventType?: string | null;
  category?: string | null;
  severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  summary?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  module?: string | null;
  result?: string | null;
  metadata?: Record<string, unknown> | null;
  changes?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  requestMethod?: string | null;
  requestPath?: string | null;
};

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function requireUuid(value: unknown, label: string) {
  if (!isUuid(value)) {
    throw new WorkspaceActivityError(
      'INVALID_AUDIT_EVENT',
      `Invalid ${label} identifier.`,
    );
  }
  return value;
}

function cleanKey(value: unknown, maxLength = 150) {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '_')
    .slice(0, maxLength);
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeSeverity(value: unknown) {
  return value === 'debug' ||
    value === 'warning' ||
    value === 'error' ||
    value === 'critical'
    ? value
    : 'info';
}

function normalizeCategory(value: unknown) {
  return cleanKey(value, 50) || 'activity';
}

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';

  if (Array.isArray(value)) {
    return value.slice(0, 100).map(item =>
      redactValue(item, depth + 1),
    );
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(value).slice(0, 150)) {
      const normalized = key
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '');

      output[key] = SENSITIVE_KEYS.has(normalized)
        ? '[redacted]'
        : redactValue(nested, depth + 1);
    }

    return output;
  }

  return typeof value === 'string'
    ? value.slice(0, 4000)
    : value;
}

function safeJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const redacted = redactValue(value) as Record<string, unknown>;
  const serialized = JSON.stringify(redacted);

  if (Buffer.byteLength(serialized, 'utf8') > MAX_JSON_BYTES) {
    return { truncated: true };
  }

  return redacted;
}

function toIso(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString();
}

function humanizeAction(action: string) {
  const known: Record<string, string> = {
    'organization.logo.updated': 'Organization logo updated',
    'organization.logo.removed': 'Organization logo removed',
    'organization.profile.updated': 'Organization profile updated',
    'file.upload.requested': 'File upload started',
    'file.upload.completed': 'File uploaded',
    'file.download.authorized': 'File downloaded',
    'file.deleted': 'File deleted',
    'communication.message.sent': 'Message sent',
    'communication.announcement.sent': 'Company announcement sent',
    'notifications.preferences.updated': 'Notification preferences updated',
    'workspace.member.suspended': 'Workspace member suspended',
    'workspace.member.reactivated': 'Workspace member reactivated',
    'workspace.member.roles.updated': 'Member roles updated',
    'workspace.member.apps.updated': 'Member app access updated',
    'workspace_app.installed': 'App installed',
    'workspace_app.enabled': 'App enabled',
    'workspace_app.disabled': 'App disabled',
    'workspace_app.uninstalled': 'App uninstalled',
    'invitation.created': 'Invitation created',
    'invitation.sent': 'Invitation sent',
    'invitation.accepted': 'Invitation accepted',
    'login_success': 'Login successful',
    'login_blocked': 'Login blocked',
  };

  const key = action.toLowerCase();

  return (
    known[key] ||
    action
      .split(/[._:-]+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

function extractSummary(row: AuditRow) {
  if (typeof row.summary === 'string' && row.summary.trim()) {
    return row.summary.trim().slice(0, 500);
  }

  const metadata = safeJsonObject(row.metadata);

  for (const key of ['summary', 'message', 'description', 'name', 'fileName']) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim().slice(0, 500);
    }
  }

  return null;
}

function mapActivity(
  row: AuditRow,
  actors: Map<string, ActorProfile>,
  includeDetails: boolean,
): WorkspaceActivityItem {
  const actor = row.user_id ? actors.get(row.user_id) || null : null;
  const action = row.action || row.event_type || 'activity';

  const item: WorkspaceActivityItem = {
    id: String(row.id),
    scope: row.scope || 'company',
    actor: {
      id: row.user_id ? String(row.user_id) : null,
      type: row.actor_type || 'system',
      name:
        actor?.name ||
        (row.actor_type === 'ai'
          ? 'SaMi AI'
          : row.actor_type === 'integration'
            ? 'Integration'
            : row.actor_type === 'human'
              ? 'Workspace user'
              : 'SaMi'),
      email: actor?.email || null,
    },
    action,
    eventType: row.event_type || action,
    label: humanizeAction(action),
    summary: extractSummary(row),
    category: row.category || (row.scope === 'workspace' ? 'administration' : 'activity'),
    severity: normalizeSeverity(row.severity),
    module: row.module,
    result: row.result,
    entity: {
      type: row.entity_type || row.resource_type,
      id: row.entity_id || row.resource_id,
    },
    createdAt: toIso(row.created_at),
  };

  if (includeDetails) {
    item.details = {
      metadata: safeJsonObject(row.metadata),
      changes: safeJsonObject(row.changes),
      ipAddress: row.ip_address ? String(row.ip_address) : null,
      userAgent: row.user_agent ? String(row.user_agent).slice(0, 1000) : null,
      correlationId: row.correlation_id ? String(row.correlation_id) : null,
      requestMethod: row.request_method ? String(row.request_method) : null,
      requestPath: row.request_path ? String(row.request_path).slice(0, 2000) : null,
    };
  }

  return item;
}

function normalizeLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function encodeCursor(value: { createdAt: string; id: string }) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(value: unknown): { createdAt: string; id: string } | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value !== 'string' || value.length > 500) {
    throw new WorkspaceActivityError(
      'INVALID_CURSOR',
      'The activity cursor is invalid.',
    );
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );

    if (
      typeof parsed?.createdAt !== 'string' ||
      Number.isNaN(new Date(parsed.createdAt).getTime()) ||
      !isUuid(parsed?.id)
    ) {
      throw new Error('invalid');
    }

    return {
      createdAt: new Date(parsed.createdAt).toISOString(),
      id: parsed.id,
    };
  } catch {
    throw new WorkspaceActivityError(
      'INVALID_CURSOR',
      'The activity cursor is invalid.',
    );
  }
}

function normalizeDate(value: unknown) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value !== 'string') {
    throw new WorkspaceActivityError(
      'INVALID_FILTER',
      'Activity date filter is invalid.',
    );
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new WorkspaceActivityError(
      'INVALID_FILTER',
      'Activity date filter is invalid.',
    );
  }

  return date.toISOString();
}

async function resolveActivityContext(): Promise<ActivityContext> {
  const [permissions, session] = await Promise.all([
    getPermissionContext(),
    getSession(),
  ]);

  if (!session) {
    throw new WorkspaceActivityError(
      'UNAUTHENTICATED',
      'Sign in to view workspace activity.',
    );
  }

  if (
    session.sessionId !== permissions.sessionId ||
    session.user.id !== permissions.userId ||
    session.currentTenantId !== permissions.tenantId
  ) {
    throw new WorkspaceActivityError(
      'WORKSPACE_CONTEXT_CHANGED',
      'Your selected workspace changed. Please try again.',
    );
  }

  const canAudit =
    permissions.isOwner ||
    permissionContextHas(permissions, SAMI_PERMISSIONS.AUDIT_VIEW);

  const canActivity =
    permissions.isOwner ||
    canAudit ||
    permissionContextHas(permissions, SAMI_PERMISSIONS.WORKSPACE_VIEW);

  if (!canActivity) {
    throw new WorkspaceActivityError(
      'ACTIVITY_VIEW_REQUIRED',
      'You do not have permission to view workspace activity.',
    );
  }

  const companyId = session.currentCompanyId;

  if (!companyId) {
    throw new WorkspaceActivityError(
      'COMPANY_REQUIRED',
      'Select a company before viewing activity.',
    );
  }

  try {
    await requireCompanyAccess(
      permissions.tenantId,
      permissions.userId,
      companyId,
    );
  } catch {
    if (!permissions.isOwner) {
      throw new WorkspaceActivityError(
        'COMPANY_ACCESS_DENIED',
        'You do not have access to the selected company.',
      );
    }
  }

  return {
    permissions,
    tenantId: permissions.tenantId,
    userId: permissions.userId,
    companyId,
    canAudit,
  };
}

async function resolveActors(userIds: string[]) {
  const ids = [...new Set(userIds.filter(isUuid))];
  if (ids.length === 0) return new Map<string, ActorProfile>();

  const result = await queryControl(
    `
      SELECT id, email, first_name, last_name
      FROM users
      WHERE id = ANY($1::uuid[])
    `,
    [ids],
  );

  return new Map<string, ActorProfile>(
    result.rows.map(row => {
      const id = String(row.id);
      const email = String(row.email || '');
      const name =
        [row.first_name, row.last_name].filter(Boolean).join(' ').trim() ||
        email ||
        'Workspace user';

      return [id, { id, email, name }];
    }),
  );
}

async function listTenantRows(
  context: ActivityContext,
  input: {
    limit: number;
    cursor: { createdAt: string; id: string } | null;
    search: string;
    moduleKey: string | null;
    resultFilter: string | null;
    actorUserId: string | null;
    from: string | null;
    to: string | null;
  },
) {
  const pool = await getTenantPoolByTenantId(context.tenantId);

  const result = await pool.query(
    `
      SELECT
        id, user_id, company_id, actor_type, action,
        resource_type, resource_id, module, result,
        metadata, ip_address::text AS ip_address, user_agent,
        correlation_id, event_type, category, severity, summary,
        entity_type, entity_id, changes, request_method,
        request_path, created_at
      FROM audit_logs
      WHERE company_id = $1
        AND ($2::text IS NULL OR module = $2)
        AND ($3::text IS NULL OR result = $3)
        AND ($4::uuid IS NULL OR user_id = $4)
        AND ($5::timestamptz IS NULL OR created_at >= $5)
        AND ($6::timestamptz IS NULL OR created_at <= $6)
        AND (
          $7::text = ''
          OR action ILIKE '%' || $7 || '%'
          OR COALESCE(event_type, '') ILIKE '%' || $7 || '%'
          OR COALESCE(summary, '') ILIKE '%' || $7 || '%'
          OR COALESCE(module, '') ILIKE '%' || $7 || '%'
          OR COALESCE(resource_type, '') ILIKE '%' || $7 || '%'
        )
        AND (
          $8::timestamptz IS NULL
          OR (created_at, id) < ($8::timestamptz, $9::uuid)
        )
      ORDER BY created_at DESC, id DESC
      LIMIT $10
    `,
    [
      context.companyId,
      input.moduleKey,
      input.resultFilter,
      input.actorUserId,
      input.from,
      input.to,
      input.search,
      input.cursor?.createdAt || null,
      input.cursor?.id || null,
      input.limit + 1,
    ],
  );

  return (result.rows as AuditRow[]).map(row => ({
    ...row,
    scope: 'company' as const,
  }));
}

async function listWorkspaceAdminRows(
  context: ActivityContext,
  input: {
    limit: number;
    cursor: { createdAt: string; id: string } | null;
    search: string;
    moduleKey: string | null;
    resultFilter: string | null;
    actorUserId: string | null;
    from: string | null;
    to: string | null;
  },
) {
  if (!context.canAudit) return [] as AuditRow[];

  const result = await queryControl(
    `
      SELECT
        id, user_id, NULL::uuid AS company_id, actor_type, action,
        resource_type, resource_id, module, result,
        metadata, ip_address, user_agent, correlation_id,
        event_type, entity_type, entity_id, created_at
      FROM audit_logs
      WHERE tenant_id = $1
        AND deleted_at IS NULL
        AND (
          action LIKE 'role.%'
          OR action LIKE 'permission.%'
          OR action LIKE 'invitation.%'
          OR action LIKE 'workspace.%'
          OR action LIKE 'workspace_app.%'
          OR UPPER(action) IN ('LOGIN_SUCCESS', 'LOGIN_BLOCKED')
        )
        AND ($2::text IS NULL OR module = $2)
        AND ($3::text IS NULL OR result = $3)
        AND ($4::uuid IS NULL OR user_id = $4)
        AND ($5::timestamptz IS NULL OR created_at >= $5)
        AND ($6::timestamptz IS NULL OR created_at <= $6)
        AND (
          $7::text = ''
          OR action ILIKE '%' || $7 || '%'
          OR COALESCE(event_type, '') ILIKE '%' || $7 || '%'
          OR COALESCE(module, '') ILIKE '%' || $7 || '%'
          OR COALESCE(resource_type, '') ILIKE '%' || $7 || '%'
        )
        AND (
          $8::timestamptz IS NULL
          OR (created_at, id) < ($8::timestamptz, $9::uuid)
        )
      ORDER BY created_at DESC, id DESC
      LIMIT $10
    `,
    [
      context.tenantId,
      input.moduleKey,
      input.resultFilter,
      input.actorUserId,
      input.from,
      input.to,
      input.search,
      input.cursor?.createdAt || null,
      input.cursor?.id || null,
      input.limit + 1,
    ],
  );

  return (result.rows as AuditRow[]).map(row => ({
    ...row,
    scope: 'workspace' as const,
    category:
      String(row.action || '').toUpperCase().startsWith('LOGIN_')
        ? 'security'
        : 'administration',
    severity:
      row.result === 'failed' || row.result === 'denied'
        ? 'warning'
        : 'info',
    changes: {},
    request_method: null,
    request_path: null,
  }));
}

export async function listWorkspaceActivity(
  input: {
    view?: unknown;
    limit?: unknown;
    cursor?: unknown;
    search?: unknown;
    module?: unknown;
    result?: unknown;
    actorUserId?: unknown;
    from?: unknown;
    to?: unknown;
  } = {},
) {
  const context = await resolveActivityContext();
  const view = input.view === 'audit' ? 'audit' : 'activity';

  if (view === 'audit' && !context.canAudit) {
    throw new WorkspaceActivityError(
      'AUDIT_VIEW_REQUIRED',
      'You do not have permission to view audit details.',
    );
  }

  const limit = normalizeLimit(input.limit);
  const cursor = decodeCursor(input.cursor);
  const search =
    typeof input.search === 'string'
      ? input.search.trim().slice(0, MAX_SEARCH_LENGTH)
      : '';
  const moduleKey = cleanKey(input.module, 150) || null;
  const resultFilter = cleanKey(input.result, 30) || null;
  const actorUserId = input.actorUserId
    ? requireUuid(input.actorUserId, 'actor')
    : null;
  const from = normalizeDate(input.from);
  const to = normalizeDate(input.to);

  const queryInput = {
    limit,
    cursor,
    search,
    moduleKey,
    resultFilter,
    actorUserId,
    from,
    to,
  };

  const [tenantRows, adminRows] = await Promise.all([
    listTenantRows(context, queryInput),
    view === 'audit'
      ? listWorkspaceAdminRows(context, queryInput)
      : Promise.resolve([] as AuditRow[]),
  ]);

  const merged = [...tenantRows, ...adminRows]
    .sort((a, b) => {
      const time = new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime();

      if (time !== 0) return time;

      return String(b.id).localeCompare(String(a.id));
    })
    .slice(0, limit + 1);

  const visible = merged.slice(0, limit);
  const actors = await resolveActors(
    visible
      .map(row => row.user_id)
      .filter((id): id is string => Boolean(id)),
  );
  const last = visible[visible.length - 1];

  return {
    view,
    canAudit: context.canAudit,
    items: visible.map(row =>
      mapActivity(row, actors, view === 'audit'),
    ),
    nextCursor:
      merged.length > limit && last
        ? encodeCursor({
            createdAt: toIso(last.created_at),
            id: String(last.id),
          })
        : null,
  };
}

export async function getWorkspaceActivitySummary() {
  const context = await resolveActivityContext();
  const pool = await getTenantPoolByTenantId(context.tenantId);

  const result = await pool.query(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE created_at >= date_trunc('day', NOW())
        )::int AS today_count,

        COUNT(*) FILTER (
          WHERE created_at >= NOW() - INTERVAL '7 days'
            AND result IN ('failed', 'denied')
        )::int AS failed_7d,

        COUNT(DISTINCT user_id) FILTER (
          WHERE created_at >= NOW() - INTERVAL '7 days'
            AND user_id IS NOT NULL
        )::int AS actors_7d,

        COUNT(DISTINCT module) FILTER (
          WHERE created_at >= NOW() - INTERVAL '7 days'
            AND module IS NOT NULL
        )::int AS modules_7d

      FROM audit_logs
      WHERE company_id = $1
    `,
    [context.companyId],
  );

  return {
    canAudit: context.canAudit,
    todayCount: Number(result.rows[0]?.today_count || 0),
    failed7d: Number(result.rows[0]?.failed_7d || 0),
    actors7d: Number(result.rows[0]?.actors_7d || 0),
    modules7d: Number(result.rows[0]?.modules_7d || 0),
  };
}

/**
 * Canonical Category 16 tenant audit writer.
 * Server-only. Browser clients never write audit rows.
 * Metadata and change payloads are redacted before persistence.
 */
export async function recordWorkspaceAuditEvent(
  input: RecordWorkspaceAuditEventInput,
) {
  const tenantId = requireUuid(input.tenantId, 'workspace');
  const companyId = input.companyId
    ? requireUuid(input.companyId, 'company')
    : null;
  const userId = input.userId
    ? requireUuid(input.userId, 'user')
    : null;

  const action = cleanKey(input.action, 150);

  if (!action) {
    throw new WorkspaceActivityError(
      'INVALID_AUDIT_EVENT',
      'Audit action is required.',
    );
  }

  const eventType =
    cleanKey(input.eventType || action, 150) || action;
  const resourceType = cleanKey(input.resourceType, 150) || null;
  const resourceId = input.resourceId
    ? requireUuid(input.resourceId, 'resource')
    : null;
  const entityType =
    cleanKey(input.entityType || resourceType, 150) || null;
  const entityId = input.entityId
    ? requireUuid(input.entityId, 'entity')
    : resourceId;

  const pool = await getTenantPoolByTenantId(tenantId);

  const result = await pool.query(
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
        ip_address,
        user_agent,
        correlation_id,
        event_type,
        category,
        severity,
        summary,
        entity_type,
        entity_id,
        changes,
        request_method,
        request_path,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9::jsonb, $10::inet, $11, $12, $13, $14,
        $15, $16, $17, $18, $19::jsonb, $20, $21, NOW()
      )
      RETURNING id
    `,
    [
      userId,
      companyId,
      input.actorType || (userId ? 'human' : 'system'),
      action,
      resourceType,
      resourceId,
      cleanKey(input.module, 150) || null,
      cleanKey(input.result, 30) || null,
      JSON.stringify(safeJsonObject(input.metadata)),
      typeof input.ipAddress === 'string'
        ? input.ipAddress.trim().slice(0, 64) || null
        : null,
      cleanText(input.userAgent, 2000) || null,
      isUuid(input.correlationId) ? input.correlationId : null,
      eventType,
      normalizeCategory(input.category),
      normalizeSeverity(input.severity),
      cleanText(input.summary, 500) || null,
      entityType,
      entityId,
      JSON.stringify(safeJsonObject(input.changes)),
      cleanText(input.requestMethod, 10).toUpperCase() || null,
      cleanText(input.requestPath, 2000) || null,
    ],
  );

  return { id: String(result.rows[0].id) };
}
