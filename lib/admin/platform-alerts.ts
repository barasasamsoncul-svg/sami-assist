import 'server-only';

import crypto from 'node:crypto';

import {
  queryControl,
} from '@/lib/db/control';

import {
  sendWorkspaceNotificationEmail,
} from '@/lib/services/email';

import {
  getSamiSmsProvider,
  sendWorkspaceNotificationSms,
} from '@/lib/services/sms';


type AlertSeverity =
  | 'info'
  | 'warning'
  | 'error'
  | 'critical';


type AdminAlertRecipient = {
  admin_id:
    string;
  first_name:
    string | null;
  last_name:
    string | null;
  email:
    string;
  role:
    string;
  email_enabled:
    boolean;
  sms_enabled:
    boolean;
  sms_phone_e164:
    string | null;
  warning_email:
    boolean;
  critical_email:
    boolean;
  warning_sms:
    boolean;
  critical_sms:
    boolean;
  service_alerts_enabled:
    boolean;
  incident_alerts_enabled:
    boolean;
};


function fingerprint(
  value:
    string,
) {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      value,
      'utf8',
    )
    .digest(
      'hex',
    );
}


function displayName(
  row:
    AdminAlertRecipient,
) {
  return [
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
    'Platform Administrator';
}


function shouldEmail(
  row:
    AdminAlertRecipient,
  severity:
    AlertSeverity,
) {
  if (
    !row.email_enabled
  ) {
    return false;
  }

  if (
    severity ===
      'critical' ||
    severity ===
      'error'
  ) {
    return row
      .critical_email;
  }

  return row
    .warning_email;
}


function shouldSms(
  row:
    AdminAlertRecipient,
  severity:
    AlertSeverity,
) {
  if (
    !row.sms_enabled ||
    !row.sms_phone_e164
  ) {
    return false;
  }

  if (
    severity ===
      'critical' ||
    severity ===
      'error'
  ) {
    return row
      .critical_sms;
  }

  return row
    .warning_sms;
}


async function recipients(
  alertType:
    'service' |
    'incident',
) {
  const result =
    await queryControl(
      `
        SELECT
          a.id
            AS admin_id,
          a.first_name,
          a.last_name,
          a.email,
          a.role,

          COALESCE(
            p.email_enabled,
            TRUE
          )
            AS email_enabled,

          COALESCE(
            p.sms_enabled,
            FALSE
          )
            AS sms_enabled,

          p.sms_phone_e164,

          COALESCE(
            p.warning_email,
            TRUE
          )
            AS warning_email,

          COALESCE(
            p.critical_email,
            TRUE
          )
            AS critical_email,

          COALESCE(
            p.warning_sms,
            FALSE
          )
            AS warning_sms,

          COALESCE(
            p.critical_sms,
            TRUE
          )
            AS critical_sms,

          COALESCE(
            p.service_alerts_enabled,
            TRUE
          )
            AS service_alerts_enabled,

          COALESCE(
            p.incident_alerts_enabled,
            TRUE
          )
            AS incident_alerts_enabled

        FROM platform_admins a

        LEFT JOIN platform_admin_alert_preferences p
          ON p.admin_id =
             a.id

        WHERE a.deleted_at
              IS NULL
          AND a.status =
              'active'
          AND a.email_verified =
              TRUE
          AND a.role IN (
            'super_admin',
            'operations_admin',
            'billing_admin'
          )
          AND (
            (
              $1 =
                'service'
              AND COALESCE(
                    p.service_alerts_enabled,
                    TRUE
                  ) =
                  TRUE
            )
            OR
            (
              $1 =
                'incident'
              AND COALESCE(
                    p.incident_alerts_enabled,
                    TRUE
                  ) =
                  TRUE
            )
          )

        ORDER BY
          CASE a.role
            WHEN 'super_admin'
            THEN 0
            WHEN 'operations_admin'
            THEN 1
            ELSE 2
          END,
          a.created_at ASC
      `,
      [
        alertType,
      ],
    );

  return result
    .rows as
      AdminAlertRecipient[];
}


async function claimDelivery(
  input: {
    adminId:
      string;
    serviceEventId?:
      string |
      null;
    incidentId?:
      string |
      null;
    channel:
      'email' |
      'sms';
    destination:
      string;
  },
) {
  const result =
    await queryControl(
      `
        INSERT INTO platform_admin_alert_deliveries (
          admin_id,
          service_event_id,
          incident_id,
          channel,
          destination_fingerprint,
          status,
          attempt_count,
          last_attempt_at,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          'pending',
          1,
          NOW(),
          NOW(),
          NOW()
        )
        ON CONFLICT
        DO NOTHING
        RETURNING id
      `,
      [
        input.adminId,
        input.serviceEventId ||
        null,
        input.incidentId ||
        null,
        input.channel,
        fingerprint(
          input.destination
            .trim()
            .toLowerCase(),
        ),
      ],
    );

  return result.rows[0]
    ?.id
    ? String(
        result.rows[0]
          .id,
      )
    : null;
}


async function finishDelivery(
  input: {
    deliveryId:
      string;
    status:
      'sent' |
      'failed' |
      'skipped';
    provider?:
      string |
      null;
    messageId?:
      string |
      null;
    errorCode?:
      string |
      null;
    metadata?:
      Record<
        string,
        unknown
      >;
  },
) {
  try {
    await queryControl(
      `
        UPDATE platform_admin_alert_deliveries
        SET
          status =
            $2,
          provider =
            $3,
          provider_message_id =
            $4,
          error_code =
            $5,
          sent_at =
            CASE
              WHEN $2 =
                   'sent'
              THEN NOW()
              ELSE sent_at
            END,
          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            ) ||
            $6::jsonb,
          last_attempt_at =
            NOW(),
          updated_at =
            NOW()
        WHERE id = $1
      `,
      [
        input.deliveryId,
        input.status,
        input.provider ||
        null,
        input.messageId ||
        null,
        input.errorCode ||
        null,
        JSON.stringify(
          input.metadata ||
          {},
        ),
      ],
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Platform Alerts] Delivery ledger update failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown delivery-ledger failure',
    );
  }
}


async function deliverEmail(
  input: {
    recipient:
      AdminAlertRecipient;
    serviceEventId?:
      string |
      null;
    incidentId?:
      string |
      null;
    title:
      string;
    message:
      string;
    actionHref:
      string;
  },
) {
  const deliveryId =
    await claimDelivery({
      adminId:
        input.recipient
          .admin_id,
      serviceEventId:
        input.serviceEventId,
      incidentId:
        input.incidentId,
      channel:
        'email',
      destination:
        input.recipient
          .email,
    });

  if (
    !deliveryId
  ) {
    return {
      sent:
        false,
      duplicate:
        true,
    };
  }

  try {
    const result =
      await sendWorkspaceNotificationEmail(
        input.recipient
          .email,
        displayName(
          input.recipient,
        ),
        {
          title:
            input.title,
          message:
            input.message,
          actionHref:
            input.actionHref,
          audience:
            'platform_admin',
        },
      );

    await finishDelivery({
      deliveryId,
      status:
        result.success
          ? 'sent'
          : 'failed',
      provider:
        'smtp',
      messageId:
        result.messageId ||
        null,
      errorCode:
        result.success
          ? null
          : 'EMAIL_NOT_DELIVERED',
    });

    return {
      sent:
        result.success,
      duplicate:
        false,
    };
  } catch (
    error
  ) {
    await finishDelivery({
      deliveryId,
      status:
        'failed',
      provider:
        'smtp',
      errorCode:
        error instanceof
          Error
          ? error.message
              .slice(
                0,
                160,
              )
          : 'EMAIL_PROVIDER_FAILED',
    });

    return {
      sent:
        false,
      duplicate:
        false,
    };
  }
}


async function deliverSms(
  input: {
    recipient:
      AdminAlertRecipient;
    serviceEventId?:
      string |
      null;
    incidentId?:
      string |
      null;
    title:
      string;
    message:
      string;
  },
) {
  const phone =
    input.recipient
      .sms_phone_e164;

  if (
    !phone
  ) {
    return {
      sent:
        false,
      duplicate:
        false,
    };
  }

  const deliveryId =
    await claimDelivery({
      adminId:
        input.recipient
          .admin_id,
      serviceEventId:
        input.serviceEventId,
      incidentId:
        input.incidentId,
      channel:
        'sms',
      destination:
        phone,
    });

  if (
    !deliveryId
  ) {
    return {
      sent:
        false,
      duplicate:
        true,
    };
  }

  const result =
    await sendWorkspaceNotificationSms(
      phone,
      {
        title:
          input.title,
        message:
          input.message,
      },
    );

  await finishDelivery({
    deliveryId,
    status:
      result.success
        ? 'sent'
        : 'failed',
    provider:
      result.provider,
    messageId:
      result.messageId ||
      null,
    errorCode:
      result.errorCode ||
      null,
  });

  return {
    sent:
      result.success,
    duplicate:
      false,
  };
}


export async function notifyPlatformAdminsOfServiceEvent(
  input: {
    serviceEventId:
      string;
    severity:
      AlertSeverity;
    title:
      string;
    message:
      string;
    serviceKey:
      string;
  },
) {
  try {
    const rows =
      await recipients(
        'service',
      );

    let emailSent =
      0;

    let smsSent =
      0;

    let duplicate =
      0;

    for (
      const recipient
      of rows
    ) {
      if (
        shouldEmail(
          recipient,
          input.severity,
        )
      ) {
        const result =
          await deliverEmail({
            recipient,
            serviceEventId:
              input.serviceEventId,
            title:
              input.title,
            message:
              input.message,
            actionHref:
              '/admin/operations/services',
          });

        if (
          result.sent
        ) {
          emailSent +=
            1;
        }

        if (
          result.duplicate
        ) {
          duplicate +=
            1;
        }
      }

      if (
        shouldSms(
          recipient,
          input.severity,
        )
      ) {
        const result =
          await deliverSms({
            recipient,
            serviceEventId:
              input.serviceEventId,
            title:
              input.title,
            message:
              input.message,
          });

        if (
          result.sent
        ) {
          smsSent +=
            1;
        }

        if (
          result.duplicate
        ) {
          duplicate +=
            1;
        }
      }
    }

    return {
      recipients:
        rows.length,
      emailSent,
      smsSent,
      duplicate,
    };
  } catch (
    error
  ) {
    /*
     * Alerting must never be able to stop the infrastructure
     * monitor that detected the problem in the first place.
     */
    console.error(
      '[SaMi Platform Alerts] Service alert delivery failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown platform-alert failure',
    );

    return {
      recipients:
        0,
      emailSent:
        0,
      smsSent:
        0,
      duplicate:
        0,
    };
  }
}


export function getPlatformAlertSmsProvider() {
  return getSamiSmsProvider();
}
