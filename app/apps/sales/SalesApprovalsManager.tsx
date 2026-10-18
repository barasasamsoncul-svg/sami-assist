'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';

type Step = { approverUserId: string; approverRoleKey: string; requiredApprovals: number };
type Policy = {
  id: string; name: string; is_active: boolean; priority: number;
  min_quote_total: string | number | null; max_discount_percent: string | number | null;
  min_margin_percent: string | number | null; currency_code: string | null; steps: Array<Record<string, unknown>>;
};
type ApprovalRequest = {
  request_id: string; quote_id: string; quote_number: string; customer_name: string;
  currency: string; total_amount: string | number; status: string; current_step_order: number;
  requested_at: string; policy_name: string | null; decisions: Array<Record<string, unknown>>; canWithdraw: boolean;
};

const APPROVAL_QUEUE_PAGE_SIZE = 50;

const emptyStep = (): Step => ({ approverUserId: '', approverRoleKey: '', requiredApprovals: 1 });

export default function SalesApprovalsManager() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [name, setName] = useState('');
  const [priority, setPriority] = useState('100');
  const [minTotal, setMinTotal] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [minMargin, setMinMargin] = useState('');
  const [currency, setCurrency] = useState('');
  const [steps, setSteps] = useState<Step[]>([emptyStep()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('');

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/apps/sales?approvals=1&offset=0&limit=${APPROVAL_QUEUE_PAGE_SIZE}`, { cache: 'no-store', credentials: 'same-origin' });
    const body = await response.json();
    if (!response.ok || body.success !== true) throw new Error(body.error || 'Could not load approval policies.');
    setPolicies(body.approvals.policies || []);
    setRequests(body.approvals.requests || []);
    setHasMore(body.approvals.hasMore === true);
  }, []);

  async function loadMoreRequests() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const response = await fetch(`/api/apps/sales?approvals=1&offset=${requests.length}&limit=${APPROVAL_QUEUE_PAGE_SIZE}`, { cache: 'no-store', credentials: 'same-origin' });
      const body = await response.json();
      if (!response.ok || body.success !== true) throw new Error(body.error || 'Could not load more approval requests.');
      const nextRequests = (body.approvals.requests || []) as ApprovalRequest[];
      setRequests(current => {
        const knownIds = new Set(current.map(request => request.request_id));
        return [...current, ...nextRequests.filter(request => !knownIds.has(request.request_id))];
      });
      setHasMore(body.approvals.hasMore === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load more approval requests.');
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => { void refresh().catch(e => setError(e instanceof Error ? e.message : 'Could not load approvals.')); }, [refresh]);

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/apps/sales', {
        method: 'POST', cache: 'no-store', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_approval_policy', policyId, isActive, name, priority,
          minQuoteTotal: minTotal || null,
          maxDiscountPercent: maxDiscount || null,
          minMarginPercent: minMargin || null,
          currencyCode: currency || null,
          steps: steps.map(step => ({
            approverUserId: step.approverUserId || null,
            approverRoleKey: step.approverRoleKey || null,
            requiredApprovals: step.requiredApprovals,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success !== true) throw new Error(body.error || 'Could not save policy.');
      setPolicyId(null); setIsActive(true); setName(''); setPriority('100'); setMinTotal(''); setMaxDiscount(''); setMinMargin(''); setCurrency(''); setSteps([emptyStep()]);
      setNotice('Approval policy saved. New submissions will use the active policy rules.');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save policy.'); }
    finally { setBusy(false); }
  }

  async function withdrawRequest(request: ApprovalRequest) {
    if (!request.canWithdraw) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/apps/sales', {
        method: 'POST', cache: 'no-store', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel_quote_approval',
          quoteId: request.quote_id,
          reason: 'Approval request withdrawn by the requester or an authorized Sales editor.',
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success !== true) throw new Error(body.error || 'Could not withdraw the approval request.');
      setNotice(body.result?.cancelled === true
        ? 'Approval request withdrawn. The quotation is back in draft approval status.'
        : 'Approval request withdrawal completed.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not withdraw the approval request.');
    } finally {
      setBusy(false);
    }
  }

  async function reviewRequest(event: FormEvent<HTMLFormElement>, request: ApprovalRequest, decision: 'approve' | 'reject') {
    event.preventDefault();
    if (decision === 'reject' && !reviewReason.trim()) {
      setError('A rejection reason is required.');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/apps/sales', {
        method: 'POST', cache: 'no-store', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review_quote_approval', quoteId: request.quote_id, decision, reason: decision === 'reject' ? reviewReason.trim() : null }),
      });
      const body = await response.json();
      if (!response.ok || body.success !== true) throw new Error(body.error || 'Could not record the approval decision.');
      setReviewingRequestId(null); setReviewReason('');
      setNotice(decision === 'approve'
        ? (body.result?.approvalStatus === 'approved' ? 'Quotation fully approved.' : 'Approval recorded. The next approval step is now active.')
        : 'Quotation rejected. The reason has been recorded.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record the approval decision.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-blue-600">SaMi Sales · Part 11</p>
          <h1 className="mt-1 text-2xl font-black">Quote approval workflow</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">Configure approval triggers and sequential review steps. Each reviewer must have internal-approval permission. Use a permission key for a role/group, or a user UUID for a specific approver.</p>
        </div>
        <Link href="/apps/sales" className="rounded-xl border border-[var(--sami-border)] px-4 py-2 text-sm font-bold">Back to Sales</Link>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-300 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-300 p-3 text-sm text-emerald-700">{notice}</div>}

      <section className="sami-surface rounded-2xl p-4 sm:p-5">
        <h2 className="text-base font-black">Create approval policy</h2>
        <p className="mt-1 text-xs text-slate-500">A policy triggers when any configured condition is met. Higher-priority policies are evaluated first.</p>
        <form onSubmit={savePolicy} className="mt-4 space-y-4">
          {policyId && <div className="flex items-center justify-between rounded-xl border border-[var(--sami-border)] p-3"><p className="text-xs font-bold">Editing existing policy</p><div className="flex items-center gap-3"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Active</label><button type="button" onClick={() => { setPolicyId(null); setIsActive(true); setName(''); setPriority('100'); setMinTotal(''); setMaxDiscount(''); setMinMargin(''); setCurrency(''); setSteps([emptyStep()]); }} className="text-xs font-bold underline">Cancel edit</button></div></div>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-bold">Policy name<input required maxLength={160} value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--sami-border)] bg-transparent p-3 text-sm" placeholder="Large quote approval" /></label>
            <label className="text-xs font-bold">Priority<input type="number" min="1" value={priority} onChange={e => setPriority(e.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--sami-border)] bg-transparent p-3 text-sm" /></label>
            <label className="text-xs font-bold">Currency (optional)<input maxLength={3} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} className="mt-1 block w-full rounded-xl border border-[var(--sami-border)] bg-transparent p-3 text-sm" placeholder="KES" /></label>
            <label className="text-xs font-bold">Minimum quote total<input type="number" min="0" step="0.01" value={minTotal} onChange={e => setMinTotal(e.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--sami-border)] bg-transparent p-3 text-sm" placeholder="Triggers at or above" /></label>
            <label className="text-xs font-bold">Maximum discount %<input type="number" min="0" max="100" step="0.1" value={maxDiscount} onChange={e => setMaxDiscount(e.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--sami-border)] bg-transparent p-3 text-sm" placeholder="Triggers above cap" /></label>
            <label className="text-xs font-bold">Minimum margin %<input type="number" min="0" max="100" step="0.1" value={minMargin} onChange={e => setMinMargin(e.target.value)} className="mt-1 block w-full rounded-xl border border-[var(--sami-border)] bg-transparent p-3 text-sm" placeholder="Triggers below floor" /></label>
          </div>
          <p className="text-xs leading-5 text-[var(--sami-muted)]">With Currency blank, Minimum quote total is evaluated in the company&apos;s base currency. Selecting a currency limits this policy to quotes in that currency, so the minimum uses the quote amount in that currency.</p>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-black">Sequential approval steps</h3><button type="button" disabled={steps.length >= 10} onClick={() => setSteps(old => [...old, emptyStep()])} className="rounded-lg border border-[var(--sami-border)] px-3 py-2 text-xs font-bold disabled:opacity-50">Add step</button></div>
            {steps.map((step, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-[var(--sami-border)] p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_140px_auto]">
                <div className="text-xs font-bold sm:col-span-2 lg:col-span-4">Step {index + 1}</div>
                <label className="text-xs font-bold">Approver permission key<input value={step.approverRoleKey} pattern="^[a-z0-9][a-z0-9._:\\-]*$" title="Start with a lowercase letter or number; then use lowercase letters, numbers, dots, underscores, colons, or hyphens." onChange={e => setSteps(old => old.map((s, i) => i === index ? { ...s, approverRoleKey: e.target.value.toLowerCase() } : s))} className="mt-1 block w-full rounded-xl border border-[var(--sami-border)] bg-transparent p-3 text-sm" placeholder="sales.quote.approve_internal" /><span className="mt-1 block text-[11px] font-normal text-slate-500">Use lowercase letters/numbers and . _ : - only; the first character must be a letter or number.</span></label>
                <label className="text-xs font-bold">Specific user ID (optional)<input value={step.approverUserId} onChange={e => setSteps(old => old.map((s, i) => i === index ? { ...s, approverUserId: e.target.value } : s))} className="mt-1 block w-full rounded-xl border border-[var(--sami-border)] bg-transparent p-3 text-sm" placeholder="User UUID" /></label>
                <label className="text-xs font-bold">Approvals required<input type="number" min="1" max="20" value={step.requiredApprovals} onChange={e => setSteps(old => old.map((s, i) => i === index ? { ...s, requiredApprovals: Number(e.target.value) } : s))} className="mt-1 block w-full rounded-xl border border-[var(--sami-border)] bg-transparent p-3 text-sm" /></label>
                <div className="flex items-end"><button type="button" disabled={steps.length === 1} onClick={() => setSteps(old => old.filter((_, i) => i !== index))} className="rounded-lg border border-[var(--sami-border)] px-3 py-3 text-xs font-bold disabled:opacity-40">Remove</button></div>
              </div>
            ))}
          </div>
          <button disabled={busy} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save approval policy'}</button>
        </form>
      </section>

      <section className="sami-surface rounded-2xl p-4 sm:p-5">
        <h2 className="text-base font-black">Configured policies</h2>
        <div className="mt-3 space-y-2">
          {policies.length === 0 && <p className="text-sm text-slate-500">No configurable policies yet. The existing Sales approval threshold remains available as a compatibility fallback.</p>}
          {policies.map(policy => (
            <article key={policy.id} className="rounded-xl border border-[var(--sami-border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black">{policy.name}</h3><div className="flex items-center gap-2"><span className="text-xs text-slate-500">{policy.is_active ? 'Active' : 'Inactive'} · priority {policy.priority}</span><button type="button" onClick={() => { setPolicyId(policy.id); setIsActive(policy.is_active); setName(policy.name); setPriority(String(policy.priority)); setMinTotal(policy.min_quote_total == null ? '' : String(policy.min_quote_total)); setMaxDiscount(policy.max_discount_percent == null ? '' : String(policy.max_discount_percent)); setMinMargin(policy.min_margin_percent == null ? '' : String(policy.min_margin_percent)); setCurrency(policy.currency_code || ''); setSteps((policy.steps || []).map(step => ({ approverUserId: String(step.approverUserId || ''), approverRoleKey: String(step.approverRoleKey || ''), requiredApprovals: Number(step.requiredApprovals || 1) }))); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="rounded-lg border border-[var(--sami-border)] px-2 py-1 text-xs font-bold">Edit</button></div></div>
              <p className="mt-1 text-xs text-slate-500">Triggers: {policy.min_quote_total != null ? 'total ≥ ' + policy.min_quote_total + ' ' + (policy.currency_code || 'any currency') : ''}{policy.max_discount_percent != null ? (policy.min_quote_total != null ? ' · ' : '') + 'discount > ' + policy.max_discount_percent + '%' : ''}{policy.min_margin_percent != null ? ((policy.min_quote_total != null || policy.max_discount_percent != null) ? ' · ' : '') + 'margin < ' + policy.min_margin_percent + '%' : ''}</p>
              <p className="mt-1 text-xs text-slate-500">{policy.steps?.length || 0} sequential step(s)</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sami-surface rounded-2xl p-4 sm:p-5">
        <h2 className="text-base font-black">Approval queue and audit trail</h2>
        <div className="mt-3 space-y-2">
          {requests.length === 0 && <p className="text-sm text-slate-500">No approval requests have been recorded yet.</p>}
          {requests.map(request => (
            <article key={request.request_id} className="rounded-xl border border-[var(--sami-border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><Link href={'/apps/sales/quotes/' + request.quote_id} className="text-sm font-black underline">{request.quote_number} · {request.customer_name}</Link><span className="text-xs font-black uppercase">{request.status}</span></div>
              <p className="mt-1 text-xs text-slate-500">{request.policy_name || 'Legacy approval'} · {request.currency} {Number(request.total_amount).toLocaleString()} · current step {request.current_step_order} · {new Date(request.requested_at).toLocaleString()}</p>
              {request.decisions?.length > 0 && <div className="mt-2 space-y-1">{request.decisions.map((decision, i) => <p key={i} className="text-xs text-slate-500">Step {String(decision.stepOrder)} · {String(decision.decision)} · {String(decision.reviewerUserId)}{decision.reason ? ' · ' + String(decision.reason) : ''}</p>)}</div>}
              {request.status === 'pending' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {request.canWithdraw && (
                    <button type="button" disabled={busy} onClick={() => void withdrawRequest(request)} className="rounded-lg border border-amber-500/50 px-3 py-2 text-xs font-black text-amber-800 disabled:opacity-50 dark:text-amber-300">
                      {busy ? 'Working…' : 'Withdraw request'}
                    </button>
                  )}
                  <form onSubmit={event => void reviewRequest(event, request, 'approve')}>
                    <button type="submit" disabled={busy} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{busy ? 'Saving…' : 'Approve step'}</button>
                  </form>
                  {reviewingRequestId === request.request_id ? (
                    <form onSubmit={event => void reviewRequest(event, request, 'reject')} className="w-full space-y-2 rounded-xl border border-rose-500/30 p-3">
                      <label className="block text-xs font-bold">Rejection reason *
                        <textarea required maxLength={2000} rows={2} value={reviewReason} onChange={event => setReviewReason(event.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--sami-border)] bg-transparent p-2 text-sm font-normal" placeholder="Explain why this quotation is rejected." />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" disabled={busy || !reviewReason.trim()} className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{busy ? 'Saving…' : 'Confirm rejection'}</button>
                        <button type="button" disabled={busy} onClick={() => { setReviewingRequestId(null); setReviewReason(''); }} className="rounded-lg border border-[var(--sami-border)] px-3 py-2 text-xs font-bold disabled:opacity-50">Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => { setReviewingRequestId(request.request_id); setReviewReason(''); setError(''); }} className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-black text-rose-700 disabled:opacity-50 dark:text-rose-300">Reject</button>
                  )}
                </div>
              )}
            </article>
          ))}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button type="button" onClick={() => void loadMoreRequests()} disabled={loadingMore || busy} className="rounded-xl border border-[var(--sami-border)] px-4 py-2 text-sm font-bold disabled:opacity-50">
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
