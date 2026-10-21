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
  emailMessage?:
    string | null;
  smsMessage?:
    string | null;
  emailStatus?:
    'success' | 'info' | 'warning' | 'critical';
  emailDetails?:
    Array<{
      label: string;
      value: string;
    }>;
};


function scalarText(value: unknown): string | null {
  if (
    typeof value === 'string' &&
    value.trim()
  ) {
    return value.trim();
  }

  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value.toLocaleString('en-KE', {
      maximumFractionDigits: 2,
    });
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString('en-KE', {
      dateStyle: 'medium',
      timeZone: 'Africa/Nairobi',
    });
  }

  return null;
}

function buildBillingEmailDetails(
  metadata: Record<string, unknown> | undefined,
) {
  if (!metadata) {
    return [];
  }

  const details: Array<{ label: string; value: string }> = [];
  const currency = scalarText(metadata.currency);
  const amount =
    typeof metadata.amount === 'number'
      ? metadata.amount
      : Number(metadata.amount);

  if (
    metadata.amount !== undefined &&
    Number.isFinite(amount) &&
    amount >= 0
  ) {
    details.push({
      label: 'Amount',
      value: currency
        ? `${currency.toUpperCase()} ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    });
  }

  const fields: Array<[string, string]> = [
    ['plan', 'Plan'],
    ['billingBoundary', 'Billing date'],
    ['graceEndsAt', 'Grace period ends'],
    ['effectiveAt', 'Effective date'],
    ['daysPastDue', 'Days overdue'],
    ['reminderDays', 'Reminder window'],
    ['phase', 'Payment status'],
    ['paymentState', 'Payment status'],
    ['provider', 'Payment provider'],
  ];

  for (const [key, label] of fields) {
    const value = scalarText(metadata[key]);

    if (!value) {
      continue;
    }

    let displayValue = value;

    if (
      (key === 'billingBoundary' ||
       key === 'graceEndsAt' ||
       key === 'effectiveAt') &&
      metadata[key]
    ) {
      const date = new Date(String(metadata[key]));

      if (!Number.isNaN(date.getTime())) {
        displayValue = date.toLocaleDateString('en-KE', {
          dateStyle: 'medium',
          timeZone: 'Africa/Nairobi',
        });
      }
    }

    details.push({
      label,
      value:
        key === 'reminderDays'
          ? `Within ${displayValue} day(s)`
          : displayValue,
    });
  }

  return details.slice(0, 6);
}

function defaultEmailStatus(
  eventType: string,
): 'success' | 'info' | 'warning' | 'critical' {
  const key = eventType.toLowerCase();

  if (
    key.includes('succeeded') ||
    key.includes('payment_received') ||
    key.includes('continues') ||
    key.includes('renewed')
  ) {
    return 'success';
  }

  if (
    key.includes('failed') ||
    key.includes('past_due') ||
    key.includes('suspended') ||
    key.includes('cancelled') ||
    key.includes('canceled')
  ) {
    return 'critical';
  }

  if (
    key.includes('due_soon') ||
    key.includes('reminder') ||
    key.includes('cancellation_scheduled')
  ) {
    return 'warning';
  }

  return 'info';
}

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
            emailMessage:
              input.emailMessage !== undefined
                ? input.emailMessage
                : input.message,
            smsMessage:
              input.smsMessage !== undefined
                ? input.smsMessage
                : input.message
                    .replace(/\\s+/g, ' ')
                    .slice(0, 220),
            emailVariant:
              'billing',
            emailStatus:
              input.emailStatus ||
              defaultEmailStatus(input.type),
            emailDetails:
              input.emailDetails ||
              buildBillingEmailDetails(input.metadata),
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
