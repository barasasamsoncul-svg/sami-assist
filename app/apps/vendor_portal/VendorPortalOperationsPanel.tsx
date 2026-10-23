'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition, type FormEvent } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Mail, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';

type Section = 'overview' | 'accounts' | 'rfqs' | 'responses';
type ApiResponse<T> = { success?: boolean; result?: T; error?: string; code?: string };
type SupplierOption = { id: string; name: string; email: string };
type PurchaseRfqOption = { id: string; rfqNumber: string; currency: string; dueAt: string | null; status: string; description: string | null; neededBy: string | null };
type VendorAccount = { id: string; vendorReference: string | null; vendorName: string; email: string; status: string; lastLoginAt: string | null; accessExpiresAt: string | null; createdAt: string; supplierName: string | null; supplierStatus: string | null };
type PortalRfq = { id: string; vendorAccountId: string; purchaseRfqId: string | null; rfqNumber: string; title: string; description: string | null; dueAt: string | null; openedAt: string | null; respondedAt: string | null; status: string; invitationEmailStatus: string; createdAt: string; vendorName: string; email: string; currency: string };
type SupplierResponse = { id: string; portalRfqId: string; amount: string; currency: string; promisedDate: string | null; terms: string | null; submittedAt: string | null; status: string; rfqNumber: string; title: string; vendorName: string; email: string; vendorReference: string | null; purchaseRfqId: string };
type VendorPortalOverview = { summary: { accounts: number; invitations: number; awaitingResponse: number; responsesPendingReview: number; deliveryFailures: number }; accounts: VendorAccount[]; rfqs: PortalRfq[]; responses: SupplierResponse[]; availableSuppliers: SupplierOption[]; purchaseRfqs: PurchaseRfqOption[] };
const emptyData: VendorPortalOverview = { summary: { accounts: 0, invitations: 0, awaitingResponse: 0, responsesPendingReview: 0, deliveryFailures: 0 }, accounts: [], rfqs: [], responses: [], availableSuppliers: [], purchaseRfqs: [] };
const fieldClass = 'h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm text-[var(--sami-text)] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15';
const cardClass = 'rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-card)] p-4 shadow-[var(--sami-shadow-sm)]';
const primaryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50';
const neutralButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2 text-xs font-semibold text-[var(--sami-text)] hover:bg-[var(--sami-surface-soft)] disabled:opacity-50';
const dangerButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 disabled:opacity-50';

function pretty(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (v) => v.toUpperCase()); }
function showDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
function statusTone(status: string) {
  if (['sent','opened','submitted'].includes(status)) return 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300';
  if (['accepted','responded','delivered','active'].includes(status)) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (['rejected','cancelled','delivery_failed','expired','suspended'].includes(status)) return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
  return 'border-[var(--sami-border)] bg-[var(--sami-surface)] text-[var(--sami-muted)]';
}
function StatusPill({ value }: { value: string }) {
  return <span className={'inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ' + statusTone(value)}>{pretty(value || 'unknown')}</span>;
}
function Stat({ label, value, note, icon }: { label: string; value: number; note: string; icon: 'users' | 'mail' | 'clock' | 'check' | 'alert' }) {
  const Icon = icon === 'users' ? Users : icon === 'mail' ? Mail : icon === 'clock' ? Clock3 : icon === 'check' ? CheckCircle2 : AlertCircle;
  return <div className={cardClass}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-[var(--sami-muted)]">{label}</p><p className="mt-2 text-2xl font-black tracking-tight tabular-nums">{value.toLocaleString()}</p><p className="mt-1 text-[11px] text-[var(--sami-muted)]">{note}</p></div><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-300"><Icon className="h-4 w-4" /></span></div></div>;
}
function SectionTitle({ eyebrow, heading, copy }: { eyebrow: string; heading: string; copy: string }) {
  return <div className="mb-4"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-700 dark:text-blue-300">{eyebrow}</p><h2 className="mt-1 text-lg font-black tracking-tight">{heading}</h2><p className="mt-1 text-xs leading-5 text-[var(--sami-muted)]">{copy}</p></div>;
}

export default function VendorPortalOperationsPanel({ initialSection, canCreate, canTransition }: { initialSection: Section; canCreate: boolean; canTransition: boolean }) {
  const [data, setData] = useState<VendorPortalOverview>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [vendorAccountId, setVendorAccountId] = useState('');
  const [purchaseRfqId, setPurchaseRfqId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expiresOn, setExpiresOn] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/apps/vendor_portal/operations', { cache: 'no-store', headers: { Accept: 'application/json' } });
      const payload = await response.json() as ApiResponse<VendorPortalOverview>;
      if (!response.ok || payload.success !== true || !payload.result) throw new Error(payload.error || 'Vendor Portal data could not be loaded.');
      setData(payload.result);
      setError('');
      setSupplierId((current) => current || payload.result!.availableSuppliers[0]?.id || '');
      setVendorAccountId((current) => current || payload.result!.accounts.find((a) => a.status === 'active')?.id || '');
      setPurchaseRfqId((current) => current || payload.result!.purchaseRfqs[0]?.id || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Vendor Portal data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const post = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/apps/vendor_portal/operations', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json() as ApiResponse<Record<string, unknown>>;
    if (!response.ok || result.success !== true) throw new Error(result.error || 'Vendor Portal could not complete the request.');
    return result.result;
  }, []);

  async function runAction(payload: Record<string, unknown>, successMessage: string) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await post(payload);
      setNotice(successMessage);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Vendor Portal could not complete the request.');
    } finally {
      setBusy(false);
    }
  }

  const createAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supplierId) { setError('Choose a Purchase supplier first.'); return; }
    void runAction({ action: 'create-account', supplierId }, 'Supplier account created and linked to the existing Purchase supplier.');
  };
  const issueRfq = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!vendorAccountId) { setError('Choose an active supplier portal account first.'); return; }
    if (!purchaseRfqId) { setError('Choose an existing Purchase RFQ first.'); return; }
    const expiresAt = expiresOn ? new Date(expiresOn + 'T23:59:59.000Z').toISOString() : undefined;
    void runAction({ action: 'issue-rfq', vendorAccountId, purchaseRfqId, title, description, expiresAt }, 'RFQ invitation sent. SaMi emailed the supplier a secure, expiring response link.');
    setTitle(''); setDescription(''); setExpiresOn('');
  };
  const decide = (responseId: string, decision: 'accepted' | 'rejected') => {
    void runAction({ action: 'decide-response', responseId, decision }, 'Supplier response ' + decision + '. The decision was synchronized to Purchase.');
  };
  const cancelInvitation = (rfqId: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Cancel this invitation and revoke its supplier link?')) return;
    void runAction({ action: 'cancel-rfq', rfqId }, 'Invitation cancelled and public link revoked.');
  };

  const needle = query.trim().toLowerCase();
  const accounts = data.accounts.filter((x) => [x.vendorName, x.email, x.supplierName || '', x.status].join(' ').toLowerCase().includes(needle));
  const rfqs = data.rfqs.filter((x) => [x.rfqNumber, x.title, x.vendorName, x.email, x.status].join(' ').toLowerCase().includes(needle));
  const responses = data.responses.filter((x) => [x.rfqNumber, x.title, x.vendorName, x.email, x.status].join(' ').toLowerCase().includes(needle));

  return (
    <div className="min-w-0 space-y-5" data-vendor-portal-operations={initialSection}>
      <section className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-card)] p-5 shadow-[var(--sami-shadow-sm)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300"><ShieldCheck className="h-4 w-4" /> Supplier collaboration</div><h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Vendor Portal</h1><p className="mt-2 text-sm leading-6 text-[var(--sami-muted)]">Manage supplier access, issue Purchase-linked requests for quotation, and review submitted offers. Each supplier receives a unique expiring link; raw access tokens are stored only as hashes.</p></div>
          <button className={neutralButton} type="button" onClick={() => void refresh()} disabled={loading || busy}><RefreshCw className={'h-3.5 w-3.5 ' + (loading ? 'animate-spin' : '')} /> Refresh</button>
        </div>
      </section>

      {error ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-800 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}
      {notice ? <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Supplier accounts" value={data.summary.accounts} note="Linked to Purchase suppliers" icon="users" />
        <Stat label="RFQ invitations" value={data.summary.invitations} note="All invitations and decisions" icon="mail" />
        <Stat label="Awaiting response" value={data.summary.awaitingResponse} note="Sent or opened by suppliers" icon="clock" />
        <Stat label="Responses to review" value={data.summary.responsesPendingReview} note="Submitted quotations" icon="check" />
        <Stat label="Delivery failures" value={data.summary.deliveryFailures} note="Email action required" icon="alert" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {[{key:'overview',label:'Overview'},{key:'accounts',label:'Supplier accounts'},{key:'rfqs',label:'RFQ invitations'},{key:'responses',label:'Supplier responses'}].map((item) =>
            <Link key={item.key} href={item.key === 'overview' ? '/apps/vendor_portal' : '/apps/vendor_portal/' + item.key}
              aria-current={initialSection === item.key ? 'page' : undefined}
              className={'rounded-lg border px-3 py-2 text-xs font-semibold transition ' + (initialSection === item.key ? 'border-blue-500/30 bg-blue-500/10 text-blue-800 dark:text-blue-200' : 'border-[var(--sami-border)] bg-[var(--sami-surface)] text-[var(--sami-text)] hover:bg-[var(--sami-surface-soft)]')}>{item.label}</Link>)}
        </div>
        <div className="relative min-w-[220px] sm:max-w-[320px] sm:flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sami-muted)]" /><input className={fieldClass + ' pl-9'} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search suppliers and RFQs" aria-label="Search Vendor Portal" /></div>
      </div>

      {initialSection === 'overview' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className={cardClass}><SectionTitle eyebrow="Sourcing" heading="Recent RFQ invitations" copy="Secure invitation status and response deadlines." />
            {loading ? <p className="text-sm text-[var(--sami-muted)]">Loading RFQ activity…</p> : rfqs.length ? <div className="space-y-3">{rfqs.slice(0,5).map((rfq) => <div key={rfq.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sami-border)] pb-3 last:border-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-bold">{rfq.title}</p><p className="mt-1 text-xs text-[var(--sami-muted)]">{rfq.vendorName} · {rfq.rfqNumber}</p><p className="mt-1 text-[11px] text-[var(--sami-muted)]">Due {showDate(rfq.dueAt)}</p></div><StatusPill value={rfq.status} /></div>)}</div> : <p className="text-sm text-[var(--sami-muted)]">No RFQ invitations yet.</p>}
            <Link href="/apps/vendor_portal/rfqs" className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300">Manage invitations <ArrowRight className="h-3.5 w-3.5" /></Link>
          </section>
          <section className={cardClass}><SectionTitle eyebrow="Supplier offers" heading="Responses awaiting review" copy="Accept or reject a submitted quote. Decisions flow back into Purchase." />
            {responses.filter((x) => x.status === 'submitted').slice(0,5).length ? <div className="space-y-3">{responses.filter((x) => x.status === 'submitted').slice(0,5).map((response) => <div key={response.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sami-border)] pb-3 last:border-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-bold">{response.vendorName} · {response.rfqNumber}</p><p className="mt-1 text-xs text-[var(--sami-muted)]">{response.currency} {Number(response.amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} · submitted {showDate(response.submittedAt)}</p></div><StatusPill value={response.status} /></div>)}</div> : <p className="text-sm text-[var(--sami-muted)]">No submitted quotations waiting for review.</p>}
            <Link href="/apps/vendor_portal/responses" className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300">Review responses <ArrowRight className="h-3.5 w-3.5" /></Link>
          </section>
        </div>
      ) : null}

      {initialSection === 'accounts' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(270px,0.8fr)_minmax(0,1.5fr)]">
          <section className={cardClass}><SectionTitle eyebrow="Supplier access" heading="Create a portal account" copy="Link an active Purchase supplier to Vendor Portal. The supplier master is not duplicated." />
            <form className="space-y-3" onSubmit={createAccount}>
              <label className="block space-y-1.5"><span className="text-xs font-semibold">Purchase supplier</span><select className={fieldClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required><option value="">Choose supplier…</option>{data.availableSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.email}</option>)}</select></label>
              <button className={primaryButton + ' w-full'} type="submit" disabled={!canCreate || busy || !supplierId}>{busy ? 'Saving…' : 'Create supplier access'}</button>
              {!canCreate ? <p className="text-[11px] text-[var(--sami-muted)]">Your role does not have permission to create supplier accounts.</p> : null}
            </form>
          </section>
          <section className={cardClass}><SectionTitle eyebrow="Supplier register" heading="Linked supplier accounts" copy="Active links preserve the Purchase supplier ID, email and company scope." />
            {loading ? <p className="text-sm text-[var(--sami-muted)]">Loading accounts…</p> : accounts.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="border-b border-[var(--sami-border)] text-[var(--sami-muted)]"><th className="py-2 pr-3 font-semibold">Supplier</th><th className="py-2 pr-3 font-semibold">Email</th><th className="py-2 pr-3 font-semibold">Link status</th><th className="py-2 font-semibold">Last login</th></tr></thead><tbody>{accounts.map((a) => <tr key={a.id} className="border-b border-[var(--sami-border)]/70 last:border-0"><td className="py-3 pr-3"><p className="font-bold">{a.vendorName}</p><p className="mt-1 text-[10px] text-[var(--sami-muted)]">{a.supplierName ? 'Purchase: ' + a.supplierName : 'Supplier reference missing'}</p></td><td className="py-3 pr-3">{a.email}</td><td className="py-3 pr-3"><StatusPill value={a.status} /></td><td className="py-3">{showDate(a.lastLoginAt)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-[var(--sami-muted)]">No supplier portal accounts yet.</p>}
          </section>
        </div>
      ) : null}

      {initialSection === 'rfqs' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)]">
          <section className={cardClass}><SectionTitle eyebrow="Secure invitation" heading="Issue a Purchase RFQ" copy="An email is sent only after the token hash is stored. The raw token is not persisted and the link expires at the deadline." />
            <form className="space-y-3" onSubmit={issueRfq}>
              <label className="block space-y-1.5"><span className="text-xs font-semibold">Supplier account</span><select className={fieldClass} value={vendorAccountId} onChange={(e) => setVendorAccountId(e.target.value)} required><option value="">Choose supplier…</option>{data.accounts.filter((a) => a.status === 'active').map((a) => <option key={a.id} value={a.id}>{a.vendorName} — {a.email}</option>)}</select></label>
              <label className="block space-y-1.5"><span className="text-xs font-semibold">Existing Purchase RFQ</span><select className={fieldClass} value={purchaseRfqId} onChange={(e) => setPurchaseRfqId(e.target.value)} required><option value="">Choose Purchase RFQ…</option>{data.purchaseRfqs.map((r) => <option key={r.id} value={r.id}>{r.rfqNumber} · {pretty(r.status)} · {r.currency}</option>)}</select></label>
              <label className="block space-y-1.5"><span className="text-xs font-semibold">Supplier-facing title (optional)</span><input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} placeholder="Request for quotation" /></label>
              <label className="block space-y-1.5"><span className="text-xs font-semibold">Message / scope notes (optional)</span><textarea className="min-h-20 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2 text-sm text-[var(--sami-text)] outline-none focus:border-blue-500" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} placeholder="Clarifications, requirements, and supplier instructions" /></label>
              <label className="block space-y-1.5"><span className="text-xs font-semibold">Response deadline (optional)</span><input className={fieldClass} type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} min={new Date().toISOString().slice(0,10)} /></label>
              <button className={primaryButton + ' w-full'} type="submit" disabled={!canCreate || busy || !purchaseRfqId || !vendorAccountId}>{busy ? 'Sending…' : 'Send RFQ invitation'}</button>
            </form>
          </section>
          <section className={cardClass}><SectionTitle eyebrow="Outbound sourcing" heading="RFQ invitation register" copy="Cancellation revokes the public link. Submitted or decided responses cannot be silently overwritten." />
            {loading ? <p className="text-sm text-[var(--sami-muted)]">Loading invitations…</p> : rfqs.length ? <div className="space-y-3">{rfqs.map((rfq) => <div key={rfq.id} className="rounded-xl border border-[var(--sami-border)] p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-bold">{rfq.title}</p><p className="mt-1 text-xs text-[var(--sami-muted)]">{rfq.vendorName} · {rfq.rfqNumber} · {rfq.currency}</p><p className="mt-1 text-[11px] text-[var(--sami-muted)]">Due {showDate(rfq.dueAt)} · Email {pretty(rfq.invitationEmailStatus)}</p></div><StatusPill value={rfq.status} /></div>{canTransition && ['sent','opened','delivery_failed','delivery_pending'].includes(rfq.status) ? <div className="mt-3"><button className={dangerButton} type="button" onClick={() => cancelInvitation(rfq.id)} disabled={busy}>Cancel and revoke link</button></div> : null}</div>)}</div> : <p className="text-sm text-[var(--sami-muted)]">No RFQ invitations match the search.</p>}
          </section>
        </div>
      ) : null}

      {initialSection === 'responses' ? (
        <section className={cardClass}><SectionTitle eyebrow="Supplier evaluation" heading="Submitted quotations" copy="Responses are also recorded against the existing Purchase supplier RFQ response, so buyers can continue in the Purchase module." />
          {loading ? <p className="text-sm text-[var(--sami-muted)]">Loading responses…</p> : responses.length ? <div className="space-y-3">{responses.map((r) => <article key={r.id} className="rounded-xl border border-[var(--sami-border)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-black">{r.vendorName} · {r.rfqNumber}</h3><p className="mt-1 text-xs text-[var(--sami-muted)]">{r.title} · {r.email}</p><p className="mt-2 text-xl font-black tabular-nums">{r.currency} {Number(r.amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</p><p className="mt-1 text-[11px] text-[var(--sami-muted)]">Promised date: {showDate(r.promisedDate)} · Submitted: {showDate(r.submittedAt)}</p>{r.terms ? <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[var(--sami-text)]">{r.terms}</p> : null}</div><StatusPill value={r.status} /></div>{canTransition && r.status === 'submitted' ? <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={primaryButton} onClick={() => decide(r.id,'accepted')} disabled={busy}><CheckCircle2 className="h-3.5 w-3.5" /> Accept offer</button><button type="button" className={dangerButton} onClick={() => decide(r.id,'rejected')} disabled={busy}>Reject offer</button></div> : null}</article>)}</div> : <p className="text-sm text-[var(--sami-muted)]">No supplier responses match the search.</p>}
        </section>
      ) : null}
    </div>
  );
}
