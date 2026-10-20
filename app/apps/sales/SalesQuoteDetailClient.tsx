'use client';

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  FileDown,
  FileText,
  History,
  Info,
  Layers,
  PackageCheck,
  Pencil,
  Receipt,
  Send,
  ShoppingCart,
  Sparkles,
  Truck,
  X,
  XCircle,
} from 'lucide-react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';

import SaMiOverlay from '@/app/components/SaMiOverlay';
import { useSaMiOverlay } from '@/app/components/useSaMiOverlay';
import SalesQuoteComposer from '@/app/apps/sales/SalesQuoteComposer';
import SalesOptionalProductsEditor from '@/app/apps/sales/SalesOptionalProductsEditor';

import type {
  SalesQuoteDetail,
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';

type RevisionDiffChange = {
  type: 'added' | 'removed' | 'changed';
  section: string;
  label: string;
  field: string;
  before: string | null;
  after: string | null;
};

type RevisionDiffResponse = {
  quoteId: string;
  revisionNumber: number;
  comparedToRevisionNumber: number;
  hasComparison: boolean;
  changes: RevisionDiffChange[];
  message: string | null;
  loading: boolean;
};

function money(value: number, currency: string) {
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

function prettyLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function Badge({ value, tone }: { value: string; tone?: 'blue' | 'emerald' | 'amber' | 'red' | 'slate' }) {
  const resolved =
    tone ||
    (value === 'accepted' || value === 'approved' || value === 'sent'
      ? 'emerald'
      : value === 'rejected' || value === 'cancelled' || value === 'expired'
        ? 'red'
        : value === 'pending'
          ? 'amber'
          : value === 'draft'
            ? 'slate'
            : 'blue');
  const cls =
    resolved === 'emerald'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30'
      : resolved === 'red'
        ? 'bg-red-50 text-red-700 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30'
        : resolved === 'amber'
          ? 'bg-amber-50 text-amber-700 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/30'
          : resolved === 'slate'
            ? 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/30'
            : 'bg-blue-50 text-blue-700 ring-blue-500/20 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-500/30';
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ring-1 ring-inset ${cls}`}
    >
      {prettyLabel(value)}
    </span>
  );
}

export default function SalesQuoteDetailClient({
  quote,
  workspace,
}: {
  quote: SalesQuoteDetail;
  workspace: SalesWorkspaceData;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revisionDiff, setRevisionDiff] = useState<RevisionDiffResponse | null>(null);
  const [revisionDiffBusy, setRevisionDiffBusy] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const { overlay, closeOverlay, showSuccess, showError, showWarning, confirmAction } = useSaMiOverlay();
  const isBusy = busy || pending;

  const quoteActivity = useMemo(
    () =>
      [
        ...quote.history.map((item) => ({
          id: 'status-' + item.id,
          kind: 'Lifecycle' as const,
          title:
            (item.fromStatus ? prettyLabel(item.fromStatus) + ' → ' : '') +
            prettyLabel(item.toStatus),
          detail: item.reason,
          at: item.createdAt,
        })),
        ...quote.revisions.map((item) => ({
          id: 'revision-' + item.id,
          kind: 'Revision' as const,
          title: 'Revision ' + item.revisionNumber + ' created',
          detail: item.reason,
          at: item.createdAt,
        })),
        ...quote.customerRevisionRequests.map((item) => ({
          id: 'change-' + item.id,
          kind: 'Customer request' as const,
          title: (item.requesterName || 'Customer') + ' requested a change',
          detail: item.reason,
          at: item.createdAt,
        })),
        ...quote.deliveries.map((item) => ({
          id: 'delivery-' + item.id,
          kind: 'Delivery' as const,
          title: item.channel + ' delivery ' + prettyLabel(item.status),
          detail:
            [item.provider, item.errorCode ? 'Error: ' + item.errorCode : null]
              .filter(Boolean)
              .join(' · ') || null,
          at: item.createdAt,
        })),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [quote.history, quote.revisions, quote.customerRevisionRequests, quote.deliveries],
  );

  async function request(payload: Record<string, unknown>) {
    if (inFlight.current) throw new Error('Another Sales action is still being saved.');
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch('/api/apps/sales', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        result?: Record<string, unknown>;
      };
      if (!response.ok || body.success !== true) {
        throw new Error(body.error || 'SaMi could not complete the Sales action.');
      }
      startTransition(() => router.refresh());
      return body.result || {};
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function run(payload: Record<string, unknown>, message: string) {
    try {
      const result = await request(payload);
      if (
        payload.action === 'request_quote_approval' &&
        result.approvalStatus === 'not_required'
      ) {
        showSuccess(
          'No approval required',
          'No active approval policy or threshold requires internal approval for this quotation.',
        );
      } else {
        showSuccess('Action completed', message);
      }
      return result;
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'SaMi could not complete the Sales action.';
      if (messageText.includes('still being saved')) {
        showWarning('Action already in progress', messageText);
      } else {
        showError('Sales action failed', messageText);
      }
      return null;
    }
  }

  async function loadRevisionDiff(revisionNumber: number) {
    setRevisionDiffBusy(revisionNumber);
    setRevisionDiff({
      quoteId: quote.id,
      revisionNumber,
      comparedToRevisionNumber: quote.currentRevision,
      hasComparison: false,
      changes: [],
      message: 'Loading revision comparison…',
      loading: true,
    });
    try {
      const params = new URLSearchParams({
        revisionDiff: '1',
        quoteId: quote.id,
        revisionNumber: String(revisionNumber),
      });
      const response = await fetch('/api/apps/sales?' + params.toString(), {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        revisionDiff?: Omit<RevisionDiffResponse, 'loading'>;
      };
      if (!response.ok || body.success !== true || !body.revisionDiff) {
        throw new Error(body.error || 'SaMi could not compare this quotation revision.');
      }
      setRevisionDiff({ ...body.revisionDiff, loading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'SaMi could not compare this quotation revision.';
      setRevisionDiff(null);
      showError('Revision comparison failed', message);
    } finally {
      setRevisionDiffBusy(null);
    }
  }

  const canEdit =
    workspace.capabilities.canEdit &&
    quote.status === 'draft' &&
    !['pending', 'approved'].includes(quote.approvalStatus);

  const quoteActivityShown = quoteActivity.slice(0, 10);

  return (
    <>
      <SaMiOverlay {...overlay} onClose={closeOverlay} />

      {revisionDiff ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-3 sm:p-6"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="sales-revision-diff-title"
            className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--sami-border)] p-4 sm:p-5">
              <div>
                <h2 id="sales-revision-diff-title" className="text-base font-black">
                  Compare with previous revision
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Revision {revisionDiff.revisionNumber} compared with current revision{' '}
                  {revisionDiff.comparedToRevisionNumber}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close revision comparison"
                onClick={() => setRevisionDiff(null)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-3 text-xs font-black"
              >
                <X className="h-3.5 w-3.5" /> Close
              </button>
            </div>
            <div className="max-h-[calc(90vh-90px)] overflow-auto p-4 sm:p-5">
              {revisionDiff.loading ? (
                <p className="py-8 text-center text-sm text-slate-500">Loading revision comparison…</p>
              ) : revisionDiff.message && !revisionDiff.hasComparison ? (
                <p className="rounded-xl border border-[var(--sami-border)] p-4 text-sm text-slate-500">
                  {revisionDiff.message}
                </p>
              ) : revisionDiff.changes.length === 0 ? (
                <p className="rounded-xl border border-[var(--sami-border)] p-4 text-sm text-slate-500">
                  No quotation, line-item, or optional-product changes were found between
                  these revisions.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[var(--sami-border)]">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="border-b border-[var(--sami-border)] text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                      <tr>
                        <th scope="col" className="px-3 py-3">Change</th>
                        <th scope="col" className="px-3 py-3">Section / item</th>
                        <th scope="col" className="px-3 py-3">Field</th>
                        <th scope="col" className="px-3 py-3">Previous value</th>
                        <th scope="col" className="px-3 py-3">This revision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sami-border)]">
                      {revisionDiff.changes.map((change, index) => (
                        <tr
                          key={
                            change.type +
                            '-' +
                            change.section +
                            '-' +
                            change.label +
                            '-' +
                            change.field +
                            '-' +
                            index
                          }
                        >
                          <td className="px-3 py-3">
                            <span
                              className={
                                'inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase ring-1 ring-inset ' +
                                (change.type === 'added'
                                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30'
                                  : change.type === 'removed'
                                    ? 'bg-red-50 text-red-700 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30'
                                    : 'bg-blue-50 text-blue-700 ring-blue-500/20 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-500/30')
                              }
                            >
                              {change.type}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-bold">{change.section}</span>
                            <span className="mt-1 block text-slate-500 dark:text-slate-400">
                              {change.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-semibold">{change.field}</td>
                          <td className="max-w-[260px] whitespace-pre-wrap break-words px-3 py-3 text-slate-500 dark:text-slate-400">
                            {change.before ?? '—'}
                          </td>
                          <td className="max-w-[260px] whitespace-pre-wrap break-words px-3 py-3">
                            {change.after ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      <div className="min-w-0 space-y-4">
        {/* ---------- Header card ---------- */}
        <section className="sami-surface rounded-[26px] p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black sm:text-2xl">{quote.quoteNumber}</h1>
                <Badge value={quote.status} />
                <Badge value={quote.approvalStatus} />
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 ring-1 ring-inset ring-slate-500/20 dark:text-slate-300">
                  <History className="h-3 w-3" /> Revision {quote.currentRevision}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                <span className="font-bold">{quote.customerName}</span> ·{' '}
                <span className="tabular-nums">
                  {money(quote.totalAmount, quote.currency)}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {quote.quoteDate}
                {quote.validUntil ? ' · valid until ' + quote.validUntil : ''}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/apps/sales"
                className="inline-flex h-10 items-center rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
              >
                Sales
              </Link>

              {workspace.capabilities.canManageSettings ? (
                <Link
                  href="/apps/sales/approvals"
                  className="inline-flex h-10 items-center rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
                >
                  Approval policies
                </Link>
              ) : null}

              <a
                href={'/api/apps/sales/quotes/' + quote.id + '/pdf'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
              >
                <FileDown className="h-4 w-4" /> PDF
              </a>

              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setEditing((current) => !current)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
                >
                  <Pencil className="h-4 w-4" /> {editing ? 'Close editor' : 'Edit draft'}
                </button>
              ) : null}

              {workspace.capabilities.canCreate ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    void run(
                      { action: 'duplicate_quote', quoteId: quote.id },
                      'A new draft quotation was created from this quotation.',
                    )
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-60"
                >
                  <Copy className="h-4 w-4" /> Duplicate
                </button>
              ) : null}

              {workspace.capabilities.canRevise &&
              ['sent', 'viewed', 'rejected', 'expired'].includes(quote.status) ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    void run(
                      {
                        action: 'revise_quote',
                        quoteId: quote.id,
                        reason: 'Commercial terms revised',
                      },
                      'A new editable quotation revision was opened while the previous revision was preserved.',
                    )
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-60"
                >
                  <Pencil className="h-4 w-4" /> Revise
                </button>
              ) : null}
            </div>
          </div>
        </section>

        {/* ---------- Inline editor ---------- */}
        {editing && canEdit ? (
          <section className="sami-surface rounded-[26px] p-4 sm:p-5">
            <SalesQuoteComposer
              data={workspace}
              salespeople={workspace.salespeople}
              currentSalespersonId={workspace.currentSalespersonId}
              initialQuote={quote}
              busy={isBusy}
              onCancel={() => setEditing(false)}
              onLocalError={(message) => showError('Exchange rate required', message)}
              onSave={async (payload) => {
                const result = await run(payload, 'Quotation updated successfully.');
                if (result) setEditing(false);
                return Boolean(result);
              }}
            />
          </section>
        ) : null}

        <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_370px]">
          {/* ---------- Left column ---------- */}
          <div className="min-w-0 space-y-4">
            {/* Lines */}
            <div className="sami-surface overflow-hidden rounded-[24px]">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--sami-border)] p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                    <Layers className="h-3.5 w-3.5" />
                  </span>
                  <h2 className="text-sm font-black">Commercial lines</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {quote.lines.length} line{quote.lines.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="border-b border-[var(--sami-border)] text-left text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    <tr>
                      <th scope="col" className="px-4 py-3">Description</th>
                      <th scope="col" className="px-4 py-3 text-right">Qty</th>
                      <th scope="col" className="px-4 py-3 text-right">Price</th>
                      <th scope="col" className="px-4 py-3 text-right">Discount</th>
                      <th scope="col" className="px-4 py-3 text-right">Tax</th>
                      {workspace.capabilities.canViewMargin ? (
                        <th scope="col" className="px-4 py-3 text-right">Cost / margin</th>
                      ) : null}
                      <th scope="col" className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--sami-border)]">
                    {quote.lines.map((line) => (
                      <tr key={line.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <p className="font-bold">{line.description}</p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {[line.sku, line.unit, line.taxName].filter(Boolean).join(' · ')}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{line.quantity}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {money(line.unitPrice, quote.currency)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {money(line.discountAmount, quote.currency)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {money(line.taxAmount, quote.currency)}
                        </td>
                        {workspace.capabilities.canViewMargin ? (
                          <td className="px-4 py-3 text-right tabular-nums">
                            <p>{money(line.costTotal || 0, quote.currency)}</p>
                            <p className="mt-1 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                              {money(line.marginAmount || 0, quote.currency)} ·{' '}
                              {(line.marginPercent || 0).toFixed(1)}%
                            </p>
                          </td>
                        ) : null}
                        <td className="px-4 py-3 text-right font-black tabular-nums">
                          {money(line.lineTotal, quote.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Addresses + notes */}
            <div className="grid gap-4 lg:grid-cols-2">
              <TextCard title="Customer notes" value={quote.notes} />
              <TextCard title="Terms & conditions" value={quote.terms} />
              <TextCard title="Billing address" value={quote.billingAddress} />
              <TextCard title="Shipping address" value={quote.shippingAddress} />
            </div>

            {/* Optional items editor */}
            {quote.status === 'draft' && workspace.capabilities.canManageOptionalProducts ? (
              <SalesOptionalProductsEditor
                quote={quote}
                workspace={workspace}
                busy={isBusy}
                onSave={async (items) => {
                  const result = await run(
                    { action: 'save_optional_items', quoteId: quote.id, items },
                    'Optional products saved.',
                  );
                  return Boolean(result);
                }}
              />
            ) : null}

            {/* Optional products view */}
            {quote.optionalItems.length > 0 ? (
              <div className="sami-surface rounded-[24px] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300">
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                        Upsell
                      </p>
                      <h2 className="text-sm font-black">Optional products</h2>
                    </div>
                  </div>
                  <span className="text-xs font-black text-slate-500 dark:text-slate-400">
                    {quote.optionalItems.length}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {quote.optionalItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-2 rounded-xl border border-[var(--sami-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-xs font-black">{item.description}</p>
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                          {item.quantity} {item.unit} ·{' '}
                          {money(item.unitPrice, quote.currency)}
                        </p>
                      </div>
                      <Badge value={item.isSelected ? 'selected' : 'optional'} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Acceptance evidence */}
            {quote.acceptedAt ? (
              <div className="sami-surface rounded-[24px] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-600 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> Customer acceptance
                    </p>
                    <h2 className="mt-1 text-sm font-black">Signed commercial commitment</h2>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                      Accepted by
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {quote.acceptedByName || 'Name not recorded'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                      Accepted at
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {new Date(quote.acceptedAt).toLocaleString()}
                    </p>
                  </div>
                  {quote.acceptedByEmail ? (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                        Signer email
                      </p>
                      <p className="mt-1 break-words text-sm">{quote.acceptedByEmail}</p>
                    </div>
                  ) : null}
                  {quote.acceptanceNote ? (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                        Acceptance note
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{quote.acceptanceNote}</p>
                    </div>
                  ) : null}
                </div>
                {quote.acceptedSignatureConsentText ? (
                  <div className="mt-4 rounded-xl border border-[var(--sami-border)] p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                      Electronic signature consent recorded
                    </p>
                    <p className="mt-2 text-sm leading-6">{quote.acceptedSignatureConsentText}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Customer change requests */}
            {quote.customerRevisionRequests.length > 0 ? (
              <div className="sami-surface rounded-[24px] p-4">
                <h2 className="text-sm font-black">Customer change requests</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  These customer requests are part of the quotation activity trail; they do
                  not change the quotation or approval status by themselves.
                </p>
                <div className="mt-3 space-y-3">
                  {quote.customerRevisionRequests.map((request) => (
                    <div
                      key={request.id}
                      className="rounded-xl border border-[var(--sami-border)] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-black">
                          {request.requesterName || 'Customer'}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {new Date(request.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {request.requesterEmail ? (
                        <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">
                          {request.requesterEmail}
                        </p>
                      ) : null}
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                        {request.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Revisions */}
            {quote.revisions.length > 0 ? (
              <div className="sami-surface rounded-[24px] p-4">
                <h2 className="text-sm font-black">Revision history</h2>
                <div className="mt-3 space-y-2">
                  {quote.revisions.map((revision) => (
                    <div
                      key={revision.id}
                      className="rounded-xl border border-[var(--sami-border)] p-3"
                    >
                      <p className="text-xs font-black">Revision {revision.revisionNumber}</p>
                      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                        {revision.createdAt}
                        {revision.reason ? ' · ' + revision.reason : ''}
                      </p>
                      <button
                        type="button"
                        disabled={isBusy || revisionDiffBusy !== null}
                        onClick={() => void loadRevisionDiff(revision.revisionNumber)}
                        className="mt-3 h-9 rounded-lg border border-[var(--sami-border)] px-3 text-[11px] font-black disabled:opacity-60"
                      >
                        {revisionDiffBusy === revision.revisionNumber
                          ? 'Comparing…'
                          : 'Compare with previous revision'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Lifecycle history */}
            <div className="sami-surface rounded-[24px] p-4">
              <h2 className="text-sm font-black">Lifecycle history</h2>
              <div className="mt-3 space-y-3">
                {quote.history.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No lifecycle changes recorded yet.
                  </p>
                ) : (
                  quote.history.map((item) => (
                    <div
                      key={item.id}
                      className="border-b border-[var(--sami-border)] pb-3 last:border-0 last:pb-0"
                    >
                      <p className="text-xs font-black">
                        {item.fromStatus ? prettyLabel(item.fromStatus) + ' → ' : ''}
                        {prettyLabel(item.toStatus)}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {item.createdAt}
                        {item.reason ? ' · ' + item.reason : ''}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quote activity */}
            <section
              className="sami-surface rounded-[24px] p-4"
              aria-labelledby="quote-activity-heading"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 id="quote-activity-heading" className="inline-flex items-center gap-1.5 text-sm font-black">
                    <Activity className="h-4 w-4" /> Quote activity
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    A single chronological view of lifecycle changes, revisions, customer
                    requests and delivery attempts.
                  </p>
                </div>
                <span className="rounded-full border border-[var(--sami-border)] px-2.5 py-1 text-[10px] font-bold">
                  {quoteActivity.length} event{quoteActivity.length === 1 ? '' : 's'}
                </span>
              </div>
              <ol className="mt-4 space-y-3">
                {quoteActivityShown.map((event, index) => (
                  <li key={event.id} className="relative pl-5">
                    {index < quoteActivityShown.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="absolute left-[5px] top-3 h-[calc(100%+8px)] w-px bg-[var(--sami-border)]"
                      />
                    ) : null}
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-blue-600 ring-4 ring-blue-500/10"
                    />
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {event.kind}
                        </p>
                        <p className="mt-0.5 text-xs font-bold">{event.title}</p>
                        {event.detail ? (
                          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {event.detail}
                          </p>
                        ) : null}
                      </div>
                      <time
                        dateTime={event.at}
                        className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400"
                      >
                        {new Date(event.at).toLocaleString()}
                      </time>
                    </div>
                  </li>
                ))}
                {quoteActivity.length === 0 ? (
                  <li className="text-xs text-slate-500 dark:text-slate-400">
                    No quotation activity has been recorded yet.
                  </li>
                ) : null}
              </ol>
              {quoteActivity.length > 10 ? (
                <p className="mt-3 border-t border-[var(--sami-border)] pt-3 text-[10px] text-slate-500 dark:text-slate-400">
                  Showing the 10 most recent events. Detailed records remain available in the
                  sections above.
                </p>
              ) : null}
            </section>

            {/* Deliveries */}
            <div className="sami-surface rounded-[24px] p-4">
              <h2 className="inline-flex items-center gap-1.5 text-sm font-black">
                <Truck className="h-4 w-4" /> Delivery log
              </h2>
              <div className="mt-3 space-y-2">
                {quote.deliveries.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    This quotation has not been delivered yet.
                  </p>
                ) : (
                  quote.deliveries.map((delivery) => (
                    <div
                      key={delivery.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--sami-border)] p-3"
                    >
                      <div>
                        <p className="text-xs font-black capitalize">{delivery.channel}</p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {delivery.provider || 'provider'} · {delivery.createdAt}
                        </p>
                      </div>
                      <Badge value={delivery.status} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* ---------- Right column (aside) ---------- */}
          <aside className="min-w-0 space-y-4">
            {/* Summary */}
            <div className="sami-surface rounded-[24px] p-4">
              <h2 className="inline-flex items-center gap-1.5 text-sm font-black">
                <Receipt className="h-4 w-4" /> Commercial summary
              </h2>
              <div className="mt-3 space-y-2 text-sm">
                <Summary label="Subtotal" value={money(quote.subtotal, quote.currency)} />
                <Summary
                  label="Discount"
                  value={'− ' + money(quote.discountTotal, quote.currency)}
                />
                <Summary label="Tax" value={money(quote.taxTotal, quote.currency)} />
                <Summary
                  label="Shipping"
                  value={money(quote.shippingTotal, quote.currency)}
                />
                <Summary
                  label="Deposit / advance"
                  value={
                    quote.depositRequiredAmount > 0
                      ? money(quote.depositRequiredAmount, quote.currency)
                      : 'None required'
                  }
                />
                {workspace.capabilities.canViewMargin && quote.marginAmount !== null ? (
                  <>
                    <Summary
                      label="Margin"
                      value={money(quote.marginAmount, quote.currency)}
                    />
                    <Summary
                      label="Margin %"
                      value={(quote.marginPercent || 0).toFixed(1) + '%'}
                    />
                  </>
                ) : null}
                <div className="flex items-center justify-between border-t border-[var(--sami-border)] pt-3">
                  <span className="font-black">Total</span>
                  <span className="text-lg font-black tabular-nums text-blue-700 dark:text-blue-300">
                    {money(quote.totalAmount, quote.currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Request internal approval */}
            {['draft', 'not_required', 'rejected'].includes(quote.approvalStatus) &&
            workspace.capabilities.canEdit ? (
              <ActionCard
                title="Internal approval"
                text="Submit this draft for the company Sales approval policy."
              >
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    void run(
                      { action: 'request_quote_approval', quoteId: quote.id },
                      'Quotation submitted for internal approval.',
                    )
                  }
                  className="h-11 w-full rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-60"
                >
                  Request approval
                </button>
              </ActionCard>
            ) : null}

            {/* Review approval */}
            {quote.approvalStatus === 'pending' && workspace.capabilities.canApproveInternally ? (
              <form
                className="sami-surface rounded-[24px] p-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  await run(
                    {
                      action: 'review_quote_approval',
                      quoteId: quote.id,
                      decision: form.get('decision'),
                      reason: form.get('reason'),
                    },
                    'Quotation approval decision recorded.',
                  );
                }}
              >
                <h2 className="text-sm font-black">Review approval</h2>
                <select
                  name="decision"
                  aria-label="Approval decision"
                  className="mt-3 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="approve">Approve</option>
                  <option value="reject">Reject</option>
                </select>
                <textarea
                  name="reason"
                  rows={3}
                  placeholder="Reason for rejection when applicable"
                  className="mt-2 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={isBusy}
                  className="mt-2 h-11 w-full rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-60"
                >
                  Submit decision
                </button>
              </form>
            ) : null}

            {/* Withdraw approval */}
            {quote.approvalStatus === 'pending' && quote.canWithdrawApproval ? (
              <form
                className="sami-surface rounded-[24px] border border-amber-500/30 p-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  await run(
                    {
                      action: 'cancel_quote_approval',
                      quoteId: quote.id,
                      reason: form.get('reason'),
                    },
                    'Approval request withdrawn.',
                  );
                }}
              >
                <h2 className="text-sm font-black">Withdraw approval request</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Withdraw the pending internal approval request and return this quotation to
                  draft review.
                </p>
                <textarea
                  name="reason"
                  rows={2}
                  maxLength={2000}
                  placeholder="Reason for withdrawal (optional)"
                  className="mt-3 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={isBusy}
                  className="mt-2 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 text-xs font-black disabled:opacity-60"
                >
                  <AlertTriangle className="h-4 w-4" /> Withdraw approval request
                </button>
              </form>
            ) : null}

            {/* Deliver */}
            {workspace.capabilities.canSend &&
            ['draft', 'sent', 'viewed'].includes(quote.status) &&
            !['draft', 'pending', 'rejected'].includes(quote.approvalStatus) ? (
              <form
                className="sami-surface rounded-[24px] p-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const channels = ['email', 'whatsapp', 'sms'].filter(
                    (channel) => form.get(channel) === 'on',
                  );
                  await run(
                    { action: 'send_quote', quoteId: quote.id, channels },
                    'Quotation delivery completed.',
                  );
                }}
              >
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-blue-600" />
                  <h2 className="text-sm font-black">Deliver quotation</h2>
                </div>
                <div className="mt-3 grid gap-2">
                  {(['email', 'whatsapp', 'sms'] as const).map((channel) => (
                    <label
                      key={channel}
                      className="flex items-center gap-2 rounded-xl border border-[var(--sami-border)] p-3 text-xs font-bold capitalize"
                    >
                      <input
                        name={channel}
                        type="checkbox"
                        defaultChecked={channel === 'email'}
                      />
                      {channel}
                    </label>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="mt-3 h-11 w-full rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-60"
                >
                  Send securely
                </button>
              </form>
            ) : null}

            {/* Record customer response */}
            {workspace.capabilities.canApprove &&
            ['draft', 'sent', 'viewed'].includes(quote.status) ? (
              <form
                className="sami-surface rounded-[24px] p-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  await run(
                    {
                      action: 'change_quote_status',
                      quoteId: quote.id,
                      status: form.get('status'),
                      reason: form.get('reason'),
                    },
                    'Customer response recorded.',
                  );
                }}
              >
                <h2 className="text-sm font-black">Record customer response</h2>
                <select
                  name="status"
                  aria-label="Customer response"
                  className="mt-3 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>
                <textarea
                  name="reason"
                  rows={3}
                  placeholder="Reason / note"
                  className="mt-2 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={isBusy}
                  className="mt-2 h-11 w-full rounded-xl border border-[var(--sami-border)] text-xs font-black disabled:opacity-60"
                >
                  Save response
                </button>
              </form>
            ) : null}

            {/* Convert accepted */}
            {quote.status === 'accepted' &&
            workspace.capabilities.canConvert &&
            !quote.salesOrderId ? (
              <ActionCard
                title="Convert accepted business"
                text="Create a sales order, or create a draft invoice through the locked Invoicing workflow."
              >
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    void run(
                      { action: 'quote_to_order', quoteId: quote.id },
                      'Sales order created from the accepted quotation.',
                    )
                  }
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-60"
                >
                  <ShoppingCart className="h-4 w-4" /> Create sales order
                </button>

                <form
                  className="mt-2 space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const rawExchangeRate = form.get('exchangeRate');
                    const enteredRate =
                      typeof rawExchangeRate === 'string' ? rawExchangeRate.trim() : '';

                    if (
                      quote.currency !== workspace.company.currency &&
                      (!enteredRate ||
                        !Number.isFinite(Number(enteredRate)) ||
                        Number(enteredRate) <= 0)
                    ) {
                      showError(
                        'Exchange rate required',
                        'Enter the exchange rate to ' +
                          workspace.company.currency +
                          ' before saving.',
                      );
                      return;
                    }

                    confirmAction({
                      title: 'Create draft invoice?',
                      message:
                        'SaMi will create or reuse the sales order, then hand invoice creation to the locked Invoicing service.',
                      confirmLabel: 'Create invoice',
                      onConfirm: () => {
                        void run(
                          {
                            action: 'quote_to_invoice',
                            quoteId: quote.id,
                            exchangeRate:
                              quote.currency === workspace.company.currency
                                ? 1
                                : Number(form.get('exchangeRate') || 0),
                          },
                          'Draft invoice created.',
                        );
                      },
                    });
                  }}
                >
                  {quote.currency !== workspace.company.currency ? (
                    <label className="block rounded-xl border border-[var(--sami-border)] p-3">
                      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                        Exchange rate
                      </span>
                      <input
                        name="exchangeRate"
                        type="number"
                        min="0.00000001"
                        step="0.00000001"
                        placeholder={
                          '1 ' + quote.currency + ' in ' + workspace.company.currency
                        }
                        className="mt-2 h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                      />
                      <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                        Required when the quotation currency differs from the company
                        currency.
                      </span>
                    </label>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isBusy}
                    className="h-11 w-full rounded-xl border border-[var(--sami-border)] text-xs font-black disabled:opacity-60"
                  >
                    Create draft invoice
                  </button>
                </form>
              </ActionCard>
            ) : null}

            {quote.salesOrderId ? (
              <LinkCard
                label="Sales order"
                href={'/apps/sales/orders/' + quote.salesOrderId}
                value="Open converted order"
                icon={<PackageCheck className="h-4 w-4" />}
              />
            ) : null}

            {quote.latestInvoiceId ? (
              <LinkCard
                label="Latest invoice"
                href={'/apps/invoicing/' + quote.latestInvoiceId}
                value="Open invoice"
                icon={<Receipt className="h-4 w-4" />}
              />
            ) : null}

            {/* Cancel quotation */}
            {workspace.capabilities.canCancel &&
            !quote.salesOrderId &&
            ['draft', 'sent', 'viewed', 'accepted'].includes(quote.status) ? (
              <form
                className="sami-surface rounded-[24px] p-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  await run(
                    {
                      action: 'change_quote_status',
                      quoteId: quote.id,
                      status: 'cancelled',
                      reason: form.get('reason'),
                    },
                    'Quotation cancelled.',
                  );
                }}
              >
                <h2 className="inline-flex items-center gap-1.5 text-sm font-black text-red-700 dark:text-red-300">
                  <XCircle className="h-4 w-4" /> Cancel quotation
                </h2>
                <textarea
                  name="reason"
                  required
                  rows={3}
                  placeholder="Cancellation reason"
                  className="mt-3 w-full rounded-xl border border-red-500/30 bg-transparent px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={isBusy}
                  className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 text-xs font-black text-red-700 disabled:opacity-60 dark:text-red-300"
                >
                  <X className="h-4 w-4" /> Cancel quotation
                </button>
              </form>
            ) : null}
          </aside>
        </section>
      </div>
    </>
  );
}

function TextCard({ title, value }: { title: string; value: string | null }) {
  return (
    <div className="sami-surface rounded-[22px] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
        {title}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
        {value || '—'}
      </p>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}

function ActionCard({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <div className="sami-surface rounded-[24px] p-4">
      <h2 className="text-sm font-black">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{text}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function LinkCard({
  label,
  value,
  href,
  icon,
}: {
  label: string;
  value: string;
  href: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link href={href} className="sami-surface block rounded-[24px] p-4 transition hover:bg-slate-500/[0.04]">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-black text-blue-700 dark:text-blue-300">
        {icon}
        {value}
        <ArrowRight className="h-3.5 w-3.5" />
      </p>
    </Link>
  );
}