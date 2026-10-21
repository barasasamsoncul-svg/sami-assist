import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  sendWorkspaceNotificationEmail,
} from '@/lib/services/email';

import {
  sendWorkspaceNotificationSms,
} from '@/lib/services/sms';

type JsonRecord = Record<string, unknown>;

type PendingDelivery = {
  id: string;
  notification_id: string;
  recipient_user_id: string;
  channel: 'email' | 'sms';
  attempts: number;
  title: string;
  message: string | null;
  link: string | null;
  type: string;
  source_module: string | null;
  delivery_metadata: JsonRecord | null;
};

function record(value: unknown): JsonRecord {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function emailStatusFor(type: string) {
  const value = type.toLowerCase();

  if (
    value.includes('succeeded') ||
    value.includes('payment_received') ||
    value.includes('renewed') ||
    value.includes('continues')
  ) {
    return 'success' as const;
  }

  if (
    value.includes('failed') ||
    value.includes('past_due') ||
    value.includes('suspended') ||
    value.includes('cancelled') ||
    value.includes('canceled')
  ) {
    return 'critical' as const;
  }

  if (
    value.includes('due_soon') ||
    value.includes('reminder') ||
    value.includes('cancellation_scheduled')
  ) {
    return 'warning' as const;
  }

  return 'info' as const;
}

async function claimPendingDeliveries(
  tenantId: string,
  limit: number,
) {
  const pool = await getTenantPoolByTenantId(tenantId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const selected = await client.query(
      `
        SELECT
          d.id,
          d.notification_id,
          d.recipient_user_id,
          d.channel,
          d.attempts,
          d.metadata AS delivery_metadata,
          n.title,
          n.message,
          n.link,
          n.type,
          n.source_module
        FROM notification_deliveries d
        INNER JOIN notifications n
          ON n.id = d.notification_id
        WHERE d.channel IN ('email', 'sms')
          AND d.attempts < 8
          AND (
            d.status IN ('pending', 'failed')
            OR (
              d.status = 'sending'
              AND d.updated_at <= NOW() - INTERVAL '30 minutes'
            )
          )
          AND (
            d.last_attempt_at IS NULL
            OR d.last_attempt_at <= NOW() -
              CASE
                WHEN d.attempts <= 1 THEN INTERVAL '15 minutes'
                WHEN d.attempts = 2 THEN INTERVAL '1 hour'
                WHEN d.attempts = 3 THEN INTERVAL '6 hours'
                ELSE INTERVAL '1 day'
              END
          )
          AND n.archived_at IS NULL
        ORDER BY
          d.created_at ASC,
          d.id ASC
        LIMIT $1
        FOR UPDATE OF d SKIP LOCKED
      `,
      [limit],
    );

    const rows =
      selected.rows as PendingDelivery[];

    for (const row of rows) {
      await client.query(
        `
          UPDATE notification_deliveries
          SET
            status = 'sending',
            attempts = attempts + 1,
            last_attempt_at = NOW(),
            error_code = NULL,
            error_message = NULL,
            updated_at = NOW()
          WHERE id = $1
        `,
        [row.id],
      );

      row.attempts =
        Number(row.attempts || 0) + 1;
    }

    await client.query('COMMIT');

    return rows;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original claim error.
    }

    throw error;
  } finally {
    client.release();
  }
}

async function getRecipient(
  tenantId: string,
  userId: string,
) {
  const result = await queryControl(
    `
      SELECT
        u.email,
        u.phone,
        u.first_name,
        u.last_name
      FROM tenant_users tu
      INNER JOIN users u
        ON u.id = tu.user_id
      WHERE tu.tenant_id = $1
        AND tu.user_id = $2
        AND tu.deleted_at IS NULL
        AND u.deleted_at IS NULL
        AND LOWER(COALESCE(tu.status, '')) = 'active'
        AND LOWER(COALESCE(tu.member_type, '')) = 'internal'
      LIMIT 1
    `,
    [tenantId, userId],
  );

  return result.rows[0] as {
    email: string | null;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
  } | undefined;
}

async function finishDelivery(
  tenantId: string,
  delivery: PendingDelivery,
  input: {
    success: boolean;
    messageId?: string;
    errorCode?: string;
    errorMessage?: string;
  },
) {
  const pool = await getTenantPoolByTenantId(tenantId);
  const maxedAttempts =
    !input.success &&
    delivery.attempts >= 8;

  await pool.query(
    `
      UPDATE notification_deliveries
      SET
        status = $2,
        provider_message_id = COALESCE($3, provider_message_id),
        sent_at =
          CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
        failed_at =
          CASE WHEN $2 = 'failed' THEN NOW() ELSE NULL END,
        error_code = $4,
        error_message = $5,
        attempts =
          CASE WHEN $6::boolean THEN 8 ELSE attempts END,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      delivery.id,
      input.success ? 'sent' : 'failed',
      input.messageId || null,
      input.success ? null : (input.errorCode || 'DELIVERY_FAILED'),
      input.success ? null : (input.errorMessage || 'Notification delivery attempt failed.'),
      maxedAttempts,
    ],
  );
}

async function deliverOne(
  tenantId: string,
  delivery: PendingDelivery,
) {
  const payload = record(delivery.delivery_metadata);
  const recipient = await getRecipient(
    tenantId,
    delivery.recipient_user_id,
  );

  if (!recipient) {
    await finishDelivery(tenantId, delivery, {
      success: false,
      errorCode: 'RECIPIENT_UNAVAILABLE',
      errorMessage: 'The recipient is no longer an active workspace member.',
    });
    return false;
  }

  if (delivery.channel === 'email') {
    const name =
      [recipient.first_name, recipient.last_name]
        .filter(isText)
        .join(' ')
        .trim() || 'there';

    try {
      const sent = await sendWorkspaceNotificationEmail(
        String(recipient.email || ''),
        name,
        {
          title: delivery.title,
          message:
            isText(payload.emailMessage)
              ? payload.emailMessage
              : (delivery.message || ''),
          actionHref:
            isText(payload.actionHref)
              ? payload.actionHref
              : delivery.link,
          actionLabel:
            isText(payload.actionLabel)
              ? payload.actionLabel
              : 'Open in SaMi',
          variant:
            payload.emailVariant === 'billing' ||
            delivery.source_module === 'core.billing'
              ? 'billing'
              : 'default',
          status:
            payload.emailStatus === 'success' ||
            payload.emailStatus === 'warning' ||
            payload.emailStatus === 'critical' ||
            payload.emailStatus === 'info'
              ? payload.emailStatus
              : emailStatusFor(delivery.type),
          details:
            Array.isArray(payload.emailDetails)
              ? payload.emailDetails
                  .filter(item => {
                    const value = record(item);
                    return isText(value.label) && isText(value.value);
                  })
                  .slice(0, 8)
                  .map(item => ({
                    label: String(record(item).label).slice(0, 80),
                    value: String(record(item).value).slice(0, 180),
                  }))
              : [],
        },
      );

      await finishDelivery(tenantId, delivery, {
        success: sent.success,
        messageId: sent.messageId,
        errorCode: sent.success ? undefined : 'EMAIL_DELIVERY_FAILED',
      });

      return sent.success;
    } catch (error) {
      await finishDelivery(tenantId, delivery, {
        success: false,
        errorCode: 'EMAIL_DELIVERY_FAILED',
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'Email delivery failed.',
      });
      return false;
    }
  }

  try {
    const sent = await sendWorkspaceNotificationSms(
      recipient.phone,
      {
        title: delivery.title,
        message:
          isText(payload.smsMessage)
            ? payload.smsMessage
            : (delivery.message || ''),
      },
    );

    await finishDelivery(tenantId, delivery, {
      success: sent.success,
      messageId: sent.messageId,
      errorCode: sent.errorCode,
    });

    return sent.success;
  } catch (error) {
    await finishDelivery(tenantId, delivery, {
      success: false,
      errorCode: 'SMS_DELIVERY_FAILED',
      errorMessage:
        error instanceof Error
          ? error.message.slice(0, 500)
          : 'SMS delivery failed.',
    });
    return false;
  }
}

export async function retryPendingNotificationDeliveries(
  input: {
    maxTenants?: number;
    perTenantLimit?: number;
  } = {},
) {
  const maxTenants = Math.min(
    500,
    Math.max(1, Math.floor(input.maxTenants || 200)),
  );
  const perTenantLimit = Math.min(
    100,
    Math.max(1, Math.floor(input.perTenantLimit || 20)),
  );

  const tenantResult = await queryControl(
    `
      SELECT id
      FROM tenants
      WHERE deleted_at IS NULL
      ORDER BY created_at ASC, id ASC
      LIMIT $1
    `,
    [maxTenants],
  );

  const report = {
    tenantsChecked: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    tenantFailures: 0,
  };

  for (const tenant of tenantResult.rows) {
    const tenantId = String(tenant.id);
    report.tenantsChecked += 1;

    try {
      const deliveries = await claimPendingDeliveries(
        tenantId,
        perTenantLimit,
      );

      for (const delivery of deliveries) {
        report.attempted += 1;

        const success = await deliverOne(
          tenantId,
          delivery,
        ).catch(error => {
          console.error(
            '[SaMi Notifications] Delivery retry failed:',
            {
              tenantId,
              deliveryId: delivery.id,
              channel: delivery.channel,
              error,
            },
          );
          return false;
        });

        if (success) {
          report.sent += 1;
        } else {
          report.failed += 1;
        }
      }
    } catch (error) {
      report.tenantFailures += 1;
      console.error(
        '[SaMi Notifications] Could not retry tenant notification deliveries:',
        {
          tenantId,
          error,
        },
      );
    }
  }

  return report;
}
