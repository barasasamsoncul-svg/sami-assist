import 'server-only';

import {
  getSamiPlanPolicy,
} from '@/lib/billing/plan-policy';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';


export async function getWorkspacePlanCapacityAssessment(
  tenantId:
    string,
  targetPlan:
    string,
) {
  const policy =
    getSamiPlanPolicy(
      targetPlan,
    );

  if (
    !policy
  ) {
    return {
      supported:
        false as const,
      allowed:
        false,
      policy:
        null,
      users:
        0,
      apps:
        0,
      companies:
        0,
      blockers: [
        'The requested SaMi plan is not supported.',
      ],
    };
  }

  const [
    usersResult,
    appsResult,
    companyPool,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM tenant_users
          WHERE tenant_id = $1
            AND deleted_at
                IS NULL
            AND LOWER(
                  COALESCE(
                    status,
                    ''
                  )
                ) =
                'active'
            AND LOWER(
                  COALESCE(
                    member_type,
                    ''
                  )
                ) =
                'internal'
        `,
        [
          tenantId,
        ],
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM tenant_modules tm
          INNER JOIN modules m
            ON m.id =
               tm.module_id
          WHERE tm.tenant_id = $1
            AND tm.deleted_at
                IS NULL
            AND m.deleted_at
                IS NULL
            AND COALESCE(
                  m.is_core,
                  FALSE
                ) =
                FALSE
            AND LOWER(
                  COALESCE(
                    tm.status,
                    ''
                  )
                ) IN (
                  'installed',
                  'active',
                  'enabled'
                )
        `,
        [
          tenantId,
        ],
      ),

      getTenantPoolByTenantId(
        tenantId,
      ),
    ]);

  const companiesResult =
    await companyPool.query(
      `
        SELECT
          COUNT(*)::int
            AS count
        FROM companies
        WHERE is_active =
              TRUE
          AND archived_at
              IS NULL
      `,
    );

  const activeUsers =
    Number(
      usersResult.rows[0]
        ?.count ||
      0,
    );

  const users =
    Math.max(
      1,
      activeUsers,
    );

  const apps =
    Number(
      appsResult.rows[0]
        ?.count ||
      0,
    );

  const companies =
    Number(
      companiesResult.rows[0]
        ?.count ||
      0,
    );

  const blockers:
    string[] =
    [];

  if (
    policy.users
      .maxActiveInternalUsers !==
      null &&
    activeUsers >
      policy.users
        .maxActiveInternalUsers
  ) {
    blockers.push(
      `Reduce active internal users to ${policy.users.maxActiveInternalUsers} before switching to ${policy.name}.`,
    );
  }

  if (
    policy.apps
      .maxInstalledBusinessApps !==
      null &&
    apps >
      policy.apps
        .maxInstalledBusinessApps
  ) {
    blockers.push(
      `Reduce installed business apps to ${policy.apps.maxInstalledBusinessApps} before switching to ${policy.name}. Required app dependencies count toward this allowance.`,
    );
  }

  if (
    !policy.companies
      .multiCompany &&
    companies >
      1
  ) {
    blockers.push(
      `Archive extra companies before switching to ${policy.name}. Multi-company is available only on Custom.`,
    );
  }

  return {
    supported:
      true as const,
    allowed:
      blockers.length ===
      0,
    policy,
    users,
    activeUsers,
    apps,
    companies,
    blockers,
  };
}
