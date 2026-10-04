import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  cleanText,
  hasSalesPermission,
  money,
  nullableText,
  numberInput,
  optionalUuid,
  requireSalesContext,
  SALES_PERMISSIONS,
  SalesError,
  UUID_RE,
} from '@/lib/apps/sales/context';

import {
  queryControl,
} from '@/lib/db/control';

function optionalDate(
  value:
    unknown,
) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return null;
  }

  const date =
    cleanText(
      value,
      10,
    );

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date,
    )
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a valid date.',
    );
  }

  return date;
}

function permissionAny(
  context:
    Awaited<
      ReturnType<
        typeof requireSalesContext
      >
    >,
  permissions:
    string[],
) {
  return (
    context.permissions
      .isOwner ||
    permissions.some(
      permission =>
        context.permissions
          .permissionSet
          .has(
            permission,
          ),
    )
  );
}

async function requireWorkspaceUsers(
  tenantId:
    string,
  userIds:
    string[],
) {
  const unique =
    Array.from(
      new Set(
        userIds,
      ),
    );

  if (
    unique.length ===
      0
  ) {
    return;
  }

  if (
    unique.length >
      250 ||
    unique.some(
      id =>
        !UUID_RE.test(
          id,
        ),
    )
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose valid workspace users.',
    );
  }

  const result =
    await queryControl(
      `
        SELECT
          tu.user_id
        FROM tenant_users tu
        INNER JOIN users u
          ON u.id = tu.user_id
        WHERE tu.tenant_id = $1
          AND tu.user_id = ANY($2::uuid[])
          AND tu.status = 'active'
          AND tu.member_type = 'internal'
          AND tu.deleted_at IS NULL
          AND u.deleted_at IS NULL
          AND LOWER(
                COALESCE(
                  u.status,
                  'active'
                )
              ) IN (
                'active',
                'verified'
              )
      `,
      [
        tenantId,
        unique,
      ],
    );

  const available =
    new Set(
      result.rows.map(
        row =>
          String(
            row.user_id,
          ),
      ),
    );

  if (
    unique.some(
      id =>
        !available.has(
          id,
        ),
    )
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'One or more selected users are not active internal members of this workspace.',
    );
  }
}

async function validateTerritory(
  client:
    PoolClient,
  companyId:
    string,
  territoryId:
    string | null,
) {
  if (
    !territoryId
  ) {
    return;
  }

  const result =
    await client.query(
      `
        SELECT 1
        FROM sales_territories
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        territoryId,
        companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a valid Sales territory.',
    );
  }
}

async function validateTeam(
  client:
    PoolClient,
  companyId:
    string,
  teamId:
    string | null,
) {
  if (
    !teamId
  ) {
    return;
  }

  const result =
    await client.query(
      `
        SELECT 1
        FROM sales_teams
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        teamId,
        companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a valid Sales team.',
    );
  }
}

export async function getSalesOrganizationData() {
  const context =
    await requireSalesContext();

  if (
    !permissionAny(
      context,
      [
        SALES_PERMISSIONS
          .TEAM_VIEW,
        SALES_PERMISSIONS
          .TEAM_MANAGE,
        SALES_PERMISSIONS
          .TARGET_VIEW,
        SALES_PERMISSIONS
          .TARGET_MANAGE,
        SALES_PERMISSIONS
          .COMMISSION_VIEW,
        SALES_PERMISSIONS
          .COMMISSION_MANAGE,
        SALES_PERMISSIONS
          .REPORT_VIEW,
      ],
    )
  ) {
    throw new SalesError(
      'SALES_PERMISSION_REQUIRED',
      'Sales organization access is required.',
    );
  }

  const [
    members,
    territories,
    teams,
    teamMembers,
    targets,
    plans,
    assignments,
    entries,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            u.id,
            COALESCE(
              NULLIF(
                BTRIM(
                  COALESCE(
                    u.full_name,
                    ''
                  )
                ),
                ''
              ),
              NULLIF(
                BTRIM(
                  CONCAT_WS(
                    ' ',
                    u.first_name,
                    u.last_name
                  )
                ),
                ''
              ),
              u.email
            ) AS name,
            u.email,
            u.avatar_url,
            tu.is_owner
          FROM tenant_users tu
          INNER JOIN users u
            ON u.id = tu.user_id
          WHERE tu.tenant_id = $1
            AND tu.status = 'active'
            AND tu.member_type = 'internal'
            AND tu.deleted_at IS NULL
            AND u.deleted_at IS NULL
          ORDER BY
            tu.is_owner DESC,
            LOWER(
              COALESCE(
                u.full_name,
                u.email
              )
            ),
            u.id
        `,
        [
          context.tenantId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id,
            name,
            code,
            parent_territory_id,
            description,
            is_active
          FROM sales_territories
          WHERE company_id = $1
            AND deleted_at IS NULL
          ORDER BY
            is_active DESC,
            LOWER(name)
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id,
            name,
            code,
            manager_user_id,
            territory_id,
            description,
            is_active
          FROM sales_teams
          WHERE company_id = $1
            AND deleted_at IS NULL
          ORDER BY
            is_active DESC,
            LOWER(name)
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id,
            team_id,
            user_id,
            role,
            is_active
          FROM sales_team_members
          WHERE company_id = $1
          ORDER BY
            team_id,
            CASE
              WHEN role = 'manager'
              THEN 0
              ELSE 1
            END,
            user_id
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id,
            target_scope,
            team_id,
            user_id,
            metric,
            period_start,
            period_end,
            target_value,
            notes,
            is_active
          FROM sales_targets
          WHERE company_id = $1
            AND deleted_at IS NULL
          ORDER BY
            period_start DESC,
            period_end DESC,
            created_at DESC
          LIMIT 500
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id,
            name,
            code,
            basis,
            rate_percent,
            threshold_amount,
            cap_amount,
            valid_from,
            valid_until,
            is_active
          FROM sales_commission_plans
          WHERE company_id = $1
            AND deleted_at IS NULL
          ORDER BY
            is_active DESC,
            LOWER(name)
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id,
            plan_id,
            assignee_type,
            user_id,
            team_id,
            valid_from,
            valid_until,
            is_active
          FROM sales_commission_assignments
          WHERE company_id = $1
          ORDER BY
            plan_id,
            assignee_type,
            id
        `,
        [
          context.companyId,
        ],
      ),
      permissionAny(
        context,
        [
          SALES_PERMISSIONS
            .COMMISSION_VIEW,
          SALES_PERMISSIONS
            .COMMISSION_MANAGE,
        ],
      )
        ? context.pool.query(
            `
              SELECT
                id,
                order_id,
                plan_id,
                assignment_id,
                user_id,
                team_id,
                basis,
                basis_amount,
                commission_amount,
                currency,
                status,
                accrued_at,
                reversed_at,
                paid_at
              FROM sales_commission_entries
              WHERE company_id = $1
              ORDER BY
                accrued_at DESC,
                id DESC
              LIMIT 500
            `,
            [
              context.companyId,
            ],
          )
        : Promise.resolve({
            rows:
              [],
          }),
    ]);

  return {
    capabilities: {
      canViewTeams:
        permissionAny(
          context,
          [
            SALES_PERMISSIONS
              .TEAM_VIEW,
            SALES_PERMISSIONS
              .TEAM_MANAGE,
          ],
        ),
      canManageTeams:
        hasSalesPermission(
          context.permissions
            .isOwner,
          context.permissions
            .permissionSet,
          SALES_PERMISSIONS
            .TEAM_MANAGE,
        ),
      canViewTargets:
        permissionAny(
          context,
          [
            SALES_PERMISSIONS
              .TARGET_VIEW,
            SALES_PERMISSIONS
              .TARGET_MANAGE,
          ],
        ),
      canManageTargets:
        hasSalesPermission(
          context.permissions
            .isOwner,
          context.permissions
            .permissionSet,
          SALES_PERMISSIONS
            .TARGET_MANAGE,
        ),
      canViewCommissions:
        permissionAny(
          context,
          [
            SALES_PERMISSIONS
              .COMMISSION_VIEW,
            SALES_PERMISSIONS
              .COMMISSION_MANAGE,
          ],
        ),
      canManageCommissions:
        hasSalesPermission(
          context.permissions
            .isOwner,
          context.permissions
            .permissionSet,
          SALES_PERMISSIONS
            .COMMISSION_MANAGE,
        ),
    },
    members:
      members.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          name:
            String(
              row.name ||
              row.email,
            ),
          email:
            String(
              row.email,
            ),
          avatarUrl:
            row.avatar_url
              ? String(
                  row.avatar_url,
                )
              : null,
          isOwner:
            row.is_owner ===
              true,
        }),
      ),
    territories:
      territories.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          name:
            String(
              row.name,
            ),
          code:
            row.code
              ? String(
                  row.code,
                )
              : null,
          parentTerritoryId:
            row.parent_territory_id
              ? String(
                  row.parent_territory_id,
                )
              : null,
          description:
            row.description
              ? String(
                  row.description,
                )
              : null,
          isActive:
            row.is_active ===
              true,
        }),
      ),
    teams:
      teams.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          name:
            String(
              row.name,
            ),
          code:
            row.code
              ? String(
                  row.code,
                )
              : null,
          managerUserId:
            row.manager_user_id
              ? String(
                  row.manager_user_id,
                )
              : null,
          territoryId:
            row.territory_id
              ? String(
                  row.territory_id,
                )
              : null,
          description:
            row.description
              ? String(
                  row.description,
                )
              : null,
          isActive:
            row.is_active ===
              true,
          memberUserIds:
            teamMembers.rows
              .filter(
                member =>
                  String(
                    member.team_id,
                  ) ===
                  String(
                    row.id,
                  ) &&
                  member.is_active ===
                    true,
              )
              .map(
                member =>
                  String(
                    member.user_id,
                  ),
              ),
        }),
      ),
    targets:
      targets.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          targetScope:
            String(
              row.target_scope,
            ),
          teamId:
            row.team_id
              ? String(
                  row.team_id,
                )
              : null,
          userId:
            row.user_id
              ? String(
                  row.user_id,
                )
              : null,
          metric:
            String(
              row.metric,
            ),
          periodStart:
            String(
              row.period_start,
            ),
          periodEnd:
            String(
              row.period_end,
            ),
          targetValue:
            Number(
              row.target_value ||
              0,
            ),
          notes:
            row.notes
              ? String(
                  row.notes,
                )
              : null,
          isActive:
            row.is_active ===
              true,
        }),
      ),
    commissionPlans:
      plans.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          name:
            String(
              row.name,
            ),
          code:
            row.code
              ? String(
                  row.code,
                )
              : null,
          basis:
            String(
              row.basis,
            ),
          ratePercent:
            Number(
              row.rate_percent ||
              0,
            ),
          thresholdAmount:
            Number(
              row.threshold_amount ||
              0,
            ),
          capAmount:
            row.cap_amount ===
              null ||
            row.cap_amount ===
              undefined
              ? null
              : Number(
                  row.cap_amount,
                ),
          validFrom:
            row.valid_from
              ? String(
                  row.valid_from,
                )
              : null,
          validUntil:
            row.valid_until
              ? String(
                  row.valid_until,
                )
              : null,
          isActive:
            row.is_active ===
              true,
          assignments:
            assignments.rows
              .filter(
                assignment =>
                  String(
                    assignment.plan_id,
                  ) ===
                  String(
                    row.id,
                  ),
              )
              .map(
                assignment => ({
                  id:
                    String(
                      assignment.id,
                    ),
                  assigneeType:
                    String(
                      assignment.assignee_type,
                    ),
                  userId:
                    assignment.user_id
                      ? String(
                          assignment.user_id,
                        )
                      : null,
                  teamId:
                    assignment.team_id
                      ? String(
                          assignment.team_id,
                        )
                      : null,
                  validFrom:
                    assignment.valid_from
                      ? String(
                          assignment.valid_from,
                        )
                      : null,
                  validUntil:
                    assignment.valid_until
                      ? String(
                          assignment.valid_until,
                        )
                      : null,
                  isActive:
                    assignment.is_active ===
                      true,
                }),
              ),
        }),
      ),
    commissionEntries:
      entries.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          orderId:
            String(
              row.order_id,
            ),
          planId:
            String(
              row.plan_id,
            ),
          assignmentId:
            String(
              row.assignment_id,
            ),
          userId:
            row.user_id
              ? String(
                  row.user_id,
                )
              : null,
          teamId:
            row.team_id
              ? String(
                  row.team_id,
                )
              : null,
          basis:
            String(
              row.basis,
            ),
          basisAmount:
            Number(
              row.basis_amount ||
              0,
            ),
          commissionAmount:
            Number(
              row.commission_amount ||
              0,
            ),
          currency:
            String(
              row.currency,
            ),
          status:
            String(
              row.status,
            ),
          accruedAt:
            new Date(
              row.accrued_at,
            ).toISOString(),
          reversedAt:
            row.reversed_at
              ? new Date(
                  row.reversed_at,
                ).toISOString()
              : null,
          paidAt:
            row.paid_at
              ? new Date(
                  row.paid_at,
                ).toISOString()
              : null,
        }),
      ),
  };
}

export async function saveSalesTerritory(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .TEAM_MANAGE,
    );

  const id =
    optionalUuid(
      input.id,
    );

  const name =
    cleanText(
      input.name,
      180,
    );

  if (
    !name
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Territory name is required.',
    );
  }

  const parentTerritoryId =
    optionalUuid(
      input.parentTerritoryId,
    );

  if (
    id &&
    parentTerritoryId ===
      id
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'A territory cannot be its own parent.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await validateTerritory(
      client,
      context.companyId,
      parentTerritoryId,
    );

    const result =
      id
        ? await client.query(
            `
              UPDATE sales_territories
              SET
                name = $3,
                code = $4,
                parent_territory_id = $5,
                description = $6,
                is_active = $7,
                updated_by = $8,
                updated_at = NOW()
              WHERE id = $1
                AND company_id = $2
                AND deleted_at IS NULL
              RETURNING id
            `,
            [
              id,
              context.companyId,
              name,
              nullableText(
                input.code,
                80,
              ),
              parentTerritoryId,
              nullableText(
                input.description,
                2000,
              ),
              input.isActive !==
                false,
              context.userId,
            ],
          )
        : await client.query(
            `
              INSERT INTO sales_territories (
                company_id,
                name,
                code,
                parent_territory_id,
                description,
                is_active,
                created_by,
                updated_by
              )
              VALUES (
                $1,$2,$3,$4,$5,$6,$7,$7
              )
              RETURNING id
            `,
            [
              context.companyId,
              name,
              nullableText(
                input.code,
                80,
              ),
              parentTerritoryId,
              nullableText(
                input.description,
                2000,
              ),
              input.isActive !==
                false,
              context.userId,
            ],
          );

    if (
      result.rows.length !==
        1
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Territory was not found.',
      );
    }

    await client.query(
      'COMMIT',
    );

    return {
      id:
        String(
          result.rows[0].id,
        ),
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}

export async function saveSalesTeam(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .TEAM_MANAGE,
    );

  const id =
    optionalUuid(
      input.id,
    );

  const name =
    cleanText(
      input.name,
      180,
    );

  if (
    !name
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Sales team name is required.',
    );
  }

  const managerUserId =
    optionalUuid(
      input.managerUserId,
    );

  const territoryId =
    optionalUuid(
      input.territoryId,
    );

  const rawMembers =
    Array.isArray(
      input.memberUserIds,
    )
      ? input.memberUserIds
      : [];

  const memberUserIds =
    Array.from(
      new Set(
        rawMembers
          .filter(
            (
              value,
            ): value is string =>
              typeof value ===
                'string' &&
              UUID_RE.test(
                value,
              ),
          ),
      ),
    );

  if (
    memberUserIds.length !==
      rawMembers.length
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose valid Sales team members.',
    );
  }

  if (
    managerUserId &&
    !memberUserIds.includes(
      managerUserId,
    )
  ) {
    memberUserIds.unshift(
      managerUserId,
    );
  }

  await requireWorkspaceUsers(
    context.tenantId,
    [
      ...memberUserIds,
      ...(
        managerUserId
          ? [
              managerUserId,
            ]
          : []
      ),
    ],
  );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await validateTerritory(
      client,
      context.companyId,
      territoryId,
    );

    const team =
      id
        ? await client.query(
            `
              UPDATE sales_teams
              SET
                name = $3,
                code = $4,
                manager_user_id = $5,
                territory_id = $6,
                description = $7,
                is_active = $8,
                updated_by = $9,
                updated_at = NOW()
              WHERE id = $1
                AND company_id = $2
                AND deleted_at IS NULL
              RETURNING id
            `,
            [
              id,
              context.companyId,
              name,
              nullableText(
                input.code,
                80,
              ),
              managerUserId,
              territoryId,
              nullableText(
                input.description,
                2000,
              ),
              input.isActive !==
                false,
              context.userId,
            ],
          )
        : await client.query(
            `
              INSERT INTO sales_teams (
                company_id,
                name,
                code,
                manager_user_id,
                territory_id,
                description,
                is_active,
                created_by,
                updated_by
              )
              VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$8
              )
              RETURNING id
            `,
            [
              context.companyId,
              name,
              nullableText(
                input.code,
                80,
              ),
              managerUserId,
              territoryId,
              nullableText(
                input.description,
                2000,
              ),
              input.isActive !==
                false,
              context.userId,
            ],
          );

    if (
      team.rows.length !==
        1
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Sales team was not found.',
      );
    }

    const teamId =
      String(
        team.rows[0].id,
      );

    await client.query(
      `
        DELETE FROM sales_team_members
        WHERE company_id = $1
          AND team_id = $2
      `,
      [
        context.companyId,
        teamId,
      ],
    );

    for (
      const userId
      of memberUserIds
    ) {
      await client.query(
        `
          INSERT INTO sales_team_members (
            company_id,
            team_id,
            user_id,
            role,
            is_active,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,TRUE,$5,$5
          )
        `,
        [
          context.companyId,
          teamId,
          userId,
          userId ===
            managerUserId
            ? 'manager'
            : 'member',
          context.userId,
        ],
      );
    }

    await client.query(
      'COMMIT',
    );

    return {
      id:
        teamId,
      memberCount:
        memberUserIds.length,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}

export async function saveSalesTarget(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .TARGET_MANAGE,
    );

  const id =
    optionalUuid(
      input.id,
    );

  const targetScope =
    cleanText(
      input.targetScope,
      20,
    );

  if (
    ![
      'company',
      'team',
      'user',
    ].includes(
      targetScope,
    )
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a valid target scope.',
    );
  }

  const metric =
    cleanText(
      input.metric,
      20,
    );

  if (
    ![
      'revenue',
      'margin',
      'orders',
    ].includes(
      metric,
    )
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a valid Sales target metric.',
    );
  }

  const teamId =
    targetScope ===
      'team'
      ? optionalUuid(
          input.teamId,
        )
      : null;

  const userId =
    targetScope ===
      'user'
      ? optionalUuid(
          input.userId,
        )
      : null;

  if (
    targetScope ===
      'team' &&
    !teamId
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a Sales team for this target.',
    );
  }

  if (
    targetScope ===
      'user' &&
    !userId
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a salesperson for this target.',
    );
  }

  const periodStart =
    optionalDate(
      input.periodStart,
    );

  const periodEnd =
    optionalDate(
      input.periodEnd,
    );

  if (
    !periodStart ||
    !periodEnd ||
    periodEnd <
      periodStart
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose a valid Sales target period.',
    );
  }

  if (
    userId
  ) {
    await requireWorkspaceUsers(
      context.tenantId,
      [
        userId,
      ],
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await validateTeam(
      client,
      context.companyId,
      teamId,
    );

    const targetValue =
      numberInput(
        input.targetValue ??
        0,
        'Target value',
        {
          min:
            0,
        },
      );

    const result =
      id
        ? await client.query(
            `
              UPDATE sales_targets
              SET
                target_scope = $3,
                team_id = $4,
                user_id = $5,
                metric = $6,
                period_start = $7,
                period_end = $8,
                target_value = $9,
                notes = $10,
                is_active = $11,
                updated_by = $12,
                updated_at = NOW()
              WHERE id = $1
                AND company_id = $2
                AND deleted_at IS NULL
              RETURNING id
            `,
            [
              id,
              context.companyId,
              targetScope,
              teamId,
              userId,
              metric,
              periodStart,
              periodEnd,
              targetValue,
              nullableText(
                input.notes,
                2000,
              ),
              input.isActive !==
                false,
              context.userId,
            ],
          )
        : await client.query(
            `
              INSERT INTO sales_targets (
                company_id,
                target_scope,
                team_id,
                user_id,
                metric,
                period_start,
                period_end,
                target_value,
                notes,
                is_active,
                created_by,
                updated_by
              )
              VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11
              )
              RETURNING id
            `,
            [
              context.companyId,
              targetScope,
              teamId,
              userId,
              metric,
              periodStart,
              periodEnd,
              targetValue,
              nullableText(
                input.notes,
                2000,
              ),
              input.isActive !==
                false,
              context.userId,
            ],
          );

    if (
      result.rows.length !==
        1
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Sales target was not found.',
      );
    }

    await client.query(
      'COMMIT',
    );

    return {
      id:
        String(
          result.rows[0].id,
        ),
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}

type CommissionAssignmentInput = {
  assigneeType?: unknown;
  userId?: unknown;
  teamId?: unknown;
  validFrom?: unknown;
  validUntil?: unknown;
  isActive?: unknown;
};

export async function saveSalesCommissionPlan(
  input:
    Record<string, unknown>,
) {
  const context =
    await requireSalesContext(
      SALES_PERMISSIONS
        .COMMISSION_MANAGE,
    );

  const id =
    optionalUuid(
      input.id,
    );

  const name =
    cleanText(
      input.name,
      180,
    );

  if (
    !name
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Commission plan name is required.',
    );
  }

  const basis =
    cleanText(
      input.basis,
      20,
    );

  if (
    basis !==
      'revenue' &&
    basis !==
      'margin'
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Choose revenue or margin as the commission basis.',
    );
  }

  const validFrom =
    optionalDate(
      input.validFrom,
    );

  const validUntil =
    optionalDate(
      input.validUntil,
    );

  if (
    validFrom &&
    validUntil &&
    validUntil <
      validFrom
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Commission plan end date cannot be before its start date.',
    );
  }

  if (
    input.assignments !==
      undefined &&
    !Array.isArray(
      input.assignments,
    )
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'Commission assignments must be a list.',
    );
  }

  const rawAssignments =
    Array.isArray(
      input.assignments,
    )
      ? input.assignments
      : [];

  if (
    rawAssignments.length >
      250
  ) {
    throw new SalesError(
      'INVALID_INPUT',
      'A commission plan can contain up to 250 assignments.',
    );
  }

  const assignments =
    rawAssignments.map(
      (
        raw,
        index,
      ) => {
        if (
          !raw ||
          typeof raw !==
            'object' ||
          Array.isArray(
            raw,
          )
        ) {
          throw new SalesError(
            'INVALID_INPUT',
            'Commission assignment ' +
            (
              index +
              1
            ) +
            ' is invalid.',
          );
        }

        const item =
          raw as
            CommissionAssignmentInput;

        const assigneeType =
          cleanText(
            item.assigneeType,
            20,
          );

        if (
          assigneeType !==
            'user' &&
          assigneeType !==
            'team'
        ) {
          throw new SalesError(
            'INVALID_INPUT',
            'Choose a user or team for every commission assignment.',
          );
        }

        const userId =
          assigneeType ===
            'user'
            ? optionalUuid(
                item.userId,
              )
            : null;

        const teamId =
          assigneeType ===
            'team'
            ? optionalUuid(
                item.teamId,
              )
            : null;

        if (
          assigneeType ===
            'user' &&
          !userId
        ) {
          throw new SalesError(
            'INVALID_INPUT',
            'Choose a salesperson for commission assignment ' +
            (
              index +
              1
            ) +
            '.',
          );
        }

        if (
          assigneeType ===
            'team' &&
          !teamId
        ) {
          throw new SalesError(
            'INVALID_INPUT',
            'Choose a Sales team for commission assignment ' +
            (
              index +
              1
            ) +
            '.',
          );
        }

        const assignmentFrom =
          optionalDate(
            item.validFrom,
          );

        const assignmentUntil =
          optionalDate(
            item.validUntil,
          );

        if (
          assignmentFrom &&
          assignmentUntil &&
          assignmentUntil <
            assignmentFrom
        ) {
          throw new SalesError(
            'INVALID_INPUT',
            'Commission assignment ' +
            (
              index +
              1
            ) +
            ' has an invalid date range.',
          );
        }

        return {
          assigneeType,
          userId,
          teamId,
          validFrom:
            assignmentFrom,
          validUntil:
            assignmentUntil,
          isActive:
            item.isActive !==
              false,
        };
      },
    );

  await requireWorkspaceUsers(
    context.tenantId,
    assignments
      .map(
        item =>
          item.userId,
      )
      .filter(
        (
          value,
        ): value is string =>
          Boolean(
            value,
          ),
      ),
  );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    for (
      const assignment
      of assignments
    ) {
      await validateTeam(
        client,
        context.companyId,
        assignment.teamId,
      );
    }

    const plan =
      id
        ? await client.query(
            `
              UPDATE sales_commission_plans
              SET
                name = $3,
                code = $4,
                basis = $5,
                rate_percent = $6,
                threshold_amount = $7,
                cap_amount = $8,
                valid_from = $9,
                valid_until = $10,
                is_active = $11,
                updated_by = $12,
                updated_at = NOW()
              WHERE id = $1
                AND company_id = $2
                AND deleted_at IS NULL
              RETURNING id
            `,
            [
              id,
              context.companyId,
              name,
              nullableText(
                input.code,
                80,
              ),
              basis,
              numberInput(
                input.ratePercent ??
                0,
                'Commission rate',
                {
                  min:
                    0,
                  max:
                    100,
                },
              ),
              numberInput(
                input.thresholdAmount ??
                0,
                'Commission threshold',
                {
                  min:
                    0,
                },
              ),
              input.capAmount ===
                null ||
              input.capAmount ===
                undefined ||
              input.capAmount ===
                ''
                ? null
                : numberInput(
                    input.capAmount,
                    'Commission cap',
                    {
                      min:
                        0,
                    },
                  ),
              validFrom,
              validUntil,
              input.isActive !==
                false,
              context.userId,
            ],
          )
        : await client.query(
            `
              INSERT INTO sales_commission_plans (
                company_id,
                name,
                code,
                basis,
                rate_percent,
                threshold_amount,
                cap_amount,
                valid_from,
                valid_until,
                is_active,
                created_by,
                updated_by
              )
              VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11
              )
              RETURNING id
            `,
            [
              context.companyId,
              name,
              nullableText(
                input.code,
                80,
              ),
              basis,
              numberInput(
                input.ratePercent ??
                0,
                'Commission rate',
                {
                  min:
                    0,
                  max:
                    100,
                },
              ),
              numberInput(
                input.thresholdAmount ??
                0,
                'Commission threshold',
                {
                  min:
                    0,
                },
              ),
              input.capAmount ===
                null ||
              input.capAmount ===
                undefined ||
              input.capAmount ===
                ''
                ? null
                : numberInput(
                    input.capAmount,
                    'Commission cap',
                    {
                      min:
                        0,
                    },
                  ),
              validFrom,
              validUntil,
              input.isActive !==
                false,
              context.userId,
            ],
          );

    if (
      plan.rows.length !==
        1
    ) {
      throw new SalesError(
        'INVALID_INPUT',
        'Commission plan was not found.',
      );
    }

    const planId =
      String(
        plan.rows[0].id,
      );

    if (
      input.assignments !==
        undefined
    ) {
      await client.query(
        `
          DELETE FROM sales_commission_assignments
          WHERE company_id = $1
            AND plan_id = $2
            AND NOT EXISTS (
              SELECT 1
              FROM sales_commission_entries entry
              WHERE entry.assignment_id =
                    sales_commission_assignments.id
            )
        `,
        [
          context.companyId,
          planId,
        ],
      );

      const existing =
        await client.query(
          `
            SELECT id
            FROM sales_commission_assignments
            WHERE company_id = $1
              AND plan_id = $2
          `,
          [
            context.companyId,
            planId,
          ],
        );

      if (
        existing.rows.length >
          0
      ) {
        throw new SalesError(
          'INVALID_INPUT',
          'This commission plan already has historical accruals. Create a new plan version instead of replacing its assignments.',
        );
      }

      for (
        const assignment
        of assignments
      ) {
        await client.query(
          `
            INSERT INTO sales_commission_assignments (
              company_id,
              plan_id,
              assignee_type,
              user_id,
              team_id,
              valid_from,
              valid_until,
              is_active,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$9
            )
          `,
          [
            context.companyId,
            planId,
            assignment.assigneeType,
            assignment.userId,
            assignment.teamId,
            assignment.validFrom,
            assignment.validUntil,
            assignment.isActive,
            context.userId,
          ],
        );
      }
    }

    await client.query(
      'COMMIT',
    );

    return {
      id:
        planId,
      assignmentCount:
        assignments.length,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}

export async function resolveSalesAssignmentForUser(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
  },
) {
  const result =
    await client.query(
      `
        SELECT
          member.team_id,
          team.territory_id
        FROM sales_team_members member
        INNER JOIN sales_teams team
          ON team.id =
             member.team_id
         AND team.company_id =
             member.company_id
        WHERE member.company_id = $1
          AND member.user_id = $2
          AND member.is_active = TRUE
          AND team.is_active = TRUE
          AND team.deleted_at IS NULL
        ORDER BY
          CASE
            WHEN member.role = 'manager'
            THEN 0
            ELSE 1
          END,
          LOWER(team.name),
          team.id
        LIMIT 1
      `,
      [
        input.companyId,
        input.userId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    return {
      salesTeamId:
        null,
      territoryId:
        null,
    };
  }

  return {
    salesTeamId:
      result.rows[0]
        .team_id
        ? String(
            result.rows[0]
              .team_id,
          )
        : null,
    territoryId:
      result.rows[0]
        .territory_id
        ? String(
            result.rows[0]
              .territory_id,
          )
        : null,
  };
}

export async function recordSalesOrderCommissionEntries(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    orderId:
      string;
    salespersonUserId:
      string | null;
    salesTeamId:
      string | null;
    orderDate:
      string;
    currency:
      string;
    revenueAmount:
      number;
    marginAmount:
      number;
    userId:
      string;
  },
) {
  const result =
    await client.query(
      `
        SELECT
          assignment.id
            AS assignment_id,
          assignment.user_id,
          assignment.team_id,
          plan.id
            AS plan_id,
          plan.basis,
          plan.rate_percent,
          plan.threshold_amount,
          plan.cap_amount
        FROM sales_commission_assignments assignment
        INNER JOIN sales_commission_plans plan
          ON plan.id =
             assignment.plan_id
         AND plan.company_id =
             assignment.company_id
        WHERE assignment.company_id = $1
          AND assignment.is_active = TRUE
          AND plan.is_active = TRUE
          AND plan.deleted_at IS NULL
          AND (
            plan.valid_from IS NULL
            OR plan.valid_from <=
               $4::date
          )
          AND (
            plan.valid_until IS NULL
            OR plan.valid_until >=
               $4::date
          )
          AND (
            assignment.valid_from IS NULL
            OR assignment.valid_from <=
               $4::date
          )
          AND (
            assignment.valid_until IS NULL
            OR assignment.valid_until >=
               $4::date
          )
          AND (
            (
              assignment.assignee_type =
                'user'
              AND assignment.user_id =
                  $2
            )
            OR
            (
              assignment.assignee_type =
                'team'
              AND assignment.team_id =
                  $3
            )
          )
        ORDER BY
          plan.id,
          assignment.id
      `,
      [
        input.companyId,
        input.salespersonUserId,
        input.salesTeamId,
        input.orderDate,
      ],
    );

  let created =
    0;

  for (
    const row
    of result.rows
  ) {
    const basisAmount =
      money(
        row.basis ===
          'margin'
          ? input.marginAmount
          : input.revenueAmount,
      );

    const threshold =
      money(
        row.threshold_amount,
      );

    if (
      basisAmount <
        threshold
    ) {
      continue;
    }

    let commission =
      money(
        basisAmount *
        Number(
          row.rate_percent ||
          0,
        ) /
        100,
      );

    if (
      row.cap_amount !==
        null &&
      row.cap_amount !==
        undefined
    ) {
      commission =
        Math.min(
          commission,
          money(
            row.cap_amount,
          ),
        );
    }

    const sourceEventKey =
      'sales-order:' +
      input.orderId +
      ':commission-assignment:' +
      String(
        row.assignment_id,
      );

    const inserted =
      await client.query(
        `
          INSERT INTO sales_commission_entries (
            company_id,
            order_id,
            plan_id,
            assignment_id,
            user_id,
            team_id,
            basis,
            basis_amount,
            commission_amount,
            currency,
            status,
            source_event_key,
            metadata,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            'accrued',$11,$12::jsonb,$13,$13
          )
          ON CONFLICT (
            company_id,
            source_event_key
          )
          DO NOTHING
          RETURNING id
        `,
        [
          input.companyId,
          input.orderId,
          String(
            row.plan_id,
          ),
          String(
            row.assignment_id,
          ),
          row.user_id
            ? String(
                row.user_id,
              )
            : null,
          row.team_id
            ? String(
                row.team_id,
              )
            : null,
          String(
            row.basis,
          ),
          basisAmount,
          commission,
          input.currency,
          sourceEventKey,
          JSON.stringify({
            revenueAmount:
              money(
                input.revenueAmount,
              ),
            marginAmount:
              money(
                input.marginAmount,
              ),
            ratePercent:
              Number(
                row.rate_percent ||
                0,
              ),
            thresholdAmount:
              threshold,
          }),
          input.userId,
        ],
      );

    if (
      inserted.rows.length >
        0
    ) {
      created +=
        1;
    }
  }

  return created;
}

export async function reverseSalesOrderCommissions(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    orderId:
      string;
    userId:
      string;
    reason?:
      string | null;
  },
) {
  const result =
    await client.query(
      `
        UPDATE sales_commission_entries
        SET
          status = 'reversed',
          reversed_at = NOW(),
          updated_by = $3,
          updated_at = NOW(),
          metadata =
            metadata ||
            jsonb_build_object(
              'reversalReason',
              $4::text
            )
        WHERE company_id = $1
          AND order_id = $2
          AND status = 'accrued'
        RETURNING id
      `,
      [
        input.companyId,
        input.orderId,
        input.userId,
        input.reason ||
        'Sales order cancelled',
      ],
    );

  return result.rows.length;
}
