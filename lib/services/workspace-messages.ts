import 'server-only';

import { queryControl } from '@/lib/db/control';
import { getTenantPoolByTenantId } from '@/lib/db/tenant';
import {
  permissionContextHas,
} from '@/lib/auth/permission-context';
import { SAMI_PERMISSIONS } from '@/lib/auth/permission-catalog';
import { requireCompanyAccess } from '@/lib/services/company-access';
import {
  createWorkspaceNotification,
  getWorkspaceNotificationContext,
  WorkspaceNotificationError,
} from '@/lib/services/workspace-notifications';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_MESSAGE_LENGTH = 8000;
const MAX_SUBJECT_LENGTH = 255;

export type WorkspaceMessageParticipant = {
  id: string;
  email: string;
  name: string;
  isOwner: boolean;
};

export type WorkspaceConversationSummary = {
  id: string;
  type: 'direct' | 'group' | 'announcement';
  subject: string | null;
  participants: WorkspaceMessageParticipant[];
  unreadCount: number;
  latestMessage: {
    body: string;
    senderUserId: string;
    createdAt: string;
  } | null;
  updatedAt: string;
};

export type WorkspaceMessage = {
  id: string;
  conversationId: string;
  senderUserId: string;
  replyToMessageId: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
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

function normalizeBody(
  value: unknown,
): string {
  if (typeof value !== 'string') {
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      'Message text is required.',
    );
  }

  const body =
    value
      .replace(/\r\n/g, '\n')
      .replace(/\u0000/g, '')
      .trim()
      .slice(0, MAX_MESSAGE_LENGTH);

  if (!body) {
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      'Message text is required.',
    );
  }

  return body;
}

function normalizeSubject(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      'Announcement subject is invalid.',
    );
  }

  const subject =
    value
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, MAX_SUBJECT_LENGTH);

  return subject || null;
}

function iso(
  value: Date | string | null,
): string {
  const date =
    value instanceof Date
      ? value
      : new Date(
          value || 0,
        );

  return Number.isNaN(
    date.getTime(),
  )
    ? new Date(0).toISOString()
    : date.toISOString();
}

async function loadUserProfiles(
  tenantId: string,
  userIds: string[],
): Promise<Map<string, WorkspaceMessageParticipant>> {
  const unique =
    [...new Set(userIds)]
      .filter(
        id =>
          UUID_RE.test(id),
      );

  if (
    unique.length === 0
  ) {
    return new Map();
  }

  const result =
    await queryControl(
      `
        SELECT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          tu.is_owner
        FROM tenant_users tu
        INNER JOIN users u
          ON u.id = tu.user_id
        WHERE tu.tenant_id = $1
          AND tu.user_id = ANY($2::uuid[])
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
      `,
      [
        tenantId,
        unique,
      ],
    );

  return new Map(
    result.rows.map(
      row => {
        const id =
          String(row.id);

        const name =
          [
            row.first_name,
            row.last_name,
          ]
            .filter(Boolean)
            .join(' ')
            .trim() ||
          String(row.email);

        return [
          id,
          {
            id,
            email:
              String(row.email),
            name,
            isOwner:
              row.is_owner === true,
          },
        ];
      },
    ),
  );
}

async function assertRecipient(
  tenantId: string,
  companyId: string,
  recipientUserId: string,
): Promise<WorkspaceMessageParticipant> {
  const profiles =
    await loadUserProfiles(
      tenantId,
      [
        recipientUserId,
      ],
    );

  const recipient =
    profiles.get(
      recipientUserId,
    );

  if (!recipient) {
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      'Choose an active internal workspace member.',
    );
  }

  if (!recipient.isOwner) {
    try {
      await requireCompanyAccess(
        tenantId,
        recipientUserId,
        companyId,
      );
    } catch {
      throw new WorkspaceNotificationError(
        'INVALID_NOTIFICATION_INPUT',
        'That user does not have access to the current company.',
      );
    }
  }

  return recipient;
}

async function getSenderName(
  tenantId: string,
  userId: string,
) {
  const profiles =
    await loadUserProfiles(
      tenantId,
      [
        userId,
      ],
    );

  return (
    profiles.get(
      userId,
    )?.name ||
    'A teammate'
  );
}

export async function listWorkspaceMessageRecipients() {
  const context =
    await getWorkspaceNotificationContext();

  const members =
    await queryControl(
      `
        SELECT
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          tu.is_owner
        FROM tenant_users tu
        INNER JOIN users u
          ON u.id = tu.user_id
        WHERE tu.tenant_id = $1
          AND tu.deleted_at IS NULL
          AND u.deleted_at IS NULL
          AND tu.user_id <> $2
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
        ORDER BY
          LOWER(
            COALESCE(
              u.first_name,
              ''
            )
          ),
          LOWER(
            COALESCE(
              u.last_name,
              ''
            )
          ),
          LOWER(u.email)
      `,
      [
        context.tenantId,
        context.userId,
      ],
    );

  const candidates =
    members.rows.map(
      row =>
        String(row.id),
    );

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const access =
    candidates.length > 0
      ? await pool.query(
          `
            SELECT user_id
            FROM company_users
            WHERE company_id = $1
              AND user_id = ANY($2::uuid[])
              AND LOWER(
                COALESCE(
                  status,
                  ''
                )
              ) = 'active'
          `,
          [
            context.companyId,
            candidates,
          ],
        )
      : {
          rows: [],
        };

  const allowed =
    new Set(
      access.rows.map(
        row =>
          String(
            row.user_id,
          ),
      ),
    );

  return members.rows
    .filter(
      row =>
        row.is_owner === true ||
        allowed.has(
          String(row.id),
        ),
    )
    .map(
      row => ({
        id:
          String(row.id),
        email:
          String(row.email),
        name:
          [
            row.first_name,
            row.last_name,
          ]
            .filter(Boolean)
            .join(' ')
            .trim() ||
          String(row.email),
        isOwner:
          row.is_owner === true,
      }),
    );
}

export async function listWorkspaceConversations():
  Promise<{
    conversations:
      WorkspaceConversationSummary[];
    unreadCount:
      number;
  }> {
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
          c.id,
          c.conversation_type,
          c.subject,
          c.updated_at,

          cm.last_read_at,

          COALESCE(
            ARRAY_AGG(
              DISTINCT members.user_id
            ) FILTER (
              WHERE members.user_id IS NOT NULL
                AND members.archived_at IS NULL
            ),
            ARRAY[]::uuid[]
          ) AS participant_ids,

          COALESCE(
            (
              SELECT COUNT(*)::int
              FROM workspace_messages unread
              WHERE unread.conversation_id = c.id
                AND unread.deleted_at IS NULL
                AND unread.sender_user_id <> $2
                AND unread.created_at >
                  COALESCE(
                    cm.last_read_at,
                    cm.joined_at
                  )
            ),
            0
          )::int AS unread_count,

          latest.body AS latest_body,
          latest.sender_user_id AS latest_sender_user_id,
          latest.created_at AS latest_created_at

        FROM workspace_conversations c

        INNER JOIN workspace_conversation_members cm
          ON cm.conversation_id = c.id
         AND cm.user_id = $2
         AND cm.archived_at IS NULL

        LEFT JOIN workspace_conversation_members members
          ON members.conversation_id = c.id

        LEFT JOIN LATERAL (
          SELECT
            m.body,
            m.sender_user_id,
            m.created_at
          FROM workspace_messages m
          WHERE m.conversation_id = c.id
            AND m.deleted_at IS NULL
          ORDER BY
            m.created_at DESC,
            m.id DESC
          LIMIT 1
        ) latest
          ON TRUE

        WHERE c.company_id = $1
          AND c.archived_at IS NULL

        GROUP BY
          c.id,
          c.conversation_type,
          c.subject,
          c.updated_at,
          cm.last_read_at,
          cm.joined_at,
          latest.body,
          latest.sender_user_id,
          latest.created_at

        ORDER BY
          c.updated_at DESC,
          c.id DESC
      `,
      [
        context.companyId,
        context.userId,
      ],
    );

  const ids =
    result.rows.flatMap(
      row =>
        (
          row.participant_ids ||
          []
        ).map(
          (id: unknown) =>
            String(id),
        ),
    );

  const profiles =
    await loadUserProfiles(
      context.tenantId,
      ids,
    );

  const conversations =
    result.rows.map(
      row => ({
        id:
          String(row.id),

        type:
          (
            row.conversation_type ===
              'announcement'
              ? 'announcement'
              : row.conversation_type ===
                  'group'
                ? 'group'
                : 'direct'
          ) as
            | 'direct'
            | 'group'
            | 'announcement',

        subject:
          typeof row.subject ===
            'string'
            ? row.subject
            : null,

        participants:
          (
            row.participant_ids ||
            []
          )
            .map(
              (id: unknown) =>
                profiles.get(
                  String(id),
                ),
            )
            .filter(
              (
                value: WorkspaceMessageParticipant | undefined,
              ): value is WorkspaceMessageParticipant =>
                Boolean(value),
            ),

        unreadCount:
          Number(
            row.unread_count ||
            0,
          ),

        latestMessage:
          row.latest_created_at
            ? {
                body:
                  String(
                    row.latest_body ||
                    '',
                  ),
                senderUserId:
                  String(
                    row.latest_sender_user_id,
                  ),
                createdAt:
                  iso(
                    row.latest_created_at,
                  ),
              }
            : null,

        updatedAt:
          iso(
            row.updated_at,
          ),
      }),
    );

  return {
    conversations,
    unreadCount:
      conversations.reduce(
        (
          total,
          conversation,
        ) =>
          total +
          conversation.unreadCount,
        0,
      ),
  };
}

export async function getWorkspaceConversation(
  conversationId: string,
): Promise<{
  conversationId:
    string;
  messages:
    WorkspaceMessage[];
}> {
  const context =
    await getWorkspaceNotificationContext();

  const id =
    requireUuid(
      conversationId,
      'conversation',
    );

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const member =
    await pool.query(
      `
        SELECT 1
        FROM workspace_conversations c
        INNER JOIN workspace_conversation_members cm
          ON cm.conversation_id = c.id
        WHERE c.id = $1
          AND c.company_id = $2
          AND c.archived_at IS NULL
          AND cm.user_id = $3
          AND cm.archived_at IS NULL
        LIMIT 1
      `,
      [
        id,
        context.companyId,
        context.userId,
      ],
    );

  if (
    member.rows.length !== 1
  ) {
    throw new WorkspaceNotificationError(
      'NOTIFICATION_NOT_FOUND',
      'The conversation could not be found.',
    );
  }

  const result =
    await pool.query(
      `
        SELECT
          id,
          conversation_id,
          sender_user_id,
          reply_to_message_id,
          body,
          created_at,
          edited_at
        FROM workspace_messages
        WHERE conversation_id = $1
          AND deleted_at IS NULL
        ORDER BY
          created_at ASC,
          id ASC
        LIMIT 300
      `,
      [
        id,
      ],
    );

  return {
    conversationId:
      id,
    messages:
      result.rows.map(
        row => ({
          id:
            String(row.id),
          conversationId:
            String(
              row.conversation_id,
            ),
          senderUserId:
            String(
              row.sender_user_id,
            ),
          replyToMessageId:
            row.reply_to_message_id
              ? String(
                  row.reply_to_message_id,
                )
              : null,
          body:
            String(row.body),
          createdAt:
            iso(
              row.created_at,
            ),
          editedAt:
            row.edited_at
              ? iso(
                  row.edited_at,
                )
              : null,
        }),
      ),
  };
}

export async function markWorkspaceConversationRead(
  conversationId: string,
) {
  const context =
    await getWorkspaceNotificationContext();

  const id =
    requireUuid(
      conversationId,
      'conversation',
    );

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const result =
    await pool.query(
      `
        UPDATE workspace_conversation_members cm
        SET last_read_at = NOW()
        FROM workspace_conversations c
        WHERE cm.conversation_id = c.id
          AND c.id = $1
          AND c.company_id = $2
          AND c.archived_at IS NULL
          AND cm.user_id = $3
          AND cm.archived_at IS NULL
        RETURNING cm.conversation_id
      `,
      [
        id,
        context.companyId,
        context.userId,
      ],
    );

  if (
    result.rows.length !== 1
  ) {
    throw new WorkspaceNotificationError(
      'NOTIFICATION_NOT_FOUND',
      'The conversation could not be found.',
    );
  }

  return {
    read: true,
  };
}

export async function startWorkspaceDirectConversation(
  input: {
    recipientUserId: unknown;
    body: unknown;
  },
) {
  const context =
    await getWorkspaceNotificationContext();

  const recipientUserId =
    requireUuid(
      input.recipientUserId,
      'recipient',
    );

  if (
    recipientUserId ===
    context.userId
  ) {
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      'Choose another workspace member.',
    );
  }

  const recipient =
    await assertRecipient(
      context.tenantId,
      context.companyId,
      recipientUserId,
    );

  const body =
    normalizeBody(
      input.body,
    );

  const directKey =
    [
      context.userId,
      recipientUserId,
    ]
      .sort()
      .join(':');

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const client =
    await pool.connect();

  let conversationId =
    '';

  let messageId =
    '';

  try {
    await client.query(
      'BEGIN',
    );

    const conversation =
      await client.query(
        `
          INSERT INTO workspace_conversations (
            company_id,
            conversation_type,
            direct_key,
            created_by,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            'direct',
            $2,
            $3,
            NOW(),
            NOW()
          )
          ON CONFLICT (
            company_id,
            direct_key
          )
          WHERE conversation_type = 'direct'
            AND direct_key IS NOT NULL
            AND archived_at IS NULL
          DO UPDATE SET
            updated_at =
              workspace_conversations.updated_at
          RETURNING id
        `,
        [
          context.companyId,
          directKey,
          context.userId,
        ],
      );

    conversationId =
      String(
        conversation.rows[0].id,
      );

    await client.query(
      `
        INSERT INTO workspace_conversation_members (
          conversation_id,
          user_id,
          member_role,
          joined_at,
          last_read_at,
          archived_at
        )
        VALUES
          ($1, $2, 'member', NOW(), NOW(), NULL),
          ($1, $3, 'member', NOW(), NULL, NULL)
        ON CONFLICT (
          conversation_id,
          user_id
        )
        DO UPDATE SET
          archived_at = NULL
      `,
      [
        conversationId,
        context.userId,
        recipientUserId,
      ],
    );

    const message =
      await client.query(
        `
          INSERT INTO workspace_messages (
            conversation_id,
            sender_user_id,
            body,
            created_at
          )
          VALUES (
            $1,
            $2,
            $3,
            NOW()
          )
          RETURNING id
        `,
        [
          conversationId,
          context.userId,
          body,
        ],
      );

    messageId =
      String(
        message.rows[0].id,
      );

    await client.query(
      `
        UPDATE workspace_conversations
        SET updated_at = NOW()
        WHERE id = $1
      `,
      [
        conversationId,
      ],
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

    throw error;
  } finally {
    client.release();
  }

  const senderName =
    await getSenderName(
      context.tenantId,
      context.userId,
    );

  await createWorkspaceNotification({
    tenantId:
      context.tenantId,
    recipientUserId:
      recipient.id,
    companyId:
      context.companyId,
    type:
      'communication.message',
    eventKey:
      'communication.message',
    title:
      `New message from ${senderName}`,
    message:
      body.slice(0, 240),
    href:
      '/notifications?tab=messages&conversation=' +
      encodeURIComponent(
        conversationId,
      ),
    sourceModule:
      'core.notifications',
    sourceModel:
      'workspace_conversation',
    sourceRecordId:
      conversationId,
    dedupeKey:
      'message:' +
      messageId +
      ':' +
      recipient.id,
    metadata: {
      conversationId,
      messageId,
      senderUserId:
        context.userId,
    },
  });

  return {
    conversationId,
    messageId,
  };
}

export async function sendWorkspaceConversationMessage(
  conversationId: string,
  input: {
    body: unknown;
    replyToMessageId?: unknown;
  },
) {
  const context =
    await getWorkspaceNotificationContext();

  const id =
    requireUuid(
      conversationId,
      'conversation',
    );

  const body =
    normalizeBody(
      input.body,
    );

  const replyToMessageId =
    input.replyToMessageId
      ? requireUuid(
          input.replyToMessageId,
          'reply message',
        )
      : null;

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const client =
    await pool.connect();

  let messageId =
    '';

  let recipients:
    string[] =
      [];

  try {
    await client.query(
      'BEGIN',
    );

    const conversation =
      await client.query(
        `
          SELECT c.id
          FROM workspace_conversations c
          INNER JOIN workspace_conversation_members cm
            ON cm.conversation_id = c.id
          WHERE c.id = $1
            AND c.company_id = $2
            AND c.archived_at IS NULL
            AND cm.user_id = $3
            AND cm.archived_at IS NULL
          LIMIT 1
          FOR UPDATE OF c
        `,
        [
          id,
          context.companyId,
          context.userId,
        ],
      );

    if (
      conversation.rows.length !==
      1
    ) {
      throw new WorkspaceNotificationError(
        'NOTIFICATION_NOT_FOUND',
        'The conversation could not be found.',
      );
    }

    if (replyToMessageId) {
      const reply =
        await client.query(
          `
            SELECT id
            FROM workspace_messages
            WHERE id = $1
              AND conversation_id = $2
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [
            replyToMessageId,
            id,
          ],
        );

      if (
        reply.rows.length !==
        1
      ) {
        throw new WorkspaceNotificationError(
          'INVALID_NOTIFICATION_INPUT',
          'The message you are replying to is unavailable.',
        );
      }
    }

    const message =
      await client.query(
        `
          INSERT INTO workspace_messages (
            conversation_id,
            sender_user_id,
            reply_to_message_id,
            body,
            created_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            NOW()
          )
          RETURNING id
        `,
        [
          id,
          context.userId,
          replyToMessageId,
          body,
        ],
      );

    messageId =
      String(
        message.rows[0].id,
      );

    await client.query(
      `
        UPDATE workspace_conversation_members
        SET last_read_at = NOW()
        WHERE conversation_id = $1
          AND user_id = $2
      `,
      [
        id,
        context.userId,
      ],
    );

    const recipientRows =
      await client.query(
        `
          SELECT user_id
          FROM workspace_conversation_members
          WHERE conversation_id = $1
            AND user_id <> $2
            AND archived_at IS NULL
        `,
        [
          id,
          context.userId,
        ],
      );

    recipients =
      recipientRows.rows.map(
        row =>
          String(
            row.user_id,
          ),
      );

    await client.query(
      `
        UPDATE workspace_conversations
        SET updated_at = NOW()
        WHERE id = $1
      `,
      [
        id,
      ],
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

    throw error;
  } finally {
    client.release();
  }

  const senderName =
    await getSenderName(
      context.tenantId,
      context.userId,
    );

  for (
    const recipientUserId
    of recipients
  ) {
    try {
      await createWorkspaceNotification({
        tenantId:
          context.tenantId,
        recipientUserId,
        companyId:
          context.companyId,
        type:
          'communication.message',
        eventKey:
          'communication.message',
        title:
          `New message from ${senderName}`,
        message:
          body.slice(0, 240),
        href:
          '/notifications?tab=messages&conversation=' +
          encodeURIComponent(id),
        sourceModule:
          'core.notifications',
        sourceModel:
          'workspace_conversation',
        sourceRecordId:
          id,
        dedupeKey:
          'message:' +
          messageId +
          ':' +
          recipientUserId,
        metadata: {
          conversationId:
            id,
          messageId,
          senderUserId:
            context.userId,
        },
      });
    } catch (error) {
      console.error(
        '[SaMi Messages] Recipient notification failed:',
        {
          conversationId:
            id,
          recipientUserId,
          error,
        },
      );
    }
  }

  return {
    conversationId:
      id,
    messageId,
  };
}

export async function sendWorkspaceCompanyAnnouncement(
  input: {
    subject: unknown;
    body: unknown;
  },
) {
  const context =
    await getWorkspaceNotificationContext();

  if (
    !context.permissions.isOwner &&
    !permissionContextHas(
      context.permissions,
      SAMI_PERMISSIONS.NOTIFICATIONS_MANAGE,
    )
  ) {
    throw new WorkspaceNotificationError(
      'NOTIFICATIONS_MANAGE_REQUIRED',
      'You do not have permission to send company announcements.',
    );
  }

  const subject =
    normalizeSubject(
      input.subject,
    );

  const body =
    normalizeBody(
      input.body,
    );

  if (!subject) {
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      'Announcement subject is required.',
    );
  }

  const recipients =
    await listWorkspaceMessageRecipients();

  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  const client =
    await pool.connect();

  let conversationId =
    '';

  let messageId =
    '';

  try {
    await client.query(
      'BEGIN',
    );

    const conversation =
      await client.query(
        `
          INSERT INTO workspace_conversations (
            company_id,
            conversation_type,
            subject,
            created_by,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            'announcement',
            $2,
            $3,
            NOW(),
            NOW()
          )
          RETURNING id
        `,
        [
          context.companyId,
          subject,
          context.userId,
        ],
      );

    conversationId =
      String(
        conversation.rows[0].id,
      );

    const memberIds =
      [
        context.userId,
        ...recipients.map(
          recipient =>
            recipient.id,
        ),
      ];

    await client.query(
      `
        INSERT INTO workspace_conversation_members (
          conversation_id,
          user_id,
          member_role,
          joined_at,
          last_read_at
        )
        SELECT
          $1,
          member_id,
          CASE
            WHEN member_id = $2
            THEN 'owner'
            ELSE 'member'
          END,
          NOW(),
          CASE
            WHEN member_id = $2
            THEN NOW()
            ELSE NULL
          END
        FROM UNNEST(
          $3::uuid[]
        ) AS member_id
        ON CONFLICT (
          conversation_id,
          user_id
        )
        DO NOTHING
      `,
      [
        conversationId,
        context.userId,
        memberIds,
      ],
    );

    const message =
      await client.query(
        `
          INSERT INTO workspace_messages (
            conversation_id,
            sender_user_id,
            body,
            created_at
          )
          VALUES (
            $1,
            $2,
            $3,
            NOW()
          )
          RETURNING id
        `,
        [
          conversationId,
          context.userId,
          body,
        ],
      );

    messageId =
      String(
        message.rows[0].id,
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

    throw error;
  } finally {
    client.release();
  }

  for (
    const recipient
    of recipients
  ) {
    try {
      await createWorkspaceNotification({
        tenantId:
          context.tenantId,
        recipientUserId:
          recipient.id,
        companyId:
          context.companyId,
        type:
          'communication.announcement',
        eventKey:
          'communication.announcement',
        priority:
          'high',
        title:
          subject,
        message:
          body.slice(0, 300),
        href:
          '/notifications?tab=messages&conversation=' +
          encodeURIComponent(
            conversationId,
          ),
        sourceModule:
          'core.notifications',
        sourceModel:
          'workspace_conversation',
        sourceRecordId:
          conversationId,
        dedupeKey:
          'announcement:' +
          messageId +
          ':' +
          recipient.id,
        metadata: {
          conversationId,
          messageId,
          senderUserId:
            context.userId,
        },
      });
    } catch (error) {
      console.error(
        '[SaMi Messages] Announcement notification failed:',
        {
          conversationId,
          recipientUserId:
            recipient.id,
          error,
        },
      );
    }
  }

  return {
    conversationId,
    messageId,
    recipients:
      recipients.length,
  };
}
