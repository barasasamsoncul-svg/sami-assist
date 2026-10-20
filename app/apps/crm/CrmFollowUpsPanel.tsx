'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ListFilter,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';

type QueueView = 'overdue' | 'due_today' | 'upcoming' | 'completed' | 'all';
type FollowUp = {
  id: string;
  account_id: string | null;
  contact_id: string | null;
  interaction_type: string;
  subject: string;
  description: string | null;
  status: string;
  occurred_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  outcome: string | null;
  created_at: string;
  updated_at: string;
  account_name: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_do_not_contact: boolean | null;
};
type QueueSummary = {
  open: number | string;
  overdue: number | string;
  due_today: number | string;
  upcoming: number | string;
  completed_recently: number | string;
  cancelled: number | string;
};
type QueuePayload = {
  success?: boolean;
  code?: string;
  error?: string;
  view?: QueueView;
  page?: number;
  pageSize?: number;
  total?: number;
  pages?: number;
  hasMore?: boolean;
  summary?: QueueSummary;
  interactions?: FollowUp[];
};

const VIEWS: Array<{ key: QueueView; label: string; description: string }> = [
  { key: 'overdue', label: 'Overdue', description: 'Planned follow-ups past their due time.' },
  { key: 'due_today', label: 'Due today', description: 'Open follow-ups still due today.' },
  { key: 'upcoming', label: 'Upcoming', description: 'Open follow-ups due over the next seven days.' },
  { key: 'completed', label: 'Completed', description: 'Completed CRM follow-ups and logged history.' },
  { key: 'all', label: 'All activity', description: 'Every CRM interaction, including cancelled items.' },
];

function count(value: number | string | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-KE') : '0';
}
function nice(value: string | null | undefined) {
  if (!value) return 'Not set';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function date(value: string | null | undefined) {
  if (!value) return 'No date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No date';
  return parsed.toLocaleString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function CrmFollowUpsPanel({ canEdit }: { canEdit: boolean }) {
  const [view, setView] = useState<QueueView>('overdue');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<FollowUp[]>([]);
  const [summary, setSummary] = useState<QueueSummary>({
    open: 0, overdue: 0, due_today: 0, upcoming: 0, completed_recently: 0, cancelled: 0,
  });
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        view,
        page: String(page),
        q: search.trim(),
      });
      const response = await fetch('/api/apps/crm/follow-ups?' + params.toString(), {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal,
      });
      const payload = await response.json() as QueuePayload;
      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || 'The follow-up queue could not be loaded.');
      }
      setItems(Array.isArray(payload.interactions) ? payload.interactions : []);
      setSummary(payload.summary || { open: 0, overdue: 0, due_today: 0, upcoming: 0, completed_recently: 0, cancelled: 0 });
      setTotal(Number(payload.total || 0));
      setPages(Math.max(1, Number(payload.pages || 1)));
      if (page > Math.max(1, Number(payload.pages || 1))) setPage(Math.max(1, Number(payload.pages || 1)));
    } catch (cause) {
      if (signal?.aborted || (cause instanceof Error && cause.name === 'AbortError')) return;
      setError(cause instanceof Error ? cause.message : 'The follow-up queue could not be loaded.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [view, page, search]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const changeStatus = useCallback(async (item: FollowUp, status: 'completed' | 'cancelled') => {
    setSavingId(item.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/apps/crm/interactions', {
        method: 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ interactionId: item.id, status }),
      });
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || 'The follow-up could not be updated.');
      }
      setNotice(status === 'completed' ? 'Follow-up marked complete.' : 'Follow-up cancelled.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The follow-up could not be updated.');
    } finally {
      setSavingId(null);
    }
  }, [load]);

  const tabs = [
    { key: 'overdue' as const, label: 'Overdue', value: summary.overdue },
    { key: 'due_today' as const, label: 'Due today', value: summary.due_today },
    { key: 'upcoming' as const, label: 'Upcoming', value: summary.upcoming },
    { key: 'completed' as const, label: 'Completed recently', value: summary.completed_recently },
    { key: 'all' as const, label: 'All activity', value: total },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">CRM activity management</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Follow-ups</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">A work queue for CRM-owned calls, meetings, notes and planned tasks. Sales follow-ups remain managed inside Sales.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={() => void load()} disabled={loading || Boolean(savingId)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm font-bold transition hover:bg-[var(--sami-surface-soft)] disabled:opacity-60">
            <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} /> Refresh
          </button>
          <Link href="/apps/crm/crm_interactions" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-700">
            <CalendarClock className="h-4 w-4" /> New activity
          </Link>
        </div>
      </div>

      {error ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-bold">Queue issue</p><p className="mt-1">{error}</p></div></div> : null}
      {notice ? <p role="status" className="rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] px-4 py-3 text-sm">{notice}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { key: 'open', label: 'Open follow-ups', value: summary.open, detail: 'Planned CRM activities', icon: ListFilter },
          { key: 'overdue', label: 'Overdue', value: summary.overdue, detail: 'Require attention', icon: CircleAlert },
          { key: 'due_today', label: 'Due today', value: summary.due_today, detail: 'Still due today', icon: Clock3 },
          { key: 'completed_recently', label: 'Completed in 30 days', value: summary.completed_recently, detail: 'Recently closed activities', icon: CheckCircle2 },
        ].map((metric) => {
          const MetricIcon = metric.icon;
          return <button key={metric.key} type="button" onClick={() => { if (metric.key === 'overdue' || metric.key === 'due_today') { setView(metric.key); setPage(1); } else if (metric.key === 'completed_recently') { setView('completed'); setPage(1); } else { setView('all'); setPage(1); } }} className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 text-left shadow-[var(--sami-shadow-sm)] transition hover:border-blue-300">
            <div className="flex items-center gap-2"><MetricIcon className="h-4 w-4 text-blue-600" /><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{metric.label}</span></div>
            <p className="mt-2 text-2xl font-black tabular-nums">{count(metric.value)}</p><p className="mt-1 text-xs text-slate-500">{metric.detail}</p>
          </button>;
        })}
      </div>

      <section className="space-y-4 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {tabs.map((tab) => <button key={tab.key} type="button" aria-pressed={view === tab.key} onClick={() => { setView(tab.key); setPage(1); }} className={['inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition', view === tab.key ? 'border-blue-600 bg-blue-600 text-white' : 'border-[var(--sami-border)] text-slate-600 hover:bg-[var(--sami-surface-soft)]'].join(' ')}>
              {tab.label}<span className={['rounded-full px-1.5 py-0.5 text-[10px] tabular-nums', view === tab.key ? 'bg-white/20 text-white' : 'bg-[var(--sami-surface-soft)] text-slate-500'].join(' ')}>{count(tab.value)}</span>
            </button>)}
          </div>
          <label className="relative block w-full xl:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <span className="sr-only">Search follow-ups</span>
            <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} maxLength={100} placeholder="Search subject, account or contact" className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-canvas)] pl-9 pr-3 text-sm outline-none focus:border-blue-500" />
          </label>
        </div>

        <p className="text-xs text-slate-500">{VIEWS.find((item) => item.key === view)?.description} · {count(total)} record{total === 1 ? '' : 's'}</p>

        {loading && items.length === 0 ? <div aria-busy="true" className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)]" />)}</div> : null}
        {!loading && items.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-8 text-center">
          <CalendarClock className="mx-auto h-6 w-6 text-slate-400" />
          <p className="mt-2 text-sm font-bold">No items in this queue</p>
          <p className="mt-1 text-xs text-slate-500">{search ? 'Try another search or clear the search field.' : view === 'overdue' ? 'No overdue CRM follow-ups. Keep it that way.' : 'New activities and follow-ups will appear here.'}</p>
        </div> : null}

        {items.length > 0 ? <div className="overflow-hidden rounded-xl border border-[var(--sami-border)]">
          <div className="divide-y divide-[var(--sami-border)]">
            {items.map((item) => {
              const overdue = item.status === 'planned' && item.due_at ? new Date(item.due_at).getTime() < Date.now() : false;
              return <article key={item.id} className="flex flex-col gap-3 bg-[var(--sami-surface)] p-4 transition hover:bg-[var(--sami-surface-soft)] sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words text-sm font-bold">{item.subject}</h2>
                    <span className="rounded-full border border-[var(--sami-border)] px-2 py-0.5 text-[10px] font-bold">{nice(item.interaction_type)}</span>
                    <span className={['rounded-full px-2 py-0.5 text-[10px] font-bold', overdue ? 'bg-rose-100 text-rose-800' : item.status === 'planned' ? 'bg-amber-100 text-amber-900' : item.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'].join(' ')}>{overdue ? 'Overdue' : nice(item.status)}</span>
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    {item.account_id ? <Link href={'/apps/crm/accounts/' + encodeURIComponent(item.account_id)} className="font-semibold text-blue-700 hover:underline">{item.account_name || 'Open account'}</Link> : null}
                    {item.contact_first_name || item.contact_last_name ? <span>{[item.contact_first_name, item.contact_last_name].filter(Boolean).join(' ')}</span> : null}
                    <span>{item.status === 'completed' ? 'Completed ' + date(item.completed_at) : 'Due ' + date(item.due_at)}</span>
                    {item.contact_do_not_contact ? <span className="font-bold text-amber-800">Do not contact</span> : null}
                  </p>
                  {item.description ? <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-600">{item.description}</p> : null}
                  {item.outcome ? <p className="mt-2 text-xs text-slate-500">Outcome: {item.outcome}</p> : null}
                </div>
                {canEdit && item.status === 'planned' ? <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={() => void changeStatus(item, 'completed')} disabled={Boolean(savingId)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-bold hover:border-emerald-300 hover:text-emerald-800 disabled:opacity-50">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {savingId === item.id ? 'Saving…' : 'Complete'}
                  </button>
                  <button type="button" onClick={() => void changeStatus(item, 'cancelled')} disabled={Boolean(savingId)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-bold text-slate-500 hover:text-rose-700 disabled:opacity-50">
                    <XCircle className="h-3.5 w-3.5" /> Cancel
                  </button>
                </div> : null}
              </article>;
            })}
          </div>
        </div> : null}

        <div className="flex flex-col gap-3 border-t border-[var(--sami-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Page {page} of {pages} · Showing up to 25 items per page</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-bold disabled:opacity-40"><ArrowLeft className="h-3.5 w-3.5" /> Previous</button>
            <button type="button" onClick={() => setPage((current) => Math.min(pages, current + 1))} disabled={page >= pages || loading} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-bold disabled:opacity-40">Next <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </section>
    </div>
  );
}
