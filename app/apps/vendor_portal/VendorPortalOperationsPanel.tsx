'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowRight, CheckCircle2, Clock3, FileText, MessageSquare,
  RefreshCw, Search, ShieldCheck, Users, XCircle,
} from 'lucide-react';

type TableKey =
  | 'vendor_portal_accounts'
  | 'vendor_portal_rfqs'
  | 'vendor_portal_rfq_responses'
  | 'vendor_portal_documents'
  | 'vendor_portal_messages';
type RowData = Record<string, unknown>;
type TableResult = { records: RowData[]; total: number; page: number; hasMore: boolean; query: string };
type ApiResponse = { success?: boolean; result?: RowData; error?: string; code?: string };
type ViewKey = 'overview' | 'accounts' | 'rfqs' | 'responses' | 'documents' | 'messages';

const TABLES: Array<{ key: TableKey; section: Exclude<ViewKey, 'overview'>; label: string; description: string }> = [
  { key: 'vendor_portal_accounts', section: 'accounts', label: 'Vendor accounts', description: 'Supplier identities, access state and portal access expiry.' },
  { key: 'vendor_portal_rfqs', section: 'rfqs', label: 'RFQ invitations', description: 'Supplier requests for quotation and response deadlines.' },
  { key: 'vendor_portal_rfq_responses', section: 'responses', label: 'Supplier responses', description: 'Quoted amounts, commercial terms and response decisions.' },
  { key: 'vendor_portal_documents', section: 'documents', label: 'Documents', description: 'Supplier certificates and documents with expiry dates.' },
  { key: 'vendor_portal_messages', section: 'messages', label: 'Messages', description: 'Vendor conversations and message status.' },
];
const inputClass = 'h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm text-[var(--sami-text)] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15';
const cardClass = 'rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-card)] p-4 shadow-[var(--sami-shadow-sm)]';
const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2 text-xs font-semibold text-[var(--sami-text)] transition hover:border-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';

function textValue(row: RowData, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const result = String(value).trim();
      if (result) return result;
    }
  }
  return '';
}
function pretty(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function showDate(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}
function money(row: RowData) {
  const amount = textValue(row, 'amount', 'total_amount');
  if (!amount) return '—';
  const numeric = Number(amount);
  const currency = textValue(row, 'currency', 'currency_code').toUpperCase() || 'KES';
  return Number.isFinite(numeric) ? currency + ' ' + numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : currency + ' ' + amount;
}
function labelFor(table: TableKey, row: RowData) {
  if (table === 'vendor_portal_accounts') return textValue(row, 'vendor_name', 'name', 'email', 'id');
  if (table === 'vendor_portal_rfqs') return textValue(row, 'rfq_number', 'number', 'id');
  if (table === 'vendor_portal_rfq_responses') return textValue(row, 'portal_rfq_id', 'rfq_number', 'id');
  if (table === 'vendor_portal_documents') return textValue(row, 'document_type', 'file_name', 'id');
  return textValue(row, 'subject', 'body', 'id');
}
function nextActions(table: TableKey, status: string): Array<{ label: string; next: string; danger?: boolean }> {
  if (table === 'vendor_portal_accounts') {
    if (status === 'active') return [{ label: 'Suspend access', next: 'suspended', danger: true }, { label: 'Close account', next: 'closed', danger: true }];
    if (status === 'suspended') return [{ label: 'Reactivate', next: 'active' }, { label: 'Close account', next: 'closed', danger: true }];
    return [];
  }
  if (table === 'vendor_portal_rfqs') {
    if (status === 'sent') return [{ label: 'Mark opened', next: 'opened' }, { label: 'Cancel invitation', next: 'cancelled', danger: true }];
    if (status === 'opened') return [{ label: 'Mark responded', next: 'responded' }, { label: 'Close RFQ', next: 'closed', danger: true }];
    if (status === 'responded') return [{ label: 'Award', next: 'awarded' }, { label: 'Close RFQ', next: 'closed' }];
    if (status === 'awarded') return [{ label: 'Close RFQ', next: 'closed' }];
    return [];
  }
  if (table === 'vendor_portal_rfq_responses') {
    if (status === 'draft') return [{ label: 'Submit response', next: 'submitted' }, { label: 'Withdraw', next: 'withdrawn', danger: true }];
    if (status === 'submitted') return [{ label: 'Accept response', next: 'accepted' }, { label: 'Reject response', next: 'rejected', danger: true }];
  }
  return [];
}
function detailFor(table: TableKey, row: RowData) {
  if (table === 'vendor_portal_accounts') return textValue(row, 'email', 'vendor_reference') || 'Supplier account';
  if (table === 'vendor_portal_rfqs') return 'Due ' + showDate(textValue(row, 'due_at'));
  if (table === 'vendor_portal_rfq_responses') return [money(row), textValue(row, 'status')].filter(Boolean).join(' · ');
  if (table === 'vendor_portal_documents') return 'Expires ' + showDate(textValue(row, 'expires_at'));
  return [textValue(row, 'direction'), showDate(textValue(row, 'sent_at'))].filter(Boolean).join(' · ') || 'Vendor message';
}
function statusClass(status: string) {
  if (['active', 'responded', 'awarded', 'accepted', 'submitted'].includes(status)) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (['suspended', 'expired', 'cancelled', 'closed', 'rejected', 'withdrawn'].includes(status)) return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  if (['sent', 'opened', 'draft'].includes(status)) return 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300';
  return 'border-[var(--sami-border)] bg-[var(--sami-surface)] text-[var(--sami-muted)]';
}

export default function VendorPortalOperationsPanel({
  initialSection,
  canTransition,
  availableTableKeys,
}: {
  initialSection: ViewKey;
  canTransition: boolean;
  availableTableKeys: string[];
}) {
  const [data, setData] = useState<Partial<Record<TableKey, TableResult>>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState<ViewKey>(initialSection);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const request = useCallback(async (payload: RowData) => {
    const response = await fetch('/api/apps/vendor_portal/records', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json() as ApiResponse;
    if (!response.ok || body.success !== true || !body.result) {
      throw new Error(body.error || 'Vendor Portal could not complete the request.');
    }
    return body.result;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const tables = TABLES.filter((table) => availableTableKeys.includes(table.key));
      const results = await Promise.all(tables.map(async (table) => {
        const result = await request({ action: 'list', table: table.key, query: '', page: 1, pageSize: 50 }) as unknown as TableResult;
        return [table.key, {
          records: Array.isArray(result.records) ? result.records : [],
          total: Number(result.total || 0),
          page: Number(result.page || 1),
          hasMore: Boolean(result.hasMore),
          query: String(result.query || ''),
        }] as const;
      }));
      setData(Object.fromEntries(results) as Partial<Record<TableKey, TableResult>>);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Vendor Portal data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [availableTableKeys, request]);

  useEffect(() => { void refresh(); }, [refresh, refreshCounter]);

  const visibleTables = useMemo(
    () => TABLES.filter((table) =>
      availableTableKeys.includes(table.key) && (view === 'overview' || table.section === view)),
    [availableTableKeys, view],
  );
  const counts = useMemo(() => {
    const rows = (table: TableKey) => data[table]?.records || [];
    const count = (table: TableKey, statuses: string[]) => rows(table).filter((row) =>
      statuses.includes(textValue(row, 'status', 'state').toLowerCase())).length;
    return {
      accounts: data.vendor_portal_accounts?.total ?? 0,
      activeAccounts: count('vendor_portal_accounts', ['active']),
      openRfqs: count('vendor_portal_rfqs', ['sent', 'opened', 'responded']),
      responses: data.vendor_portal_rfq_responses?.total ?? 0,
      expiringDocuments: rows('vendor_portal_documents').filter((row) => {
        const date = new Date(textValue(row, 'expires_at'));
        const diff = date.getTime() - Date.now();
        return Number.isFinite(diff) && diff >= 0 && diff <= 30 * 24 * 60 * 60 * 1000;
      }).length,
      openMessages: count('vendor_portal_messages', ['open', 'unread', 'active']),
    };
  }, [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return visibleTables.flatMap((table) => (data[table.key]?.records || [])
      .filter((row) => {
        const status = textValue(row, 'status', 'state').toLowerCase();
        if (filter !== 'all' && status !== filter) return false;
        if (!query) return true;
        return Object.values(row).some((value) => {
          if (value == null || typeof value === 'object') return false;
          return String(value).toLowerCase().includes(query);
        });
      })
      .map((row) => ({ table, row })));
  }, [data, filter, search, visibleTables]);

  async function transition(table: TableKey, row: RowData, next: string, label: string) {
    const id = textValue(row, 'id');
    if (!id || !canTransition || busyId) return;
    if (!window.confirm('Confirm "' + label + '" for ' + labelFor(table, row) + '?')) return;
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      await request({ action: 'transition', table, id, statusField: 'status', nextStatus: next });
      setNotice(label + ' completed.');
      setRefreshCounter((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The vendor workflow action failed.');
    } finally {
      setBusyId('');
    }
  }

  const iconFor = (table: TableKey) => table === 'vendor_portal_accounts'
    ? Users : table === 'vendor_portal_rfqs' ? FileText
      : table === 'vendor_portal_rfq_responses' ? CheckCircle2
        : table === 'vendor_portal_documents' ? ShieldCheck : MessageSquare;

  return (
    <div className="space-y-5" data-vendor-portal-workspace="specialist" data-vendor-portal-section={view}>
      <header className="flex flex-col gap-3 border-b border-[var(--sami-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">Supplier collaboration</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[var(--sami-text)] sm:text-3xl">
            {view === 'overview' ? 'Vendor Portal command center' : TABLES.find((table) => table.section === view)?.label || 'Vendor Portal'}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sami-muted)]">
            Manage supplier access, quotation invitations, commercial responses, documents and vendor conversations from a company-scoped workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={() => setRefreshCounter((value) => value + 1)} disabled={loading}>
            <RefreshCw className={'h-4 w-4' + (loading ? ' animate-spin' : '')} aria-hidden="true" /> Refresh
          </button>
          {view !== 'overview' && visibleTables[0] ? (
            <Link href={'/apps/vendor_portal/' + visibleTables[0].key} className={primaryButton}>
              Open register <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </header>

      {error ? <div role="alert" className="flex gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{error}</span></div> : null}
      {notice ? <div role="status" className="flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{notice}</span></div> : null}

      {view === 'overview' ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Vendor Portal indicators">
            {[
              { label: 'Vendor accounts', value: counts.accounts, icon: Users, detail: counts.activeAccounts + ' active' },
              { label: 'Open RFQs', value: counts.openRfqs, icon: FileText, detail: 'Sent, opened or awaiting response' },
              { label: 'Responses', value: counts.responses, icon: CheckCircle2, detail: 'Supplier quotation records' },
              { label: 'Documents expiring', value: counts.expiringDocuments, icon: Clock3, detail: 'Within the next 30 days' },
              { label: 'Open conversations', value: counts.openMessages, icon: MessageSquare, detail: 'Marked open, unread or active' },
            ].map((metric) => (
              <div key={metric.label} className={cardClass}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-[var(--sami-muted)]">{metric.label}</p>
                  <metric.icon className="h-4 w-4 text-[var(--sami-muted)]" aria-hidden="true" />
                </div>
                <p className="mt-3 text-2xl font-black tabular-nums text-[var(--sami-text)]">{loading ? '—' : metric.value}</p>
                <p className="mt-1 text-[11px] text-[var(--sami-muted)]">{metric.detail}</p>
              </div>
            ))}
          </section>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Vendor Portal registers">
            {TABLES.filter((table) => availableTableKeys.includes(table.key)).map((table) => {
              const Icon = iconFor(table.key);
              return (
                <Link key={table.key} href={'/apps/vendor_portal/' + table.section} className={cardClass + ' group block transition hover:border-blue-500/40'}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                    <ArrowRight className="h-4 w-4 text-[var(--sami-muted)] transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                  <p className="mt-4 text-base font-bold text-[var(--sami-text)]">{table.label}</p>
                  <p className="mt-1 min-h-10 text-xs leading-5 text-[var(--sami-muted)]">{table.description}</p>
                  <p className="mt-3 text-sm font-black tabular-nums text-[var(--sami-text)]">{loading ? '—' : data[table.key]?.total ?? 0} <span className="text-xs font-medium text-[var(--sami-muted)]">records</span></p>
                </Link>
              );
            })}
          </section>
        </>
      ) : (
        <section className={cardClass}>
          <div className="flex flex-col gap-3 border-b border-[var(--sami-border)] pb-4 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search this register</span>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--sami-muted)]" aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className={inputClass + ' pl-9'} placeholder="Search vendor, RFQ, status or document..." />
            </label>
            <select value={filter} onChange={(event) => setFilter(event.target.value)} className={inputClass + ' sm:max-w-[190px]'} aria-label="Filter status">
              <option value="all">All statuses</option>
              {['active', 'suspended', 'sent', 'opened', 'responded', 'awarded', 'draft', 'submitted', 'accepted', 'rejected', 'expired', 'closed', 'cancelled', 'withdrawn'].map((status) => <option key={status} value={status}>{pretty(status)}</option>)}
            </select>
            <button type="button" className={buttonClass} onClick={() => { setSearch(''); setFilter('all'); }}><XCircle className="h-4 w-4" aria-hidden="true" /> Clear</button>
          </div>

          {loading ? <p className="py-10 text-center text-sm text-[var(--sami-muted)]">Loading vendor records…</p>
            : filtered.length === 0 ? <div className="py-12 text-center"><p className="font-semibold text-[var(--sami-text)]">No matching records</p><p className="mt-1 text-xs text-[var(--sami-muted)]">Try a different filter, or open the register to create a record.</p></div>
              : (
                <div className="divide-y divide-[var(--sami-border)]">
                  {filtered.map(({ table, row }) => {
                    const id = textValue(row, 'id');
                    const status = textValue(row, 'status', 'state').toLowerCase();
                    const actions = canTransition ? nextActions(table.key, status) : [];
                    return (
                      <article key={table.key + ':' + id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_130px_minmax(190px,auto)] sm:items-start">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-bold text-[var(--sami-text)]">{labelFor(table.key, row)}</p>
                          <p className="mt-1 break-words text-xs text-[var(--sami-muted)]">{detailFor(table.key, row)}</p>
                          <p className="mt-1 text-[10px] text-[var(--sami-muted)]">{table.label} · created {showDate(textValue(row, 'created_at'))}</p>
                        </div>
                        <div><span className={'inline-flex max-w-full rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ' + statusClass(status)}>{pretty(status || 'unknown')}</span></div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          {actions.map((action) => (
                            <button key={action.next} type="button"
                              className={action.danger ? 'inline-flex min-h-8 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-300 disabled:opacity-50' : buttonClass}
                              disabled={Boolean(busyId)}
                              onClick={() => void transition(table.key, row, action.next, action.label)}>
                              {busyId === id ? 'Saving…' : action.label}
                            </button>
                          ))}
                          <Link className={buttonClass} href={'/apps/vendor_portal/' + table.key}>Open register</Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sami-border)] pt-4 text-xs text-[var(--sami-muted)]">
            <span>{filtered.length} loaded records · each register is company scoped</span>
            {visibleTables[0] ? <Link className="font-bold text-blue-700 hover:underline dark:text-blue-300" href={'/apps/vendor_portal/' + visibleTables[0].key}>Manage records <ArrowRight className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></Link> : null}
          </div>
        </section>
      )}

      {availableTableKeys.length === 0 ? (
        <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
          Vendor Portal records are not available in the current installation. Verify module installation and its required Purchase dependency before using this workspace.
        </div>
      ) : null}
    </div>
  );
}
