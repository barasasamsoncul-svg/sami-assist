'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, CalendarClock, Download, RefreshCw, UsersRound } from 'lucide-react';

type Summary = {
  accounts: number;
  contacts: number;
  interactions: number;
  completedLast30Days: number;
  overdueFollowUps: number;
  dueToday: number;
  dueNext7Days: number;
  unassignedAccounts: number;
  newAccountsLast30Days: number;
};
type LifecycleRow = { stage: string; count: number };
type MonthlyRow = { month: string; interactions: number; completed: number; planned: number };
type ReportPayload = {
  success?: boolean;
  error?: string;
  generatedAt?: string;
  summary?: Summary;
  lifecycle?: LifecycleRow[];
  monthlyActivity?: MonthlyRow[];
  scope?: string;
};

const EMPTY: Summary = {
  accounts: 0, contacts: 0, interactions: 0, completedLast30Days: 0,
  overdueFollowUps: 0, dueToday: 0, dueNext7Days: 0, unassignedAccounts: 0, newAccountsLast30Days: 0,
};

function pretty(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function csvCell(value: string | number) {
  const text = String(value);
  return '"' + text.replaceAll('"', '""') + '"';
}
function monthLabel(value: string) {
  const parsed = new Date(value + '-01T00:00:00');
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-KE', { month: 'short', year: '2-digit' });
}

export default function CrmReportsPanel() {
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/apps/crm/reports', {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
      });
      const data = await response.json() as ReportPayload;
      if (!response.ok || data.success !== true || !data.summary) {
        throw new Error(data.error || 'CRM reports could not be loaded.');
      }
      setPayload(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CRM reports could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summary = payload?.summary || EMPTY;
  const maxActivity = useMemo(
    () => Math.max(1, ...(payload?.monthlyActivity || []).map((row) => row.interactions)),
    [payload?.monthlyActivity],
  );

  const exportCsv = useCallback(() => {
    if (!payload?.summary) return;
    const rows: Array<Array<string | number>> = [
      ['SaMi CRM report', 'Value'],
      ['Generated at', payload.generatedAt || ''],
      ['Scope', payload.scope || 'Current CRM company'],
      ...Object.entries(payload.summary).map(([key, value]) => [pretty(key), value] as Array<string | number>),
      [],
      ['Account lifecycle', 'Count'],
      ...(payload.lifecycle || []).map((row) => [pretty(row.stage), row.count]),
      [],
      ['Month', 'Interactions', 'Completed', 'Planned'],
      ...(payload.monthlyActivity || []).map((row) => [row.month, row.interactions, row.completed, row.planned]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sami-crm-report.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }, [payload]);

  const cards = [
    { label: 'Accounts', value: summary.accounts, sub: '+' + summary.newAccountsLast30Days + ' created in 30 days', icon: UsersRound },
    { label: 'Contacts', value: summary.contacts, sub: 'Active CRM contacts', icon: UsersRound },
    { label: 'Interactions', value: summary.interactions, sub: summary.completedLast30Days + ' completed in 30 days', icon: Activity },
    { label: 'Overdue follow-ups', value: summary.overdueFollowUps, sub: summary.dueToday + ' due today', icon: CalendarClock },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--sami-muted)]">CRM performance</p>
          <h1 className="mt-1 text-xl font-black text-[var(--sami-text)]">Reports and insights</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sami-muted)]">Review relationship coverage, follow-up workload, account lifecycle and recent interaction volume. Counts include non-deleted CRM records in the selected company; this report does not duplicate Sales pipeline forecasting.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={exportCsv} disabled={loading || !payload?.summary} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-sm font-bold text-[var(--sami-text)] disabled:opacity-50"><Download className="h-4 w-4" />Export CSV</button>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-sm font-bold text-[var(--sami-text)] disabled:opacity-50"><RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />Refresh</button>
        </div>
      </header>

      {error ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return <article key={card.label} className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4">
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-[var(--sami-muted)]">{card.label}</span><Icon className="h-4 w-4 text-[var(--sami-muted)]" /></div>
            <p className="mt-3 text-3xl font-black tabular-nums text-[var(--sami-text)]">{loading ? '—' : card.value.toLocaleString('en-KE')}</p>
            <p className="mt-1 text-xs text-[var(--sami-muted)]">{card.sub}</p>
          </article>;
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
        <article className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-5">
          <div className="mb-4"><h2 className="text-base font-black text-[var(--sami-text)]">Six-month interaction trend</h2><p className="mt-1 text-xs text-[var(--sami-muted)]">Interactions grouped by occurrence time, falling back to record creation time; planned and completed records are included.</p></div>
          {loading ? <p className="text-sm text-[var(--sami-muted)]">Loading activity trend…</p> : (payload?.monthlyActivity || []).length ? <div className="space-y-4">
            {(payload?.monthlyActivity || []).map((row) => <div key={row.month} className="grid grid-cols-[58px_minmax(0,1fr)_36px] items-center gap-3">
              <span className="text-xs font-semibold text-[var(--sami-muted)]">{monthLabel(row.month)}</span>
              <div className="h-3 overflow-hidden rounded-full bg-[var(--sami-canvas)]"><div className="h-full rounded-full bg-blue-600" style={{ width: Math.max(row.interactions ? 3 : 0, row.interactions / maxActivity * 100) + '%' }} /></div>
              <span className="text-right text-xs font-bold tabular-nums text-[var(--sami-text)]">{row.interactions}</span>
            </div>)}
          </div> : <p className="text-sm text-[var(--sami-muted)]">No interactions are recorded for this period.</p>}
        </article>

        <article className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-5">
          <h2 className="text-base font-black text-[var(--sami-text)]">Account lifecycle</h2>
          <p className="mt-1 text-xs text-[var(--sami-muted)]">Active accounts grouped by their current lifecycle stage.</p>
          <div className="mt-4 space-y-3">
            {loading ? <p className="text-sm text-[var(--sami-muted)]">Loading lifecycle report…</p> : (payload?.lifecycle || []).length ? (payload?.lifecycle || []).map((row) => <div key={row.stage} className="flex items-center justify-between gap-3 border-b border-[var(--sami-border)] pb-3 last:border-0">
              <span className="text-sm text-[var(--sami-text)]">{pretty(row.stage)}</span><span className="text-sm font-black tabular-nums text-[var(--sami-text)]">{row.count.toLocaleString('en-KE')}</span>
            </div>) : <p className="text-sm text-[var(--sami-muted)]">No active accounts yet.</p>}
          </div>
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[{ label: 'Due within 7 days', value: summary.dueNext7Days }, { label: 'Due today', value: summary.dueToday }, { label: 'Unassigned accounts', value: summary.unassignedAccounts }, { label: 'New accounts · 30 days', value: summary.newAccountsLast30Days }].map((item) => <article key={item.label} className="rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4"><p className="text-xs font-semibold text-[var(--sami-muted)]">{item.label}</p><p className="mt-2 text-2xl font-black tabular-nums text-[var(--sami-text)]">{loading ? '—' : item.value.toLocaleString('en-KE')}</p></article>)}
      </section>

      <p className="text-xs text-[var(--sami-muted)]">{payload?.scope || 'Company-scoped reporting. Refresh to load the latest totals.'}{payload?.generatedAt ? ' Report generated ' + new Date(payload.generatedAt).toLocaleString('en-KE') + '.' : ''}</p>
    </div>
  );
}
