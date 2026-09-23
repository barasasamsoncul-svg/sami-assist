import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';


const DEFAULT_PAGE_SIZE =
  25;

const MAX_PAGE_SIZE =
  100;

const MAX_SEARCH_LENGTH =
  120;


function integer(
  value:
    unknown,
  fallback:
    number,
  minimum:
    number,
  maximum:
    number,
) {
  const parsed =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.floor(
        parsed,
      ),
    ),
  );
}


function searchText(
  value:
    unknown,
) {
  return typeof value ===
    'string'
    ? value
        .trim()
        .slice(
          0,
          MAX_SEARCH_LENGTH,
        )
    : '';
}


function toIso(
  value:
    Date |
    string |
    null |
    undefined,
) {
  if (
    !value
  ) {
    return null;
  }

  const date =
    value instanceof
      Date
      ? value
      : new Date(
          value,
        );

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}


function isUndefinedTable(
  error:
    unknown,
) {
  return Boolean(
    error &&
    typeof error ===
      'object' &&
    'code' in
      error &&
    String(
      (
        error as {
          code?:
            unknown;
        }
      ).code ||
      '',
    ) ===
      '42P01',
  );
}


export async function listAdminAlertDeliveries(
  input: {
    page?:
      unknown;
    limit?:
      unknown;
    search?:
      unknown;
  } = {},
) {
  const page =
    integer(
      input.page,
      1,
      1,
      1_000_000,
    );

  const limit =
    integer(
      input.limit,
      DEFAULT_PAGE_SIZE,
      1,
      MAX_PAGE_SIZE,
    );

  const offset =
    (
      page -
      1
    ) *
    limit;

  const search =
    searchText(
      input.search,
    );

  const pattern =
    search
      ? `%${search}%`
      : null;

  const filter =
    `
      (
        $1::text IS NULL
        OR a.email ILIKE $1
        OR COALESCE(
             a.first_name,
             ''
           ) ILIKE $1
        OR COALESCE(
             a.last_name,
             ''
           ) ILIKE $1
        OR COALESCE(
             d.channel,
             ''
           ) ILIKE $1
        OR COALESCE(
             d.status,
             ''
           ) ILIKE $1
        OR COALESCE(
             d.provider,
             ''
           ) ILIKE $1
        OR COALESCE(
             d.error_code,
             ''
           ) ILIKE $1
        OR COALESCE(
             service.service_name,
             ''
           ) ILIKE $1
        OR COALESCE(
             service.service_key,
             ''
           ) ILIKE $1
        OR COALESCE(
             incident.title,
             ''
           ) ILIKE $1
      )
    `;

  try {
    const [
      countResult,
      rowsResult,
      summaryResult,
    ] =
      await Promise.all([
        queryControl(
          `
            SELECT
              COUNT(*)::int
                AS count

            FROM platform_admin_alert_deliveries d

            INNER JOIN platform_admins a
              ON a.id =
                 d.admin_id

            LEFT JOIN platform_service_events service_event
              ON service_event.id =
                 d.service_event_id

            LEFT JOIN platform_service_subscriptions service
              ON service.id =
                 service_event.subscription_id

            LEFT JOIN platform_incidents incident
              ON incident.id =
                 d.incident_id

            WHERE
              ${filter}
          `,
          [
            pattern,
          ],
        ),

        queryControl(
          `
            SELECT
              d.id,
              d.channel,
              d.status,
              d.provider,
              d.provider_message_id,
              d.error_code,
              d.attempt_count,
              d.last_attempt_at,
              d.sent_at,
              d.created_at,

              a.id
                AS admin_id,
              a.first_name
                AS admin_first_name,
              a.last_name
                AS admin_last_name,
              a.email
                AS admin_email,

              service.service_key,
              service.service_name,

              incident.id
                AS incident_id,
              incident.title
                AS incident_title,
              incident.severity
                AS incident_severity

            FROM platform_admin_alert_deliveries d

            INNER JOIN platform_admins a
              ON a.id =
                 d.admin_id

            LEFT JOIN platform_service_events service_event
              ON service_event.id =
                 d.service_event_id

            LEFT JOIN platform_service_subscriptions service
              ON service.id =
                 service_event.subscription_id

            LEFT JOIN platform_incidents incident
              ON incident.id =
                 d.incident_id

            WHERE
              ${filter}

            ORDER BY
              d.last_attempt_at DESC,
              d.created_at DESC,
              d.id DESC

            LIMIT $2
            OFFSET $3
          `,
          [
            pattern,
            limit,
            offset,
          ],
        ),

        queryControl(
          `
            SELECT
              COUNT(*) FILTER (
                WHERE status =
                      'sent'
              )::int
                AS sent,

              COUNT(*) FILTER (
                WHERE status =
                      'failed'
              )::int
                AS failed,

              COUNT(*) FILTER (
                WHERE status =
                      'pending'
              )::int
                AS pending,

              COUNT(*) FILTER (
                WHERE status =
                      'skipped'
              )::int
                AS skipped,

              COUNT(*) FILTER (
                WHERE channel =
                      'email'
              )::int
                AS email,

              COUNT(*) FILTER (
                WHERE channel =
                      'sms'
              )::int
                AS sms

            FROM platform_admin_alert_deliveries

            WHERE created_at >=
                  NOW() -
                  INTERVAL '24 hours'
          `,
        ),
      ]);

    const total =
      Number(
        countResult.rows[0]
          ?.count ||
        0,
      );

    const summary =
      summaryResult.rows[0] ||
      {};

    return {
      available:
        true,
      page,
      limit,
      total,
      totalPages:
        Math.max(
          1,
          Math.ceil(
            total /
            limit,
          ),
        ),
      summary: {
        sent:
          Number(
            summary.sent ||
            0,
          ),
        failed:
          Number(
            summary.failed ||
            0,
          ),
        pending:
          Number(
            summary.pending ||
            0,
          ),
        skipped:
          Number(
            summary.skipped ||
            0,
          ),
        email:
          Number(
            summary.email ||
            0,
          ),
        sms:
          Number(
            summary.sms ||
            0,
          ),
      },
      items:
        rowsResult.rows.map(
          row => ({
            id:
              String(
                row.id,
              ),
            channel:
              String(
                row.channel ||
                'unknown',
              ),
            status:
              String(
                row.status ||
                'unknown',
              ),
            provider:
              row.provider
                ? String(
                    row.provider,
                  )
                : null,

            /*
             * Provider message IDs are useful for support/provider
             * correlation and are not delivery destinations.
             */
            providerMessageId:
              row.provider_message_id
                ? String(
                    row.provider_message_id,
                  )
                : null,
            errorCode:
              row.error_code
                ? String(
                    row.error_code,
                  )
                : null,
            attemptCount:
              Number(
                row.attempt_count ||
                0,
              ),
            lastAttemptAt:
              toIso(
                row.last_attempt_at,
              ),
            sentAt:
              toIso(
                row.sent_at,
              ),
            createdAt:
              toIso(
                row.created_at,
              ),
            admin: {
              id:
                String(
                  row.admin_id,
                ),
              name:
                [
                  row.admin_first_name,
                  row.admin_last_name,
                ]
                  .filter(
                    Boolean,
                  )
                  .join(
                    ' ',
                  )
                  .trim() ||
                String(
                  row.admin_email ||
                  'Platform Administrator',
                ),
              email:
                String(
                  row.admin_email ||
                  '',
                ),
            },
            context:
              row.service_key
                ? {
                    kind:
                      'service' as const,
                    key:
                      String(
                        row.service_key,
                      ),
                    label:
                      String(
                        row.service_name ||
                        row.service_key,
                      ),
                    severity:
                      null,
                  }
                : row.incident_id
                  ? {
                      kind:
                        'incident' as const,
                      key:
                        String(
                          row.incident_id,
                        ),
                      label:
                        String(
                          row.incident_title ||
                          'Platform incident',
                        ),
                      severity:
                        row.incident_severity
                          ? String(
                              row.incident_severity,
                            )
                          : null,
                    }
                  : {
                      kind:
                        'platform' as const,
                      key:
                        null,
                      label:
                        'Platform alert',
                      severity:
                        null,
                    },
          }),
        ),
    };
  } catch (
    error
  ) {
    if (
      !isUndefinedTable(
        error,
      )
    ) {
      throw error;
    }

    /*
     * Migration 006 may not be applied yet. Notifications must
     * remain usable so Platform Admin can see that the delivery
     * ledger is waiting for its control migration.
     */
    return {
      available:
        false,
      page,
      limit,
      total:
        0,
      totalPages:
        1,
      summary: {
        sent:
          0,
        failed:
          0,
        pending:
          0,
        skipped:
          0,
        email:
          0,
        sms:
          0,
      },
      items:
        [],
    };
  }
}
