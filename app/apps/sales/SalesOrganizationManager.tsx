'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  BadgeDollarSign,
  Plus,
  Target,
  UsersRound,
} from 'lucide-react';

type Member = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isOwner: boolean;
};

type Territory = {
  id: string;
  name: string;
  code: string | null;
  parentTerritoryId: string | null;
  description: string | null;
  isActive: boolean;
};

type Team = {
  id: string;
  name: string;
  code: string | null;
  managerUserId: string | null;
  territoryId: string | null;
  description: string | null;
  isActive: boolean;
  memberUserIds: string[];
};

type SalesTarget = {
  id: string;
  targetScope: string;
  teamId: string | null;
  userId: string | null;
  metric: string;
  periodStart: string;
  periodEnd: string;
  targetValue: number;
  actualValue: number;
  attainmentPercent: number;
  notes: string | null;
  isActive: boolean;
};

type CommissionAssignment = {
  id: string;
  assigneeType: string;
  userId: string | null;
  teamId: string | null;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
};

type CommissionPlan = {
  id: string;
  name: string;
  code: string | null;
  basis: string;
  ratePercent: number;
  thresholdAmount: number;
  capAmount: number | null;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  assignments: CommissionAssignment[];
};

type CommissionEntry = {
  id: string;
  orderId: string;
  planId: string;
  assignmentId: string;
  userId: string | null;
  teamId: string | null;
  basis: string;
  basisAmount: number;
  commissionAmount: number;
  currency: string;
  status: string;
  accruedAt: string;
  reversedAt: string | null;
  paidAt: string | null;
};

type OrganizationData = {
  capabilities: {
    canViewTeams: boolean;
    canManageTeams: boolean;
    canViewTargets: boolean;
    canManageTargets: boolean;
    canViewCommissions: boolean;
    canManageCommissions: boolean;
  };
  members: Member[];
  territories: Territory[];
  teams: Team[];
  targets: SalesTarget[];
  commissionPlans: CommissionPlan[];
  commissionEntries: CommissionEntry[];
};

type AssignmentDraft = {
  key: string;
  assigneeType: 'user' | 'team';
  userId: string;
  teamId: string;
};

function randomKey() {
  return globalThis.crypto?.randomUUID?.() ||
    Math.random().toString(36).slice(2);
}

function money(
  value: number,
  currency: string,
) {
  try {
    return new Intl.NumberFormat(
      'en-KE',
      {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      },
    ).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString();
  }
}

export default function SalesOrganizationManager({
  busy,
  request,
  showSuccess,
  showError,
}: {
  busy: boolean;
  request: (
    payload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  showSuccess: (
    title: string,
    message: string,
  ) => void;
  showError: (
    title: string,
    message: string,
  ) => void;
}) {
  const [
    data,
    setData,
  ] =
    useState<OrganizationData | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    memberSelection,
    setMemberSelection,
  ] =
    useState<string[]>([]);

  const [
    targetScope,
    setTargetScope,
  ] =
    useState<'company' | 'team' | 'user'>(
      'company',
    );

  const [
    assignments,
    setAssignments,
  ] =
    useState<AssignmentDraft[]>([
      {
        key: randomKey(),
        assigneeType: 'user',
        userId: '',
        teamId: '',
      },
    ]);

  async function refresh() {
    setLoading(true);

    try {
      const response =
        await fetch(
          '/api/apps/sales?organization=1',
          {
            cache: 'no-store',
            credentials: 'same-origin',
          },
        );

      const body =
        await response
          .json()
          .catch(
            () => ({}),
          ) as {
            success?: boolean;
            error?: string;
            organization?: OrganizationData;
          };

      if (
        !response.ok ||
        body.success !== true ||
        !body.organization
      ) {
        throw new Error(
          body.error ||
          'SaMi could not load Sales organization data.',
        );
      }

      setData(
        body.organization,
      );
    } catch (
      error
    ) {
      showError(
        'Sales organization unavailable',
        error instanceof Error
          ? error.message
          : 'SaMi could not load Sales organization data.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(
    () => {
      void refresh();
    },
    [],
  );

  const memberById =
    useMemo(
      () =>
        new Map(
          (
            data?.members ||
            []
          ).map(
            member => [
              member.id,
              member,
            ],
          ),
        ),
      [
        data?.members,
      ],
    );

  const teamById =
    useMemo(
      () =>
        new Map(
          (
            data?.teams ||
            []
          ).map(
            team => [
              team.id,
              team,
            ],
          ),
        ),
      [
        data?.teams,
      ],
    );

  const activeAccrued =
    useMemo(
      () =>
        (
          data?.commissionEntries ||
          []
        )
          .filter(
            entry =>
              entry.status ===
              'accrued',
          )
          .reduce(
            (
              sum,
              entry,
            ) =>
              sum +
              entry.commissionAmount,
            0,
          ),
      [
        data?.commissionEntries,
      ],
    );

  if (
    loading &&
    !data
  ) {
    return (
      <div className="sami-surface rounded-[24px] p-6 text-sm text-slate-500">
        Loading Sales teams, targets and commissions…
      </div>
    );
  }

  if (
    !data
  ) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Sales teams"
          value={
            String(
              data.teams.filter(
                team =>
                  team.isActive,
              ).length,
            )
          }
          icon={
            UsersRound
          }
        />
        <Metric
          label="Active targets"
          value={
            String(
              data.targets.filter(
                target =>
                  target.isActive,
              ).length,
            )
          }
          icon={
            Target
          }
        />
        <Metric
          label="Commission plans"
          value={
            String(
              data.commissionPlans.filter(
                plan =>
                  plan.isActive,
              ).length,
            )
          }
          icon={
            BadgeDollarSign
          }
        />
        <Metric
          label="Accrued commission"
          value={
            data.commissionEntries.length >
              0
              ? money(
                  activeAccrued,
                  data.commissionEntries[0]
                    ?.currency ||
                  'KES',
                )
              : '—'
          }
          icon={
            BadgeDollarSign
          }
        />
      </div>

      {
        data.capabilities
          .canViewTeams &&
        (
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            {
              data.capabilities
                .canManageTeams &&
              (
                <form
                  className="sami-surface rounded-[24px] p-4"
                  onSubmit={
                    async event => {
                      event.preventDefault();

                      const form =
                        new FormData(
                          event.currentTarget,
                        );

                      try {
                        await request({
                          action:
                            'save_sales_territory',
                          name:
                            form.get(
                              'territoryName',
                            ),
                          code:
                            form.get(
                              'territoryCode',
                            ),
                          parentTerritoryId:
                            form.get(
                              'parentTerritoryId',
                            ) ||
                            undefined,
                          description:
                            form.get(
                              'territoryDescription',
                            ),
                        });

                        event.currentTarget
                          .reset();

                        showSuccess(
                          'Territory saved',
                          'The Sales territory is ready for team assignment.',
                        );

                        await refresh();
                      } catch (
                        error
                      ) {
                        showError(
                          'Territory save failed',
                          error instanceof Error
                            ? error.message
                            : 'SaMi could not save the territory.',
                        );
                      }
                    }
                  }
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Coverage
                  </p>
                  <h2 className="mt-1 text-sm font-black">
                    Sales territories
                  </h2>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Field
                      name="territoryName"
                      label="Territory name"
                      required
                    />
                    <Field
                      name="territoryCode"
                      label="Code"
                    />

                    <label className="sm:col-span-2">
                      <Label>
                        Parent territory
                      </Label>
                      <select
                        name="parentTerritoryId"
                        className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                      >
                        <option value="">
                          No parent
                        </option>
                        {
                          data.territories
                            .filter(
                              territory =>
                                territory.isActive,
                            )
                            .map(
                              territory => (
                                <option
                                  key={
                                    territory.id
                                  }
                                  value={
                                    territory.id
                                  }
                                >
                                  {
                                    territory.name
                                  }
                                </option>
                              ),
                            )
                        }
                      </select>
                    </label>

                    <label className="sm:col-span-2">
                      <Label>
                        Description
                      </Label>
                      <textarea
                        name="territoryDescription"
                        rows={3}
                        className="mt-1 w-full resize-y rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      busy
                    }
                    className="mt-4 h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
                  >
                    Save territory
                  </button>

                  <div className="mt-4 space-y-2">
                    {
                      data.territories
                        .map(
                          territory => (
                            <div
                              key={
                                territory.id
                              }
                              className="rounded-xl border border-[var(--sami-border)] p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-black">
                                  {
                                    territory.name
                                  }
                                </p>
                                <State
                                  active={
                                    territory.isActive
                                  }
                                />
                              </div>
                              {
                                territory.code &&
                                (
                                  <p className="mt-1 text-[10px] text-slate-500">
                                    {
                                      territory.code
                                    }
                                  </p>
                                )
                              }
                            </div>
                          ),
                        )
                    }
                  </div>
                </form>
              )
            }

            {
              data.capabilities
                .canManageTeams
                ? (
                    <form
                      className="sami-surface rounded-[24px] p-4"
                      onSubmit={
                        async event => {
                          event.preventDefault();

                          const form =
                            new FormData(
                              event.currentTarget,
                            );

                          try {
                            await request({
                              action:
                                'save_sales_team',
                              name:
                                form.get(
                                  'teamName',
                                ),
                              code:
                                form.get(
                                  'teamCode',
                                ),
                              managerUserId:
                                form.get(
                                  'managerUserId',
                                ) ||
                                undefined,
                              territoryId:
                                form.get(
                                  'territoryId',
                                ) ||
                                undefined,
                              description:
                                form.get(
                                  'teamDescription',
                                ),
                              memberUserIds:
                                memberSelection,
                            });

                            event.currentTarget
                              .reset();

                            setMemberSelection(
                              [],
                            );

                            showSuccess(
                              'Sales team saved',
                              'The team and member assignments were saved.',
                            );

                            await refresh();
                          } catch (
                            error
                          ) {
                            showError(
                              'Sales team save failed',
                              error instanceof Error
                                ? error.message
                                : 'SaMi could not save the Sales team.',
                            );
                          }
                        }
                      }
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                        Organization
                      </p>
                      <h2 className="mt-1 text-sm font-black">
                        Sales teams
                      </h2>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Field
                          name="teamName"
                          label="Team name"
                          required
                        />
                        <Field
                          name="teamCode"
                          label="Code"
                        />

                        <label>
                          <Label>
                            Manager
                          </Label>
                          <select
                            name="managerUserId"
                            className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                          >
                            <option value="">
                              No manager
                            </option>
                            {
                              data.members.map(
                                member => (
                                  <option
                                    key={
                                      member.id
                                    }
                                    value={
                                      member.id
                                    }
                                  >
                                    {
                                      member.name
                                    }
                                  </option>
                                ),
                              )
                            }
                          </select>
                        </label>

                        <label>
                          <Label>
                            Territory
                          </Label>
                          <select
                            name="territoryId"
                            className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                          >
                            <option value="">
                              No territory
                            </option>
                            {
                              data.territories
                                .filter(
                                  territory =>
                                    territory.isActive,
                                )
                                .map(
                                  territory => (
                                    <option
                                      key={
                                        territory.id
                                      }
                                      value={
                                        territory.id
                                      }
                                    >
                                      {
                                        territory.name
                                      }
                                    </option>
                                  ),
                                )
                            }
                          </select>
                        </label>

                        <label className="sm:col-span-2">
                          <Label>
                            Description
                          </Label>
                          <textarea
                            name="teamDescription"
                            rows={2}
                            className="mt-1 w-full resize-y rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
                          />
                        </label>
                      </div>

                      <div className="mt-4">
                        <Label>
                          Team members
                        </Label>
                        <div className="mt-2 grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
                          {
                            data.members.map(
                              member => {
                                const checked =
                                  memberSelection
                                    .includes(
                                      member.id,
                                    );

                                return (
                                  <label
                                    key={
                                      member.id
                                    }
                                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--sami-border)] p-3"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={
                                        checked
                                      }
                                      onChange={
                                        event =>
                                          setMemberSelection(
                                            current =>
                                              event.target
                                                .checked
                                                ? [
                                                    ...current,
                                                    member.id,
                                                  ]
                                                : current.filter(
                                                    id =>
                                                      id !==
                                                        member.id,
                                                  ),
                                          )
                                      }
                                    />
                                    <span className="min-w-0">
                                      <span className="block truncate text-xs font-black">
                                        {
                                          member.name
                                        }
                                      </span>
                                      <span className="block truncate text-[10px] text-slate-500">
                                        {
                                          member.email
                                        }
                                      </span>
                                    </span>
                                  </label>
                                );
                              },
                            )
                          }
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={
                          busy
                        }
                        className="mt-4 h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
                      >
                        Save team
                      </button>
                    </form>
                  )
                : (
                    <ListCard
                      title="Sales teams"
                      rows={
                        data.teams.map(
                          team => ({
                            title:
                              team.name,
                            detail:
                              String(
                                team.memberUserIds.length,
                              ) +
                              ' members',
                          }),
                        )
                      }
                    />
                  )
            }
          </div>
        )
      }

      {
        data.capabilities
          .canViewTeams &&
        data.capabilities
          .canManageTeams &&
        data.teams.length >
          0 &&
        (
          <div className="sami-surface rounded-[24px] p-4">
            <h2 className="text-sm font-black">
              Team directory
            </h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {
                data.teams.map(
                  team => (
                    <div
                      key={
                        team.id
                      }
                      className="rounded-2xl border border-[var(--sami-border)] p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-black">
                          {
                            team.name
                          }
                        </p>
                        <State
                          active={
                            team.isActive
                          }
                        />
                      </div>
                      <p className="mt-2 text-[10px] text-slate-500">
                        Manager: {
                          team.managerUserId
                            ? memberById.get(
                                team.managerUserId,
                              )?.name ||
                              'Assigned member'
                            : 'Not assigned'
                        }
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {
                          team.memberUserIds.length
                        } active member{
                          team.memberUserIds.length ===
                            1
                            ? ''
                            : 's'
                        }
                      </p>
                    </div>
                  ),
                )
              }
            </div>
          </div>
        )
      }

      {
        data.capabilities
          .canViewTargets &&
        (
          <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            {
              data.capabilities
                .canManageTargets &&
              (
                <form
                  className="sami-surface rounded-[24px] p-4"
                  onSubmit={
                    async event => {
                      event.preventDefault();

                      const form =
                        new FormData(
                          event.currentTarget,
                        );

                      try {
                        await request({
                          action:
                            'save_sales_target',
                          targetScope,
                          teamId:
                            targetScope ===
                              'team'
                              ? form.get(
                                  'targetTeamId',
                                )
                              : undefined,
                          userId:
                            targetScope ===
                              'user'
                              ? form.get(
                                  'targetUserId',
                                )
                              : undefined,
                          metric:
                            form.get(
                              'targetMetric',
                            ),
                          periodStart:
                            form.get(
                              'periodStart',
                            ),
                          periodEnd:
                            form.get(
                              'periodEnd',
                            ),
                          targetValue:
                            form.get(
                              'targetValue',
                            ),
                          notes:
                            form.get(
                              'targetNotes',
                            ),
                        });

                        event.currentTarget
                          .reset();

                        setTargetScope(
                          'company',
                        );

                        showSuccess(
                          'Sales target saved',
                          'The target is now available for performance tracking.',
                        );

                        await refresh();
                      } catch (
                        error
                      ) {
                        showError(
                          'Sales target save failed',
                          error instanceof Error
                            ? error.message
                            : 'SaMi could not save the target.',
                        );
                      }
                    }
                  }
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Quotas
                  </p>
                  <h2 className="mt-1 text-sm font-black">
                    New sales target
                  </h2>

                  <div className="mt-4 space-y-3">
                    <label>
                      <Label>
                        Scope
                      </Label>
                      <select
                        value={
                          targetScope
                        }
                        onChange={
                          event =>
                            setTargetScope(
                              event.target
                                .value as
                                'company' |
                                'team' |
                                'user',
                            )
                        }
                        className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                      >
                        <option value="company">
                          Company
                        </option>
                        <option value="team">
                          Sales team
                        </option>
                        <option value="user">
                          Salesperson
                        </option>
                      </select>
                    </label>

                    {
                      targetScope ===
                        'team' &&
                      (
                        <label>
                          <Label>
                            Team
                          </Label>
                          <select
                            name="targetTeamId"
                            required
                            className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                          >
                            <option value="">
                              Choose team
                            </option>
                            {
                              data.teams
                                .filter(
                                  team =>
                                    team.isActive,
                                )
                                .map(
                                  team => (
                                    <option
                                      key={
                                        team.id
                                      }
                                      value={
                                        team.id
                                      }
                                    >
                                      {
                                        team.name
                                      }
                                    </option>
                                  ),
                                )
                            }
                          </select>
                        </label>
                      )
                    }

                    {
                      targetScope ===
                        'user' &&
                      (
                        <label>
                          <Label>
                            Salesperson
                          </Label>
                          <select
                            name="targetUserId"
                            required
                            className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                          >
                            <option value="">
                              Choose salesperson
                            </option>
                            {
                              data.members.map(
                                member => (
                                  <option
                                    key={
                                      member.id
                                    }
                                    value={
                                      member.id
                                    }
                                  >
                                    {
                                      member.name
                                    }
                                  </option>
                                ),
                              )
                            }
                          </select>
                        </label>
                      )
                    }

                    <label>
                      <Label>
                        Metric
                      </Label>
                      <select
                        name="targetMetric"
                        className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                      >
                        <option value="revenue">
                          Revenue
                        </option>
                        <option value="margin">
                          Margin
                        </option>
                        <option value="orders">
                          Orders
                        </option>
                      </select>
                    </label>

                    <Field
                      name="periodStart"
                      label="Period start"
                      type="date"
                      required
                    />
                    <Field
                      name="periodEnd"
                      label="Period end"
                      type="date"
                      required
                    />
                    <Field
                      name="targetValue"
                      label="Target value"
                      type="number"
                      required
                    />
                    <Field
                      name="targetNotes"
                      label="Notes"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={
                      busy
                    }
                    className="mt-4 h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
                  >
                    Save target
                  </button>
                </form>
              )
            }

            <div className="sami-surface rounded-[24px] p-4">
              <h2 className="text-sm font-black">
                Current targets
              </h2>
              <div className="mt-3 space-y-2">
                {
                  data.targets.length ===
                    0
                    ? (
                        <Empty>
                          No Sales targets yet.
                        </Empty>
                      )
                    : data.targets.map(
                        target => (
                          <div
                            key={
                              target.id
                            }
                            className="rounded-xl border border-[var(--sami-border)] p-3"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-black capitalize">
                                  {
                                    target.metric
                                  } · {
                                    target.targetScope
                                  }
                                </p>
                                <p className="mt-1 text-[10px] text-slate-500">
                                  {
                                    target.periodStart
                                  } → {
                                    target.periodEnd
                                  }
                                </p>
                                {
                                  target.userId &&
                                  (
                                    <p className="mt-1 text-[10px] text-slate-500">
                                      {
                                        memberById.get(
                                          target.userId,
                                        )?.name ||
                                        'Salesperson'
                                      }
                                    </p>
                                  )
                                }
                                {
                                  target.teamId &&
                                  (
                                    <p className="mt-1 text-[10px] text-slate-500">
                                      {
                                        teamById.get(
                                          target.teamId,
                                        )?.name ||
                                        'Sales team'
                                      }
                                    </p>
                                  )
                                }
                              </div>
                              <div className="min-w-32 text-right">
                                <p className="text-sm font-black">
                                  {
                                    target.actualValue
                                      .toLocaleString()
                                  } / {
                                    target.targetValue
                                      .toLocaleString()
                                  }
                                </p>
                                <p className="mt-1 text-[10px] font-black text-blue-700 dark:text-blue-300">
                                  {
                                    target.attainmentPercent
                                      .toFixed(
                                        1,
                                      )
                                  }% achieved
                                </p>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-500/10">
                                  <div
                                    className="h-full rounded-full bg-blue-600"
                                    style={{
                                      width:
                                        Math.min(
                                          100,
                                          Math.max(
                                            0,
                                            target.attainmentPercent,
                                          ),
                                        ) +
                                        '%',
                                    }}
                                  />
                                </div>
                                <div className="mt-2">
                                  <State
                                    active={
                                      target.isActive
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ),
                      )
                }
              </div>
            </div>
          </div>
        )
      }

      {
        data.capabilities
          .canViewCommissions &&
        (
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            {
              data.capabilities
                .canManageCommissions &&
              (
                <form
                  className="sami-surface rounded-[24px] p-4"
                  onSubmit={
                    async event => {
                      event.preventDefault();

                      const form =
                        new FormData(
                          event.currentTarget,
                        );

                      try {
                        await request({
                          action:
                            'save_commission_plan',
                          name:
                            form.get(
                              'commissionName',
                            ),
                          code:
                            form.get(
                              'commissionCode',
                            ),
                          basis:
                            form.get(
                              'commissionBasis',
                            ),
                          ratePercent:
                            form.get(
                              'commissionRate',
                            ),
                          thresholdAmount:
                            form.get(
                              'commissionThreshold',
                            ),
                          capAmount:
                            form.get(
                              'commissionCap',
                            ) ||
                            undefined,
                          validFrom:
                            form.get(
                              'commissionValidFrom',
                            ) ||
                            undefined,
                          validUntil:
                            form.get(
                              'commissionValidUntil',
                            ) ||
                            undefined,
                          assignments:
                            assignments.map(
                              assignment => ({
                                assigneeType:
                                  assignment.assigneeType,
                                userId:
                                  assignment.assigneeType ===
                                    'user'
                                    ? assignment.userId
                                    : undefined,
                                teamId:
                                  assignment.assigneeType ===
                                    'team'
                                    ? assignment.teamId
                                    : undefined,
                              }),
                            ),
                        });

                        event.currentTarget
                          .reset();

                        setAssignments([
                          {
                            key:
                              randomKey(),
                            assigneeType:
                              'user',
                            userId:
                              '',
                            teamId:
                              '',
                          },
                        ]);

                        showSuccess(
                          'Commission plan saved',
                          'New eligible orders will accrue commission automatically.',
                        );

                        await refresh();
                      } catch (
                        error
                      ) {
                        showError(
                          'Commission plan save failed',
                          error instanceof Error
                            ? error.message
                            : 'SaMi could not save the commission plan.',
                        );
                      }
                    }
                  }
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Incentives
                  </p>
                  <h2 className="mt-1 text-sm font-black">
                    Commission plan
                  </h2>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Field
                      name="commissionName"
                      label="Plan name"
                      required
                    />
                    <Field
                      name="commissionCode"
                      label="Code"
                    />

                    <label>
                      <Label>
                        Basis
                      </Label>
                      <select
                        name="commissionBasis"
                        className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                      >
                        <option value="revenue">
                          Revenue
                        </option>
                        <option value="margin">
                          Margin
                        </option>
                      </select>
                    </label>

                    <Field
                      name="commissionRate"
                      label="Rate %"
                      type="number"
                      required
                    />
                    <Field
                      name="commissionThreshold"
                      label="Minimum basis"
                      type="number"
                      defaultValue="0"
                    />
                    <Field
                      name="commissionCap"
                      label="Commission cap"
                      type="number"
                    />
                    <Field
                      name="commissionValidFrom"
                      label="Valid from"
                      type="date"
                    />
                    <Field
                      name="commissionValidUntil"
                      label="Valid until"
                      type="date"
                    />
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3">
                      <Label>
                        Assignments
                      </Label>
                      <button
                        type="button"
                        onClick={
                          () =>
                            setAssignments(
                              current => [
                                ...current,
                                {
                                  key:
                                    randomKey(),
                                  assigneeType:
                                    'user',
                                  userId:
                                    '',
                                  teamId:
                                    '',
                                },
                              ],
                            )
                        }
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--sami-border)] px-2 text-[10px] font-black"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Assignment
                      </button>
                    </div>

                    <div className="mt-2 space-y-2">
                      {
                        assignments.map(
                          (
                            assignment,
                            index,
                          ) => (
                            <div
                              key={
                                assignment.key
                              }
                              className="grid gap-2 rounded-xl border border-[var(--sami-border)] p-3 sm:grid-cols-[0.7fr_1.3fr_auto]"
                            >
                              <select
                                value={
                                  assignment.assigneeType
                                }
                                onChange={
                                  event =>
                                    setAssignments(
                                      current =>
                                        current.map(
                                          (
                                            item,
                                            position,
                                          ) =>
                                            position ===
                                              index
                                              ? {
                                                  ...item,
                                                  assigneeType:
                                                    event.target
                                                      .value as
                                                      'user' |
                                                      'team',
                                                  userId:
                                                    '',
                                                  teamId:
                                                    '',
                                                }
                                              : item,
                                        ),
                                    )
                                }
                                className="h-10 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                              >
                                <option value="user">
                                  Salesperson
                                </option>
                                <option value="team">
                                  Team
                                </option>
                              </select>

                              {
                                assignment.assigneeType ===
                                  'user'
                                  ? (
                                      <select
                                        required
                                        value={
                                          assignment.userId
                                        }
                                        onChange={
                                          event =>
                                            setAssignments(
                                              current =>
                                                current.map(
                                                  (
                                                    item,
                                                    position,
                                                  ) =>
                                                    position ===
                                                      index
                                                      ? {
                                                          ...item,
                                                          userId:
                                                            event.target
                                                              .value,
                                                        }
                                                      : item,
                                                ),
                                            )
                                        }
                                        className="h-10 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                      >
                                        <option value="">
                                          Choose salesperson
                                        </option>
                                        {
                                          data.members.map(
                                            member => (
                                              <option
                                                key={
                                                  member.id
                                                }
                                                value={
                                                  member.id
                                                }
                                              >
                                                {
                                                  member.name
                                                }
                                              </option>
                                            ),
                                          )
                                        }
                                      </select>
                                    )
                                  : (
                                      <select
                                        required
                                        value={
                                          assignment.teamId
                                        }
                                        onChange={
                                          event =>
                                            setAssignments(
                                              current =>
                                                current.map(
                                                  (
                                                    item,
                                                    position,
                                                  ) =>
                                                    position ===
                                                      index
                                                      ? {
                                                          ...item,
                                                          teamId:
                                                            event.target
                                                              .value,
                                                        }
                                                      : item,
                                                ),
                                            )
                                        }
                                        className="h-10 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                      >
                                        <option value="">
                                          Choose team
                                        </option>
                                        {
                                          data.teams
                                            .filter(
                                              team =>
                                                team.isActive,
                                            )
                                            .map(
                                              team => (
                                                <option
                                                  key={
                                                    team.id
                                                  }
                                                  value={
                                                    team.id
                                                  }
                                                >
                                                  {
                                                    team.name
                                                  }
                                                </option>
                                              ),
                                            )
                                        }
                                      </select>
                                    )
                              }

                              <button
                                type="button"
                                disabled={
                                  assignments.length ===
                                    1
                                }
                                onClick={
                                  () =>
                                    setAssignments(
                                      current =>
                                        current.filter(
                                          (
                                            _item,
                                            position,
                                          ) =>
                                            position !==
                                              index,
                                        ),
                                    )
                                }
                                className="h-10 rounded-lg border border-red-500/30 px-3 text-xs font-black text-red-600 disabled:opacity-30"
                              >
                                Remove
                              </button>
                            </div>
                          ),
                        )
                      }
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      busy
                    }
                    className="mt-4 h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
                  >
                    Save commission plan
                  </button>
                </form>
              )
            }

            <div className="space-y-4">
              <div className="sami-surface rounded-[24px] p-4">
                <h2 className="text-sm font-black">
                  Commission plans
                </h2>
                <div className="mt-3 space-y-2">
                  {
                    data.commissionPlans.length ===
                      0
                      ? (
                          <Empty>
                            No commission plans yet.
                          </Empty>
                        )
                      : data.commissionPlans.map(
                          plan => (
                            <div
                              key={
                                plan.id
                              }
                              className="rounded-xl border border-[var(--sami-border)] p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-black">
                                  {
                                    plan.name
                                  }
                                </p>
                                <State
                                  active={
                                    plan.isActive
                                  }
                                />
                              </div>
                              <p className="mt-1 text-[10px] text-slate-500">
                                {
                                  plan.ratePercent
                                }% of {
                                  plan.basis
                                } · {
                                  plan.assignments.length
                                } assignment{
                                  plan.assignments.length ===
                                    1
                                    ? ''
                                    : 's'
                                }
                              </p>
                            </div>
                          ),
                        )
                  }
                </div>
              </div>

              <div className="sami-surface rounded-[24px] p-4">
                <h2 className="text-sm font-black">
                  Recent commission accruals
                </h2>
                <div className="mt-3 space-y-2">
                  {
                    data.commissionEntries.length ===
                      0
                      ? (
                          <Empty>
                            No commission accruals yet.
                          </Empty>
                        )
                      : data.commissionEntries
                          .slice(
                            0,
                            20,
                          )
                          .map(
                            entry => (
                              <div
                                key={
                                  entry.id
                                }
                                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--sami-border)] p-3"
                              >
                                <div>
                                  <p className="text-xs font-black">
                                    {
                                      entry.userId
                                        ? memberById.get(
                                            entry.userId,
                                          )?.name ||
                                          'Salesperson'
                                        : entry.teamId
                                          ? teamById.get(
                                              entry.teamId,
                                            )?.name ||
                                            'Sales team'
                                          : 'Sales commission'
                                    }
                                  </p>
                                  <p className="mt-1 text-[10px] text-slate-500">
                                    {
                                      entry.basis
                                    } · {
                                      entry.status
                                    }
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-black">
                                    {
                                      money(
                                        entry.commissionAmount,
                                        entry.currency,
                                      )
                                    }
                                  </p>
                                  {
                                    entry.status ===
                                      'accrued' &&
                                    data.capabilities
                                      .canManageCommissions &&
                                    (
                                      <button
                                        type="button"
                                        disabled={
                                          busy
                                        }
                                        onClick={
                                          async () => {
                                            try {
                                              await request({
                                                action:
                                                  'mark_commission_paid',
                                                entryId:
                                                  entry.id,
                                              });

                                              showSuccess(
                                                'Commission marked paid',
                                                'The payout status and audit timestamp were recorded.',
                                              );

                                              await refresh();
                                            } catch (
                                              error
                                            ) {
                                              showError(
                                                'Commission payout failed',
                                                error instanceof Error
                                                  ? error.message
                                                  : 'SaMi could not update this commission.',
                                              );
                                            }
                                          }
                                        }
                                        className="mt-1 rounded-lg border border-[var(--sami-border)] px-2 py-1 text-[10px] font-black"
                                      >
                                        Mark paid
                                      </button>
                                    )
                                  }
                                </div>
                              </div>
                            ),
                          )
                  }
                </div>
              </div>
            </div>
          </div>
        )
      }
    </section>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof UsersRound;
}) {
  return (
    <div className="sami-surface rounded-[22px] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
            {
              label
            }
          </p>
          <p className="mt-2 text-xl font-black">
            {
              value
            }
          </p>
        </div>
        <Icon className="h-5 w-5 text-blue-600 dark:text-blue-300" />
      </div>
    </div>
  );
}

function Label({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
      {
        children
      }
    </span>
  );
}

function Field({
  name,
  label,
  type = 'text',
  required = false,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <Label>
        {
          label
        }
      </Label>
      <input
        name={
          name
        }
        type={
          type
        }
        required={
          required
        }
        defaultValue={
          defaultValue
        }
        min={
          type ===
            'number'
            ? '0'
            : undefined
        }
        step={
          type ===
            'number'
            ? '0.01'
            : undefined
        }
        className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
      />
    </label>
  );
}

function State({
  active,
}: {
  active: boolean;
}) {
  return (
    <span
      className={
        active
          ? 'rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-700 dark:text-emerald-300'
          : 'rounded-full bg-slate-500/10 px-2 py-1 text-[10px] font-black text-slate-500'
      }
    >
      {
        active
          ? 'Active'
          : 'Inactive'
      }
    </span>
  );
}

function Empty({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-4 text-xs text-slate-500">
      {
        children
      }
    </div>
  );
}

function ListCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    title: string;
    detail: string;
  }>;
}) {
  return (
    <div className="sami-surface rounded-[24px] p-4">
      <h2 className="text-sm font-black">
        {
          title
        }
      </h2>
      <div className="mt-3 space-y-2">
        {
          rows.length ===
            0
            ? (
                <Empty>
                  Nothing to show yet.
                </Empty>
              )
            : rows.map(
                (
                  row,
                  index,
                ) => (
                  <div
                    key={
                      index
                    }
                    className="rounded-xl border border-[var(--sami-border)] p-3"
                  >
                    <p className="text-xs font-black">
                      {
                        row.title
                      }
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {
                        row.detail
                      }
                    </p>
                  </div>
                ),
              )
        }
      </div>
    </div>
  );
}
