import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';


export type AdminOperationsDashboard = {
  available:
    boolean;

  incidents: {
    open:
      number;
    acknowledged:
      number;
    critical:
      number;
    errors:
      number;
  };

  jobs: {
    failedLast24Hours:
      number;
    running:
      number;
  };

  tenantDatabases: {
    total:
      number;
    healthy:
      number;
    degraded:
      number;
    unreachable:
      number;
    maintenance:
      number;
    unknown:
      number;
  };

  services: Array<{
    serviceKey:
      string;
    serviceName:
      string;
    provider:
      string;
    category:
      string;
    status:
      string;
    renewalAt:
      string |
      null;
    expiresAt:
      string |
      null;
    quotaUsed:
      number |
      null;
    quotaLimit:
      number |
      null;
    quotaUnit:
      string |
      null;
    lastSyncedAt:
      string |
      null;
  }>;

  providerChecks: Array<{
    provider:
      string;
    component:
      string;
    status:
      string;
    latencyMs:
      number |
      null;
    checkedAt:
      string |
      null;
  }>;
};


function numberValue(
  value:
    unknown,
) {
  const parsed =
    Number(
      value,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}


function nullableNumber(
  value:
    unknown,
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  ) {
    return null;
  }

  const parsed =
    Number(
      value,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}


function iso(
  value:
    unknown,
) {
  if (
    !value
  ) {
    return null;
  }

  const date =
    new Date(
      String(
        value,
      ),
    );

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}


const EMPTY:
  AdminOperationsDashboard = {
    available:
      false,

    incidents: {
      open:
        0,
      acknowledged:
        0,
      critical:
        0,
      errors:
        0,
    },

    jobs: {
      failedLast24Hours:
        0,
      running:
        0,
    },

    tenantDatabases: {
      total:
        0,
      healthy:
        0,
      degraded:
        0,
      unreachable:
        0,
      maintenance:
        0,
      unknown:
        0,
    },

    services:
      [],

    providerChecks:
      [],
  };


export async function getAdminOperationsDashboard():
  Promise<AdminOperationsDashboard> {
  try {
    const [
      incidents,
      jobs,
      tenantDatabases,
      services,
      providerChecks,
    ] =
      await Promise.all([
        queryControl(
          `
            SELECT
              COUNT(*) FILTER (
                WHERE status =
                      'open'
              )::int
                AS open,

              COUNT(*) FILTER (
                WHERE status =
                      'acknowledged'
              )::int
                AS acknowledged,

              COUNT(*) FILTER (
                WHERE status IN (
                  'open',
                  'acknowledged'
                )
                AND severity =
                    'critical'
              )::int
                AS critical,

              COUNT(*) FILTER (
                WHERE status IN (
                  'open',
                  'acknowledged'
                )
                AND severity =
                    'error'
              )::int
                AS errors

            FROM platform_incidents
          `,
        ),

        queryControl(
          `
            SELECT
              COUNT(*) FILTER (
                WHERE status =
                      'failed'
                  AND created_at >=
                      NOW() -
                      INTERVAL '24 hours'
              )::int
                AS failed_last_24_hours,

              COUNT(*) FILTER (
                WHERE status =
                      'running'
              )::int
                AS running

            FROM platform_job_runs
          `,
        ),

        queryControl(
          `
            SELECT
              COUNT(*)::int
                AS total,

              COUNT(*) FILTER (
                WHERE health_status =
                      'healthy'
              )::int
                AS healthy,

              COUNT(*) FILTER (
                WHERE health_status =
                      'degraded'
              )::int
                AS degraded,

              COUNT(*) FILTER (
                WHERE health_status =
                      'unreachable'
              )::int
                AS unreachable,

              COUNT(*) FILTER (
                WHERE health_status =
                      'maintenance'
              )::int
                AS maintenance,

              COUNT(*) FILTER (
                WHERE health_status IS NULL
                   OR health_status =
                      'unknown'
              )::int
                AS unknown

            FROM tenant_databases
          `,
        ),

        queryControl(
          `
            SELECT
              service_key,
              service_name,
              provider,
              category,
              status,
              renewal_at,
              expires_at,
              quota_used,
              quota_limit,
              quota_unit,
              last_synced_at

            FROM platform_service_subscriptions

            WHERE deleted_at
                  IS NULL

            ORDER BY
              CASE status
                WHEN 'expired'
                THEN 0
                WHEN 'suspended'
                THEN 1
                WHEN 'payment_required'
                THEN 2
                WHEN 'upgrade_recommended'
                THEN 3
                WHEN 'quota_warning'
                THEN 4
                WHEN 'renewal_due'
                THEN 5
                WHEN 'not_configured'
                THEN 6
                ELSE 7
              END,
              service_name ASC
          `,
        ),

        queryControl(
          `
            SELECT DISTINCT ON (
              provider,
              component
            )
              provider,
              component,
              status,
              latency_ms,
              checked_at

            FROM platform_provider_checks

            ORDER BY
              provider,
              component,
              checked_at DESC
          `,
        ),
      ]);

    const incidentRow =
      incidents.rows[0] ||
      {};

    const jobRow =
      jobs.rows[0] ||
      {};

    const databaseRow =
      tenantDatabases.rows[0] ||
      {};

    return {
      available:
        true,

      incidents: {
        open:
          numberValue(
            incidentRow.open,
          ),
        acknowledged:
          numberValue(
            incidentRow.acknowledged,
          ),
        critical:
          numberValue(
            incidentRow.critical,
          ),
        errors:
          numberValue(
            incidentRow.errors,
          ),
      },

      jobs: {
        failedLast24Hours:
          numberValue(
            jobRow.failed_last_24_hours,
          ),
        running:
          numberValue(
            jobRow.running,
          ),
      },

      tenantDatabases: {
        total:
          numberValue(
            databaseRow.total,
          ),
        healthy:
          numberValue(
            databaseRow.healthy,
          ),
        degraded:
          numberValue(
            databaseRow.degraded,
          ),
        unreachable:
          numberValue(
            databaseRow.unreachable,
          ),
        maintenance:
          numberValue(
            databaseRow.maintenance,
          ),
        unknown:
          numberValue(
            databaseRow.unknown,
          ),
      },

      services:
        services.rows.map(
          row => ({
            serviceKey:
              String(
                row.service_key,
              ),
            serviceName:
              String(
                row.service_name,
              ),
            provider:
              String(
                row.provider,
              ),
            category:
              String(
                row.category,
              ),
            status:
              String(
                row.status ||
                'unknown',
              ),
            renewalAt:
              iso(
                row.renewal_at,
              ),
            expiresAt:
              iso(
                row.expires_at,
              ),
            quotaUsed:
              nullableNumber(
                row.quota_used,
              ),
            quotaLimit:
              nullableNumber(
                row.quota_limit,
              ),
            quotaUnit:
              row.quota_unit
                ? String(
                    row.quota_unit,
                  )
                : null,
            lastSyncedAt:
              iso(
                row.last_synced_at,
              ),
          }),
        ),

      providerChecks:
        providerChecks.rows.map(
          row => ({
            provider:
              String(
                row.provider,
              ),
            component:
              String(
                row.component,
              ),
            status:
              String(
                row.status ||
                'unknown',
              ),
            latencyMs:
              nullableNumber(
                row.latency_ms,
              ),
            checkedAt:
              iso(
                row.checked_at,
              ),
          }),
        ),
    };
  } catch (
    error
  ) {
    /*
     * Keep the pre-Category-24 admin dashboard usable before
     * migrations 004-006 are applied or if observability itself
     * is temporarily unavailable.
     */
    console.error(
      '[SaMi Admin] Operations dashboard unavailable:',
      error instanceof
        Error
        ? error.message
        : 'Unknown operations dashboard error',
    );

    return {
      ...EMPTY,
    };
  }
}
