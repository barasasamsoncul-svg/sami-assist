import 'server-only';

import type { Pool } from 'pg';

import { queryControl } from '@/lib/db/control';
import { getTenantPoolByTenantId } from '@/lib/db/tenant';
import { getSession } from '@/lib/auth/session';
import {
  getPermissionContext,
  type PermissionContext,
} from '@/lib/auth/permission-context';
import { requireCompanyAccess } from '@/lib/services/company-access';
import { getWorkspaceSubscriptionAccessState } from '@/lib/billing/access';
import { sendWorkspaceNotificationEmail } from '@/lib/services/email';
import { sendWorkspaceNotificationSms } from '@/lib/services/sms';
import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_METADATA_BYTES = 16 * 1024;

export type WorkspaceNotificationErrorCode =
  | 'UNAUTHENTICATED'
  | 'WORKSPACE_CONTEXT_CHANGED'
  | 'WORKSPACE_SUSPENDED'
  | 'COMPANY_REQUIRED'
  | 'COMPANY_ACCESS_DENIED'
  | 'NOTIFICATIONS_MANAGE_REQUIRED'
  | 'INVALID_NOTIFICATION_ID'
  | 'INVALID_CURSOR'
  | 'INVALID_NOTIFICATION_INPUT'
  | 'NOTIFICATION_NOT_FOUND';

export class WorkspaceNotificationError extends Error {
  readonly code: WorkspaceNotificationErrorCode;

  constructor(
    code: WorkspaceNotificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceNotificationError';
    this.code = code;
  }
}

type NotificationContext = {
  permissions: PermissionContext;
  tenantId: string;
  userId: string;
  companyId: string;
};

type NotificationRow = {
  id: string;
  company_id: string | null;
  user_id: string;
  type: string;
  event_key: string | null;
  priority: string;
  title: string;
  message: string | null;
  link: string | null;
  source_module: string | null;
  source_model: string | null;
  source_record_id: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  read_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type WorkspaceNotification = {
  id: string;
  type: string;
  eventKey: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  title: string;
  message: string | null;
  href: string | null;
  sourceModule: string | null;
  sourceModel: string | null;
  sourceRecordId: string | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceNotificationPreferences = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  smsEnabled: boolean;
  muteUntil: string | null;
};

export type CreateWorkspaceNotificationInput = {
  tenantId: string;
  recipientUserId: string;
  companyId?: string | null;
  type: string;
  eventKey?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  title: string;
  message?: string | null;
  href?: string | null;
  sourceModule?: string | null;
  sourceModel?: string | null;
  sourceRecordId?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
  expiresAt?: Date | string | null;
  forceSms?: boolean;
  critical?: boolean;
};

function requireUuid(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== 'string' ||
    !UUID_RE.test(value)
  ) {
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      `Invalid ${label} identifier.`,
    );
  }

  return value;
}

function requireNotificationId(
  value: unknown,
): string {
  if (
    typeof value !== 'string' ||
    !UUID_RE.test(value)
  ) {
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_ID',
      'Choose a valid notification.',
    );
  }

  return value;
}

function normalizeKey(
  value: unknown,
  maxLength = 150,
): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '_')
    .slice(0, maxLength);
}

function normalizeText(
  value: unknown,
  maxLength: number,
): string {
  return typeof value === 'string'
    ? value
        .trim()
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, maxLength)
    : '';
}

function normalizePriority(
  value: unknown,
): WorkspaceNotification['priority'] {
  return value === 'low' ||
    value === 'high' ||
    value === 'urgent'
    ? value
    : 'normal';
}

function normalizeInternalHref(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const href = value.trim();

  if (
    !href ||
    !href.startsWith('/') ||
    href.startsWith('//') ||
    href.length > 2000
  ) {
    return null;
  }

  return href;
}

function normalizeMetadata(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  const serialized =
    JSON.stringify(value);

  if (
    Buffer.byteLength(
      serialized,
      'utf8',
    ) > MAX_METADATA_BYTES
  ) {
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      'Notification metadata is too large.',
    );
  }

  return value as Record<string, unknown>;
}

function toIso(
  value: Date | string | null,
): string | null {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}

function mapNotification(
  row: NotificationRow,
): WorkspaceNotification {
  return {
    id: String(row.id),
    type: row.type,
    eventKey: row.event_key,
    priority: normalizePriority(row.priority),
    title: row.title,
    message: row.message,
    href: normalizeInternalHref(row.link),
    sourceModule: row.source_module,
    sourceModel: row.source_model,
    sourceRecordId: row.source_record_id,
    metadata: row.metadata || {},
    isRead: row.is_read === true,
    readAt: toIso(row.read_at),
    createdAt:
      toIso(row.created_at) ||
      new Date(0).toISOString(),
    updatedAt:
      toIso(row.updated_at) ||
      toIso(row.created_at) ||
      new Date(0).toISOString(),
  };
}

export async function getWorkspaceNotificationContext():
  Promise<NotificationContext> {
  const [
    permissions,
    session,
  ] =
    await Promise.all([
      getPermissionContext(),
      getSession(),
    ]);

  if (!session) {
    throw new WorkspaceNotificationError(
      'UNAUTHENTICATED',
      'Sign in to access workspace notifications.',
    );
  }

  if (
    session.sessionId !== permissions.sessionId ||
    session.user.id !== permissions.userId ||
    session.currentTenantId !== permissions.tenantId
  ) {
    throw new WorkspaceNotificationError(
      'WORKSPACE_CONTEXT_CHANGED',
      'Your selected workspace changed. Please try again.',
    );
  }

  const subscriptionAccess =
    await getWorkspaceSubscriptionAccessState(
      permissions.tenantId,
    );

  if (
    subscriptionAccess.pastDue
  ) {
    throw new WorkspaceNotificationError(
      'WORKSPACE_SUSPENDED',
      'This workspace is temporarily locked until the subscription payment is restored.',
    );
  }

  const companyId =
    session.currentCompanyId;

  if (!companyId) {
    throw new WorkspaceNotificationError(
      'COMPANY_REQUIRED',
      'Select a company before opening notifications.',
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
      throw new WorkspaceNotificationError(
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
  };
}

function normalizeLimit(
  value: unknown,
): number {
  const parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < 1
  ) {
    return DEFAULT_LIMIT;
  }

  return Math.min(
    Math.floor(parsed),
    MAX_LIMIT,
  );
}

function encodeCursor(
  value: {
    createdAt: string;
    id: string;
  },
): string {
  return Buffer
    .from(
      JSON.stringify(value),
      'utf8',
    )
    .toString('base64url');
}

function decodeCursor(
  value: unknown,
): {
  createdAt: string;
  id: string;
} | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  if (
    typeof value !== 'string' ||
    value.length > 500
  ) {
    throw new WorkspaceNotificationError(
      'INVALID_CURSOR',
      'The notification cursor is invalid.',
    );
  }

  try {
    const parsed =
      JSON.parse(
        Buffer
          .from(
            value,
            'base64url',
          )
          .toString('utf8'),
      );

    if (
      typeof parsed?.createdAt !== 'string' ||
      Number.isNaN(
        new Date(
          parsed.createdAt,
        ).getTime(),
      ) ||
      typeof parsed?.id !== 'string' ||
      !UUID_RE.test(parsed.id)
    ) {
      throw new Error('invalid');
    }

    return {
      createdAt:
        new Date(
          parsed.createdAt,
        ).toISOString(),
      id: parsed.id,
    };
  } catch {
    throw new WorkspaceNotificationError(
      'INVALID_CURSOR',
      'The notification cursor is invalid.',
    );
  }
}

async function loadPreferences(
  pool: Pool,
  companyId: string,
  userId: string,
  eventKey: string,
): Promise<WorkspaceNotificationPreferences> {
  const result =
    await pool.query(
      `
        SELECT
          in_app_enabled,
          email_enabled,
          push_enabled,
          sms_enabled,
          mute_until
        FROM notification_preferences
        WHERE company_id = $1
          AND user_id = $2
          AND event_key IN ($3, '*')
        ORDER BY
          CASE
            WHEN event_key = $3
            THEN 0
            ELSE 1
          END
        LIMIT 1
      `,
      [
        companyId,
        userId,
        eventKey,
      ],
    );

  const row =
    result.rows[0];

  return {
    inAppEnabled:
      row?.in_app_enabled !== false,
    emailEnabled:
      row?.email_enabled === true,
    pushEnabled:
      row?.push_enabled === true,
    smsEnabled:
      row?.sms_enabled === true,
    muteUntil:
      toIso(
        row?.mute_until || null,
      ),
  };
}

async function resolveRecipient(
  tenantId: string,
  recipientUserId: string,
  companyId: string | null,
) {
  const result =
    await queryControl(
      `
        SELECT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.phone,
          tu.is_owner
        FROM tenant_users tu
        INNER JOIN users u
          ON u.id = tu.user_id
        WHERE tu.tenant_id = $1
          AND tu.user_id = $2
          AND tu.deleted_at IS NULL
          AND u.deleted_at IS NULL
          AND LOWER(
            COALESCE(
              tu.status,
              ''
            )
          ) = 'active'
          AND LOWER(
            COALESCE(
              tu.member_type,
              ''
            )
          ) = 'internal'
        LIMIT 1
      `,
      [
        tenantId,
        recipientUserId,
      ],
    );

  if (
    result.rows.length !== 1
  ) {
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      'Notification recipient is not an active workspace member.',
    );
  }

  const recipient =
    result.rows[0] as {
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      is_owner: boolean;
    };

  if (
    companyId &&
    recipient.is_owner !== true
  ) {
    await requireCompanyAccess(
      tenantId,
      recipientUserId,
      companyId,
    );
  }

  return recipient;
}

export async function listWorkspaceNotifications(
  input: {
    limit?: unknown;
    cursor?: unknown;
    unreadOnly?: unknown;
  } = {},
) {
  const context =
    await getWorkspaceNotificationContext();

  const limit =
    normalizeLimit(input.limit);

  const cursor =
    decodeCursor(input.cursor);

  const unreadOnly =
    input.unreadOnly === true ||
    input.unreadOnly === 'true' ||
    input.unreadOnly === '1';

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          id,
          company_id,
          user_id,
          type,
          event_key,
          priority,
          title,
          message,
          link,
          source_module,
          source_model,
          source_record_id,
          metadata,
          is_read,
          read_at,
          created_at,
          updated_at
        FROM notifications
        WHERE user_id = $1
          AND (
            company_id = $2
            OR company_id IS NULL
          )
          AND in_app_visible = TRUE
          AND archived_at IS NULL
          AND (
            expires_at IS NULL
            OR expires_at > NOW()
          )
          AND (
            $3::boolean = FALSE
            OR is_read = FALSE
          )
          AND (
            $4::timestamptz IS NULL
            OR (created_at, id) <
               ($4::timestamptz, $5::uuid)
          )
        ORDER BY
          created_at DESC,
          id DESC
        LIMIT $6
      `,
      [
        context.userId,
        context.companyId,
        unreadOnly,
        cursor?.createdAt || null,
        cursor?.id || null,
        limit + 1,
      ],
    );

  const rows =
    result.rows as NotificationRow[];

  const visible =
    rows.slice(0, limit);

  const last =
    visible[
      visible.length - 1
    ];

  return {
    notifications:
      visible.map(
        mapNotification,
      ),
    nextCursor:
      rows.length > limit &&
      last
        ? encodeCursor({
            createdAt:
              toIso(
                last.created_at,
              )!,
            id: String(last.id),
          })
        : null,
  };
}

export async function getWorkspaceNotificationSummary() {
  const context =
    await getWorkspaceNotificationContext();

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE is_read = FALSE
          )::int AS unread_count,
          COUNT(*)::int AS total_count
        FROM notifications
        WHERE user_id = $1
          AND (
            company_id = $2
            OR company_id IS NULL
          )
          AND in_app_visible = TRUE
          AND archived_at IS NULL
          AND (
            expires_at IS NULL
            OR expires_at > NOW()
          )
      `,
      [
        context.userId,
        context.companyId,
      ],
    );

  return {
    unreadCount:
      Number(
        result.rows[0]
          ?.unread_count ||
        0,
      ),
    totalCount:
      Number(
        result.rows[0]
          ?.total_count ||
        0,
      ),
  };
}

export async function getWorkspaceNotificationPreferences() {
  const context =
    await getWorkspaceNotificationContext();

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  return loadPreferences(
    pool,
    context.companyId,
    context.userId,
    '*',
  );
}

export async function updateWorkspaceNotificationPreferences(
  patch: {
    inAppEnabled?: unknown;
    emailEnabled?: unknown;
    smsEnabled?: unknown;
    muteUntil?: unknown;
  },
): Promise<WorkspaceNotificationPreferences> {
  const context =
    await getWorkspaceNotificationContext();

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const current =
    await loadPreferences(
      pool,
      context.companyId,
      context.userId,
      '*',
    );

  const inAppEnabled =
    typeof patch.inAppEnabled === 'boolean'
      ? patch.inAppEnabled
      : current.inAppEnabled;

  const emailEnabled =
    typeof patch.emailEnabled === 'boolean'
      ? patch.emailEnabled
      : current.emailEnabled;

  const smsEnabled =
    typeof patch.smsEnabled === 'boolean'
      ? patch.smsEnabled
      : current.smsEnabled;

  let muteUntil =
    current.muteUntil;

  if (
    patch.muteUntil === null ||
    patch.muteUntil === ''
  ) {
    muteUntil = null;
  } else if (
    typeof patch.muteUntil === 'string'
  ) {
    const date =
      new Date(
        patch.muteUntil,
      );

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      throw new WorkspaceNotificationError(
        'INVALID_NOTIFICATION_INPUT',
        'Mute-until date is invalid.',
      );
    }

    muteUntil =
      date.toISOString();
  }

  const result =
    await pool.query(
      `
        INSERT INTO notification_preferences (
          company_id,
          user_id,
          event_key,
          in_app_enabled,
          email_enabled,
          push_enabled,
          sms_enabled,
          mute_until,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          '*',
          $3,
          $4,
          FALSE,
          $5,
          $6,
          NOW(),
          NOW()
        )
        ON CONFLICT (
          company_id,
          user_id,
          event_key
        )
        DO UPDATE SET
          in_app_enabled =
            EXCLUDED.in_app_enabled,
          email_enabled =
            EXCLUDED.email_enabled,
          sms_enabled =
            EXCLUDED.sms_enabled,
          mute_until =
            EXCLUDED.mute_until,
          updated_at =
            NOW()
        RETURNING
          in_app_enabled,
          email_enabled,
          push_enabled,
          sms_enabled,
          mute_until
      `,
      [
        context.companyId,
        context.userId,
        inAppEnabled,
        emailEnabled,
        smsEnabled,
        muteUntil,
      ],
    );

  const row =
    result.rows[0];

  const updatedPreferences = {
    inAppEnabled:
      row.in_app_enabled === true,
    emailEnabled:
      row.email_enabled === true,
    pushEnabled:
      row.push_enabled === true,
    smsEnabled:
      row.sms_enabled === true,
    muteUntil:
      toIso(
        row.mute_until || null,
      ),
  };

  try {
    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      actorType:
        'human',
      action:
        'notifications.preferences.updated',
      eventType:
        'notifications.preferences.updated',
      category:
        'preferences',
      severity:
        'info',
      summary:
        'Notification preferences updated.',
      resourceType:
        'notification_preferences',
      module:
        'core.notifications',
      result:
        'success',
      changes: {
        inAppEnabled: {
          from:
            current.inAppEnabled,
          to:
            updatedPreferences.inAppEnabled,
        },
        emailEnabled: {
          from:
            current.emailEnabled,
          to:
            updatedPreferences.emailEnabled,
        },
        smsEnabled: {
          from:
            current.smsEnabled,
          to:
            updatedPreferences.smsEnabled,
        },
        muteUntil: {
          from:
            current.muteUntil,
          to:
            updatedPreferences.muteUntil,
        },
      },
    });
  } catch (error) {
    console.error(
      '[SaMi Notifications] Activity recording failed:',
      error,
    );
  }

  return updatedPreferences;
}

export async function setWorkspaceNotificationReadState(
  notificationId: string,
  isRead: boolean,
): Promise<WorkspaceNotification> {
  const context =
    await getWorkspaceNotificationContext();

  const id =
    requireNotificationId(
      notificationId,
    );

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const result =
    await pool.query(
      `
        UPDATE notifications
        SET
          is_read = $4,
          read_at =
            CASE
              WHEN $4::boolean
              THEN COALESCE(
                read_at,
                NOW()
              )
              ELSE NULL
            END,
          updated_at =
            NOW()
        WHERE id = $1
          AND user_id = $2
          AND (
            company_id = $3
            OR company_id IS NULL
          )
          AND archived_at IS NULL
        RETURNING
          id,
          company_id,
          user_id,
          type,
          event_key,
          priority,
          title,
          message,
          link,
          source_module,
          source_model,
          source_record_id,
          metadata,
          is_read,
          read_at,
          created_at,
          updated_at
      `,
      [
        id,
        context.userId,
        context.companyId,
        isRead,
      ],
    );

  if (
    result.rows.length !== 1
  ) {
    throw new WorkspaceNotificationError(
      'NOTIFICATION_NOT_FOUND',
      'The notification could not be found.',
    );
  }

  return mapNotification(
    result.rows[0] as NotificationRow,
  );
}

export async function markAllWorkspaceNotificationsRead() {
  const context =
    await getWorkspaceNotificationContext();

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const result =
    await pool.query(
      `
        UPDATE notifications
        SET
          is_read = TRUE,
          read_at =
            COALESCE(
              read_at,
              NOW()
            ),
          updated_at =
            NOW()
        WHERE user_id = $1
          AND (
            company_id = $2
            OR company_id IS NULL
          )
          AND in_app_visible = TRUE
          AND is_read = FALSE
          AND archived_at IS NULL
          AND (
            expires_at IS NULL
            OR expires_at > NOW()
          )
      `,
      [
        context.userId,
        context.companyId,
      ],
    );

  return {
    updated:
      result.rowCount || 0,
  };
}

export async function archiveWorkspaceNotification(
  notificationId: string,
) {
  const context =
    await getWorkspaceNotificationContext();

  const id =
    requireNotificationId(
      notificationId,
    );

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const result =
    await pool.query(
      `
        UPDATE notifications
        SET
          archived_at =
            COALESCE(
              archived_at,
              NOW()
            ),
          updated_at =
            NOW()
        WHERE id = $1
          AND user_id = $2
          AND (
            company_id = $3
            OR company_id IS NULL
          )
        RETURNING id
      `,
      [
        id,
        context.userId,
        context.companyId,
      ],
    );

  if (
    result.rows.length !== 1
  ) {
    throw new WorkspaceNotificationError(
      'NOTIFICATION_NOT_FOUND',
      'The notification could not be found.',
    );
  }

  return {
    archived: true,
  };
}

/**
 * Trusted server-side notification emitter.
 *
 * Browser routes intentionally do not expose notification creation.
 * Modules and SaMi core services call this only after their own
 * business authorization succeeds.
 */
export async function createWorkspaceNotification(
  input: CreateWorkspaceNotificationInput,
): Promise<WorkspaceNotification> {
  const tenantId =
    requireUuid(
      input.tenantId,
      'workspace',
    );

  const recipientUserId =
    requireUuid(
      input.recipientUserId,
      'recipient',
    );

  const companyId =
    input.companyId
      ? requireUuid(
          input.companyId,
          'company',
        )
      : null;

  const type =
    normalizeKey(
      input.type,
      100,
    );

  const eventKey =
    normalizeKey(
      input.eventKey ||
      input.type,
      150,
    );

  const title =
    normalizeText(
      input.title,
      255,
    );

  const message =
    normalizeText(
      input.message,
      5000,
    ) || null;

  const href =
    normalizeInternalHref(
      input.href,
    );

  const sourceModule =
    normalizeKey(
      input.sourceModule,
      150,
    ) || null;

  const sourceModel =
    normalizeKey(
      input.sourceModel,
      150,
    ) || null;

  const sourceRecordId =
    input.sourceRecordId
      ? requireUuid(
          input.sourceRecordId,
          'source record',
        )
      : null;

  const dedupeKey =
    normalizeKey(
      input.dedupeKey,
      255,
    ) || null;

  const priority =
    normalizePriority(
      input.priority,
    );

  const metadata =
    normalizeMetadata(
      input.metadata,
    );

  if (
    !type ||
    !eventKey ||
    !title
  ) {
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      'Notification type, event key, and title are required.',
    );
  }

  let expiresAt:
    string | null =
      null;

  if (input.expiresAt) {
    const candidate =
      input.expiresAt instanceof Date
        ? input.expiresAt
        : new Date(
            input.expiresAt,
          );

    if (
      Number.isNaN(
        candidate.getTime(),
      )
    ) {
      throw new WorkspaceNotificationError(
        'INVALID_NOTIFICATION_INPUT',
        'Notification expiry is invalid.',
      );
    }

    expiresAt =
      candidate.toISOString();
  }

  const recipient =
    await resolveRecipient(
      tenantId,
      recipientUserId,
      companyId,
    );

  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const preferences =
    companyId
      ? await loadPreferences(
          pool,
          companyId,
          recipientUserId,
          eventKey,
        )
      : {
          inAppEnabled: true,
          emailEnabled: false,
          pushEnabled: false,
          smsEnabled: false,
          muteUntil: null,
        };

  const muted =
    preferences.muteUntil
      ? new Date(
          preferences.muteUntil,
        ).getTime() >
        Date.now()
      : false;

  const client =
    await pool.connect();

  let row:
    NotificationRow;

  let emailQueued =
    false;

  let smsQueued =
    false;

  try {
    await client.query(
      'BEGIN',
    );

    const inserted =
      await client.query(
        `
          INSERT INTO notifications (
            company_id,
            user_id,
            type,
            event_key,
            priority,
            title,
            message,
            link,
            source_module,
            source_model,
            source_record_id,
            dedupe_key,
            metadata,
            in_app_visible,
            is_read,
            expires_at,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13::jsonb, $14,
            FALSE, $15, NOW(), NOW()
          )
          ON CONFLICT DO NOTHING
          RETURNING
            id,
            company_id,
            user_id,
            type,
            event_key,
            priority,
            title,
            message,
            link,
            source_module,
            source_model,
            source_record_id,
            metadata,
            is_read,
            read_at,
            created_at,
            updated_at
        `,
        [
          companyId,
          recipientUserId,
          type,
          eventKey,
          priority,
          title,
          message,
          href,
          sourceModule,
          sourceModel,
          sourceRecordId,
          dedupeKey,
          JSON.stringify(metadata),
          input.critical === true ||
          (
            preferences.inAppEnabled &&
            !muted
          ),
          expiresAt,
        ],
      );

    if (
      inserted.rows.length === 1
    ) {
      row =
        inserted.rows[0] as NotificationRow;
    } else if (dedupeKey) {
      const existing =
        await client.query(
          `
            SELECT
              id,
              company_id,
              user_id,
              type,
              event_key,
              priority,
              title,
              message,
              link,
              source_module,
              source_model,
              source_record_id,
              metadata,
              is_read,
              read_at,
              created_at,
              updated_at
            FROM notifications
            WHERE user_id = $1
              AND dedupe_key = $2
              AND archived_at IS NULL
            ORDER BY
              created_at DESC
            LIMIT 1
          `,
          [
            recipientUserId,
            dedupeKey,
          ],
        );

      if (
        existing.rows.length !== 1
      ) {
        throw new WorkspaceNotificationError(
          'INVALID_NOTIFICATION_INPUT',
          'Notification deduplication could not be resolved.',
        );
      }

      row =
        existing.rows[0] as NotificationRow;
    } else {
      throw new WorkspaceNotificationError(
        'INVALID_NOTIFICATION_INPUT',
        'Notification could not be created.',
      );
    }

    if (
      input.critical === true ||
      (
        preferences.emailEnabled &&
        !muted
      )
    ) {
      const delivery =
        await client.query(
          `
            INSERT INTO notification_deliveries (
              notification_id,
              recipient_user_id,
              channel,
              status,
              attempts,
              created_at,
              updated_at
            )
            VALUES (
              $1,
              $2,
              'email',
              'pending',
              0,
              NOW(),
              NOW()
            )
            ON CONFLICT (
              notification_id,
              channel
            )
            DO NOTHING
            RETURNING id
          `,
          [
            row.id,
            recipientUserId,
          ],
        );

      emailQueued =
        delivery.rows.length === 1;
    }

    if (
      input.critical === true ||
      input.forceSms === true ||
      (
        preferences.smsEnabled &&
        !muted
      )
    ) {
      const delivery =
        await client.query(
          `
            INSERT INTO notification_deliveries (
              notification_id,
              recipient_user_id,
              channel,
              status,
              attempts,
              created_at,
              updated_at
            )
            VALUES (
              $1,
              $2,
              'sms',
              'pending',
              0,
              NOW(),
              NOW()
            )
            ON CONFLICT (
              notification_id,
              channel
            )
            DO NOTHING
            RETURNING id
          `,
          [
            row.id,
            recipientUserId,
          ],
        );

      smsQueued =
        delivery.rows.length === 1;
    }

    await client.query(
      'COMMIT',
    );
  } catch (error) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }

  if (emailQueued) {
    const name =
      [
        recipient.first_name,
        recipient.last_name,
      ]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      'there';

    try {
      const delivery =
        await sendWorkspaceNotificationEmail(
          String(recipient.email),
          name,
          {
            title,
            message,
            actionHref: href,
          },
        );

      await pool.query(
        `
          UPDATE notification_deliveries
          SET
            status = $3,
            attempts = attempts + 1,
            provider_message_id = $4,
            last_attempt_at = NOW(),
            sent_at =
              CASE
                WHEN $3 = 'sent'
                THEN NOW()
                ELSE sent_at
              END,
            failed_at =
              CASE
                WHEN $3 = 'failed'
                THEN NOW()
                ELSE NULL
              END,
            error_code =
              CASE
                WHEN $3 = 'failed'
                THEN 'DELIVERY_UNAVAILABLE'
                ELSE NULL
              END,
            error_message = NULL,
            updated_at = NOW()
          WHERE notification_id = $1
            AND recipient_user_id = $2
            AND channel = 'email'
        `,
        [
          row.id,
          recipientUserId,
          delivery.success
            ? 'sent'
            : 'failed',
          delivery.messageId || null,
        ],
      );
    } catch (error) {
      console.error(
        '[SaMi Notifications] Email delivery failed:',
        {
          notificationId:
            row.id,
          error,
        },
      );

      await pool.query(
        `
          UPDATE notification_deliveries
          SET
            status = 'failed',
            attempts = attempts + 1,
            last_attempt_at = NOW(),
            failed_at = NOW(),
            error_code = 'DELIVERY_FAILED',
            error_message = $3,
            updated_at = NOW()
          WHERE notification_id = $1
            AND recipient_user_id = $2
            AND channel = 'email'
        `,
        [
          row.id,
          recipientUserId,
          error instanceof Error
            ? error.message.slice(0, 1000)
            : 'Email delivery failed.',
        ],
      );
    }
  }

  if (smsQueued) {
    try {
      const delivery =
        await sendWorkspaceNotificationSms(
          recipient.phone,
          {
            title,
            message,
          },
        );

      await pool.query(
        `
          UPDATE notification_deliveries
          SET
            status = $3,
            attempts = attempts + 1,
            provider_message_id = $4,
            last_attempt_at = NOW(),
            sent_at =
              CASE
                WHEN $3 = 'sent'
                THEN NOW()
                ELSE sent_at
              END,
            failed_at =
              CASE
                WHEN $3 = 'failed'
                THEN NOW()
                ELSE NULL
              END,
            error_code =
              CASE
                WHEN $3 = 'failed'
                THEN $5
                ELSE NULL
              END,
            error_message = NULL,
            updated_at = NOW()
          WHERE notification_id = $1
            AND recipient_user_id = $2
            AND channel = 'sms'
        `,
        [
          row.id,
          recipientUserId,
          delivery.success
            ? 'sent'
            : 'failed',
          delivery.messageId ||
          null,
          delivery.errorCode ||
          'DELIVERY_UNAVAILABLE',
        ],
      );
    } catch (error) {
      console.error(
        '[SaMi Notifications] SMS delivery failed:',
        {
          notificationId:
            row.id,
          error,
        },
      );

      await pool.query(
        `
          UPDATE notification_deliveries
          SET
            status = 'failed',
            attempts = attempts + 1,
            last_attempt_at = NOW(),
            failed_at = NOW(),
            error_code = 'DELIVERY_FAILED',
            error_message = $3,
            updated_at = NOW()
          WHERE notification_id = $1
            AND recipient_user_id = $2
            AND channel = 'sms'
        `,
        [
          row.id,
          recipientUserId,
          error instanceof Error
            ? error.message.slice(
                0,
                1000,
              )
            : 'SMS delivery failed.',
        ],
      );
    }
  }

  return mapNotification(row);
}
