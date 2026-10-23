'use client';

import { useState } from 'react';

type ResponseRecord = {
  amount: string;
  currency: string;
  promisedDate: string | null;
  terms: string | null;
  submittedAt: string | null;
  status: string;
} | null;

const inputClass = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15';
const primaryButton = 'inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50';

export default function VendorPortalResponseForm({
  tenantId,
  token,
  rfqId,
  rfqNumber,
  initialResponse,
  canRespond,
}: {
  tenantId: string;
  token: string;
  rfqId: string;
  rfqNumber: string;
  initialResponse: ResponseRecord;
  canRespond: boolean;
}) {
  const [amount, setAmount] = useState(initialResponse?.amount || '');
  const [currency, setCurrency] = useState(initialResponse?.currency || 'KES');
  const [promisedDate, setPromisedDate] = useState(initialResponse?.promisedDate || '');
  const [terms, setTerms] = useState(initialResponse?.terms || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canRespond) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        '/api/public/vendor-portal/' + encodeURIComponent(tenantId) + '/' + encodeURIComponent(token),
        {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ rfqId, amount, currency, promisedDate: promisedDate || null, terms }),
        },
      );
      const body = await response.json() as {
        success?: boolean;
        result?: { status?: string };
        error?: string;
      };
      if (!response.ok || body.success !== true) {
        throw new Error(body.error || 'The quotation response could not be submitted.');
      }
      setNotice('Your quotation for ' + rfqNumber + ' was submitted. You can update it while the invitation remains open.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The quotation response could not be submitted.');
    } finally {
      setBusy(false);
    }
  }

  const locked = initialResponse && ['accepted', 'rejected'].includes(initialResponse.status);
  if (locked) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        The procurement team has marked this response <strong className="capitalize">{initialResponse.status}</strong>. The response is read-only.
      </div>
    );
  }
  if (!canRespond) {
    return <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">This quotation invitation is closed or past its deadline.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4" data-vendor-portal-rfq-response={rfqId}>
      {error ? <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
      {notice ? <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-slate-700">Total quotation amount</span>
          <input className={inputClass} name="amount" type="number" min="0" max="999999999999.9999" step="0.0001" required value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-slate-700">Currency</span>
          <select className={inputClass} name="currency" value={currency} onChange={(event) => setCurrency(event.target.value)} required>
            <option value="KES">KES — Kenyan shilling</option>
            <option value="USD">USD — US dollar</option>
            <option value="EUR">EUR — Euro</option>
            <option value="GBP">GBP — Pound sterling</option>
            <option value="TZS">TZS — Tanzanian shilling</option>
            <option value="UGX">UGX — Ugandan shilling</option>
            <option value="RWF">RWF — Rwandan franc</option>
          </select>
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-xs font-bold text-slate-700">Promised delivery date</span>
          <input className={inputClass} name="promisedDate" type="date" value={promisedDate} onChange={(event) => setPromisedDate(event.target.value)} />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-bold text-slate-700">Commercial terms / notes</span>
        <textarea className={inputClass + ' min-h-28 py-3'} name="terms" maxLength={5000} value={terms} onChange={(event) => setTerms(event.target.value)} placeholder="Lead time, warranty, quote validity, delivery notes or exceptions." />
        <span className="block text-right text-[11px] text-slate-500">{terms.length}/5000</span>
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <p className="max-w-xl text-xs leading-5 text-slate-600">Submitting sends this commercial offer to the purchasing company. Make sure the amount and delivery commitment are correct.</p>
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? 'Submitting…' : initialResponse ? 'Update quotation' : 'Submit quotation'}
        </button>
      </div>
    </form>
  );
}
