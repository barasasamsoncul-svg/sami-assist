'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, FileText, LoaderCircle, Send } from 'lucide-react';

type RfqLine = { id: string; description: string; quantity: string; sku: string | null };
type PublicRfq = {
  id: string; rfqNumber: string; title: string; description: string | null; dueAt: string | null;
  currency: string; status: string; vendorName: string; lines: RfqLine[];
  response: { amount: string; currency: string; promisedDate: string | null; terms: string | null; submittedAt: string | null; status: string } | null;
  acceptingResponses: boolean;
};
type ApiResponse<T> = { success?: boolean; result?: T; error?: string };
const fieldClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15';
const cardClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
function showDate(value: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function VendorRfqResponseClient({ tenantId, token }: { tenantId: string; token: string }) {
  const [rfq, setRfq] = useState<PublicRfq | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [promisedDate, setPromisedDate] = useState('');
  const [terms, setTerms] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/public/vendor-portal/' + encodeURIComponent(tenantId) + '/' + encodeURIComponent(token), {
        cache: 'no-store', headers: { Accept: 'application/json' },
      });
      const payload = await response.json() as ApiResponse<PublicRfq>;
      if (!response.ok || payload.success !== true || !payload.result) throw new Error(payload.error || 'This supplier invitation is no longer available.');
      setRfq(payload.result);
      setAmount((current) => current || payload.result!.response?.amount || '');
      setCurrency(payload.result.response?.currency || payload.result.currency || 'KES');
      setPromisedDate((current) => current || payload.result!.response?.promisedDate || '');
      setTerms((current) => current || payload.result!.response?.terms || '');
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This supplier invitation is no longer available.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, token]);
  useEffect(() => { void refresh(); }, [refresh]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/public/vendor-portal/' + encodeURIComponent(tenantId) + '/' + encodeURIComponent(token), {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ amount, currency, promisedDate: promisedDate || null, terms: terms || null }),
      });
      const payload = await response.json() as ApiResponse<{ status: string }>;
      if (!response.ok || payload.success !== true) throw new Error(payload.error || 'Your quotation could not be submitted.');
      setNotice('Your quotation has been submitted successfully. The buyer has received your response.');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your quotation could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="rounded-2xl bg-slate-950 px-5 py-6 text-white shadow-sm sm:px-7">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-300">SaMi Technologies</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Vendor Portal</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Secure supplier response workspace. Use this private invitation link to review the request and submit your quotation to the buyer.</p>
        </header>
        {error ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}
        {notice ? <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div> : null}
        {loading && !rfq ? <div className={cardClass}><div className="flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading secure supplier invitation…</div></div> : null}
        {rfq ? (
          <>
            <section className={cardClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-700">Request for quotation · {rfq.rfqNumber}</p>
                  <h2 className="mt-1 break-words text-xl font-black">{rfq.title}</h2>
                  <p className="mt-1 text-xs text-slate-500">Supplier: {rfq.vendorName} · Response due {showDate(rfq.dueAt)}</p>
                </div>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-800">{rfq.status.replaceAll('_',' ')}</span>
              </div>
              {rfq.description ? <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{rfq.description}</p> : null}
              <div className="mt-5">
                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-700"><FileText className="h-4 w-4" /> Requested items</h3>
                {rfq.lines.length ? <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[440px] text-left text-xs"><thead className="bg-slate-50"><tr><th className="px-3 py-2 font-semibold text-slate-600">Item / description</th><th className="px-3 py-2 font-semibold text-slate-600">SKU</th><th className="px-3 py-2 text-right font-semibold text-slate-600">Quantity</th></tr></thead><tbody>{rfq.lines.map((line) => <tr key={line.id} className="border-t border-slate-100"><td className="px-3 py-3 font-semibold">{line.description}</td><td className="px-3 py-3 text-slate-600">{line.sku || '—'}</td><td className="px-3 py-3 text-right tabular-nums">{line.quantity}</td></tr>)}</tbody></table></div> : <p className="mt-2 rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500">No item lines were attached to this RFQ. Use the buyer's RFQ description to prepare your offer.</p>}
              </div>
            </section>
            <section className={cardClass}>
              <h2 className="text-lg font-black">Your quotation</h2>
              {rfq.response && !rfq.acceptingResponses ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-bold text-emerald-900">Quotation {rfq.response.status.replaceAll('_',' ')}</p><p className="mt-1 text-xs text-emerald-800">Submitted {showDate(rfq.response.submittedAt)} · {rfq.response.currency} {Number(rfq.response.amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</p><p className="mt-1 text-xs text-emerald-800">Promised date: {rfq.response.promisedDate || '—'}</p></div>
                : rfq.acceptingResponses ? <form className="mt-4 space-y-4" onSubmit={submit}>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1.7fr)_minmax(120px,0.7fr)]">
                    <label className="block space-y-1.5"><span className="text-xs font-bold">Total quotation amount</span><input className={fieldClass} type="number" min="0" max="9999999999999" step="0.0001" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
                    <label className="block space-y-1.5"><span className="text-xs font-bold">Currency (set by buyer)</span><input className={fieldClass} value={rfq.currency} readOnly aria-describedby="rfq-currency-help" /><span id="rfq-currency-help" className="text-[11px] text-slate-500">Supplier quotations must use the currency on this Purchase RFQ.</span></label>
                  </div>
                  <label className="block space-y-1.5"><span className="text-xs font-bold">Promised delivery date (optional)</span><input className={fieldClass} type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} min={new Date().toISOString().slice(0,10)} /></label>
                  <label className="block space-y-1.5"><span className="text-xs font-bold">Quotation terms and notes (optional)</span><textarea className="min-h-28 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={4000} placeholder="Delivery terms, validity, exclusions, or clarification notes." /></label>
                  <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50 sm:w-auto" type="submit" disabled={submitting || !amount || !currency}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit quotation</button>
                  <p className="text-[11px] leading-5 text-slate-500">When submitted, your quotation is saved to the buyer's Purchase RFQ response register. You cannot edit it after submission; contact the buyer if a correction is required.</p>
                </form>
                : <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">This RFQ is no longer accepting quotations. Contact the buyer if you need to discuss the request.</p>}
            </section>
          </>
        ) : null}
        <footer className="pb-4 text-center text-[11px] text-slate-500">SaMi Vendor Portal · This secure invitation is intended for the named supplier only. Do not forward the link.</footer>
      </div>
    </main>
  );
}
