import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  createWorkspaceNotification,
} from '@/lib/services/workspace-notifications';

export type BillingNotificationInput = {
  tenantId:
    string;
  type:
    string;
  eventKey:
    string;
  title:
    string;
  message:
    string;
  priority?:
    'low' |
    'normal' |
    'high' |
    'urgent';
  href?:
    string;
  dedupeKey:
    string;
  metadata?:
    Record<
      string,
      unknown
    >;
};

async function getBillingNotificationCompanyId(
  tenantId:
    string,
) {
  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT id
        FROM companies
        WHERE is_active =
              TRUE
          AND archived_at
              IS NULL
        ORDER BY
          created_at ASC,
          id ASC
        LIMIT 1
      `,
    );

  return result.rows[0]
    ?.id
    ? String(
        result.rows[0]
          .id,
      )
    : null;
}

async function getWorkspaceOwnerIds(
  tenantId:
    string,
) {
  const result =
    await queryControl(
      `
        SELECT
          tu.user_id
        FROM tenant_users tu
        INNER JOIN users u
          ON u.id =
             tu.user_id
        WHERE tu.tenant_id = $1
          AND tu.deleted_at
              IS NULL
          AND u.deleted_at
              IS NULL
          AND tu.is_owner =
              TRUE
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
        ORDER BY
          tu.created_at ASC,
          tu.user_id ASC
      `,
      [
        tenantId,
      ],
    );

  return result.rows
    .map(
      row =>
        String(
          row.user_id,
        ),
    );
}

export async function notifyWorkspaceOwnersOfBillingEvent(
  input:
    BillingNotificationInput,
) {
  const [
    ownerIds,
    companyId,
  ] =
    await Promise.all([
      getWorkspaceOwnerIds(
        input.tenantId,
      ),
      getBillingNotificationCompanyId(
        input.tenantId,
      ),
    ]);

  const results =
    await Promise.allSettled(
      ownerIds.map(
        userId =>
          createWorkspaceNotification({
            tenantId:
              input.tenantId,
            recipientUserId:
              userId,
            companyId,
            type:
              input.type,
            eventKey:
              input.eventKey,
            priority:
              input.priority ||
              'high',
            title:
              input.title,
            message:
              input.message,
            href:
              input.href ||
              '/settings?tab=billing',
            sourceModule:
              'core.billing',
            sourceModel:
              'subscription',
            dedupeKey:
              `${input.dedupeKey}:${userId}`,
            metadata:
              input.metadata ||
              {},
            forceEmail:
              true,
            forceSms:
              true,
            critical:
              true,
          }),
      ),
    );

  const failed =
    results.filter(
      result =>
        result.status ===
        'rejected',
    );

  if (
    failed.length >
      0
  ) {
    console.error(
      '[SaMi Billing] Some owner notifications failed:',
      {
        tenantId:
          input.tenantId,
        failed:
          failed.length,
      },
    );
  }

  return {
    owners:
      ownerIds.length,
    delivered:
      results.length -
      failed.length,
    failed:
      failed.length,
  };
}
