'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardCheck, Clock3, FileText, PackageCheck, RefreshCw, Search, Truck } from 'lucide-react';

type PurchaseSection = 'overview' | 'requisitions' | 'orders' | 'receipts';
type Row = Record<string, unknown>;
type ApiResponse = { success?: boolean; result?: Row; error?: string; code?: string };
type TableResult = { records: Row[]; total: number; page: number; hasMore: boolean; query: string };
type PurchaseData = { requisitions: TableResult; orders: TableResult; receipts: TableResult };
type WorkflowAction = { label: string; next: string; tone?: 'primary' | 'danger' };
const TABLES = [
  { key: 'purchase_requisitions', label: 'Requisitions' },
  { key: 'purchase_orders', label: 'Purchase orders' },
  { key: 'purchase_receipts', label: 'Goods receipts' },
] as const;
const TRANSITIONS: Record<string, WorkflowAction[]> = {
  purchase_requisitions: [
    { label: 'Submit', next: 'submitted', tone: 'primary' },
    { label: 'Approve', next: 'approved', tone: 'primary' },
    { label: 'Reject', next: 'rejected', tone: 'danger' },
    { label: 'Convert to orders', next: 'converted', tone: 'primary' },
    { label: 'Return to draft', next: 'draft' },
    { label: 'Cancel', next: 'cancelled', tone: 'danger' },
  ],
  purchase_orders: [
    { label: 'Confirm order', next: 'confirmed', tone: 'primary' },
    { label: 'Mark received', next: 'received', tone: 'primary' },
    { label: 'Close order', next: 'closed' },
    { label: 'Cancel order', next: 'cancelled', tone: 'danger' },
  ],
  purchase_receipts: [
    { label: 'Mark received', next: 'received', tone: 'primary' },
    { label: 'Mark inspected', next: 'inspected', tone: 'primary' },
    { label: 'Post to Inventory', next: 'posted', tone: 'primary' },
    { label: 'Return to received', next: 'received' },
    { label: 'Cancel receipt', next: 'cancelled', tone: 'danger' },
  ],
};
const inputClass = 'h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm text-[var(--sami-text)] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15';
const cardClass = 'rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-card)] p-4 shadow-[var(--sami-shadow-sm)]';
const primaryButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50';
const neutralButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2 text-xs font-semibold text-[var(--sami-text)] disabled:opacity-50';
const dangerButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 disabled:opacity-50';

function stringValue(row: Row, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' || typeof value === 'number') {
      const result = String(value).trim();
      if (result) return result;
    }
  }
  return '';
}
function displayDate(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}
function pretty(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function money(row: Row) {
  const total = stringValue(row, 'total_amount', 'total', 'amount');
  const currency = stringValue(row, 'currency_code', 'currency', 'currencyCode');
  if (!total) return '—';
  const amount = Number(total);
  if (!Number.isFinite(amount)) return currency ? currency + ' ' + total : total;
  return (currency ? currency.toUpperCase() + ' ' : '') + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function statusClass(status: string) {
  if (['posted', 'received', 'closed', 'converted', 'approved'].includes(status)) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (['cancelled', 'rejected', 'failed'].includes(status)) return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  if (['submitted', 'confirmed', 'inspected'].includes(status)) return 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300';
  return 'border-[var(--sami-border)] bg-[var(--sami-surface)] text-[var(--sami-muted)]';
}
function Status({ value }: { value: string }) {
  return <span className={'inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ' + statusClass(value)}>{pretty(value || 'unknown')}</span>;
}
function labelFor(row: Row, table: string) {
  if (table === 'purchase_requisitions') return stringValue(row, 'requisition_number', 'request_number', 'number', 'id');
  if (table === 'purchase_orders') return stringValue(row, 'order_number', 'purchase_order_number', 'number', 'id');
  return stringValue(row, 'receipt_number', 'number', 'id');
}
function actionList(table: string, status: string): WorkflowAction[] {
  const all = TRANSITIONS[table] || [];
  const allowed: Record<string, string[]> = {
    purchase_requisitions: status === 'draft' ? ['submitted','cancelled']
      : status === 'submitted' ? ['approved','rejected','draft','cancelled']
      : status === 'approved' ? ['converted','cancelled']
      : status === 'rejected' ? ['draft','cancelled'] : [],
    purchase_orders: status === 'draft' || status === 'active' ? ['confirmed','cancelled']
      : status === 'confirmed' ? ['received','cancelled']
      : status === 'received' ? ['closed'] : [],
    purchase_receipts: status === 'draft' ? ['received','cancelled']
      : status === 'received' ? ['inspected','posted','cancelled']
      : status === 'inspected' ? ['posted','received','cancelled'] : [],
  };
  return all.filter((action) => (allowed[table] || []).includes(action.next));
}
function tableHref(table: string) { return '/apps/purchase/' + table; }

export default function PurchaseOperationsPanel({ initialSection, canTransition, availableTableKeys }: { initialSection: PurchaseSection; canTransition: boolean; availableTableKeys: string[] }) {
  const [data, setData] = useState<PurchaseData>({
    requisitions: { records: [], total: 0, page: 1, hasMore: false, query: '' },
    orders: { records: [], total: 0, page: 1, hasMore: false, query: '' },
    receipts: { records: [], total: 0, page: 1, hasMore: false, query: '' },
  });
  const [loading, setLoading] = useState(true);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [focusTable, setFocusTable] = useState<string>(initialSection === 'overview' ? 'all' : initialSection === 'requisitions' ? 'purchase_requisitions' : initialSection === 'receipts' ? 'purchase_receipts' : 'purchase_orders');

  const request = useCallback(async (payload: Row) => {
    const response = await fetch('/api/apps/purchase/records', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json() as ApiResponse;
    if (!response.ok || body.success !== true || !body.result) throw new Error(body.error || 'Purchase could not complete the request.');
    return body.result;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const visibleTables = TABLES.filter((table) => availableTableKeys.includes(table.key));
      const results = await Promise.all(visibleTables.map(async (table) => {
        const result = await request({ action: 'list', table: table.key, query: '', page: 1, pageSize: 50 }) as unknown as TableResult;
        return [table.key, {
          records: Array.isArray(result.records) ? result.records : [],
          total: Number(result.total || 0), page: Number(result.page || 1),
          hasMore: Boolean(result.hasMore), query: String(result.query || ''),
        }] as const;
      }));
      const emptyResult: TableResult = { records: [], total: 0, page: 1, hasMore: false, query: '' };
      const indexed = Object.fromEntries(results) as unknown as Record<string, TableResult>;
      setData({
        requisitions: indexed.purchase_requisitions || emptyResult,
        orders: indexed.purchase_orders || emptyResult,
        receipts: indexed.purchase_receipts || emptyResult,
      });
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Purchase records could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [request, availableTableKeys]);

  useEffect(() => { void refresh(); }, [refresh]);

  const counts = useMemo(() => {
    const statusCount = (rows: Row[], statuses: string[]) => rows.filter((row) => statuses.includes(stringValue(row, 'status', 'state').toLowerCase())).length;
    return {
      pendingRequisitions: statusCount(data.requisitions.records, ['submitted']),
      openOrders: statusCount(data.orders.records, ['draft','active','confirmed']),
      pendingReceipts: statusCount(data.receipts.records, ['draft','received','inspected']),
      postedReceipts: statusCount(data.receipts.records, ['posted']),
    };
  }, [data]);

  const entries = useMemo(() => {
    const all = TABLES.flatMap((table) => {
      const tableData = table.key === 'purchase_requisitions' ? data.requisitions
        : table.key === 'purchase_orders' ? data.orders : data.receipts;
      return tableData.records.map((row) => ({ table: table.key as string, row }));
    });
    return all.filter(({ table, row }) => {
      if (initialSection !== 'overview' && table !== focusTable) return false;
      if (initialSection === 'overview' && focusTable !== 'all' && table !== focusTable) return false;
      const status = stringValue(row, 'status', 'state').toLowerCase();
      if (filter !== 'all' && status !== filter) return false;
      const query = search.trim().toLowerCase();
      const searchable = [labelFor(row, table), stringValue(row, 'supplier_name','supplier','vendor_name','name'), stringValue(row, 'status','state'), stringValue(row, 'currency_code','currency'), stringValue(row, 'total_amount','total','amount'), stringValue(row, 'expected_date','expected_delivery_date','order_date','created_at','receipt_date'), stringValue(row, 'purchase_order_id','purchase_order_number')].join(' ').toLowerCase();
      return !query || searchable.includes(query);
    }).sort((a,b) => stringValue(b.row,'created_at','updated_at').localeCompare(stringValue(a.row,'created_at','updated_at'))).slice(0, 100);
  }, [data, filter, focusTable, initialSection, search]);

  const performTransition = (table: string, row: Row, action: WorkflowAction) => {
    const id = stringValue(row, 'id');
    if (!id) { setError('This record has no identifier and cannot be advanced.'); return; }
    if (table === 'purchase_receipts' && action.next === 'posted') {
      const confirmed = window.confirm('Post this goods receipt to Inventory? This creates inventory movements and updates stock balances. The operation is company-scoped and must pass the receipt, order-line and quantity validations.');
      if (!confirmed) return;
    }
    setError(''); setNotice('');
    startTransition(async () => {
      try {
        await request({ action: 'transition', table, recordId: id, statusField: 'status', nextStatus: action.next });
        setNotice(labelFor(row, table) + ' moved to ' + pretty(action.next) + '.');
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The workflow transition was not completed.');
      }
    });
  };

  const title = initialSection === 'requisitions' ? 'Requisition desk'
    : initialSection === 'orders' ? 'Purchase order desk'
    : initialSection === 'receipts' ? 'Goods receiving'
    : 'Procurement command center';

  return (
    <div className="space-y-5 text-[var(--sami-text)]" data-purchase-workspace="specialist">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--sami-muted)]">Source-to-receipt procurement</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sami-muted)]">Track requisitions, supplier orders and goods receipts in one workflow. Approval and Inventory posting still use SaMi’s guarded server-side business rules.</p>
        </div>
        <button type="button" className={neutralButton} onClick={() => void refresh()} disabled={loading || busy}><RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} /> Refresh</button>
      </header>

      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-4 text-sm leading-6">
        <strong>Posting control:</strong> only the server can approve requisitions, convert them into supplier orders or post a receipt. Posting a receipt updates Inventory; it is not a label-only status change.
      </div>

      {error ? <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">{notice}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Purchase requisitions', value: data.requisitions.total, detail: 'Internal demand requests', icon: FileText },
          { label: 'Open purchase orders', value: counts.openOrders, detail: 'Draft and confirmed orders', icon: Truck },
          { label: 'Receipts awaiting posting', value: counts.pendingReceipts, detail: 'Received or inspected goods', icon: PackageCheck },
          { label: 'Posted receipts', value: counts.postedReceipts, detail: 'Received into Inventory', icon: CheckCircle2 },
        ].map((item) => <article key={item.label} className={cardClass}><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-[var(--sami-muted)]">{item.label}</p><item.icon className="h-4 w-4 text-[var(--sami-muted)]" /></div><p className="mt-2 text-2xl font-semibold tabular-nums">{loading ? '—' : item.value.toLocaleString()}</p><p className="mt-1 text-[11px] text-[var(--sami-muted)]">{item.detail}</p></article>)}
      </section>

      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-[var(--sami-muted)]" /><h2 className="text-base font-semibold">{initialSection === 'overview' ? 'Procurement workflow queue' : title}</h2></div><p className="mt-1 text-xs text-[var(--sami-muted)]">Company-scoped records; showing up to 50 per register.</p></div>
          <label className="relative block w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sami-muted)]" /><input className={inputClass + ' pl-9'} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reference, supplier, status…" /></label>
        </div>
        {initialSection === 'overview' ? <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setFocusTable('all')} className={focusTable === 'all' ? primaryButton : neutralButton}>All registers</button>{TABLES.map((table) => <button type="button" key={table.key} onClick={() => setFocusTable(table.key)} className={focusTable === table.key ? primaryButton : neutralButton}>{table.label}</button>)}<button type="button" onClick={() => { setFilter('all'); setSearch(''); setFocusTable('all'); }} className={neutralButton}>Clear filters</button></div> : null}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--sami-muted)]">Status
            <select className={inputClass + ' w-44'} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All statuses</option>{['draft','submitted','approved','rejected','converted','confirmed','received','inspected','posted','closed','cancelled'].map((status) => <option value={status} key={status}>{pretty(status)}</option>)}</select>
          </label>
          <div className="flex flex-wrap gap-2">
            {initialSection !== 'requisitions' && availableTableKeys.includes('purchase_requisitions') ? <Link className={neutralButton} href={tableHref('purchase_requisitions')}>Open requisitions register <ArrowRight className="h-3.5 w-3.5" /></Link> : null}
            {initialSection !== 'orders' && availableTableKeys.includes('purchase_orders') ? <Link className={neutralButton} href={tableHref('purchase_orders')}>Open PO register <ArrowRight className="h-3.5 w-3.5" /></Link> : null}
            {initialSection !== 'receipts' && availableTableKeys.includes('purchase_receipts') ? <Link className={neutralButton} href={tableHref('purchase_receipts')}>Open receipt register <ArrowRight className="h-3.5 w-3.5" /></Link> : null}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[860px] border-collapse text-left text-sm"><thead><tr className="border-b border-[var(--sami-border)] text-[10px] uppercase tracking-wide text-[var(--sami-muted)]"><th className="px-3 py-3">Reference</th><th className="px-3 py-3">Supplier / detail</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Due / created</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th></tr></thead><tbody>
          {entries.map(({ table, row }) => {
            const status = stringValue(row, 'status', 'state').toLowerCase();
            const actions = canTransition ? actionList(table, status) : [];
            return <tr key={table + ':' + stringValue(row,'id')} className="border-b border-[var(--sami-border)]/70 last:border-0">
              <td className="px-3 py-3"><div className="font-mono text-xs font-semibold">{labelFor(row, table)}</div><div className="mt-1 text-[10px] text-[var(--sami-muted)]">{table === 'purchase_requisitions' ? 'Requisition' : table === 'purchase_orders' ? 'Purchase order' : 'Goods receipt'}</div></td>
              <td className="px-3 py-3"><div className="font-medium">{stringValue(row,'supplier_name','supplier_display_name','vendor_name','supplier','description','name') || '—'}</div><div className="mt-1 text-[11px] text-[var(--sami-muted)]">{table === 'purchase_receipts' ? 'PO: ' + (stringValue(row,'purchase_order_number','order_number','purchase_order_id') || '—') : stringValue(row,'requester_name','department_name','expected_delivery_date','need_by_date') || '—'}</div></td>
              <td className="px-3 py-3 tabular-nums text-xs">{money(row)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--sami-muted)]">{displayDate(stringValue(row,'expected_date','expected_delivery_date','needed_by','need_by_date','order_date','receipt_date','created_at'))}</td>
              <td className="px-3 py-3"><Status value={status} /></td>
              <td className="px-3 py-3"><div className="flex max-w-[320px] flex-wrap gap-1.5">{actions.map((action) => <button type="button" key={action.next} disabled={busy} className={action.tone === 'primary' ? primaryButton : action.tone === 'danger' ? dangerButton : neutralButton} onClick={() => performTransition(table, row, action)}>{action.label}</button>)}{!actions.length ? <span className="text-[11px] text-[var(--sami-muted)]">{canTransition ? 'No action available' : 'Workflow permission required'}</span> : null}</div></td>
            </tr>;
          })}
          {!loading && entries.length === 0 ? <tr><td colSpan={6} className="px-4 py-12 text-center"><AlertCircle className="mx-auto h-5 w-5 text-[var(--sami-muted)]" /><p className="mt-2 text-sm font-medium">No procurement records match this view</p><p className="mt-1 text-xs text-[var(--sami-muted)]">Create a record in the relevant register or widen your filters.</p></td></tr> : null}
        </tbody></table></div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          { title: 'Requisitions', body: 'Validate demand, submit for review, approve and convert approved requests into supplier orders.', href: tableHref('purchase_requisitions'), icon: FileText },
          { title: 'Purchase orders', body: 'Confirm supplier orders and track received quantities against each order line.', href: tableHref('purchase_orders'), icon: Truck },
          { title: 'Goods receipts', body: 'Record received and rejected quantities; post accepted stock through the guarded Inventory workflow.', href: tableHref('purchase_receipts'), icon: PackageCheck },
        ].map((item) => <Link key={item.title} href={item.href} className={cardClass + ' block transition hover:border-blue-500/40'}><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{item.title}</h3><item.icon className="h-4 w-4 text-[var(--sami-muted)]" /></div><p className="mt-2 text-xs leading-5 text-[var(--sami-muted)]">{item.body}</p><span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-300">Open register <ArrowRight className="h-3.5 w-3.5" /></span></Link>)}
      </section>
    </div>
  );
}
