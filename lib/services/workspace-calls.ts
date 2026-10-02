import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';
import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';
import {
  requireCompanyAccess,
} from '@/lib/services/company-access';
import {
  createWorkspaceNotification,
  getWorkspaceNotificationContext,
  WorkspaceNotificationError,
} from '@/lib/services/workspace-notifications';
import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_SIGNAL_BYTES =
  64 * 1024;

export type WorkspaceCallStatus =
  | 'ringing'
  | 'accepted'
  | 'declined'
  | 'ended'
  | 'cancelled'
  | 'missed';

function requireUuid(
  value:
    unknown,
  label:
    string,
) {
  if (
    typeof value !==
      'string' ||
    !UUID_RE.test(
      value,
    )
  ) {
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      `Invalid ${label} identifier.`,
    );
  }

  return value;
}

async function userProfile(
  tenantId:
    string,
  userId:
    string,
) {
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
          ON u.id =
             tu.user_id
        WHERE tu.tenant_id =
              $1
          AND tu.user_id =
              $2
          AND tu.deleted_at
              IS NULL
          AND u.deleted_at
              IS NULL
          AND LOWER(
                COALESCE(
                  tu.status,
                  ''
                )
              ) =
              'active'
          AND LOWER(
                COALESCE(
                  tu.member_type,
                  ''
                )
              ) =
              'internal'
        LIMIT 1
      `,
      [
        tenantId,
        userId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      'The call participant is not an active workspace member.',
    );
  }

  const row =
    result.rows[0];

  return {
    id:
      String(
        row.id,
      ),
    email:
      String(
        row.email ||
        '',
      ),
    name:
      [
        row.first_name,
        row.last_name,
      ]
        .filter(
          Boolean,
        )
        .join(
          ' ',
        )
        .trim() ||
      String(
        row.email ||
        'Workspace member',
      ),
    isOwner:
      row.is_owner ===
      true,
  };
}

async function requireCallableUser(
  tenantId:
    string,
  companyId:
    string,
  userId:
    string,
) {
  const profile =
    await userProfile(
      tenantId,
      userId,
    );

  if (
    !profile.isOwner
  ) {
    await requireCompanyAccess(
      tenantId,
      userId,
      companyId,
    );
  }

  return profile;
}

async function callForParticipant(
  callId:
    string,
  lock =
    false,
) {
  const context =
    await getWorkspaceNotificationContext();
  const id =
    requireUuid(
      callId,
      'call',
    );
  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );
  const client =
    await pool.connect();

  try {
    if (
      lock
    ) {
      await client.query(
        'BEGIN',
      );
    }

    const result =
      await client.query(
        `
          SELECT
            id::text,
            company_id::text,
            conversation_id::text,
            caller_user_id::text,
            callee_user_id::text,
            status,
            started_at,
            answered_at,
            ended_at,
            metadata,
            created_at,
            updated_at
          FROM workspace_calls
          WHERE id =
                $1
            AND company_id =
                $2
            AND (
              caller_user_id =
                $3
              OR
              callee_user_id =
                $3
            )
          LIMIT 1
          ${lock
            ? 'FOR UPDATE'
            : ''}
        `,
        [
          id,
          context.companyId,
          context.userId,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new WorkspaceNotificationError(
        'NOTIFICATION_NOT_FOUND',
        'The workspace call could not be found.',
      );
    }

    return {
      context,
      client,
      row:
        result.rows[0],
    };
  } catch (
    error
  ) {
    if (
      lock
    ) {
      await client.query(
        'ROLLBACK',
      ).catch(
        () =>
          undefined,
      );
    }
    client.release();
    throw error;
  }
}

async function mapCall(
  tenantId:
    string,
  row:
    Record<
      string,
      unknown
    >,
) {
  const [
    caller,
    callee,
  ] =
    await Promise.all([
      userProfile(
        tenantId,
        String(
          row.caller_user_id,
        ),
      ),
      userProfile(
        tenantId,
        String(
          row.callee_user_id,
        ),
      ),
    ]);

  return {
    id:
      String(
        row.id,
      ),
    conversationId:
      row.conversation_id
        ? String(
            row.conversation_id,
          )
        : null,
    caller,
    callee,
    status:
      String(
        row.status,
      ) as
        WorkspaceCallStatus,
    startedAt:
      new Date(
        row.started_at as
          string |
          Date,
      ).toISOString(),
    answeredAt:
      row.answered_at
        ? new Date(
            row.answered_at as
              string |
              Date,
          ).toISOString()
        : null,
    endedAt:
      row.ended_at
        ? new Date(
            row.ended_at as
              string |
              Date,
          ).toISOString()
        : null,
  };
}

export async function listActiveWorkspaceCalls() {
  const context =
    await getWorkspaceNotificationContext();
  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );

  await pool.query(
    `
      UPDATE workspace_calls
      SET
        status =
          'missed',
        ended_at =
          COALESCE(
            ended_at,
            NOW()
          ),
        updated_at =
          NOW()
      WHERE company_id =
            $1
        AND status =
            'ringing'
        AND started_at <
            NOW() -
            INTERVAL '75 seconds'
    `,
    [
      context.companyId,
    ],
  );

  const result =
    await pool.query(
      `
        SELECT
          id::text,
          company_id::text,
          conversation_id::text,
          caller_user_id::text,
          callee_user_id::text,
          status,
          started_at,
          answered_at,
          ended_at,
          metadata,
          created_at,
          updated_at
        FROM workspace_calls
        WHERE company_id =
              $1
          AND (
            caller_user_id =
              $2
            OR
            callee_user_id =
              $2
          )
          AND status IN (
            'ringing',
            'accepted'
          )
        ORDER BY
          created_at DESC,
          id DESC
        LIMIT 3
      `,
      [
        context.companyId,
        context.userId,
      ],
    );

  return Promise.all(
    result.rows.map(
      row =>
        mapCall(
          context.tenantId,
          row,
        ),
    ),
  );
}

export async function startWorkspaceCall(
  input: {
    recipientUserId?:
      unknown;
    conversationId?:
      unknown;
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
      'Choose another workspace member to call.',
    );
  }

  const conversationId =
    input.conversationId
      ? requireUuid(
          input.conversationId,
          'conversation',
        )
      : null;

  const recipient =
    await requireCallableUser(
      context.tenantId,
      context.companyId,
      recipientUserId,
    );
  const caller =
    await userProfile(
      context.tenantId,
      context.userId,
    );
  const pool =
    await getTenantPoolByTenantId(
      context.tenantId,
    );
  const client =
    await pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const lockKey =
      [
        context.userId,
        recipientUserId,
      ]
        .sort()
        .join(
          ':',
        );

    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [
        'workspace-call:' +
        context.companyId +
        ':' +
        lockKey,
      ],
    );

    if (
      conversationId
    ) {
      const conversation =
        await client.query(
          `
            SELECT 1
            FROM workspace_conversations c
            INNER JOIN workspace_conversation_members self_member
              ON self_member.conversation_id =
                 c.id
             AND self_member.user_id =
                 $3
             AND self_member.archived_at
                 IS NULL
            INNER JOIN workspace_conversation_members recipient_member
              ON recipient_member.conversation_id =
                 c.id
             AND recipient_member.user_id =
                 $4
             AND recipient_member.archived_at
                 IS NULL
            WHERE c.id =
                  $1
              AND c.company_id =
                  $2
              AND c.archived_at
                  IS NULL
              AND c.conversation_type =
                  'direct'
            LIMIT 1
          `,
          [
            conversationId,
            context.companyId,
            context.userId,
            recipientUserId,
          ],
        );

      if (
        conversation.rows.length !==
          1
      ) {
        throw new WorkspaceNotificationError(
          'INVALID_NOTIFICATION_INPUT',
          'Calls can only start from a direct conversation shared with that coworker.',
        );
      }
    }

    const active =
      await client.query(
        `
          SELECT id
          FROM workspace_calls
          WHERE company_id =
                $1
            AND status IN (
              'ringing',
              'accepted'
            )
            AND (
              caller_user_id = ANY(
                $2::uuid[]
              )
              OR
              callee_user_id = ANY(
                $2::uuid[]
              )
            )
          LIMIT 1
          FOR UPDATE
        `,
        [
          context.companyId,
          [
            context.userId,
            recipientUserId,
          ],
        ],
      );

    if (
      active.rows.length >
        0
    ) {
      throw new WorkspaceNotificationError(
        'INVALID_NOTIFICATION_INPUT',
        'One of the participants already has an active SaMi call.',
      );
    }

    const inserted =
      await client.query(
        `
          INSERT INTO workspace_calls (
            company_id,
            conversation_id,
            caller_user_id,
            callee_user_id,
            status,
            started_at,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            'ringing',
            NOW(),
            NOW(),
            NOW()
          )
          RETURNING
            id::text,
            company_id::text,
            conversation_id::text,
            caller_user_id::text,
            callee_user_id::text,
            status,
            started_at,
            answered_at,
            ended_at,
            metadata,
            created_at,
            updated_at
        `,
        [
          context.companyId,
          conversationId,
          context.userId,
          recipientUserId,
        ],
      );

    await client.query(
      'COMMIT',
    );

    const call =
      await mapCall(
        context.tenantId,
        inserted.rows[0],
      );

    await createWorkspaceNotification({
      tenantId:
        context.tenantId,
      recipientUserId:
        recipient.id,
      companyId:
        context.companyId,
      type:
        'communication.call',
      eventKey:
        'communication.call',
      priority:
        'high',
      title:
        `Incoming call from ${caller.name}`,
      message:
        'Open SaMi to answer or decline the call.',
      href:
        '/notifications?tab=messages',
      sourceModule:
        'core.notifications',
      sourceModel:
        'workspace_call',
      sourceRecordId:
        call.id,
      dedupeKey:
        'workspace-call:' +
        call.id,
      metadata: {
        callId:
          call.id,
        callerUserId:
          context.userId,
        conversationId,
      },
    }).catch(
      error => {
        console.error(
          '[SaMi Calls] Incoming call notification failed:',
          error,
        );
      },
    );

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
        'communication.call.started',
      eventType:
        'communication.call.started',
      category:
        'communication',
      severity:
        'info',
      summary:
        'In-app call started.',
      resourceType:
        'workspace_call',
      resourceId:
        call.id,
      module:
        'core.notifications',
      result:
        'success',
      metadata: {
        recipientUserId,
        conversationId,
      },
    }).catch(
      () =>
        undefined,
    );

    return call;
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    ).catch(
      () =>
        undefined,
    );
    throw error;
  } finally {
    client.release();
  }
}

export async function updateWorkspaceCall(
  callId:
    string,
  actionInput:
    unknown,
) {
  const holder =
    await callForParticipant(
      callId,
      true,
    );
  const {
    context,
    client,
  } =
    holder;
  const row =
    holder.row;
  const action =
    typeof actionInput ===
      'string'
      ? actionInput
          .trim()
          .toLowerCase()
      : '';

  try {
    const caller =
      String(
        row.caller_user_id,
      ) ===
      context.userId;
    const callee =
      String(
        row.callee_user_id,
      ) ===
      context.userId;
    const current =
      String(
        row.status,
      );

    let next:
      WorkspaceCallStatus;
    let answered =
      false;

    if (
      action ===
        'accept' &&
      callee &&
      current ===
        'ringing'
    ) {
      next =
        'accepted';
      answered =
        true;
    } else if (
      action ===
        'decline' &&
      callee &&
      current ===
        'ringing'
    ) {
      next =
        'declined';
    } else if (
      action ===
        'cancel' &&
      caller &&
      current ===
        'ringing'
    ) {
      next =
        'cancelled';
    } else if (
      action ===
        'end' &&
      (
        caller ||
        callee
      ) &&
      (
        current ===
          'accepted' ||
        current ===
          'ringing'
      )
    ) {
      next =
        current ===
          'ringing'
          ? (
              caller
                ? 'cancelled'
                : 'declined'
            )
          : 'ended';
    } else {
      throw new WorkspaceNotificationError(
        'INVALID_NOTIFICATION_INPUT',
        'That call action is not valid for the current call state.',
      );
    }

    const result =
      await client.query(
        `
          UPDATE workspace_calls
          SET
            status =
              $2,
            answered_at =
              CASE
                WHEN $3::boolean
                THEN COALESCE(
                  answered_at,
                  NOW()
                )
                ELSE answered_at
              END,
            ended_at =
              CASE
                WHEN $2 IN (
                  'declined',
                  'ended',
                  'cancelled',
                  'missed'
                )
                THEN COALESCE(
                  ended_at,
                  NOW()
                )
                ELSE ended_at
              END,
            updated_at =
              NOW()
          WHERE id =
                $1
            AND status =
                $4
          RETURNING
            id::text,
            company_id::text,
            conversation_id::text,
            caller_user_id::text,
            callee_user_id::text,
            status,
            started_at,
            answered_at,
            ended_at,
            metadata,
            created_at,
            updated_at
        `,
        [
          callId,
          next,
          answered,
          current,
        ],
      );

    if (
      result.rows.length !==
        1
    ) {
      throw new WorkspaceNotificationError(
        'INVALID_NOTIFICATION_INPUT',
        'The call changed on another device. Refresh the call state.',
      );
    }

    await client.query(
      'COMMIT',
    );

    const call =
      await mapCall(
        context.tenantId,
        result.rows[0],
      );

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
        'communication.call.' +
        next,
      eventType:
        'communication.call.' +
        next,
      category:
        'communication',
      severity:
        'info',
      summary:
        'In-app call ' +
        next +
        '.',
      resourceType:
        'workspace_call',
      resourceId:
        call.id,
      module:
        'core.notifications',
      result:
        'success',
    }).catch(
      () =>
        undefined,
    );

    return call;
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    ).catch(
      () =>
        undefined,
    );
    throw error;
  } finally {
    client.release();
  }
}

export async function listWorkspaceCallSignals(
  callId:
    string,
) {
  const holder =
    await callForParticipant(
      callId,
    );
  const {
    context,
    client,
  } =
    holder;

  try {
    const result =
      await client.query(
        `
          SELECT
            id::text,
            sender_user_id::text,
            signal_type,
            payload,
            created_at
          FROM workspace_call_signals
          WHERE call_id =
                $1
          ORDER BY
            created_at ASC,
            id ASC
          LIMIT 1000
        `,
        [
          callId,
        ],
      );

    return result.rows.map(
      row => ({
        id:
          String(
            row.id,
          ),
        senderUserId:
          String(
            row.sender_user_id,
          ),
        type:
          String(
            row.signal_type,
          ),
        payload:
          row.payload,
        createdAt:
          new Date(
            row.created_at,
          ).toISOString(),
      }),
    );
  } finally {
    client.release();
  }
}

export async function addWorkspaceCallSignal(
  callId:
    string,
  input: {
    type?:
      unknown;
    payload?:
      unknown;
  },
) {
  const holder =
    await callForParticipant(
      callId,
    );
  const {
    context,
    client,
  } =
    holder;
  const call =
    holder.row;
  const type =
    input.type ===
      'offer' ||
    input.type ===
      'answer' ||
    input.type ===
      'ice'
      ? input.type
      : null;

  if (
    !type
  ) {
    client.release();
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      'Invalid call signal type.',
    );
  }

  if (
    String(
      call.status,
    ) !==
      'ringing' &&
    String(
      call.status,
    ) !==
      'accepted'
  ) {
    client.release();
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      'This call is no longer active.',
    );
  }

  let serialized:
    string;

  try {
    serialized =
      JSON.stringify(
        input.payload,
      );
  } catch {
    client.release();
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      'Call signal payload is invalid.',
    );
  }

  if (
    !serialized ||
    Buffer.byteLength(
      serialized,
      'utf8',
    ) >
      MAX_SIGNAL_BYTES
  ) {
    client.release();
    throw new WorkspaceNotificationError(
      'INVALID_NOTIFICATION_INPUT',
      'Call signal payload is too large.',
    );
  }

  try {
    const result =
      await client.query(
        `
          INSERT INTO workspace_call_signals (
            call_id,
            sender_user_id,
            signal_type,
            payload,
            created_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4::jsonb,
            NOW()
          )
          RETURNING id::text
        `,
        [
          callId,
          context.userId,
          type,
          serialized,
        ],
      );

    return {
      id:
        String(
          result.rows[0].id,
        ),
    };
  } finally {
    client.release();
  }
}

export function getWorkspaceCallIceServers() {
  const raw =
    process.env
      .SAMI_WEBRTC_ICE_SERVERS_JSON
      ?.trim();

  if (
    raw
  ) {
    try {
      const parsed =
        JSON.parse(
          raw,
        );

      if (
        Array.isArray(
          parsed,
        )
      ) {
        return parsed
          .filter(
            item =>
              item &&
              typeof item ===
                'object' &&
              (
                typeof item.urls ===
                  'string' ||
                Array.isArray(
                  item.urls,
                )
              ),
          )
          .slice(
            0,
            8,
          );
      }
    } catch {
      // Fall back to public STUN below.
    }
  }

  return [
    {
      urls:
        'stun:stun.l.google.com:19302',
    },
  ];
}
