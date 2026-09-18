import 'server-only';

import crypto from 'node:crypto';

import type {
  PoolClient,
} from 'pg';

import {
  withControlTransaction,
} from '@/lib/db/control';


/* ================================================================
   SaMi WORKSPACE MEMBERSHIP LIFECYCLE
   ================================================================

   Category 7.3 / 7.9

   Responsibilities:

   - suspend a workspace member
   - reactivate a suspended member
   - soft-remove a workspace member
   - restore a previously removed member
   - protect workspace ownership
   - invalidate affected session workspace/company context
   - write lifecycle audit events

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export type MembershipLifecycleStatus =
  | 'active'
  | 'suspended';


export type MembershipMemberType =
  | 'internal'
  | 'portal';


export type MembershipLifecycleAction =
  | 'suspend'
  | 'reactivate'
  | 'remove'
  | 'restore';


export type MembershipLifecycleAuditContext = {
  ipAddress?:
    string | null;

  userAgent?:
    string | null;

  correlationId?:
    string | null;
};


export type MembershipLifecycleInput = {
  tenantId:
    string;

  actorUserId:
    string;

  targetUserId:
    string;

  reason?:
    string | null;

  audit?:
    MembershipLifecycleAuditContext;
};


export type MembershipLifecycleResult = {
  membershipId:
    string;

  tenantId:
    string;

  userId:
    string;

  memberType:
    MembershipMemberType;

  status:
    MembershipLifecycleStatus;

  isOwner:
    boolean;

  removed:
    boolean;

  suspendedAt:
    string | null;

  deletedAt:
    string | null;

  changed:
    boolean;

  action:
    MembershipLifecycleAction;
};


/* ================================================================
   INTERNAL ROW
   ================================================================ */

type MembershipRow = {
  id:
    string;

  tenant_id:
    string;

  user_id:
    string;

  member_type:
    string;

  status:
    string;

  is_owner:
    boolean;

  default_company_id:
    string | null;

  suspended_at:
    Date | string | null;

  suspended_by:
    string | null;

  suspension_reason:
    string | null;

  deleted_at:
    Date | string | null;

  removed_by:
    string | null;

  removal_reason:
    string | null;
};


/* ================================================================
   ERROR
   ================================================================ */

export class MembershipLifecycleError
  extends Error {
  readonly code:
    | 'INVALID_TENANT_ID'
    | 'INVALID_ACTOR_USER_ID'
    | 'INVALID_TARGET_USER_ID'
    | 'INVALID_REASON'
    | 'WORKSPACE_NOT_FOUND'
    | 'WORKSPACE_NOT_ACTIVE'
    | 'ACTOR_MEMBERSHIP_NOT_FOUND'
    | 'ACTOR_ACCESS_DENIED'
    | 'OWNER_REQUIRED'
    | 'MEMBERSHIP_NOT_FOUND'
    | 'MEMBERSHIP_REMOVED'
    | 'MEMBERSHIP_NOT_REMOVED'
    | 'OWNER_PROTECTED'
    | 'INVALID_MEMBERSHIP_STATE';


  constructor(
    code:
      | 'INVALID_TENANT_ID'
      | 'INVALID_ACTOR_USER_ID'
      | 'INVALID_TARGET_USER_ID'
      | 'INVALID_REASON'
      | 'WORKSPACE_NOT_FOUND'
      | 'WORKSPACE_NOT_ACTIVE'
      | 'ACTOR_MEMBERSHIP_NOT_FOUND'
      | 'ACTOR_ACCESS_DENIED'
      | 'OWNER_REQUIRED'
      | 'MEMBERSHIP_NOT_FOUND'
      | 'MEMBERSHIP_REMOVED'
      | 'MEMBERSHIP_NOT_REMOVED'
      | 'OWNER_PROTECTED'
      | 'INVALID_MEMBERSHIP_STATE',

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'MembershipLifecycleError';

    this.code =
      code;
  }
}


/* ================================================================
   UUID VALIDATION
   ================================================================ */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


function requireUuid(
  value:
    string,

  field:
    'tenant'
    | 'actor'
    | 'target',
): string {
  if (
    typeof value !==
      'string'
  ) {
    throwInvalidUuid(
      field,
    );
  }


  const normalized =
    value.trim();


  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    throwInvalidUuid(
      field,
    );
  }


  return normalized;
}


function throwInvalidUuid(
  field:
    'tenant'
    | 'actor'
    | 'target',
): never {
  if (
    field ===
      'tenant'
  ) {
    throw new MembershipLifecycleError(
      'INVALID_TENANT_ID',
      'A valid workspace ID is required.',
    );
  }


  if (
    field ===
      'actor'
  ) {
    throw new MembershipLifecycleError(
      'INVALID_ACTOR_USER_ID',
      'A valid acting user ID is required.',
    );
  }


  throw new MembershipLifecycleError(
    'INVALID_TARGET_USER_ID',
    'A valid target user ID is required.',
  );
}


/* ================================================================
   REASON
   ================================================================ */

function normalizeReason(
  value:
    string | null | undefined,
): string | null {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }


  if (
    typeof value !==
      'string'
  ) {
    throw new MembershipLifecycleError(
      'INVALID_REASON',
      'Membership lifecycle reason must be text.',
    );
  }


  const normalized =
    value.trim();


  if (
    !normalized
  ) {
    return null;
  }


  if (
    normalized.length >
      500
  ) {
    throw new MembershipLifecycleError(
      'INVALID_REASON',
      'Membership lifecycle reason cannot exceed 500 characters.',
    );
  }


  return normalized;
}


/* ================================================================
   STATUS NORMALIZATION
   ================================================================ */

function normalizeStatus(
  value:
    unknown,
): MembershipLifecycleStatus {
  const normalized =
    typeof value ===
      'string'
      ? value
          .trim()
          .toLowerCase()
      : '';


  if (
    normalized ===
      'active'
  ) {
    return 'active';
  }


  if (
    normalized ===
      'suspended'
  ) {
    return 'suspended';
  }


  throw new MembershipLifecycleError(
    'INVALID_MEMBERSHIP_STATE',
    `Unsupported membership state "${normalized || 'unknown'}".`,
  );
}


function normalizeMemberType(
  value:
    unknown,
): MembershipMemberType {
  const normalized =
    typeof value ===
      'string'
      ? value
          .trim()
          .toLowerCase()
      : '';


  if (
    normalized ===
      'portal'
  ) {
    return 'portal';
  }


  return 'internal';
}


/* ================================================================
   ISO DATE
   ================================================================ */

function toIso(
  value:
    unknown,
): string | null {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }


  const date =
    value instanceof Date
      ? value
      : new Date(
          String(
            value,
          ),
        );


  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }


  return date.toISOString();
}


/* ================================================================
   LOAD WORKSPACE
   ================================================================ */

async function requireActiveWorkspace(
  client:
    PoolClient,

  tenantId:
    string,
): Promise<void> {
  const result =
    await client.query(
      `
        SELECT
          id,
          status,
          deleted_at

        FROM tenants

        WHERE id = $1

        LIMIT 1

        FOR UPDATE
      `,
      [
        tenantId,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    throw new MembershipLifecycleError(
      'WORKSPACE_NOT_FOUND',
      'The workspace could not be found.',
    );
  }


  const workspace =
    result.rows[0];


  if (
    workspace.deleted_at
  ) {
    throw new MembershipLifecycleError(
      'WORKSPACE_NOT_ACTIVE',
      'The workspace is no longer active.',
    );
  }


  const status =
    typeof workspace.status ===
      'string'
      ? workspace.status
          .trim()
          .toLowerCase()
      : '';


  if (
    status !==
      'active'
  ) {
    throw new MembershipLifecycleError(
      'WORKSPACE_NOT_ACTIVE',
      'Membership cannot be changed while the workspace is inactive.',
    );
  }
}


/* ================================================================
   REQUIRE ACTING OWNER
   ================================================================ */

async function requireActingOwner(
  client:
    PoolClient,

  tenantId:
    string,

  actorUserId:
    string,
): Promise<void> {
  const result =
    await client.query(
      `
        SELECT
          tu.id,

          tu.status,
          tu.member_type,
          tu.is_owner,
          tu.deleted_at,

          u.status
            AS user_status

        FROM tenant_users tu

        INNER JOIN users u
          ON u.id =
             tu.user_id

        WHERE tu.tenant_id = $1
          AND tu.user_id = $2

        LIMIT 1

        FOR UPDATE OF tu
      `,
      [
        tenantId,
        actorUserId,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    throw new MembershipLifecycleError(
      'ACTOR_MEMBERSHIP_NOT_FOUND',
      'The acting user does not belong to this workspace.',
    );
  }


  const actor =
    result.rows[0];


  if (
    actor.deleted_at
  ) {
    throw new MembershipLifecycleError(
      'ACTOR_ACCESS_DENIED',
      'The acting membership is not active.',
    );
  }


  if (
    String(
      actor.status ||
      '',
    )
      .trim()
      .toLowerCase() !==
      'active'
  ) {
    throw new MembershipLifecycleError(
      'ACTOR_ACCESS_DENIED',
      'The acting membership is not active.',
    );
  }


  if (
    String(
      actor.member_type ||
      '',
    )
      .trim()
      .toLowerCase() !==
      'internal'
  ) {
    throw new MembershipLifecycleError(
      'ACTOR_ACCESS_DENIED',
      'Portal members cannot manage workspace membership.',
    );
  }


  if (
    String(
      actor.user_status ||
      '',
    )
      .trim()
      .toLowerCase() !==
      'active'
  ) {
    throw new MembershipLifecycleError(
      'ACTOR_ACCESS_DENIED',
      'The acting SaMi account is not active.',
    );
  }


  if (
    actor.is_owner !==
      true
  ) {
    throw new MembershipLifecycleError(
      'OWNER_REQUIRED',
      'Only the workspace owner can currently manage workspace membership.',
    );
  }
}


/* ================================================================
   LOAD TARGET MEMBERSHIP
   ================================================================ */

async function getTargetMembershipForUpdate(
  client:
    PoolClient,

  tenantId:
    string,

  targetUserId:
    string,
): Promise<MembershipRow> {
  const result =
    await client.query<MembershipRow>(
      `
        SELECT
          id,
          tenant_id,
          user_id,

          member_type,
          status,

          is_owner,

          default_company_id,

          suspended_at,
          suspended_by,
          suspension_reason,

          deleted_at,

          removed_by,
          removal_reason

        FROM tenant_users

        WHERE tenant_id = $1
          AND user_id = $2

        LIMIT 1

        FOR UPDATE
      `,
      [
        tenantId,
        targetUserId,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    throw new MembershipLifecycleError(
      'MEMBERSHIP_NOT_FOUND',
      'The workspace membership could not be found.',
    );
  }


  return result.rows[0];
}


/* ================================================================
   OWNER PROTECTION
   ================================================================ */

function protectOwner(
  membership:
    MembershipRow,
): void {
  if (
    membership.is_owner ===
      true
  ) {
    throw new MembershipLifecycleError(
      'OWNER_PROTECTED',
      [
        'The workspace owner cannot be suspended or removed.',
        'Transfer workspace ownership first.',
      ].join(' '),
    );
  }
}


/* ================================================================
   INVALIDATE SESSION WORKSPACE CONTEXT
   ================================================================ */

async function clearCurrentWorkspaceSessions(
  client:
    PoolClient,

  tenantId:
    string,

  userId:
    string,
): Promise<number> {
  const result =
    await client.query(
      `
        UPDATE sessions

        SET
          current_tenant_id =
            NULL,

          current_company_id =
            NULL,

          selected_company_ids =
            '{}'::UUID[],

          updated_at =
            NOW()

        WHERE user_id = $1

          AND current_tenant_id =
              $2

          AND is_current =
              TRUE

          AND revoked_at
              IS NULL

          AND expires_at >
              NOW()

        RETURNING id
      `,
      [
        userId,
        tenantId,
      ],
    );


  return result.rows.length;
}


/* ================================================================
   AUDIT
   ================================================================ */

async function insertLifecycleAudit(
  client:
    PoolClient,

  input: {
    tenantId:
      string;

    actorUserId:
      string;

    targetUserId:
      string;

    membershipId:
      string;

    action:
      string;

    eventType:
      string;

    reason:
      string | null;

    previousStatus:
      string;

    newStatus:
      string;

    previousDeletedAt:
      string | null;

    newDeletedAt:
      string | null;

    clearedSessions:
      number;

    audit?:
      MembershipLifecycleAuditContext;
  },
): Promise<void> {
  const correlationId =
    input.audit
      ?.correlationId
      ?.trim() ||
    crypto.randomUUID();


  const ipAddress =
    input.audit
      ?.ipAddress
      ?.trim()
      ?.slice(
        0,
        45,
      ) ||
    'unknown';


  const userAgent =
    input.audit
      ?.userAgent
      ?.trim() ||
    '';


  await client.query(
    `
      INSERT INTO audit_logs (
        tenant_id,
        user_id,

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

        entity_type,
        entity_id
      )

      VALUES (
        $1,
        $2,

        'human',

        $3,

        'workspace_member',
        $4,

        'workspace',

        'success',

        $5::jsonb,

        $6,
        $7,

        $8,

        $9,

        'workspace_member',
        $4
      )
    `,
    [
      input.tenantId,
      input.actorUserId,

      input.action,

      input.membershipId,

      JSON.stringify({
        targetUserId:
          input.targetUserId,

        reason:
          input.reason,

        previousStatus:
          input.previousStatus,

        newStatus:
          input.newStatus,

        previousDeletedAt:
          input.previousDeletedAt,

        newDeletedAt:
          input.newDeletedAt,

        clearedSessions:
          input.clearedSessions,
      }),

      ipAddress,
      userAgent,

      correlationId,

      input.eventType,
    ],
  );
}


/* ================================================================
   RESULT
   ================================================================ */

function buildResult(
  membership:
    MembershipRow,

  action:
    MembershipLifecycleAction,

  changed:
    boolean,
): MembershipLifecycleResult {
  return {
    membershipId:
      String(
        membership.id,
      ),

    tenantId:
      String(
        membership.tenant_id,
      ),

    userId:
      String(
        membership.user_id,
      ),

    memberType:
      normalizeMemberType(
        membership.member_type,
      ),

    status:
      normalizeStatus(
        membership.status,
      ),

    isOwner:
      membership.is_owner ===
      true,

    removed:
      Boolean(
        membership.deleted_at,
      ),

    suspendedAt:
      toIso(
        membership.suspended_at,
      ),

    deletedAt:
      toIso(
        membership.deleted_at,
      ),

    changed,

    action,
  };
}


/* ================================================================
   SUSPEND MEMBER
   ================================================================ */

export async function suspendWorkspaceMember(
  input:
    MembershipLifecycleInput,
): Promise<MembershipLifecycleResult> {
  const tenantId =
    requireUuid(
      input.tenantId,
      'tenant',
    );


  const actorUserId =
    requireUuid(
      input.actorUserId,
      'actor',
    );


  const targetUserId =
    requireUuid(
      input.targetUserId,
      'target',
    );


  const reason =
    normalizeReason(
      input.reason,
    );


  return withControlTransaction(
    async client => {
      await requireActiveWorkspace(
        client,
        tenantId,
      );


      await requireActingOwner(
        client,
        tenantId,
        actorUserId,
      );


      const target =
        await getTargetMembershipForUpdate(
          client,
          tenantId,
          targetUserId,
        );


      protectOwner(
        target,
      );


      if (
        target.deleted_at
      ) {
        throw new MembershipLifecycleError(
          'MEMBERSHIP_REMOVED',
          'A removed membership must be restored before it can be suspended.',
        );
      }


      const previousStatus =
        normalizeStatus(
          target.status,
        );


      if (
        previousStatus ===
          'suspended'
      ) {
        return buildResult(
          target,
          'suspend',
          false,
        );
      }


      const updated =
        await client.query<MembershipRow>(
          `
            UPDATE tenant_users

            SET
              status =
                'suspended',

              suspended_at =
                NOW(),

              suspended_by =
                $3,

              suspension_reason =
                $4,

              updated_at =
                NOW()

            WHERE tenant_id = $1
              AND user_id = $2
              AND deleted_at IS NULL

            RETURNING
              id,
              tenant_id,
              user_id,
              member_type,
              status,
              is_owner,
              default_company_id,
              suspended_at,
              suspended_by,
              suspension_reason,
              deleted_at,
              removed_by,
              removal_reason
          `,
          [
            tenantId,
            targetUserId,
            actorUserId,
            reason,
          ],
        );


      if (
        updated.rows.length ===
          0
      ) {
        throw new MembershipLifecycleError(
          'MEMBERSHIP_NOT_FOUND',
          'The workspace membership could not be updated.',
        );
      }


      const membership =
        updated.rows[0];


      const clearedSessions =
        await clearCurrentWorkspaceSessions(
          client,
          tenantId,
          targetUserId,
        );


      await insertLifecycleAudit(
        client,
        {
          tenantId,
          actorUserId,
          targetUserId,

          membershipId:
            membership.id,

          action:
            'workspace.member.suspended',

          eventType:
            'workspace.member.suspended',

          reason,

          previousStatus,

          newStatus:
            'suspended',

          previousDeletedAt:
            toIso(
              target.deleted_at,
            ),

          newDeletedAt:
            null,

          clearedSessions,

          audit:
            input.audit,
        },
      );


      return buildResult(
        membership,
        'suspend',
        true,
      );
    },
  );
}


/* ================================================================
   REACTIVATE MEMBER
   ================================================================ */

export async function reactivateWorkspaceMember(
  input:
    MembershipLifecycleInput,
): Promise<MembershipLifecycleResult> {
  const tenantId =
    requireUuid(
      input.tenantId,
      'tenant',
    );


  const actorUserId =
    requireUuid(
      input.actorUserId,
      'actor',
    );


  const targetUserId =
    requireUuid(
      input.targetUserId,
      'target',
    );


  const reason =
    normalizeReason(
      input.reason,
    );


  return withControlTransaction(
    async client => {
      await requireActiveWorkspace(
        client,
        tenantId,
      );


      await requireActingOwner(
        client,
        tenantId,
        actorUserId,
      );


      const target =
        await getTargetMembershipForUpdate(
          client,
          tenantId,
          targetUserId,
        );


      protectOwner(
        target,
      );


      if (
        target.deleted_at
      ) {
        throw new MembershipLifecycleError(
          'MEMBERSHIP_REMOVED',
          'A removed membership must be restored instead of reactivated.',
        );
      }


      const previousStatus =
        normalizeStatus(
          target.status,
        );


      if (
        previousStatus ===
          'active'
      ) {
        return buildResult(
          target,
          'reactivate',
          false,
        );
      }


      const updated =
        await client.query<MembershipRow>(
          `
            UPDATE tenant_users

            SET
              status =
                'active',

              suspended_at =
                NULL,

              suspended_by =
                NULL,

              suspension_reason =
                NULL,

              updated_at =
                NOW()

            WHERE tenant_id = $1
              AND user_id = $2
              AND deleted_at IS NULL

            RETURNING
              id,
              tenant_id,
              user_id,
              member_type,
              status,
              is_owner,
              default_company_id,
              suspended_at,
              suspended_by,
              suspension_reason,
              deleted_at,
              removed_by,
              removal_reason
          `,
          [
            tenantId,
            targetUserId,
          ],
        );


      if (
        updated.rows.length ===
          0
      ) {
        throw new MembershipLifecycleError(
          'MEMBERSHIP_NOT_FOUND',
          'The workspace membership could not be updated.',
        );
      }


      const membership =
        updated.rows[0];


      await insertLifecycleAudit(
        client,
        {
          tenantId,
          actorUserId,
          targetUserId,

          membershipId:
            membership.id,

          action:
            'workspace.member.reactivated',

          eventType:
            'workspace.member.reactivated',

          reason,

          previousStatus,

          newStatus:
            'active',

          previousDeletedAt:
            null,

          newDeletedAt:
            null,

          clearedSessions:
            0,

          audit:
            input.audit,
        },
      );


      return buildResult(
        membership,
        'reactivate',
        true,
      );
    },
  );
}


/* ================================================================
   REMOVE MEMBER
   ================================================================ */

export async function removeWorkspaceMember(
  input:
    MembershipLifecycleInput,
): Promise<MembershipLifecycleResult> {
  const tenantId =
    requireUuid(
      input.tenantId,
      'tenant',
    );


  const actorUserId =
    requireUuid(
      input.actorUserId,
      'actor',
    );


  const targetUserId =
    requireUuid(
      input.targetUserId,
      'target',
    );


  const reason =
    normalizeReason(
      input.reason,
    );


  return withControlTransaction(
    async client => {
      await requireActiveWorkspace(
        client,
        tenantId,
      );


      await requireActingOwner(
        client,
        tenantId,
        actorUserId,
      );


      const target =
        await getTargetMembershipForUpdate(
          client,
          tenantId,
          targetUserId,
        );


      protectOwner(
        target,
      );


      if (
        target.deleted_at
      ) {
        return buildResult(
          target,
          'remove',
          false,
        );
      }


      const previousStatus =
        normalizeStatus(
          target.status,
        );


      const updated =
        await client.query<MembershipRow>(
          `
            UPDATE tenant_users

            SET
              status =
                'suspended',

              suspended_at =
                COALESCE(
                  suspended_at,
                  NOW()
                ),

              suspended_by =
                COALESCE(
                  suspended_by,
                  $3
                ),

              suspension_reason =
                COALESCE(
                  suspension_reason,
                  $4,
                  'Membership removed'
                ),

              deleted_at =
                NOW(),

              removed_by =
                $3,

              removal_reason =
                $4,

              updated_at =
                NOW()

            WHERE tenant_id = $1
              AND user_id = $2
              AND deleted_at IS NULL

            RETURNING
              id,
              tenant_id,
              user_id,
              member_type,
              status,
              is_owner,
              default_company_id,
              suspended_at,
              suspended_by,
              suspension_reason,
              deleted_at,
              removed_by,
              removal_reason
          `,
          [
            tenantId,
            targetUserId,
            actorUserId,
            reason,
          ],
        );


      if (
        updated.rows.length ===
          0
      ) {
        throw new MembershipLifecycleError(
          'MEMBERSHIP_NOT_FOUND',
          'The workspace membership could not be removed.',
        );
      }


      const membership =
        updated.rows[0];


      const clearedSessions =
        await clearCurrentWorkspaceSessions(
          client,
          tenantId,
          targetUserId,
        );


      await insertLifecycleAudit(
        client,
        {
          tenantId,
          actorUserId,
          targetUserId,

          membershipId:
            membership.id,

          action:
            'workspace.member.removed',

          eventType:
            'workspace.member.removed',

          reason,

          previousStatus,

          newStatus:
            'suspended',

          previousDeletedAt:
            null,

          newDeletedAt:
            toIso(
              membership.deleted_at,
            ),

          clearedSessions,

          audit:
            input.audit,
        },
      );


      return buildResult(
        membership,
        'remove',
        true,
      );
    },
  );
}


/* ================================================================
   RESTORE REMOVED MEMBER
   ================================================================ */

export async function restoreWorkspaceMember(
  input:
    MembershipLifecycleInput,
): Promise<MembershipLifecycleResult> {
  const tenantId =
    requireUuid(
      input.tenantId,
      'tenant',
    );


  const actorUserId =
    requireUuid(
      input.actorUserId,
      'actor',
    );


  const targetUserId =
    requireUuid(
      input.targetUserId,
      'target',
    );


  const reason =
    normalizeReason(
      input.reason,
    );


  return withControlTransaction(
    async client => {
      await requireActiveWorkspace(
        client,
        tenantId,
      );


      await requireActingOwner(
        client,
        tenantId,
        actorUserId,
      );


      const target =
        await getTargetMembershipForUpdate(
          client,
          tenantId,
          targetUserId,
        );


      protectOwner(
        target,
      );


      if (
        !target.deleted_at
      ) {
        throw new MembershipLifecycleError(
          'MEMBERSHIP_NOT_REMOVED',
          'This membership has not been removed.',
        );
      }


      const previousStatus =
        normalizeStatus(
          target.status,
        );


      const previousDeletedAt =
        toIso(
          target.deleted_at,
        );


      const updated =
        await client.query<MembershipRow>(
          `
            UPDATE tenant_users

            SET
              status =
                'active',

              suspended_at =
                NULL,

              suspended_by =
                NULL,

              suspension_reason =
                NULL,

              deleted_at =
                NULL,

              removed_by =
                NULL,

              removal_reason =
                NULL,

              updated_at =
                NOW()

            WHERE tenant_id = $1
              AND user_id = $2
              AND deleted_at IS NOT NULL

            RETURNING
              id,
              tenant_id,
              user_id,
              member_type,
              status,
              is_owner,
              default_company_id,
              suspended_at,
              suspended_by,
              suspension_reason,
              deleted_at,
              removed_by,
              removal_reason
          `,
          [
            tenantId,
            targetUserId,
          ],
        );


      if (
        updated.rows.length ===
          0
      ) {
        throw new MembershipLifecycleError(
          'MEMBERSHIP_NOT_REMOVED',
          'The removed membership could not be restored.',
        );
      }


      const membership =
        updated.rows[0];


      await insertLifecycleAudit(
        client,
        {
          tenantId,
          actorUserId,
          targetUserId,

          membershipId:
            membership.id,

          action:
            'workspace.member.restored',

          eventType:
            'workspace.member.restored',

          reason,

          previousStatus,

          newStatus:
            'active',

          previousDeletedAt,

          newDeletedAt:
            null,

          clearedSessions:
            0,

          audit:
            input.audit,
        },
      );


      return buildResult(
        membership,
        'restore',
        true,
      );
    },
  );
}