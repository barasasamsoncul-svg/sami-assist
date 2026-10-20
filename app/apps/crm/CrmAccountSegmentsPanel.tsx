'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, Bookmark, Building2, Check, CircleAlert, Clock3,
  Filter, RefreshCw, Save, Search, Trash2, UsersRound, X,
} from 'lucide-react';

type SegmentFilters = {
  search: string;
  lifecycleStage: string;
  accountType: string;
  industry: string;
  source: string;
  ownerUserId: string;
  engagement: string;
};
type SavedView = {
  id: string;
  view_name: string;
  filters: SegmentFilters;
  created_at: string;
  updated_at: string;
};
type AccountRow = {
  id: string;
  account_name: string;
  account_type: string;
  lifecycle_stage: string;
  industry: string | null;
  source: string | null;
  email: string | null;
  phone: string | null;
  owner_user_id: string | null;
  contact_count: number | string;
  last_interaction_at: string | null;
};
type SegmentsPayload = {
  success?: boolean;
  error?: string;
  total?: number;
  pages?: number;
  page?: number;
  accounts?: AccountRow[];
  summary?: { total?: number; leads?: number; qualified?: number; customers?: number; partners?: number };
  options?: { industries?: string[]; sources?: string[]; owners?: string[] };
};
type ViewsPayload = { success?: boolean; error?: string; views?: SavedView[]; view?: SavedView };
const DEFAULT_FILTERS: SegmentFilters = {
  search: '', lifecycleStage: '', accountType: '', industry: '', source: '', ownerUserId: '', engagement: 'all',
};

function pretty(value: string | null | undefined) {
  if (!value) return '—';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function number(value: number | string | null | undefined) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result.toLocaleString('en-KE') : '0';
}
function date(value: string | null | undefined) {
  if (!value) return 'No activity';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No activity';
  return parsed.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}
function sameFilters(a: SegmentFilters, b: SegmentFilters) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function CrmAccountSegmentsPanel() {
  const [filters, setFilters] = useState<SegmentFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [summary, setSummary] = useState<SegmentsPayload['summary']>({});
  const [options, setOptions] = useState<NonNullable<SegmentsPayload['options']>>({ industries: [], sources: [], owners: [] });
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [views, setViews] = useState<SavedView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState('');
  const [viewName, setViewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewsLoading, setViewsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewsError, setViewsError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedView = useMemo(() => views.find((view) => view.id === selectedViewId) || null, [views, selectedViewId]);
  const selectedViewIsDirty = Boolean(selectedView && !sameFilters(filters, selectedView.filters));

  const loadViews = useCallback(async () => {
    setViewsLoading(true);
    setViewsError(null);
    try {
      const response = await fetch('/api/apps/crm/account-views', {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
      });
      const payload = await response.json() as ViewsPayload;
      if (!response.ok || payload.success !== true) throw new Error(payload.error || 'Saved account views could not be loaded.');
      const loaded = Array.isArray(payload.views) ? payload.views : [];
      setViews(loaded);
      setSelectedViewId((current) => current && loaded.some((view) => view.id === current) ? current : '');
    } catch (cause) {
      setViewsError(cause instanceof Error ? cause.message : 'Saved account views could not be loaded.');
    } finally {
      setViewsLoading(false);
    }
  }, []);

  const loadAccounts = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: filters.search,
        lifecycleStage: filters.lifecycleStage,
        accountType: filters.accountType,
        industry: filters.industry,
        source: filters.source,
        ownerUserId: filters.ownerUserId,
        engagement: filters.engagement,
        page: String(page),
      });
      const response = await fetch('/api/apps/crm/account-segments?' + params.toString(), {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal,
      });
      const payload = await response.json() as SegmentsPayload;
      if (!response.ok || payload.success !== true) throw new Error(payload.error || 'Account segments could not be loaded.');
      setAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
      setSummary(payload.summary || {});
      setOptions(payload.options || { industries: [], sources: [], owners: [] });
      setTotal(Number(payload.total || 0));
      setPages(Math.max(1, Number(payload.pages || 1)));
      if (page > Math.max(1, Number(payload.pages || 1))) setPage(Math.max(1, Number(payload.pages || 1)));
    } catch (cause) {
      if (signal?.aborted || (cause instanceof Error && cause.name === 'AbortError')) return;
      setError(cause instanceof Error ? cause.message : 'Account segments could not be loaded.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { void loadViews(); }, [loadViews]);
  useEffect(() => {
    const controller = new AbortController();
    void loadAccounts(controller.signal);
    return () => controller.abort();
  }, [loadAccounts]);

  const changeFilter = useCallback((key: keyof SegmentFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }, []);

  const selectView = useCallback((id: string) => {
    setSelectedViewId(id);
    const view = views.find((item) => item.id === id);
    if (view) {
      setFilters({ ...DEFAULT_FILTERS, ...view.filters });
      setViewName(view.view_name);
    } else {
      setFilters(DEFAULT_FILTERS);
      setViewName('');
    }
    setPage(1);
    setNotice(null);
  }, [views]);

  const saveView = useCallback(async (mode: 'create' | 'update') => {
    const name = viewName.trim();
    if (name.length < 2) {
      setViewsError('Enter a saved view name with at least two characters.');
      return;
    }
    if (mode === 'update' && !selectedView) {
      setViewsError('Select a saved view before updating it.');
      return;
    }
    setSaving(true);
    setViewsError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/apps/crm/account-views', {
        method: mode === 'create' ? 'POST' : 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(mode === 'update' && selectedView ? { id: selectedView.id } : {}),
          name,
          filters,
        }),
      });
      const payload = await response.json() as ViewsPayload;
      if (!response.ok || payload.success !== true || !payload.view) throw new Error(payload.error || 'The saved view could not be saved.');
      setViews((current) => {
        const existingIndex = current.findIndex((item) => item.id === payload.view?.id);
        if (existingIndex < 0) return [...current, payload.view!].sort((a, b) => a.view_name.localeCompare(b.view_name));
        return current.map((item) => item.id === payload.view?.id ? payload.view! : item).sort((a, b) => a.view_name.localeCompare(b.view_name));
      });
      setSelectedViewId(payload.view.id);
      setViewName(payload.view.view_name);
      setNotice(mode === 'create' ? 'Saved view created.' : 'Saved view updated.');
    } catch (cause) {
      setViewsError(cause instanceof Error ? cause.message : 'The saved view could not be saved.');
    } finally {
      setSaving(false);
    }
  }, [filters, selectedView, viewName]);

  const deleteView = useCallback(async () => {
    if (!selectedView) return;
    setSaving(true);
    setViewsError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/apps/crm/account-views', {
        method: 'DELETE',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedView.id }),
      });
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || payload.success !== true) throw new Error(payload.error || 'The saved view could not be deleted.');
      setViews((current) => current.filter((item) => item.id !== selectedView.id));
      setSelectedViewId('');
      setViewName('');
      setNotice('Saved view deleted.');
    } catch (cause) {
      setViewsError(cause instanceof Error ? cause.message : 'The saved view could not be deleted.');
    } finally {
      setSaving(false);
    }
  }, [selectedView]);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
    setSelectedViewId('');
    setViewName('');
    setNotice(null);
  }, []);

  const summaryCards = [
    { label: 'Matching accounts', value: summary?.total ?? total, detail: 'Current segment', icon: Building2 },
    { label: 'Leads', value: summary?.leads, detail: 'Lead lifecycle', icon: UsersRound },
    { label: 'Qualified', value: summary?.qualified, detail: 'Qualified lifecycle', icon: Check },
    { label: 'Customers', value: summary?.customers, detail: 'Customer lifecycle', icon: Bookmark },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">CRM account intelligence</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Account segments</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Segment CRM accounts by lifecycle, type, industry, source, owner and recent engagement. Save your filters for repeatable team workflows; saved views are private to your user in this company.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={() => { void loadAccounts(); void loadViews(); }} disabled={loading || viewsLoading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm font-bold transition hover:bg-[var(--sami-surface-soft)] disabled:opacity-60"><RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} /> Refresh</button>
          <Link href="/apps/crm/crm_accounts" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-700"><Building2 className="h-4 w-4" /> Accounts register</Link>
        </div>
      </div>

      {error ? <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"><CircleAlert className="h-4 w-4 shrink-0" />{error}</div> : null}
      {viewsError ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0 flex-1">{viewsError}</div><button type="button" onClick={() => setViewsError(null)} aria-label="Dismiss saved view warning"><X className="h-4 w-4" /></button></div> : null}
      {notice ? <p role="status" className="rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] px-4 py-3 text-sm">{notice}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((metric) => {
          const MetricIcon = metric.icon;
          return <div key={metric.label} className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)]">
            <div className="flex items-center gap-2"><MetricIcon className="h-4 w-4 text-blue-600" /><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{metric.label}</span></div>
            <p className="mt-2 text-2xl font-black tabular-nums">{number(metric.value)}</p><p className="mt-1 text-xs text-slate-500">{metric.detail}</p>
          </div>;
        })}
      </div>

      <section className="space-y-4 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
        <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-black">Build a segment</h2><span className="ml-auto text-xs text-slate-500">Filters apply immediately</span></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-bold text-slate-600">Search accounts</span>
            <span className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={filters.search} maxLength={100} onChange={(event) => changeFilter('search', event.target.value)} placeholder="Account, email or phone" className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-canvas)] pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></span>
          </label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Lifecycle</span><select value={filters.lifecycleStage} onChange={(event) => changeFilter('lifecycleStage', event.target.value)} className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-canvas)] px-3 text-sm"><option value="">All lifecycle stages</option><option value="lead">Lead</option><option value="qualified">Qualified</option><option value="customer">Customer</option><option value="inactive">Inactive</option></select></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Account type</span><select value={filters.accountType} onChange={(event) => changeFilter('accountType', event.target.value)} className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-canvas)] px-3 text-sm"><option value="">All account types</option><option value="prospect">Prospect</option><option value="customer">Customer</option><option value="partner">Partner</option><option value="competitor">Competitor</option></select></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Industry</span><select value={filters.industry} onChange={(event) => changeFilter('industry', event.target.value)} className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-canvas)] px-3 text-sm"><option value="">All industries</option>{options.industries?.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Source</span><select value={filters.source} onChange={(event) => changeFilter('source', event.target.value)} className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-canvas)] px-3 text-sm"><option value="">All sources</option>{options.sources?.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Owner</span><select value={filters.ownerUserId} onChange={(event) => changeFilter('ownerUserId', event.target.value)} className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-canvas)] px-3 text-sm"><option value="">All owners</option><option value="unassigned">Unassigned</option>{options.owners?.map((id) => <option key={id} value={id} title={id}>Owner · {id.slice(0, 8)}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Engagement</span><select value={filters.engagement} onChange={(event) => changeFilter('engagement', event.target.value)} className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-canvas)] px-3 text-sm"><option value="all">Any engagement</option><option value="engaged">Activity in last 90 days</option><option value="not_engaged">No activity in last 90 days</option></select></label>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--sami-border)] pt-4">
          <button type="button" onClick={resetFilters} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-bold text-slate-600 hover:bg-[var(--sami-surface-soft)]"><X className="h-3.5 w-3.5" /> Clear filters</button>
          <span className="text-xs text-slate-500">{number(total)} accounts match these criteria.</span>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
        <div className="flex items-center gap-2"><Bookmark className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-black">Saved views</h2><span className="ml-auto text-xs text-slate-500">{viewsLoading ? 'Loading…' : number(views.length) + ' saved'}</span></div>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto_auto]">
          <label className="block min-w-0"><span className="mb-1.5 block text-xs font-bold text-slate-600">Load a saved view</span><select value={selectedViewId} onChange={(event) => selectView(event.target.value)} className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-canvas)] px-3 text-sm"><option value="">Current filters (not saved)</option>{views.map((view) => <option key={view.id} value={view.id}>{view.view_name}</option>)}</select></label>
          <label className="block min-w-0"><span className="mb-1.5 block text-xs font-bold text-slate-600">View name</span><input value={viewName} onChange={(event) => setViewName(event.target.value)} maxLength={80} placeholder="e.g. Unengaged prospects" className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-canvas)] px-3 text-sm outline-none focus:border-blue-500" /></label>
          <div className="flex items-end"><button type="button" onClick={() => void saveView('create')} disabled={saving || viewName.trim().length < 2} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50"><Save className="h-3.5 w-3.5" /> Save new</button></div>
          <div className="flex items-end"><button type="button" onClick={() => void saveView('update')} disabled={saving || !selectedView || (!selectedViewIsDirty && viewName.trim() === selectedView.view_name) || viewName.trim().length < 2} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-bold hover:bg-[var(--sami-surface-soft)] disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Update</button></div>
          <div className="flex items-end"><button type="button" onClick={() => void deleteView()} disabled={saving || !selectedView} aria-label="Delete selected saved view" className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /> Delete</button></div>
        </div>
        <p className="text-xs text-slate-500">Saved views remember these filters for your user in the current company; they do not change account records or Sales pipeline stages.</p>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 shadow-[var(--sami-shadow-sm)] sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-sm font-black">Segment results</h2><p className="mt-1 text-xs text-slate-500">{number(total)} records · page {page} of {pages}</p></div>
          <button type="button" onClick={() => void loadAccounts()} disabled={loading} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-bold hover:bg-[var(--sami-surface-soft)] disabled:opacity-50"><RefreshCw className={'h-3.5 w-3.5 ' + (loading ? 'animate-spin' : '')} /> Refresh results</button>
        </div>
        {loading && accounts.length === 0 ? <div aria-busy="true" className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)]" />)}</div> : null}
        {!loading && accounts.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-8 text-center"><Building2 className="mx-auto h-6 w-6 text-slate-400" /><p className="mt-2 text-sm font-bold">No accounts match these filters</p><p className="mt-1 text-xs text-slate-500">Clear one or more filters, or save this segment for later.</p></div> : null}
        {accounts.length > 0 ? <div className="overflow-x-auto rounded-xl border border-[var(--sami-border)]"><table className="min-w-full divide-y divide-[var(--sami-border)] text-sm">
          <thead className="bg-[var(--sami-surface-soft)] text-left text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Lifecycle / type</th><th className="px-4 py-3">Industry / source</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Contacts</th><th className="px-4 py-3">Last activity</th><th className="px-4 py-3 text-right">Profile</th></tr></thead>
          <tbody className="divide-y divide-[var(--sami-border)]">{accounts.map((account) => <tr key={account.id} className="bg-[var(--sami-surface)] hover:bg-[var(--sami-surface-soft)]">
            <td className="max-w-[280px] px-4 py-3"><p className="truncate font-bold" title={account.account_name}>{account.account_name}</p><p className="mt-1 truncate text-xs text-slate-500">{account.email || account.phone || 'No contact details'}</p></td>
            <td className="px-4 py-3"><span className="block font-semibold">{pretty(account.lifecycle_stage)}</span><span className="mt-1 block text-xs text-slate-500">{pretty(account.account_type)}</span></td>
            <td className="px-4 py-3"><span className="block">{account.industry || '—'}</span><span className="mt-1 block text-xs text-slate-500">{account.source || 'No source'}</span></td>
            <td className="px-4 py-3 text-xs text-slate-500" title={account.owner_user_id || 'Unassigned'}>{account.owner_user_id ? 'Owner · ' + account.owner_user_id.slice(0, 8) : 'Unassigned'}</td>
            <td className="px-4 py-3 tabular-nums">{number(account.contact_count)}</td>
            <td className="px-4 py-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{date(account.last_interaction_at)}</span></td>
            <td className="px-4 py-3 text-right"><Link href={'/apps/crm/accounts/' + encodeURIComponent(account.id)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--sami-border)] px-2.5 text-xs font-bold hover:border-blue-400 hover:text-blue-700">Open 360 <ArrowRight className="h-3.5 w-3.5" /></Link></td>
          </tr>)}</tbody>
        </table></div> : null}
        <div className="flex flex-col gap-3 border-t border-[var(--sami-border)] pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">Showing up to 25 accounts per page.</p><div className="flex gap-2">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-bold disabled:opacity-40"><ArrowLeft className="h-3.5 w-3.5" /> Previous</button>
          <button type="button" onClick={() => setPage((current) => Math.min(pages, current + 1))} disabled={page >= pages || loading} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-bold disabled:opacity-40">Next <ArrowRight className="h-3.5 w-3.5" /></button>
        </div></div>
      </section>
    </div>
  );
}
