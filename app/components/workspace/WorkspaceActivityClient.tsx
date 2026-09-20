'use client';

import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  Clock3,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

type ActivityItem = {
  id: string;
  scope: 'company' | 'workspace';
  actor: {
    id: string | null;
    type: string;
    name: string;
    email: string | null;
  };
  action: string;
  eventType: string;
  label: string;
  summary: string | null;
  category: string;
  severity: string;
  module: string | null;
  result: string | null;
  entity: {
    type: string | null;
    id: string | null;
  };
  createdAt: string;
  details?: {
    metadata: Record<string, unknown>;
    changes: Record<string, unknown>;
    ipAddress: string | null;
    userAgent: string | null;
    correlationId: string | null;
    requestMethod: string | null;
    requestPath: string | null;
  };
};

type Summary = {
  canAudit: boolean;
  todayCount: number;
  failed7d: number;
  actors7d: number;
  modules7d: number;
};

type ViewMode = 'activity' | 'audit';

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diff = Date.now() - date.getTime();

  if (diff < 60_000) return 'Now';
  if (diff < 3_600_000) {
    return (
      Math.max(1, Math.floor(diff / 60_000)) +
      'm ago'
    );
  }
  if (diff < 86_400_000) {
    return Math.floor(diff / 3_600_000) + 'h ago';
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year:
      date.getFullYear() === today.getFullYear()
        ? undefined
        : 'numeric',
  });
}

function resultIcon(result: string | null) {
  if (result === 'failed' || result === 'denied') {
    return XCircle;
  }
  if (result === 'partial') {
    return TriangleAlert;
  }
  return CheckCircle2;
}

function actorIcon(type: string) {
  return type === 'ai' ? Bot : CircleUserRound;
}

function prettyJson(value: Record<string, unknown>) {
  if (!value || Object.keys(value).length === 0) {
    return null;
  }

  return JSON.stringify(value, null, 2);
}

export default function WorkspaceActivityClient() {
  const [view, setView] =
    useState<ViewMode>('activity');
  const [loading, setLoading] =
    useState(true);
  const [loadingMore, setLoadingMore] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [items, setItems] =
    useState<ActivityItem[]>([]);
  const [nextCursor, setNextCursor] =
    useState<string | null>(null);
  const [search, setSearch] =
    useState('');
  const [moduleFilter, setModuleFilter] =
    useState('');
  const [resultFilter, setResultFilter] =
    useState('');
  const [expandedId, setExpandedId] =
    useState<string | null>(null);

  const [summary, setSummary] =
    useState<Summary>({
      canAudit: false,
      todayCount: 0,
      failed7d: 0,
      actors7d: 0,
      modules7d: 0,
    });

  const modules = useMemo(
    () =>
      [
        ...new Set(
          items
            .map(item => item.module)
            .filter(
              (value): value is string =>
                Boolean(value),
            ),
        ),
      ].sort(),
    [items],
  );

  const groups = useMemo(() => {
    const grouped = new Map<string, ActivityItem[]>();

    for (const item of items) {
      const label = dayLabel(item.createdAt);
      const current = grouped.get(label) || [];
      current.push(item);
      grouped.set(label, current);
    }

    return [...grouped.entries()];
  }, [items]);

  const load = useCallback(
    async (
      append = false,
      cursor?: string | null,
    ) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const params = new URLSearchParams({
          view,
          limit: '40',
        });

        if (search.trim()) {
          params.set('search', search.trim());
        }
        if (moduleFilter) {
          params.set('module', moduleFilter);
        }
        if (resultFilter) {
          params.set('result', resultFilter);
        }
        if (cursor) {
          params.set('cursor', cursor);
        }

        const response = await fetch(
          '/api/workspace/activity?' +
            params.toString(),
          {
            credentials: 'same-origin',
            cache: 'no-store',
          },
        );

        const data = await readJson(response);

        if (!response.ok || !data.success) {
          throw new Error(
            data.error ||
              'Workspace activity could not be loaded.',
          );
        }

        const nextItems: ActivityItem[] =
          Array.isArray(data.items)
            ? data.items
            : [];

        setItems(current =>
          append
            ? [...current, ...nextItems]
            : nextItems,
        );

        setNextCursor(
          typeof data.nextCursor === 'string'
            ? data.nextCursor
            : null,
        );

        setSummary({
          canAudit:
            data.summary?.canAudit === true,
          todayCount:
            Number(data.summary?.todayCount || 0),
          failed7d:
            Number(data.summary?.failed7d || 0),
          actors7d:
            Number(data.summary?.actors7d || 0),
          modules7d:
            Number(data.summary?.modules7d || 0),
        });
      } catch (candidate) {
        setError(
          candidate instanceof Error
            ? candidate.message
            : 'Workspace activity could not be loaded.',
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [moduleFilter, resultFilter, search, view],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (
      view === 'audit' &&
      !summary.canAudit &&
      !loading
    ) {
      setView('activity');
    }
  }, [loading, summary.canAudit, view]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={Activity}
          label="Today"
          value={summary.todayCount}
          detail="Recorded company activity"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Needs attention"
          value={summary.failed7d}
          detail="Failed or denied · 7 days"
          warn={summary.failed7d > 0}
        />
        <SummaryCard
          icon={CircleUserRound}
          label="Active people"
          value={summary.actors7d}
          detail="Distinct actors · 7 days"
        />
        <SummaryCard
          icon={ShieldCheck}
          label="Active areas"
          value={summary.modules7d}
          detail="Modules with activity · 7 days"
        />
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0F131B]">
        <div className="border-b border-slate-200 px-4 py-4 dark:border-white/10 sm:px-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setView('activity')}
                className={[
                  'h-9 rounded-xl px-3 text-xs font-bold transition',
                  view === 'activity'
                    ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10',
                ].join(' ')}
              >
                Activity
              </button>

              {summary.canAudit && (
                <button
                  type="button"
                  onClick={() => setView('audit')}
                  className={[
                    'inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold transition',
                    view === 'audit'
                      ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                      : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10',
                  ].join(' ')}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Audit
                </button>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row xl:justify-end">
              <label className="relative min-w-0 flex-1 xl:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={event =>
                    setSearch(event.target.value)
                  }
                  placeholder="Search activity…"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none transition focus:border-blue-400 dark:border-white/10 dark:bg-white/[0.04]"
                />
              </label>

              <label className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select
                  value={moduleFilter}
                  onChange={event =>
                    setModuleFilter(event.target.value)
                  }
                  className="h-10 min-w-[150px] appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-xs font-semibold outline-none dark:border-white/10 dark:bg-[#0B0E14]"
                >
                  <option value="">
                    All areas
                  </option>
                  {modules.map(module => (
                    <option
                      key={module}
                      value={module}
                    >
                      {module}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </label>

              <label className="relative">
                <select
                  value={resultFilter}
                  onChange={event =>
                    setResultFilter(event.target.value)
                  }
                  className="h-10 min-w-[130px] appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-xs font-semibold outline-none dark:border-white/10 dark:bg-[#0B0E14]"
                >
                  <option value="">
                    All outcomes
                  </option>
                  <option value="success">
                    Success
                  </option>
                  <option value="failed">
                    Failed
                  </option>
                  <option value="denied">
                    Denied
                  </option>
                  <option value="partial">
                    Partial
                  </option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </label>

              <button
                type="button"
                aria-label="Refresh activity"
                onClick={() => void load()}
                disabled={loading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/10"
              >
                <RefreshCw
                  className={[
                    'h-4 w-4',
                    loading ? 'animate-spin' : '',
                  ].join(' ')}
                />
              </button>
            </div>
          </div>

          <p className="mt-3 max-w-4xl text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            {view === 'audit'
              ? 'Audit combines company events with authorized workspace-administration events. Sensitive metadata is redacted before display.'
              : 'Activity is a business-readable timeline for the current company, inspired by the clarity of Odoo chatter without exposing raw system logs.'}
          </p>
        </div>

        {error && (
          <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[420px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/10">
              <Activity className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-bold">
              No matching activity
            </p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">
              Change the filters or continue working in SaMi.
            </p>
          </div>
        ) : (
          <div>
            {groups.map(([day, dayItems]) => (
              <div key={day}>
                <div className="sticky top-0 z-10 border-y border-slate-100 bg-slate-50/95 px-4 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400 backdrop-blur dark:border-white/5 dark:bg-[#0B0E14]/95">
                  {day}
                </div>

                <div className="divide-y divide-slate-100 dark:divide-white/5">
                  {dayItems.map(item => {
                    const ResultIcon =
                      resultIcon(item.result);
                    const ActorIcon =
                      actorIcon(item.actor.type);
                    const expanded =
                      expandedId === item.id;

                    const metadata =
                      item.details
                        ? prettyJson(
                            item.details.metadata,
                          )
                        : null;
                    const changes =
                      item.details
                        ? prettyJson(
                            item.details.changes,
                          )
                        : null;

                    return (
                      <article
                        key={item.id}
                        className="relative px-4 py-4 sm:px-5"
                      >
                        <div className="flex gap-3">
                          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                            <ActorIcon className="h-4 w-4" />
                            <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white bg-blue-500 dark:border-[#0F131B]" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-bold tracking-tight">
                                    {item.label}
                                  </p>

                                  {view === 'audit' && (
                                    <span className={[
                                      'rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em]',
                                      item.scope === 'workspace'
                                        ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300'
                                        : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300',
                                    ].join(' ')}>
                                      {item.scope === 'workspace'
                                        ? 'Workspace'
                                        : 'Company'}
                                    </span>
                                  )}
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400">
                                  <span className="font-semibold text-slate-500 dark:text-slate-300">
                                    {item.actor.name}
                                  </span>

                                  {item.module && (
                                    <>
                                      <span>·</span>
                                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold dark:bg-white/10">
                                        {item.module}
                                      </span>
                                    </>
                                  )}

                                  <span>·</span>

                                  <span className="inline-flex items-center gap-1">
                                    <Clock3 className="h-3 w-3" />
                                    {relativeTime(item.createdAt)}
                                  </span>
                                </div>

                                {item.summary && (
                                  <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                                    {item.summary}
                                  </p>
                                )}
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                <span
                                  className={[
                                    'inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-bold',
                                    item.result === 'failed' ||
                                    item.result === 'denied'
                                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
                                      : item.result === 'partial'
                                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
                                  ].join(' ')}
                                >
                                  <ResultIcon className="h-3.5 w-3.5" />
                                  {item.result || 'Recorded'}
                                </span>

                                {view === 'audit' &&
                                  item.details && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedId(
                                        expanded
                                          ? null
                                          : item.id,
                                      )
                                    }
                                    className="h-7 rounded-lg border border-slate-200 px-2.5 text-[10px] font-bold text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/10"
                                  >
                                    {expanded
                                      ? 'Hide'
                                      : 'Details'}
                                  </button>
                                )}
                              </div>
                            </div>

                            {expanded &&
                              item.details && (
                              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                                <div className="grid gap-3 text-[10px] sm:grid-cols-2 xl:grid-cols-4">
                                  <AuditFact
                                    label="Event"
                                    value={item.eventType}
                                  />
                                  <AuditFact
                                    label="Entity"
                                    value={
                                      item.entity.type
                                        ? `${item.entity.type}${item.entity.id ? ` · ${item.entity.id}` : ''}`
                                        : null
                                    }
                                  />
                                  <AuditFact
                                    label="Request"
                                    value={
                                      item.details.requestPath
                                        ? `${item.details.requestMethod || ''} ${item.details.requestPath}`.trim()
                                        : null
                                    }
                                  />
                                  <AuditFact
                                    label="Correlation"
                                    value={
                                      item.details.correlationId
                                    }
                                  />
                                  <AuditFact
                                    label="IP"
                                    value={
                                      item.details.ipAddress
                                    }
                                  />
                                  <AuditFact
                                    label="Severity"
                                    value={item.severity}
                                  />
                                  <AuditFact
                                    label="Actor email"
                                    value={item.actor.email}
                                  />
                                  <AuditFact
                                    label="Created"
                                    value={new Date(
                                      item.createdAt,
                                    ).toLocaleString()}
                                  />
                                </div>

                                {(changes ||
                                  metadata) && (
                                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                                    {changes && (
                                      <JsonPanel
                                        title="Changes"
                                        value={changes}
                                      />
                                    )}
                                    {metadata && (
                                      <JsonPanel
                                        title="Metadata"
                                        value={metadata}
                                      />
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {nextCursor && (
          <div className="border-t border-slate-200 px-4 py-4 text-center dark:border-white/10">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() =>
                void load(true, nextCursor)
              }
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
            >
              {loadingMore && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              Load older activity
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
  warn = false,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  detail: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0F131B]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            {label}
          </p>
          <p
            className={[
              'mt-2 text-2xl font-black tracking-tight',
              warn
                ? 'text-rose-600 dark:text-rose-300'
                : 'text-slate-950 dark:text-white',
            ].join(' ')}
          >
            {value}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">
            {detail}
          </p>
        </div>
        <div
          className={[
            'flex h-10 w-10 items-center justify-center rounded-xl',
            warn
              ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300'
              : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300',
          ].join(' ')}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function AuditFact({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="font-black uppercase tracking-[0.1em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-all font-semibold text-slate-600 dark:text-slate-300">
        {value || '—'}
      </p>
    </div>
  );
}

function JsonPanel({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#0B0E14]">
      <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
        {title}
      </p>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-5 text-slate-500 dark:text-slate-300">
        {value}
      </pre>
    </div>
  );
}
