import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';


const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


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


function pageNumber(
  value:
    unknown,
) {
  const parsed =
    Number(
      value,
    );

  return Number.isInteger(
    parsed,
  ) &&
    parsed >
      0
    ? Math.min(
        parsed,
        1_000_000,
      )
    : 1;
}


function pageLimit(
  value:
    unknown,
) {
  const parsed =
    Number(
      value,
    );

  return Number.isInteger(
    parsed,
  ) &&
    parsed >
      0
    ? Math.min(
        parsed,
        100,
      )
    : 25;
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
          120,
        )
    : '';
}


export async function listPlatformIncidents(
  input: {
    page?:
      unknown;
    limit?:
      unknown;
    search?:
      unknown;
    status?:
      unknown;
    severity?:
      unknown;
  } = {},
) {
  const page =
    pageNumber(
      input.page,
    );

  const limit =
    pageLimit(
      input.limit,
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

  const status =
    typeof input.status ===
      'string'
      ? input.status
          .trim()
          .toLowerCase()
      : '';

  const severity =
    typeof input.severity ===
      'string'
      ? input.severity
          .trim()
          .toLowerCase()
      : '';

  const validStatus =
    [
      'open',
      'acknowledged',
      'resolved',
      'ignored',
    ].includes(
      status,
    )
      ? status
      : null;

  const validSeverity =
    [
      'info',
      'warning',
      'error',
      'critical',
    ].includes(
      severity,
    )
      ? severity
      : null;

  const [
    countResult,
    rowsResult,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM platform_incidents i
          WHERE (
            $1::text IS NULL
            OR i.status =
               $1
          )
            AND (
              $2::text IS NULL
              OR i.severity =
                 $2
            )
            AND (
              $3::text IS NULL
              OR i.title
                   ILIKE $3
              OR COALESCE(
                   i.latest_message,
                   ''
                 )
                   ILIKE $3
              OR COALESCE(
                   i.error_code,
                   ''
                 )
                   ILIKE $3
              OR COALESCE(
                   i.route,
                   ''
                 )
                   ILIKE $3
              OR COALESCE(
                   i.provider,
                   ''
                 )
                   ILIKE $3
            )
        `,
        [
          validStatus,
          validSeverity,
          pattern,
        ],
      ),

      queryControl(
        `
          SELECT
            i.id,
            i.status,
            i.severity,
            i.source,
            i.provider,
            i.category,
            i.title,
            i.error_name,
            i.error_code,
            i.route,
            i.operation,
            i.tenant_id,
            i.user_id,
            i.occurrence_count,
            i.first_seen_at,
            i.last_seen_at,
            i.latest_correlation_id,
            i.latest_request_id,
            i.latest_status_code,
            i.latest_message,
            i.acknowledged_at,
            i.resolved_at,
            t.name
              AS tenant_name,
            u.email
              AS user_email
          FROM platform_incidents i
          LEFT JOIN tenants t
            ON t.id =
               i.tenant_id
          LEFT JOIN users u
            ON u.id =
               i.user_id
          WHERE (
            $1::text IS NULL
            OR i.status =
               $1
          )
            AND (
              $2::text IS NULL
              OR i.severity =
                 $2
            )
            AND (
              $3::text IS NULL
              OR i.title
                   ILIKE $3
              OR COALESCE(
                   i.latest_message,
                   ''
                 )
                   ILIKE $3
              OR COALESCE(
                   i.error_code,
                   ''
                 )
                   ILIKE $3
              OR COALESCE(
                   i.route,
                   ''
                 )
                   ILIKE $3
              OR COALESCE(
                   i.provider,
                   ''
                 )
                   ILIKE $3
            )
          ORDER BY
            CASE i.status
              WHEN 'open'
              THEN 0
              WHEN 'acknowledged'
              THEN 1
              ELSE 2
            END,
            CASE i.severity
              WHEN 'critical'
              THEN 0
              WHEN 'error'
              THEN 1
              WHEN 'warning'
              THEN 2
              ELSE 3
            END,
            i.last_seen_at DESC
          LIMIT $4
          OFFSET $5
        `,
        [
          validStatus,
          validSeverity,
          pattern,
          limit,
          offset,
        ],
      ),
    ]);

  const total =
    Number(
      countResult.rows[0]
        ?.count ||
      0,
    );

  return {
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
    items:
      rowsResult.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          status:
            String(
              row.status,
            ),
          severity:
            String(
              row.severity,
            ),
          source:
            String(
              row.source,
            ),
          provider:
            row.provider
              ? String(
                  row.provider,
                )
              : null,
          category:
            String(
              row.category,
            ),
          title:
            String(
              row.title,
            ),
          errorName:
            row.error_name
              ? String(
                  row.error_name,
                )
              : null,
          errorCode:
            row.error_code
              ? String(
                  row.error_code,
                )
              : null,
          route:
            row.route
              ? String(
                  row.route,
                )
              : null,
          operation:
            row.operation
              ? String(
                  row.operation,
                )
              : null,
          tenantId:
            row.tenant_id
              ? String(
                  row.tenant_id,
                )
              : null,
          tenantName:
            row.tenant_name
              ? String(
                  row.tenant_name,
                )
              : null,
          userId:
            row.user_id
              ? String(
                  row.user_id,
                )
              : null,
          userEmail:
            row.user_email
              ? String(
                  row.user_email,
                )
              : null,
          occurrenceCount:
            Number(
              row.occurrence_count ||
              0,
            ),
          firstSeenAt:
            toIso(
              row.first_seen_at,
            ),
          lastSeenAt:
            toIso(
              row.last_seen_at,
            ),
          correlationId:
            row.latest_correlation_id
              ? String(
                  row.latest_correlation_id,
                )
              : null,
          requestId:
            row.latest_request_id
              ? String(
                  row.latest_request_id,
                )
              : null,
          statusCode:
            row.latest_status_code ===
              null ||
            row.latest_status_code ===
              undefined
              ? null
              : Number(
                  row.latest_status_code,
                ),
          message:
            row.latest_message
              ? String(
                  row.latest_message,
                )
              : null,
          acknowledgedAt:
            toIso(
              row.acknowledged_at,
            ),
          resolvedAt:
            toIso(
              row.resolved_at,
            ),
        }),
      ),
  };
}


export async function getPlatformIncident(
  incidentId:
    string,
) {
  if (
    !UUID_RE.test(
      incidentId,
    )
  ) {
    return null;
  }

  const [
    incidentResult,
    occurrencesResult,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            i.*,
            t.name
              AS tenant_name,
            u.email
              AS user_email,
            a.email
              AS resolved_by_email,
            ack.email
              AS acknowledged_by_email
          FROM platform_incidents i
          LEFT JOIN tenants t
            ON t.id =
               i.tenant_id
          LEFT JOIN users u
            ON u.id =
               i.user_id
          LEFT JOIN platform_admins a
            ON a.id =
               i.resolved_by_admin_id
          LEFT JOIN platform_admins ack
            ON ack.id =
               i.acknowledged_by_admin_id
          WHERE i.id = $1
          LIMIT 1
        `,
        [
          incidentId,
        ],
      ),

      queryControl(
        `
          SELECT
            o.id,
            o.correlation_id,
            o.request_id,
            o.environment,
            o.source,
            o.provider,
            o.category,
            o.route,
            o.method,
            o.operation,
            o.status_code,
            o.tenant_id,
            o.user_id,
            o.error_name,
            o.error_code,
            o.message,
            o.stack,
            o.metadata,
            o.created_at,
            t.name
              AS tenant_name,
            u.email
              AS user_email
          FROM platform_incident_occurrences o
          LEFT JOIN tenants t
            ON t.id =
               o.tenant_id
          LEFT JOIN users u
            ON u.id =
               o.user_id
          WHERE o.incident_id =
                $1
          ORDER BY
            o.created_at DESC
          LIMIT 100
        `,
        [
          incidentId,
        ],
      ),
    ]);

  const row =
    incidentResult.rows[0];

  if (
    !row
  ) {
    return null;
  }

  return {
    incident: {
      id:
        String(
          row.id,
        ),
      fingerprint:
        String(
          row.fingerprint,
        ),
      status:
        String(
          row.status,
        ),
      severity:
        String(
          row.severity,
        ),
      source:
        String(
          row.source,
        ),
      provider:
        row.provider
          ? String(
              row.provider,
            )
          : null,
      category:
        String(
          row.category,
        ),
      title:
        String(
          row.title,
        ),
      errorName:
        row.error_name
          ? String(
              row.error_name,
            )
          : null,
      errorCode:
        row.error_code
          ? String(
              row.error_code,
            )
          : null,
      route:
        row.route
          ? String(
              row.route,
            )
          : null,
      operation:
        row.operation
          ? String(
              row.operation,
            )
          : null,
      occurrenceCount:
        Number(
          row.occurrence_count ||
          0,
        ),
      firstSeenAt:
        toIso(
          row.first_seen_at,
        ),
      lastSeenAt:
        toIso(
          row.last_seen_at,
        ),
      message:
        row.latest_message
          ? String(
              row.latest_message,
            )
          : null,
      stack:
        row.latest_stack
          ? String(
              row.latest_stack,
            )
          : null,
      metadata:
        row.latest_metadata &&
        typeof row.latest_metadata ===
          'object'
          ? row.latest_metadata
          : {},
      tenantId:
        row.tenant_id
          ? String(
              row.tenant_id,
            )
          : null,
      tenantName:
        row.tenant_name
          ? String(
              row.tenant_name,
            )
          : null,
      userId:
        row.user_id
          ? String(
              row.user_id,
            )
          : null,
      userEmail:
        row.user_email
          ? String(
              row.user_email,
            )
          : null,
      acknowledgedAt:
        toIso(
          row.acknowledged_at,
        ),
      acknowledgedByEmail:
        row.acknowledged_by_email
          ? String(
              row.acknowledged_by_email,
            )
          : null,
      resolvedAt:
        toIso(
          row.resolved_at,
        ),
      resolvedByEmail:
        row.resolved_by_email
          ? String(
              row.resolved_by_email,
            )
          : null,
      resolutionNote:
        row.resolution_note
          ? String(
              row.resolution_note,
            )
          : null,
    },
    occurrences:
      occurrencesResult.rows.map(
        occurrence => ({
          id:
            String(
              occurrence.id,
            ),
          correlationId:
            String(
              occurrence.correlation_id,
            ),
          requestId:
            occurrence.request_id
              ? String(
                  occurrence.request_id,
                )
              : null,
          environment:
            occurrence.environment
              ? String(
                  occurrence.environment,
                )
              : null,
          source:
            String(
              occurrence.source,
            ),
          provider:
            occurrence.provider
              ? String(
                  occurrence.provider,
                )
              : null,
          category:
            String(
              occurrence.category,
            ),
          route:
            occurrence.route
              ? String(
                  occurrence.route,
                )
              : null,
          method:
            occurrence.method
              ? String(
                  occurrence.method,
                )
              : null,
          operation:
            occurrence.operation
              ? String(
                  occurrence.operation,
                )
              : null,
          statusCode:
            occurrence.status_code ===
              null ||
            occurrence.status_code ===
              undefined
              ? null
              : Number(
                  occurrence.status_code,
                ),
          tenantId:
            occurrence.tenant_id
              ? String(
                  occurrence.tenant_id,
                )
              : null,
          tenantName:
            occurrence.tenant_name
              ? String(
                  occurrence.tenant_name,
                )
              : null,
          userId:
            occurrence.user_id
              ? String(
                  occurrence.user_id,
                )
              : null,
          userEmail:
            occurrence.user_email
              ? String(
                  occurrence.user_email,
                )
              : null,
          errorName:
            occurrence.error_name
              ? String(
                  occurrence.error_name,
                )
              : null,
          errorCode:
            occurrence.error_code
              ? String(
                  occurrence.error_code,
                )
              : null,
          message:
            occurrence.message
              ? String(
                  occurrence.message,
                )
              : null,
          stack:
            occurrence.stack
              ? String(
                  occurrence.stack,
                )
              : null,
          metadata:
            occurrence.metadata &&
            typeof occurrence.metadata ===
              'object'
              ? occurrence.metadata
              : {},
          createdAt:
            toIso(
              occurrence.created_at,
            ),
        }),
      ),
  };
}


export async function updatePlatformIncidentState(
  input: {
    incidentId:
      string;
    action:
      'acknowledge' |
      'resolve' |
      'reopen' |
      'ignore';
    adminId:
      string;
    note?:
      string | null;
  },
) {
  if (
    !UUID_RE.test(
      input.incidentId,
    ) ||
    !UUID_RE.test(
      input.adminId,
    )
  ) {
    return null;
  }

  const note =
    typeof input.note ===
      'string'
      ? input.note
          .trim()
          .slice(
            0,
            4_000,
          ) ||
        null
      : null;

  const action =
    input.action;

  const result =
    await queryControl(
      action ===
        'acknowledge'
        ? `
          UPDATE platform_incidents
          SET
            status =
              'acknowledged',
            acknowledged_at =
              COALESCE(
                acknowledged_at,
                NOW()
              ),
            acknowledged_by_admin_id =
              COALESCE(
                acknowledged_by_admin_id,
                $2
              ),
            updated_at =
              NOW()
          WHERE id = $1
            AND status =
                'open'
          RETURNING
            id,
            status
        `
        : action ===
            'resolve'
          ? `
            UPDATE platform_incidents
            SET
              status =
                'resolved',
              resolved_at =
                NOW(),
              resolved_by_admin_id =
                $2,
              resolution_note =
                $3,
              updated_at =
                NOW()
            WHERE id = $1
              AND status IN (
                'open',
                'acknowledged'
              )
            RETURNING
              id,
              status
          `
          : action ===
              'ignore'
            ? `
              UPDATE platform_incidents
              SET
                status =
                  'ignored',
                resolved_at =
                  NOW(),
                resolved_by_admin_id =
                  $2,
                resolution_note =
                  $3,
                updated_at =
                  NOW()
              WHERE id = $1
                AND status IN (
                  'open',
                  'acknowledged'
                )
              RETURNING
                id,
                status
            `
            : `
              UPDATE platform_incidents
              SET
                status =
                  'open',
                acknowledged_at =
                  NULL,
                acknowledged_by_admin_id =
                  NULL,
                resolved_at =
                  NULL,
                resolved_by_admin_id =
                  NULL,
                resolution_note =
                  NULL,
                updated_at =
                  NOW()
              WHERE id = $1
                AND status IN (
                  'resolved',
                  'ignored'
                )
              RETURNING
                id,
                status
            `,
      [
        input.incidentId,
        input.adminId,
        note,
      ],
    );

  const row =
    result.rows[0];

  return row
    ? {
        id:
          String(
            row.id,
          ),
        status:
          String(
            row.status,
          ),
      }
    : null;
}
