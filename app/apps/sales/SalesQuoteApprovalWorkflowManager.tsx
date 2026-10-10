'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import Link from 'next/link';

type ApprovalStep = {
  stepNumber: number;
  stepName: string;
  approverUserId: string;
  approverName?: string;
  approverEmail?: string | null;
};

type ApprovalPolicy = {
  id: string;
  name: string;
  priority: number;
  minBaseAmount: number;
  maxBaseAmount: number | null;
  isActive: boolean;
  steps: ApprovalStep[];
};

type Approver = {
  id: string;
  name: string;
  email: string | null;
  isOwner: boolean;
};

type ApprovalDecision = {
  stepNumber: number;
  stepName: string;
  approverUserId: string;
  approverName: string;
  decision: 'approved' | 'rejected' | string;
  note: string | null;
  decidedAt: string | null;
};

type ApprovalQueueItem = {
  id: string;
  quoteId: string;
  quoteNumber: string;
  customerName: string;
  currency: string;
  totalAmount: number;
  baseCurrency: string;
  baseTotalAmount: number;
  requestedByName: string;
  requestedAt: string | null;
  currentStepNumber: number;
  currentStepName: string;
  totalSteps: number;
  decisions: ApprovalDecision[];
};

type WorkflowData = {
  canManagePolicies: boolean;
  canReview: boolean;
  baseCurrency: string;
  policies: ApprovalPolicy[];
  approvers: Approver[];
  queue: ApprovalQueueItem[];
};

type Mode = 'queue' | 'policies';

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return currency + ' ' + amount.toLocaleString();
  }
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString();
}

async function responseError(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : 'SaMi could not complete the approval workflow request.',
    );
  }
  return payload;
}

export default function SalesQuoteApprovalWorkflowManager({
  mode,
}: {
  mode: Mode;
}) {
  const [data, setData] = useState<WorkflowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [priority, setPriority] = useState('100');
  const [minBaseAmount, setMinBaseAmount] = useState('0');
  const [maxBaseAmount, setMaxBaseAmount] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [steps, setSteps] = useState<Array<{ stepName: string; approverUserId: string }>>([
    { stepName: 'Sales manager approval', approverUserId: '' },
  ]);
  const [notesByRequest, setNotesByRequest] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/apps/sales?approval_workflows=1', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await responseError(response);
      const result = payload.approvalWorkflows || payload;
      setData(result as WorkflowData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load quote approvals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setName('');
    setPriority('100');
    setMinBaseAmount('0');
    setMaxBaseAmount('');
    setIsActive(true);
    setSteps([{ stepName: 'Sales manager approval', approverUserId: '' }]);
  }

  function editPolicy(policy: ApprovalPolicy) {
    setEditingId(policy.id);
    setName(policy.name);
    setPriority(String(policy.priority));
    setMinBaseAmount(String(policy.minBaseAmount));
    setMaxBaseAmount(policy.maxBaseAmount === null ? '' : String(policy.maxBaseAmount));
    setIsActive(policy.isActive);
    setSteps(
      policy.steps.length
        ? policy.steps.map(step => ({
            stepName: step.stepName,
            approverUserId: step.approverUserId,
          }))
        : [{ stepName: 'Approval step 1', approverUserId: '' }],
    );
    setNotice('');
    setError('');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function savePolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/apps/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_quote_approval_policy',
          id: editingId,
          name,
          priority,
          minBaseAmount,
          maxBaseAmount: maxBaseAmount || null,
          isActive,
          steps: steps.map(step => ({
            stepName: step.stepName,
            approverUserId: step.approverUserId,
          })),
        }),
      });
      await responseError(response);
      setNotice('Approval policy saved.');
      resetForm();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the approval policy.');
    } finally {
      setBusy(false);
    }
  }

  async function deactivatePolicy(policy: ApprovalPolicy) {
    if (!window.confirm('Deactivate "' + policy.name + '"? Existing approval requests will keep their original step assignments.')) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/apps/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deactivate_quote_approval_policy',
          id: policy.id,
        }),
      });
      await responseError(response);
      setNotice('Approval policy deactivated. In-flight requests were preserved.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not deactivate the approval policy.');
    } finally {
      setBusy(false);
    }
  }

  async function decide(item: ApprovalQueueItem, decision: 'approve' | 'reject') {
    const note = (notesByRequest[item.id] || '').trim();
    if (decision === 'reject' && !note) {
      setError('Add a rejection reason before rejecting this step.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/apps/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review_quote_approval',
          requestId: item.id,
          quoteId: item.quoteId,
          stepNumber: item.currentStepNumber,
          decision,
          reason: note,
        }),
      });
      const payload = await responseError(response);
      const result = payload.result || {};
      if (result.completed) {
        setNotice(decision === 'approve' ? 'Final approval recorded. The quotation is approved.' : 'Rejection recorded. The quotation was rejected.');
      } else if (decision === 'approve') {
        setNotice('Step approved. The request advanced to the next assigned approver.');
      } else {
        setNotice('Rejection recorded.');
      }
      setNotesByRequest(previous => ({ ...previous, [item.id]: '' }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record the approval decision.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="sami-surface rounded-[24px] p-5">
        <p className="text-sm text-slate-500">Loading quote approval workflow…</p>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="sami-surface rounded-[24px] p-5">
        <h2 className="text-base font-black">Quote approvals</h2>
        <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-4 rounded-xl border px-4 py-2 text-sm font-bold">Retry</button>
      </section>
    );
  }

  if (!data) return null;

  return (
    <section className="space-y-4">
      <header className="sami-surface flex flex-col gap-3 rounded-[24px] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-blue-600">Sales workflow</p>
          <h2 className="mt-1 text-xl font-black">
            {mode === 'policies' ? 'Quote approval policies' : 'Approval queue'}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Policies use {data.baseCurrency} base-currency bands. Each submitted request keeps its own ordered approver snapshot.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy} className="rounded-xl border border-[var(--sami-border)] px-4 py-2 text-sm font-bold disabled:opacity-50">
          Refresh
        </button>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</p>
      )}

      {mode === 'policies' && data.canManagePolicies && (
        <>
          <form onSubmit={savePolicy} className="sami-surface space-y-4 rounded-[24px] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-black">{editingId ? 'Edit approval policy' : 'Create approval policy'}</h3>
                <p className="mt-1 text-xs text-slate-500">Lower priority numbers are evaluated first. A blank maximum means no upper limit.</p>
              </div>
              {editingId && (
                <button type="button" onClick={resetForm} className="rounded-lg border px-3 py-1.5 text-xs font-bold">Cancel edit</button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-bold">
                Policy name
                <input required maxLength={180} value={name} onChange={event => setName(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal" placeholder="Standard quotation approval" />
              </label>
              <label className="text-xs font-bold">
                Priority
                <input required type="number" min="1" max="100000" step="1" value={priority} onChange={event => setPriority(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal" />
              </label>
              <label className="text-xs font-bold">
                Minimum ({data.baseCurrency})
                <input required type="number" min="0" step="0.01" value={minBaseAmount} onChange={event => setMinBaseAmount(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal" />
              </label>
              <label className="text-xs font-bold">
                Maximum ({data.baseCurrency}, optional)
                <input type="number" min={minBaseAmount || '0'} step="0.01" value={maxBaseAmount} onChange={event => setMaxBaseAmount(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal" placeholder="No maximum" />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} />
              Policy is active for new approval requests
            </label>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-black">Sequential approval steps</h4>
                <button type="button" disabled={steps.length >= 10} onClick={() => setSteps(previous => [...previous, { stepName: 'Approval step ' + (previous.length + 1), approverUserId: '' }])} className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-50">
                  Add step
                </button>
              </div>
              {steps.map((step, index) => {
                const unavailable = new Set(steps.filter((_, otherIndex) => otherIndex !== index).map(item => item.approverUserId).filter(Boolean));
                return (
                  <div key={index} className="grid gap-3 rounded-2xl border border-[var(--sami-border)] p-3 sm:grid-cols-[80px_1fr_1.4fr_auto] sm:items-end">
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-400">Step {index + 1}</p>
                      <p className="mt-1 text-xs text-slate-500">{index === 0 ? 'First reviewer' : 'After previous approval'}</p>
                    </div>
                    <label className="text-xs font-bold">
                      Step label
                      <input required maxLength={120} value={step.stepName} onChange={event => setSteps(previous => previous.map((item, stepIndex) => stepIndex === index ? { ...item, stepName: event.target.value } : item))} className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal" />
                    </label>
                    <label className="text-xs font-bold">
                      Assigned approver
                      <select required value={step.approverUserId} onChange={event => setSteps(previous => previous.map((item, stepIndex) => stepIndex === index ? { ...item, approverUserId: event.target.value } : item))} className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm font-normal">
                        <option value="">Select internal user</option>
                        {data.approvers.filter(user => !unavailable.has(user.id) || user.id === step.approverUserId).map(user => (
                          <option key={user.id} value={user.id}>{user.name}{user.email ? ' — ' + user.email : ''}</option>
                        ))}
                      </select>
                    </label>
                    <button type="button" disabled={steps.length <= 1} onClick={() => setSteps(previous => previous.filter((_, stepIndex) => stepIndex !== index))} className="h-10 rounded-xl border px-3 text-xs font-bold disabled:opacity-40">Remove</button>
                  </div>
                );
              })}
            </div>

            <button type="submit" disabled={busy || !name.trim() || steps.length < 1} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-50">
              {busy ? 'Saving…' : editingId ? 'Save policy changes' : 'Create policy'}
            </button>
          </form>

          <div className="sami-surface rounded-[24px] p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-black">Configured policies</h3>
              <span className="text-xs text-slate-500">{data.policies.length} total</span>
            </div>
            {data.policies.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No configurable policies yet. The existing single-threshold approval setting continues to work until a matching policy is configured.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {data.policies.map(policy => (
                  <article key={policy.id} className="rounded-2xl border border-[var(--sami-border)] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-black">{policy.name}</h4>
                          <span className={policy.isActive ? 'rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-700 dark:text-emerald-300' : 'rounded-full bg-slate-500/10 px-2 py-1 text-[10px] font-black text-slate-500'}>{policy.isActive ? 'Active' : 'Inactive'}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Priority {policy.priority} · {formatMoney(policy.minBaseAmount, data.baseCurrency)} to {policy.maxBaseAmount === null ? 'no maximum' : formatMoney(policy.maxBaseAmount, data.baseCurrency)}
                        </p>
                        <ol className="mt-3 space-y-1 text-sm">
                          {policy.steps.map(step => (
                            <li key={step.stepNumber} className="flex flex-wrap gap-2">
                              <span className="font-semibold">{step.stepNumber}. {step.stepName}</span>
                              <span className="text-slate-500">— {step.approverName || 'Workspace member'}{step.approverEmail ? ' (' + step.approverEmail + ')' : ''}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" disabled={busy} onClick={() => editPolicy(policy)} className="rounded-xl border px-3 py-2 text-xs font-bold">Edit</button>
                        {policy.isActive && (
                          <button type="button" disabled={busy} onClick={() => void deactivatePolicy(policy)} className="rounded-xl border border-rose-300 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">Deactivate</button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {mode === 'queue' && (
        <div className="sami-surface rounded-[24px] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-black">Assigned to me</h3>
            <span className="text-xs text-slate-500">{data.queue.length} awaiting your decision</span>
          </div>
          {data.queue.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">There are no sequential quote-approval steps assigned to you right now.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {data.queue.map(item => (
                <article key={item.id} className="rounded-2xl border border-[var(--sami-border)] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <Link href={'/apps/sales/quotes/' + item.quoteId} className="font-black text-blue-700 hover:underline dark:text-blue-300">{item.quoteNumber}</Link>
                      <p className="mt-1 text-sm">{item.customerName}</p>
                      <p className="mt-1 text-xs text-slate-500">Requested by {item.requestedByName} · {formatDate(item.requestedAt)}</p>
                    </div>
                    <div className="rounded-xl bg-blue-500/10 px-3 py-2 text-sm font-black text-blue-800 dark:text-blue-200">
                      Step {item.currentStepNumber} of {item.totalSteps}: {item.currentStepName}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-500/5 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Quote value</p>
                      <p className="mt-1 font-black">{formatMoney(item.totalAmount, item.currency)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-500/5 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Approval band value</p>
                      <p className="mt-1 font-black">{formatMoney(item.baseTotalAmount, item.baseCurrency)}</p>
                    </div>
                  </div>
                  {item.decisions.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Previous decisions</h4>
                      <ol className="mt-2 space-y-2">
                        {item.decisions.map(decision => (
                          <li key={decision.stepNumber} className="rounded-xl border border-[var(--sami-border)] p-3 text-sm">
                            <p className="font-bold">Step {decision.stepNumber}: {decision.stepName} — {decision.decision}</p>
                            <p className="mt-1 text-xs text-slate-500">{decision.approverName} · {formatDate(decision.decidedAt)}</p>
                            {decision.note && <p className="mt-2 whitespace-pre-wrap text-sm">{decision.note}</p>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  <label className="mt-4 block text-xs font-bold">
                    Decision note
                    <textarea value={notesByRequest[item.id] || ''} onChange={event => setNotesByRequest(previous => ({ ...previous, [item.id]: event.target.value }))} rows={3} maxLength={2000} placeholder="Required when rejecting; optional for approval." className="mt-1 w-full rounded-xl border border-[var(--sami-border)] bg-transparent p-3 text-sm font-normal" />
                  </label>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button type="button" disabled={busy} onClick={() => void decide(item, 'reject')} className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-black text-rose-700 disabled:opacity-50 dark:text-rose-300">Reject</button>
                    <button type="button" disabled={busy} onClick={() => void decide(item, 'approve')} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Approve step</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'policies' && !data.canManagePolicies && (
        <div className="sami-surface rounded-[24px] p-5">
          <p className="text-sm text-slate-500">You need Sales settings-management permission to configure approval policies.</p>
        </div>
      )}
    </section>
  );
}
