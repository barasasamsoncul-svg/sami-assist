'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Activity, ArrowUpRight, CheckCircle2, Clock3, RefreshCw, Search, ShieldAlert, UsersRound } from 'lucide-react';

type HealthAccount = {
  id: string;
  name: string;
  accountType: string;
  lifecycleStage: string;
  industry: string | null;
  ownerUserId: string | null;
  lastActivityAt: string | null;
  activity90Days: number;
  futureFollowUps: number;
  overdueFollowUps: number;
  contactCount: number;
  primaryContactCount: number;
  score: number;
  band: 'healthy' | 'watch' | 'at_risk' | 'critical' | string;
  reasons: string[];
};
type Payload = { success?: boolean; error?: string; accounts?: HealthAccount[]; calculatedAt?: string; limited?: boolean; methodology?: string };
type Filter = 'all' | 'critical' | 'at_risk' | 'watch' | 'healthy' | 'overdue' | 'dormant';

function date(value: string | null) {
  if (!value) return 'No recorded activity';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No recorded activity';
  return parsed.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}
function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}
function bandText(value: string) {
  if (value === 'healthy') return 'Healthy';
  if (value === 'watch') return 'Monitor';
  if (value === 'at_risk') return 'At risk';
  return 'Critical';
}
function bandClass(value: string) {
  if (value === 'healthy') return 'border-emerald-300 text-emerald-800 bg-emerald-50';
  if (value === 'watch') return 'border-blue-300 text-blue-800 bg-blue-50';
  if (value === 'at_risk') return 'border-amber-300 text-amber-900 bg-amber-50';
  return 'border-red-300 text-red-900 bg-red-50';
}

export default function CrmRelationshipHealthPanel() {
  const [accounts, setAccounts] = useState<HealthAccount[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calculatedAt, setCalculatedAt] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/apps/crm/relationship-health', {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
      });
      const payload = await response.json() as Payload;
      if (!response.ok || payload.success !== true) throw new Error(payload.error || 'Relationship health could not be loaded.');
      setAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
      setCalculatedAt(payload.calculatedAt || null);
      setLimited(payload.limited === true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Relationship health could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return accounts.filter((account) => {
      if (filter === 'overdue' && account.overdueFollowUps < 1) return false;
      if (filter === 'dormant' && (!account.lastActivityAt || Date.now() - new Date(account.lastActivityAt).getTime() <= 30 * 86400000)) return false;
      if (['critical', 'at_risk', 'watch', 'healthy'].includes(filter) && account.band !== filter) return false;
      if (!needle) return true;
      return [account.name, account.industry || '', account.accountType, account.lifecycleStage, ...(account.reasons || [])]
        .join(' ').toLocaleLowerCase().includes(needle);
    });
  }, [accounts, filter, query]);

  const critical = accounts.filter((a) => a.band === 'critical').length;
  const atRisk = accounts.filter((a) => a.band === 'at_risk').length;
  const overdue = accounts.filter((a) => a.overdueFollowUps > 0).length;
  const healthy = accounts.filter((a) => a.band === 'healthy').length;

  const filters: Array<{ value: Filter; title: string }> = [
    { value: 'all', title: 'All accounts' },
    { value: 'critical', title: 'Critical' },
    { value: 'at_risk', title: 'At risk' },
    { value: 'watch', title: 'Monitor' },
    { value: 'healthy', title: 'Healthy' },
    { value: 'overdue', title: 'Overdue follow-ups' },
    { value: 'dormant', title: 'No activity for 30+ days' },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--sami-muted)]">Account prioritization</p>
          <h1 className="mt-1 text-xl font-black text-[var(--sami-text)]">Relationship health</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sami-muted)]">Prioritize account follow-up using actual CRM engagement, overdue activities, contact coverage and lifecycle stage. This is an explainable operational score, not a forecast or a prediction of revenue.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-sm font-bold text-[var(--sami-text)] disabled:opacity-50"><RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />Refresh scores</button>
      </header>

      {error ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium text-[var(--sami-muted)]">Critical health</span><ShieldAlert className="h-4 w-4 text-red-700" /></div><p className="mt-2 text-3xl font-black tabular-nums text-[var(--sami-text)]">{loading ? '—' : critical}</p><p className="mt-1 text-xs text-[var(--sami-muted)]">Lowest engagement scores</p></div>
        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium text-[var(--sami-muted)]">At risk</span><AlertCircle className="h-4 w-4 text-amber-700" /></div><p className="mt-2 text-3xl font-black tabular-nums text-[var(--sami-text)]">{loading ? '—' : atRisk}</p><p className="mt-1 text-xs text-[var(--sami-muted)]">Accounts to review</p></div>
        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium text-[var(--sami-muted)]">Overdue follow-ups</span><Clock3 className="h-4 w-4 text-orange-700" /></div><p className="mt-2 text-3xl font-black tabular-nums text-[var(--sami-text)]">{loading ? '—' : overdue}</p><p className="mt-1 text-xs text-[var(--sami-muted)]">Accounts with overdue activity</p></div>
        <div className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium text-[var(--sami-muted)]">Healthy</span><CheckCircle2 className="h-4 w-4 text-emerald-700" /></div><p className="mt-2 text-3xl font-black tabular-nums text-[var(--sami-text)]">{loading ? '—' : healthy}</p><p className="mt-1 text-xs text-[var(--sami-muted)]">Strongest health bands</p></div>
      </div>

      <section className="space-y-4 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="text-base font-black text-[var(--sami-text)]">Account attention queue</h2><p className="mt-1 text-xs text-[var(--sami-muted)]">{visible.length.toLocaleString('en-KE')} accounts · sorted by urgency, then health score</p></div>
          <div className="relative w-full lg:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sami-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search account, industry or attention reason" className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-canvas)] pl-9 pr-3 text-sm text-[var(--sami-text)] outline-none focus:border-blue-500" /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => <button key={item.value} type="button" onClick={() => setFilter(item.value)} aria-pressed={filter === item.value} className={'rounded-full border px-3 py-1.5 text-xs font-bold transition ' + (filter === item.value ? 'border-[var(--sami-text)] bg-[var(--sami-text)] text-[var(--sami-surface)]' : 'border-[var(--sami-border)] text-[var(--sami-muted)] hover:text-[var(--sami-text)]')}>{item.title}</button>)}
        </div>

        {entriesEmptyPlaceholder()}
        {visible.map((account) => <article key={account.id} className="grid gap-4 rounded-xl border border-[var(--sami-border)] p-4 lg:grid-cols-[minmax(0,1fr)_180px] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-black text-[var(--sami-text)]">{account.name}</h3><span className={'rounded-full border px-2.5 py-1 text-[10px] font-bold ' + bandClass(account.band)}>{bandText(account.band)}</span><span className="rounded-full border border-[var(--sami-border)] px-2 py-1 text-[10px] font-semibold text-[var(--sami-muted)]">{label(account.lifecycleStage)}</span></div>
            <p className="mt-1 text-xs text-[var(--sami-muted)]">{account.industry || 'Industry not set'} · {label(account.accountType)} · Last activity: {date(account.lastActivityAt)}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--sami-muted)]"><span className="inline-flex items-center gap-1"><Activity className="h-3.5 w-3.5" />{account.activity90Days} activities / 90 days</span><span className="inline-flex items-center gap-1"><UsersRound className="h-3.5 w-3.5" />{account.contactCount} contacts{account.primaryContactCount ? ' · primary contact set' : ''}</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{account.overdueFollowUps} overdue · {account.futureFollowUps} upcoming</span></div>
            {account.reasons.length ? <p className="mt-2 text-xs leading-5 text-[var(--sami-muted)]">Attention: {account.reasons.join(' · ')}</p> : <p className="mt-2 text-xs text-emerald-800">No priority issues detected in the current CRM data.</p>}
          </div>
          <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-stretch">
            <div><div className="flex items-baseline gap-1"><span className="text-3xl font-black tabular-nums text-[var(--sami-text)]">{account.score}</span><span className="text-xs text-[var(--sami-muted)]">/ 100</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--sami-border)]"><div className="h-full rounded-full bg-current text-blue-700" style={{ width: account.score + '%' }} /></div></div>
            <Link href={'/apps/crm/accounts/' + encodeURIComponent(account.id)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--sami-border)] px-3 py-2 text-xs font-bold text-[var(--sami-text)] hover:bg-[var(--sami-canvas)]">Open account <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </div>
        </article>)}
        {!loading && visible.length === 0 && !error ? <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-8 text-center text-sm text-[var(--sami-muted)]">No accounts match this filter.</div> : null}
        {limited ? <p className="text-xs text-[var(--sami-muted)]">Showing the 250 highest-priority accounts. Narrow the view in Account segments for broader cohort analysis.</p> : null}
      </section>
      <p className="text-xs leading-5 text-[var(--sami-muted)]"><Activity className="mr-1 inline h-3.5 w-3.5" />Scores combine recency, recent activity volume, follow-up coverage, contact coverage, lifecycle stage and overdue follow-up penalties. {calculatedAt ? 'Calculated ' + date(calculatedAt) + '.' : ''} Use the underlying interactions and account timeline to investigate before making business decisions.</p>
    </div>
  );

  function entriesEmptyPlaceholder() {
    return loading ? <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-8 text-center text-sm text-[var(--sami-muted)]">Calculating relationship health…</div> : null;
  }
}
