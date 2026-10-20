'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  BadgeDollarSign,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Plus,
  Save,
  Target,
  Trash2,
  Users,
  UsersRound,
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

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
  companyCurrency: string;
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

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function randomKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ||
    Math.random().toString(36).slice(2)
  );
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString();
  }
}

function formatPercent(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%';
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function SalesOrganizationManager({
  busy,
  request,
  showSuccess,
  showError,
}: {
  busy: boolean;
  request: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}) {
  const [data, setData] = useState<OrganizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberSelection, setMemberSelection] = useState<string[]>([]);
  const [targetScope, setTargetScope] = useState<'company' | 'team' | 'user'>(
    'company',
  );
  const [assignments, setAssignments] = useState<AssignmentDraft[]>([
    { key: randomKey(), assigneeType: 'user', userId: '', teamId: '' },
  ]);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/apps/sales?organization=1', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        organization?: OrganizationData;
      };
      if (!response.ok || body.success !== true || !body.organization) {
        throw new Error(body.error || 'SaMi could not load Sales organization data.');
      }
      setData(body.organization);
    } catch (error) {
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

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const memberById = useMemo(
    () => new Map((data?.members || []).map((member) => [member.id, member])),
    [data?.members],
  );

  const teamById = useMemo(
    () => new Map((data?.teams || []).map((team) => [team.id, team])),
    [data?.teams],
  );

  const activeAccruedByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const entry of data?.commissionEntries || []) {
      if (entry.status !== 'accrued') continue;
      const currency = String(entry.currency || 'KES').toUpperCase();
      totals.set(currency, (totals.get(currency) || 0) + entry.commissionAmount);
    }
    return Array.from(totals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => ({ currency, amount }));
  }, [data?.commissionEntries]);

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading Sales teams, targets and commissions…
        </span>
      </div>
    );
  }

  if (!data) return null;

  /* ------------------------------------------------------------------------ */
  /*  Render                                                                 */
  /* ------------------------------------------------------------------------ */

  return (
    <section className="space-y-4">
      {/* ------------------------------------------------------------------ */}
      {/* KPI strip                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<UsersRound className="h-4 w-4" aria-hidden="true" />}
          label="Sales teams"
          value={String(data.teams.filter((t) => t.isActive).length)}
        />
        <KpiCard
          icon={<Target className="h-4 w-4" aria-hidden="true" />}
          label="Active targets"
          value={String(data.targets.filter((t) => t.isActive).length)}
        />
        <KpiCard
          icon={<BadgeDollarSign className="h-4 w-4" aria-hidden="true" />}
          label="Commission plans"
          value={String(data.commissionPlans.filter((p) => p.isActive).length)}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          label="Accrued commission"
          value={
            activeAccruedByCurrency.length > 0
              ? activeAccruedByCurrency
                  .map((item) => formatMoney(item.amount, item.currency))
                  .join(' · ')
              : '—'
          }
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Territories & Teams                                                */}
      {/* ------------------------------------------------------------------ */}
      {data.capabilities.canViewTeams ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {/* Territories */}
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <PanelHeader
              title="Sales territories"
              subtitle="Coverage areas grouped under parent territories."
              count={`${data.territories.length} total`}
            />
            {data.capabilities.canManageTeams ? (
              <form
                className="space-y-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  try {
                    await request({
                      action: 'save_sales_territory',
                      name: form.get('territoryName'),
                      code: form.get('territoryCode'),
                      parentTerritoryId: form.get('parentTerritoryId') || undefined,
                      description: form.get('territoryDescription'),
                    });
                    event.currentTarget.reset();
                    showSuccess(
                      'Territory saved',
                      'The Sales territory is ready for team assignment.',
                    );
                    await refresh();
                  } catch (error) {
                    showError(
                      'Territory save failed',
                      error instanceof Error
                        ? error.message
                        : 'SaMi could not save the territory.',
                    );
                  }
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldInput name="territoryName" label="Territory name" required />
                  <FieldInput name="territoryCode" label="Code" />
                  <FieldSelect
                    name="parentTerritoryId"
                    label="Parent territory"
                    className="sm:col-span-2"
                  >
                    <option value="">No parent</option>
                    {data.territories
                      .filter((territory) => territory.isActive)
                      .map((territory) => (
                        <option key={territory.id} value={territory.id}>
                          {territory.name}
                        </option>
                      ))}
                  </FieldSelect>
                  <FieldArea
                    name="territoryDescription"
                    label="Description"
                    className="sm:col-span-2"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    Save territory
                  </button>
                </div>
              </form>
            ) : null}

            {data.territories.length === 0 ? (
              <EmptyBlock
                icon={<Target className="h-5 w-5" />}
                title="No territories yet"
                description="Create a territory to group teams by region or market."
              />
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.territories.map((territory) => (
                  <li
                    key={territory.id}
                    className="flex flex-wrap items-start justify-between gap-2 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-black">{territory.name}</p>
                      {territory.code ? (
                        <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                          {territory.code}
                        </p>
                      ) : null}
                    </div>
                    <ActivePill active={territory.isActive} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Teams */}
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <PanelHeader
              title="Sales teams"
              subtitle="Managers, member rosters, and coverage."
              count={`${data.teams.filter((t) => t.isActive).length} active`}
            />

            {data.capabilities.canManageTeams ? (
              <form
                className="space-y-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  try {
                    await request({
                      action: 'save_sales_team',
                      name: form.get('teamName'),
                      code: form.get('teamCode'),
                      managerUserId: form.get('managerUserId') || undefined,
                      territoryId: form.get('territoryId') || undefined,
                      description: form.get('teamDescription'),
                      memberUserIds: memberSelection,
                    });
                    event.currentTarget.reset();
                    setMemberSelection([]);
                    showSuccess(
                      'Sales team saved',
                      'The team and member assignments were saved.',
                    );
                    await refresh();
                  } catch (error) {
                    showError(
                      'Sales team save failed',
                      error instanceof Error
                        ? error.message
                        : 'SaMi could not save the Sales team.',
                    );
                  }
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldInput name="teamName" label="Team name" required />
                  <FieldInput name="teamCode" label="Code" />
                  <FieldSelect name="managerUserId" label="Manager">
                    <option value="">No manager</option>
                    {data.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </FieldSelect>
                  <FieldSelect name="territoryId" label="Territory">
                    <option value="">No territory</option>
                    {data.territories
                      .filter((territory) => territory.isActive)
                      .map((territory) => (
                        <option key={territory.id} value={territory.id}>
                          {territory.name}
                        </option>
                      ))}
                  </FieldSelect>
                  <FieldArea
                    name="teamDescription"
                    label="Description"
                    className="sm:col-span-2"
                  />
                </div>

                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                    Team members
                  </span>
                  <div className="mt-2 grid max-h-48 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {data.members.map((member) => {
                      const checked = memberSelection.includes(member.id);
                      return (
                        <label
                          key={member.id}
                          className={
                            'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition ' +
                            (checked
                              ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-950/30'
                              : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900')
                          }
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setMemberSelection((current) =>
                                event.target.checked
                                  ? [...current, member.id]
                                  : current.filter((id) => id !== member.id),
                              )
                            }
                            className="h-3.5 w-3.5 rounded border-slate-300 text-slate-950 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-800"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-black">
                              {member.name}
                            </span>
                            <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">
                              {member.email}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    Save team
                  </button>
                </div>
              </form>
            ) : null}

            {data.teams.length === 0 ? (
              <EmptyBlock
                icon={<UsersRound className="h-5 w-5" />}
                title="No teams yet"
                description="Create a team to assign members, managers, and territories."
              />
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.teams.map((team) => (
                  <li key={team.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black">{team.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>
                            Manager:{' '}
                            <span className="font-bold text-slate-700 dark:text-slate-200">
                              {team.managerUserId
                                ? memberById.get(team.managerUserId)?.name ||
                                  'Assigned member'
                                : 'Not assigned'}
                            </span>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {team.memberUserIds.length} member
                            {team.memberUserIds.length === 1 ? '' : 's'}
                          </span>
                          {team.territoryId ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                Territory{' '}
                                <span className="font-bold text-slate-700 dark:text-slate-200">
                                  {data.territories.find(
                                    (t) => t.id === team.territoryId,
                                  )?.name || '—'}
                                </span>
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <ActivePill active={team.isActive} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Targets                                                            */}
      {/* ------------------------------------------------------------------ */}
      {data.capabilities.canViewTargets ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
          {data.capabilities.canManageTargets ? (
            <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <PanelHeader
                title="New sales target"
                subtitle="Set a company, team, or salesperson target for a period."
              />
              <form
                className="space-y-3 px-5 py-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  try {
                    await request({
                      action: 'save_sales_target',
                      targetScope,
                      teamId:
                        targetScope === 'team' ? form.get('targetTeamId') : undefined,
                      userId:
                        targetScope === 'user' ? form.get('targetUserId') : undefined,
                      metric: form.get('targetMetric'),
                      periodStart: form.get('periodStart'),
                      periodEnd: form.get('periodEnd'),
                      targetValue: form.get('targetValue'),
                      notes: form.get('targetNotes'),
                    });
                    event.currentTarget.reset();
                    setTargetScope('company');
                    showSuccess(
                      'Sales target saved',
                      'The target is now available for performance tracking.',
                    );
                    await refresh();
                  } catch (error) {
                    showError(
                      'Sales target save failed',
                      error instanceof Error
                        ? error.message
                        : 'SaMi could not save the target.',
                    );
                  }
                }}
              >
                <FieldSelect
                  label="Scope"
                  value={targetScope}
                  onChange={(value) =>
                    setTargetScope(value as 'company' | 'team' | 'user')
                  }
                >
                  <option value="company">Company</option>
                  <option value="team">Sales team</option>
                  <option value="user">Salesperson</option>
                </FieldSelect>

                {targetScope === 'team' ? (
                  <FieldSelect name="targetTeamId" label="Team" required>
                    <option value="">Choose team</option>
                    {data.teams
                      .filter((team) => team.isActive)
                      .map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                  </FieldSelect>
                ) : null}

                {targetScope === 'user' ? (
                  <FieldSelect name="targetUserId" label="Salesperson" required>
                    <option value="">Choose salesperson</option>
                    {data.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </FieldSelect>
                ) : null}

                <FieldSelect name="targetMetric" label="Metric">
                  <option value="revenue">Revenue</option>
                  <option value="margin">Margin</option>
                  <option value="orders">Orders</option>
                </FieldSelect>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldInput
                    name="periodStart"
                    label="Period start"
                    type="date"
                    required
                  />
                  <FieldInput
                    name="periodEnd"
                    label="Period end"
                    type="date"
                    required
                  />
                </div>

                <FieldInput
                  name="targetValue"
                  label="Target value"
                  type="number"
                  step="0.01"
                  required
                />

                <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  Revenue and margin targets use company currency (
                  {data.companyCurrency}). Orders targets are counts.
                </p>

                <FieldArea name="targetNotes" label="Notes" />

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    Save target
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <PanelHeader
              title="Current targets"
              subtitle="Attainment vs target, by scope."
              count={`${data.targets.length} total`}
            />

            {data.targets.length === 0 ? (
              <EmptyBlock
                icon={<Target className="h-5 w-5" />}
                title="No targets yet"
                description="Set a target to start tracking attainment across the team."
              />
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.targets.map((target) => {
                  const progress = Math.max(
                    0,
                    Math.min(100, target.attainmentPercent),
                  );
                  const isOrder = target.metric === 'orders';
                  return (
                    <li key={target.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-black capitalize">
                              {target.metric} · {target.targetScope}
                            </p>
                            <ActivePill active={target.isActive} />
                          </div>
                          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <CalendarClock className="h-3 w-3" aria-hidden="true" />
                            {target.periodStart} → {target.periodEnd}
                          </p>
                          {target.userId ? (
                            <p className="mt-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                              {memberById.get(target.userId)?.name || 'Salesperson'}
                            </p>
                          ) : target.teamId ? (
                            <p className="mt-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                              {teamById.get(target.teamId)?.name || 'Sales team'}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-black tabular-nums">
                            {isOrder
                              ? target.actualValue.toLocaleString()
                              : formatMoney(target.actualValue, data.companyCurrency)}{' '}
                            /{' '}
                            {isOrder
                              ? target.targetValue.toLocaleString()
                              : formatMoney(
                                  target.targetValue,
                                  data.companyCurrency,
                                )}
                          </p>
                          <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-indigo-600 dark:text-indigo-400">
                            {formatPercent(target.attainmentPercent)} achieved
                          </p>
                        </div>
                      </div>
                      <div
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                        role="progressbar"
                        aria-valuenow={Math.round(progress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className={
                            progress >= 100
                              ? 'h-full rounded-full bg-emerald-500'
                              : progress >= 60
                                ? 'h-full rounded-full bg-indigo-500'
                                : 'h-full rounded-full bg-amber-500'
                          }
                          style={{ width: Math.max(2, progress) + '%' }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Commissions                                                        */}
      {/* ------------------------------------------------------------------ */}
      {data.capabilities.canViewCommissions ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.capabilities.canManageCommissions ? (
            <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <PanelHeader
                title="New commission plan"
                subtitle="Rate plan with thresholds and assignees."
              />
              <form
                className="space-y-3 px-5 py-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  try {
                    await request({
                      action: 'save_commission_plan',
                      name: form.get('commissionName'),
                      code: form.get('commissionCode'),
                      basis: form.get('commissionBasis'),
                      ratePercent: form.get('commissionRate'),
                      thresholdAmount: form.get('commissionThreshold'),
                      capAmount: form.get('commissionCap') || undefined,
                      validFrom: form.get('commissionValidFrom') || undefined,
                      validUntil: form.get('commissionValidUntil') || undefined,
                      assignments: assignments.map((assignment) => ({
                        assigneeType: assignment.assigneeType,
                        userId:
                          assignment.assigneeType === 'user'
                            ? assignment.userId
                            : undefined,
                        teamId:
                          assignment.assigneeType === 'team'
                            ? assignment.teamId
                            : undefined,
                      })),
                    });
                    event.currentTarget.reset();
                    setAssignments([
                      {
                        key: randomKey(),
                        assigneeType: 'user',
                        userId: '',
                        teamId: '',
                      },
                    ]);
                    showSuccess(
                      'Commission plan saved',
                      'New eligible orders will accrue commission automatically.',
                    );
                    await refresh();
                  } catch (error) {
                    showError(
                      'Commission plan save failed',
                      error instanceof Error
                        ? error.message
                        : 'SaMi could not save the commission plan.',
                    );
                  }
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldInput name="commissionName" label="Plan name" required />
                  <FieldInput name="commissionCode" label="Code" />
                  <FieldSelect name="commissionBasis" label="Basis">
                    <option value="revenue">Revenue</option>
                    <option value="margin">Margin</option>
                  </FieldSelect>
                  <FieldInput
                    name="commissionRate"
                    label="Rate %"
                    type="number"
                    step="0.01"
                    required
                  />
                  <FieldInput
                    name="commissionThreshold"
                    label="Minimum basis"
                    type="number"
                    step="0.01"
                    defaultValue="0"
                  />
                  <FieldInput
                    name="commissionCap"
                    label="Commission cap"
                    type="number"
                    step="0.01"
                  />
                  <FieldInput
                    name="commissionValidFrom"
                    label="Valid from"
                    type="date"
                  />
                  <FieldInput
                    name="commissionValidUntil"
                    label="Valid until"
                    type="date"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                      Assignments
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setAssignments((current) => [
                          ...current,
                          {
                            key: randomKey(),
                            assigneeType: 'user',
                            userId: '',
                            teamId: '',
                          },
                        ])
                      }
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" />
                      Add
                    </button>
                  </div>

                  <ul className="mt-2 space-y-2">
                    {assignments.map((assignment, index) => (
                      <li
                        key={assignment.key}
                        className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/40 p-3 dark:border-slate-800 dark:bg-slate-950/30 sm:grid-cols-[0.7fr_1.3fr_auto]"
                      >
                        <FieldSelect
                          value={assignment.assigneeType}
                          onChange={(value) =>
                            setAssignments((current) =>
                              current.map((item, position) =>
                                position === index
                                  ? {
                                      ...item,
                                      assigneeType: value as 'user' | 'team',
                                      userId: '',
                                      teamId: '',
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          <option value="user">Salesperson</option>
                          <option value="team">Team</option>
                        </FieldSelect>

                        {assignment.assigneeType === 'user' ? (
                          <FieldSelect
                            required
                            value={assignment.userId}
                            onChange={(value) =>
                              setAssignments((current) =>
                                current.map((item, position) =>
                                  position === index
                                    ? { ...item, userId: value }
                                    : item,
                                ),
                              )
                            }
                          >
                            <option value="">Choose salesperson</option>
                            {data.members.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.name}
                              </option>
                            ))}
                          </FieldSelect>
                        ) : (
                          <FieldSelect
                            required
                            value={assignment.teamId}
                            onChange={(value) =>
                              setAssignments((current) =>
                                current.map((item, position) =>
                                  position === index
                                    ? { ...item, teamId: value }
                                    : item,
                                ),
                              )
                            }
                          >
                            <option value="">Choose team</option>
                            {data.teams
                              .filter((team) => team.isActive)
                              .map((team) => (
                                <option key={team.id} value={team.id}>
                                  {team.name}
                                </option>
                              ))}
                          </FieldSelect>
                        )}

                        <button
                          type="button"
                          disabled={assignments.length === 1}
                          onClick={() =>
                            setAssignments((current) =>
                              current.filter((_, position) => position !== index),
                            )
                          }
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:opacity-30 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40"
                          aria-label={`Remove assignment ${index + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                  >
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    Save plan
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          <div className="space-y-4">
            {/* Plans list */}
            <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <PanelHeader
                title="Commission plans"
                subtitle="Active rates, bases, and assignments."
                count={`${data.commissionPlans.length} total`}
              />
              {data.commissionPlans.length === 0 ? (
                <EmptyBlock
                  icon={<BadgeDollarSign className="h-5 w-5" />}
                  title="No commission plans"
                  description="Create a plan to start accruing commission on eligible sales orders."
                />
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {data.commissionPlans.map((plan) => (
                    <li key={plan.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-black">{plan.name}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {formatPercent(plan.ratePercent)} of {plan.basis} ·{' '}
                            {plan.assignments.length} assignment
                            {plan.assignments.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <ActivePill active={plan.isActive} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Accruals */}
            <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <PanelHeader
                title="Recent accruals"
                subtitle="Newest entries, accrual status per person or team."
                count={`${data.commissionEntries.length} total`}
              />
              {data.commissionEntries.length === 0 ? (
                <EmptyBlock
                  icon={<BadgeDollarSign className="h-5 w-5" />}
                  title="No accruals yet"
                  description="Commission entries appear automatically when eligible orders are confirmed."
                />
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {data.commissionEntries.slice(0, 20).map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-start justify-between gap-2 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-black">
                          {entry.userId
                            ? memberById.get(entry.userId)?.name || 'Salesperson'
                            : entry.teamId
                              ? teamById.get(entry.teamId)?.name || 'Sales team'
                              : 'Sales commission'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {entry.basis} · {entry.status.replaceAll('_', ' ')}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black tabular-nums">
                          {formatMoney(entry.commissionAmount, entry.currency)}
                        </p>
                        {entry.status === 'accrued' &&
                        data.capabilities.canManageCommissions ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                              try {
                                await request({
                                  action: 'mark_commission_paid',
                                  entryId: entry.id,
                                });
                                showSuccess(
                                  'Commission marked paid',
                                  'The payout status and audit timestamp were recorded.',
                                );
                                await refresh();
                              } catch (error) {
                                showError(
                                  'Commission payout failed',
                                  error instanceof Error
                                    ? error.message
                                    : 'SaMi could not update this commission.',
                                );
                              }
                            }}
                            className="mt-1 inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Mark paid
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
          {label}
        </p>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          {icon}
        </span>
      </div>
      <p className="mt-2 break-words text-lg font-black tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
  count,
}: {
  title: string;
  subtitle: string;
  count?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
      <div className="min-w-0">
        <h2 className="text-sm font-black">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {subtitle}
        </p>
      </div>
      {count ? (
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {count}
        </span>
      ) : null}
    </div>
  );
}

function ActivePill({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] text-slate-600 ring-1 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300'
      }
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function FieldInput({
  name,
  label,
  type = 'text',
  required = false,
  defaultValue,
  step,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        min={type === 'number' ? '0' : undefined}
        step={type === 'number' ? step ?? '0.01' : undefined}
        className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm tabular-nums focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
      />
    </label>
  );
}

function FieldSelect({
  name,
  label,
  value,
  onChange,
  required,
  className,
  children,
}: {
  name?: string;
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      {label ? (
        <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
          {label}
        </span>
      ) : null}
      <div className="relative mt-1">
        <select
          name={name}
          value={value}
          onChange={
            onChange ? (event) => onChange(event.target.value) : undefined
          }
          required={required}
          className="h-9 w-full appearance-none rounded-xl border border-slate-200 bg-white pr-8 pl-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
        />
      </div>
    </label>
  );
}

function FieldArea({
  name,
  label,
  className,
}: {
  name: string;
  label: string;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <textarea
        name={name}
        rows={2}
        className="mt-1 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
      />
    </label>
  );
}

function EmptyBlock({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <div
        aria-hidden="true"
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
      >
        {icon}
      </div>
      <p className="mt-3 text-sm font-black">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}