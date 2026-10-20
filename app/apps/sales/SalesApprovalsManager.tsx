'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  Workflow,
  X,
} from 'lucide-react';

import SaMiOverlay, { type SaMiOverlayType } from '@/app/components/SaMiOverlay';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type Step = {
  approverUserId: string;
  approverRoleKey: string;
  requiredApprovals: number;
};

type Policy = {
  id: string;
  name: string;
  is_active: boolean;
  priority: number;
  min_quote_total: string | number | null;
  max_discount_percent: string | number | null;
  min_margin_percent: string | number | null;
  currency_code: string | null;
  steps: Array<Record<string, unknown>>;
};

type ApprovalRequest = {
  request_id: string;
  quote_id: string;
  quote_number: string;
  customer_name: string;
  currency: string;
  total_amount: string | number;
  status: string;
  current_step_order: number;
  requested_at: string;
  policy_name: string | null;
  decisions: Array<Record<string, unknown>>;
  canWithdraw: boolean;
};

type OverlayState = {
  open: boolean;
  type: SaMiOverlayType;
  title: string;
  message: string;
};

/* -------------------------------------------------------------------------- */
/*  Constants & helpers                                                       */
/* -------------------------------------------------------------------------- */

const APPROVAL_QUEUE_PAGE_SIZE = 50;
const MAX_STEPS = 10;
const MAX_REQUIRED_APPROVALS = 20;
const ROLE_KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;

const emptyStep = (): Step => ({
  approverUserId: '',
  approverRoleKey: '',
  requiredApprovals: 1,
});

function formValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function formatMoney(value: string | number, currency: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return `${currency} ${String(value)}`;
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-KE', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function statusTone(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-50 text-amber-700 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/30';
    case 'approved':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30';
    case 'rejected':
      return 'bg-red-50 text-red-700 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/30';
  }
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

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
  const [overlay, setOverlay] = useState<OverlayState>({
    open: false,
    type: 'info',
    title: '',
    message: '',
  });
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('');

  const isEditing = Boolean(policyId);

  /* ------------------------------------------------------------------------ */
  /*  Overlay helpers                                                         */
  /* ------------------------------------------------------------------------ */

  function showOverlay(
    type: SaMiOverlayType,
    title: string,
    message: string,
  ) {
    setOverlay({ open: true, type, title, message });
  }

  function closeOverlay() {
    setOverlay((current) => ({ ...current, open: false }));
  }

  /* ------------------------------------------------------------------------ */
  /*  Data                                                                    */
  /* ------------------------------------------------------------------------ */

  const refresh = useCallback(async () => {
    const response = await fetch(
      `/api/apps/sales?approvals=1&offset=0&limit=${APPROVAL_QUEUE_PAGE_SIZE}`,
      { cache: 'no-store', credentials: 'same-origin' },
    );
    const body = await response.json();
    if (!response.ok || body.success !== true) {
      throw new Error(body.error || 'Could not load approval policies.');
    }
    setPolicies(body.approvals.policies || []);
    setRequests(body.approvals.requests || []);
    setHasMore(body.approvals.hasMore === true);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => {
      showOverlay(
        'error',
        'Approvals unavailable',
        e instanceof Error ? e.message : 'Could not load approvals.',
      );
    });
  }, [refresh]);

  async function loadMoreRequests() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(
        `/api/apps/sales?approvals=1&offset=${requests.length}&limit=${APPROVAL_QUEUE_PAGE_SIZE}`,
        { cache: 'no-store', credentials: 'same-origin' },
      );
      const body = await response.json();
      if (!response.ok || body.success !== true) {
        throw new Error(body.error || 'Could not load more approval requests.');
      }
      const nextRequests = (body.approvals.requests || []) as ApprovalRequest[];
      setRequests((current) => {
        const knownIds = new Set(current.map((request) => request.request_id));
        return [
          ...current,
          ...nextRequests.filter((request) => !knownIds.has(request.request_id)),
        ];
      });
      setHasMore(body.approvals.hasMore === true);
    } catch (e) {
      showOverlay(
        'error',
        'Could not load more',
        e instanceof Error ? e.message : 'Could not load more approval requests.',
      );
    } finally {
      setLoadingMore(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /*  Form                                                                    */
  /* ------------------------------------------------------------------------ */

  function resetForm() {
    setPolicyId(null);
    setIsActive(true);
    setName('');
    setPriority('100');
    setMinTotal('');
    setMaxDiscount('');
    setMinMargin('');
    setCurrency('');
    setSteps([emptyStep()]);
  }

  function loadPolicyForEdit(policy: Policy) {
    setPolicyId(policy.id);
    setIsActive(policy.is_active);
    setName(policy.name);
    setPriority(String(policy.priority));
    setMinTotal(formValue(policy.min_quote_total));
    setMaxDiscount(formValue(policy.max_discount_percent));
    setMinMargin(formValue(policy.min_margin_percent));
    setCurrency(policy.currency_code || '');
    setSteps(
      (policy.steps || []).map((step) => ({
        approverUserId: String(step.approverUserId || ''),
        approverRoleKey: String(step.approverRoleKey || ''),
        requiredApprovals: Number(step.requiredApprovals || 1),
      })),
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validatePolicy(): string | null {
    if (!name.trim()) return 'Enter a policy name.';
    if (!Number.isFinite(Number(priority)) || Number(priority) < 1) {
      return 'Priority must be a whole number from 1 or higher.';
    }
    if (!minTotal && !maxDiscount && !minMargin) {
      return 'Set at least one trigger condition: minimum total, maximum discount, or minimum margin.';
    }

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const hasApprover =
        Boolean(step.approverUserId.trim()) || Boolean(step.approverRoleKey.trim());
      if (!hasApprover) {
        return `Step ${i + 1} needs an approver permission key or a user ID.`;
      }
      if (
        step.approverRoleKey &&
        !ROLE_KEY_PATTERN.test(step.approverRoleKey)
      ) {
        return `Step ${i + 1} permission key is invalid. Use lowercase letters, numbers, and . _ : - only.`;
      }
      if (
        !Number.isInteger(Number(step.requiredApprovals)) ||
        Number(step.requiredApprovals) < 1 ||
        Number(step.requiredApprovals) > MAX_REQUIRED_APPROVALS
      ) {
        return `Step ${i + 1} required approvals must be a whole number from 1 to ${MAX_REQUIRED_APPROVALS}.`;
      }
    }

    return null;
  }

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validatePolicy();
    if (validationError) {
      showOverlay('warning', 'Check the policy', validationError);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/apps/sales', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_approval_policy',
          policyId,
          isActive,
          name,
          priority,
          minQuoteTotal: minTotal || null,
          maxDiscountPercent: maxDiscount || null,
          minMarginPercent: minMargin || null,
          currencyCode: currency || null,
          steps: steps.map((step) => ({
            approverUserId: step.approverUserId || null,
            approverRoleKey: step.approverRoleKey || null,
            requiredApprovals: step.requiredApprovals,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success !== true) {
        throw new Error(body.error || 'Could not save policy.');
      }
      resetForm();
      showOverlay(
        'success',
        'Policy saved',
        'New submissions will use the active policy rules.',
      );
      await refresh();
    } catch (e) {
      showOverlay(
        'error',
        'Could not save policy',
        e instanceof Error ? e.message : 'Could not save policy.',
      );
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /*  Requests                                                                */
  /* ------------------------------------------------------------------------ */

  async function withdrawRequest(request: ApprovalRequest) {
    if (!request.canWithdraw) return;
    setBusy(true);
    try {
      const response = await fetch('/api/apps/sales', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel_quote_approval',
          quoteId: request.quote_id,
          reason:
            'Approval request withdrawn by the requester or an authorized Sales editor.',
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success !== true) {
        throw new Error(body.error || 'Could not withdraw the approval request.');
      }
      showOverlay(
        'success',
        'Request withdrawn',
        body.result?.cancelled === true
          ? 'The quotation is back in draft approval status.'
          : 'Approval request withdrawal completed.',
      );
      await refresh();
    } catch (e) {
      showOverlay(
        'error',
        'Could not withdraw',
        e instanceof Error ? e.message : 'Could not withdraw the approval request.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function reviewRequest(
    event: FormEvent<HTMLFormElement>,
    request: ApprovalRequest,
    decision: 'approve' | 'reject',
  ) {
    event.preventDefault();

    if (decision === 'reject' && !reviewReason.trim()) {
      showOverlay(
        'warning',
        'Reason required',
        'Enter a rejection reason so the audit trail explains the decision.',
      );
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/apps/sales', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review_quote_approval',
          quoteId: request.quote_id,
          decision,
          reason: decision === 'reject' ? reviewReason.trim() : null,
        }),
      });
      const body = await response.json();
      if (!response.ok || body.success !== true) {
        throw new Error(body.error || 'Could not record the approval decision.');
      }
      setReviewingRequestId(null);
      setReviewReason('');
      showOverlay(
        'success',
        decision === 'approve' ? 'Approval recorded' : 'Quotation rejected',
        decision === 'approve'
          ? body.result?.approvalStatus === 'approved'
            ? 'Quotation fully approved.'
            : 'Approval recorded. The next approval step is now active.'
          : 'The rejection reason has been recorded.',
      );
      await refresh();
    } catch (e) {
      showOverlay(
        'error',
        'Could not record decision',
        e instanceof Error ? e.message : 'Could not record the approval decision.',
      );
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /*  Steps                                                                   */
  /* ------------------------------------------------------------------------ */

  function patchStep(index: number, patch: Partial<Step>) {
    setSteps((old) =>
      old.map((step, position) =>
        position === index ? { ...step, ...patch } : step,
      ),
    );
  }

  function addStep() {
    if (steps.length >= MAX_STEPS) return;
    setSteps((old) => [...old, emptyStep()]);
  }

  function removeStep(index: number) {
    if (steps.length === 1) return;
    setSteps((old) => old.filter((_, position) => position !== index));
  }

  const pendingCount = requests.filter((request) => request.status === 'pending').length;

  /* ------------------------------------------------------------------------ */
  /*  Render                                                                 */
  /* ------------------------------------------------------------------------ */

  return (
    <section className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* Page header                                                        */}
      {/* ------------------------------------------------------------------ */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Sales · Quote approvals
          </p>
          <h1 className="mt-1 text-lg font-black tracking-tight">
            Approval workflow
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Configure approval triggers and sequential review steps. Each
            reviewer needs internal-approval permission. Use a role key for a
            group, or a user UUID for a specific approver.
          </p>
        </div>
        <Link
          href="/apps/sales"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Back to Sales
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Policy editor                                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
              <Workflow className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-black">
                {isEditing ? 'Edit approval policy' : 'Create approval policy'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                A policy triggers when any configured condition is met.
                Higher-priority policies are evaluated first.
              </p>
            </div>
          </div>
          {isEditing ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Cancel edit
            </button>
          ) : null}
        </div>

        <form onSubmit={savePolicy} className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FieldText
              label="Policy name"
              required
              value={name}
              onChange={setName}
              placeholder="Large quote approval"
              maxLength={160}
            />
            <FieldNumber
              label="Priority"
              min={1}
              value={priority}
              onChange={setPriority}
              hint="Lower number wins"
            />
            <FieldText
              label="Currency (optional)"
              value={currency}
              onChange={(value) => setCurrency(value.toUpperCase())}
              placeholder="KES"
              maxLength={3}
            />
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-800"
                />
                Active
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
              Trigger conditions
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Set at least one trigger. Empty fields are ignored.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <FieldNumber
                label="Minimum quote total"
                min={0}
                step={0.01}
                value={minTotal}
                onChange={setMinTotal}
                placeholder="Triggers at or above"
              />
              <FieldNumber
                label="Maximum discount %"
                min={0}
                max={100}
                step={0.1}
                value={maxDiscount}
                onChange={setMaxDiscount}
                placeholder="Triggers above cap"
              />
              <FieldNumber
                label="Minimum margin %"
                min={0}
                max={100}
                step={0.1}
                value={minMargin}
                onChange={setMinMargin}
                placeholder="Triggers below floor"
              />
            </div>
            <p className="mt-2 inline-flex items-start gap-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              With currency blank, minimum quote total is evaluated in the
              company base currency. Selecting a currency limits this policy to
              quotes in that currency.
            </p>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                Sequential approval steps
              </h3>
              <button
                type="button"
                onClick={addStep}
                disabled={steps.length >= MAX_STEPS}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add step
              </button>
            </div>

            <ol className="mt-3 space-y-3">
              {steps.map((step, index) => (
                <li
                  key={index}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white dark:bg-white dark:text-slate-950">
                        {index + 1}
                      </span>
                      <span className="text-xs font-black">Step {index + 1}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeStep(index)}
                      disabled={steps.length === 1}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                      aria-label={`Remove step ${index + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_140px]">
                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        Approver permission key
                      </span>
                      <input
                        value={step.approverRoleKey}
                        onChange={(event) =>
                          patchStep(index, {
                            approverRoleKey: event.target.value.toLowerCase(),
                          })
                        }
                        placeholder="sales.quote.approve_internal"
                        className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                      />
                      <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                        Lowercase letters, numbers, and . _ : - only.
                      </span>
                    </label>

                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        Specific user ID (optional)
                      </span>
                      <input
                        value={step.approverUserId}
                        onChange={(event) =>
                          patchStep(index, { approverUserId: event.target.value })
                        }
                        placeholder="User UUID"
                        className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                      />
                    </label>

                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                        Approvals required
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={MAX_REQUIRED_APPROVALS}
                        value={step.requiredApprovals}
                        onChange={(event) =>
                          patchStep(index, {
                            requiredApprovals: Number(event.target.value),
                          })
                        }
                        className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm tabular-nums focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                      />
                    </label>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={resetForm}
              disabled={busy}
              className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {isEditing ? 'Update policy' : 'Save policy'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Policies list                                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-black">Configured policies</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Rules applied to quotes before customer delivery.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {policies.length} total
          </span>
        </div>

        {policies.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div
              aria-hidden="true"
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
            >
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-black">No configurable policies yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
              The existing Sales approval threshold remains available as a
              compatibility fallback until you create a policy.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {policies.map((policy) => {
              const triggers: string[] = [];
              if (policy.min_quote_total != null) {
                triggers.push(
                  'total ≥ ' +
                    policy.min_quote_total +
                    ' ' +
                    (policy.currency_code || 'any currency'),
                );
              }
              if (policy.max_discount_percent != null) {
                triggers.push('discount > ' + policy.max_discount_percent + '%');
              }
              if (policy.min_margin_percent != null) {
                triggers.push('margin < ' + policy.min_margin_percent + '%');
              }

              return (
                <li
                  key={policy.id}
                  className="flex flex-wrap items-start gap-3 px-5 py-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-black">{policy.name}</h3>
                      <span
                        className={
                          policy.is_active
                            ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700 ring-1 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 ring-1 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300'
                        }
                      >
                        {policy.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        Priority {policy.priority}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {triggers.length > 0
                        ? triggers.join(' · ')
                        : 'No trigger conditions set.'}
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Workflow className="h-3 w-3" aria-hidden="true" />
                      {policy.steps?.length || 0} sequential step
                      {(policy.steps?.length || 0) === 1 ? '' : 's'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadPolicyForEdit(policy)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Approval queue                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-black">Approval queue</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Pending decisions and completed audit trail.
            </p>
          </div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700 ring-1 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-300">
            {pendingCount} pending
          </span>
        </div>

        {requests.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div
              aria-hidden="true"
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
            >
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-black">No approval requests yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
              Submissions from quotations matching a policy will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {requests.map((request) => {
              const isPending = request.status === 'pending';
              const showRejectForm = reviewingRequestId === request.request_id;

              return (
                <li key={request.request_id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={'/apps/sales/quotes/' + request.quote_id}
                          className="text-sm font-black underline decoration-slate-300 underline-offset-4 hover:decoration-current dark:decoration-slate-600"
                        >
                          {request.quote_number}
                        </Link>
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          · {request.customer_name}
                        </span>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                          {request.policy_name || 'Legacy approval'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {formatMoney(request.total_amount, request.currency)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Step {request.current_step_order}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDate(request.requested_at)}</span>
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ring-1 ${statusTone(request.status)}`}
                    >
                      {request.status}
                    </span>
                  </div>

                  {request.decisions?.length > 0 ? (
                    <details className="group mt-3 rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40">
                      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                        <span>
                          {request.decisions.length} decision
                          {request.decisions.length === 1 ? '' : 's'}
                        </span>
                        <ChevronDown
                          className="h-3.5 w-3.5 transition group-open:rotate-180"
                          aria-hidden="true"
                        />
                      </summary>
                      <ul className="divide-y divide-slate-200 px-3 pb-2 dark:divide-slate-800">
                        {request.decisions.map((decision, index) => (
                          <li
                            key={index}
                            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2 text-xs text-slate-600 dark:text-slate-300"
                          >
                            <span className="font-black uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                              Step {String(decision.stepOrder)}
                            </span>
                            <span className="font-black">
                              {String(decision.decision)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                              <UserRound className="h-3 w-3" aria-hidden="true" />
                              {String(decision.reviewerUserId)}
                            </span>
                            {decision.reason ? (
                              <span className="text-slate-500 dark:text-slate-400">
                                · {String(decision.reason)}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}

                  {isPending ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {request.canWithdraw ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void withdrawRequest(request)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-black text-amber-800 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          Withdraw
                        </button>
                      ) : null}

                      <form onSubmit={(event) => void reviewRequest(event, request, 'approve')}>
                        <button
                          type="submit"
                          disabled={busy}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white transition hover:bg-emerald-600 disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Approve step
                        </button>
                      </form>

                      {showRejectForm ? (
                        <form
                          onSubmit={(event) =>
                            void reviewRequest(event, request, 'reject')
                          }
                          className="w-full space-y-2 rounded-xl border border-rose-300/60 bg-rose-50/60 p-3 dark:border-rose-900/60 dark:bg-rose-950/30"
                        >
                          <label className="block text-xs font-bold text-rose-900 dark:text-rose-200">
                            Rejection reason *
                            <textarea
                              required
                              maxLength={2000}
                              rows={2}
                              value={reviewReason}
                              onChange={(event) => setReviewReason(event.target.value)}
                              className="mt-1 block w-full rounded-lg border border-rose-200 bg-white p-2 text-sm font-normal text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200 dark:border-rose-900 dark:bg-slate-950 dark:text-slate-100"
                              placeholder="Explain why this quotation is rejected."
                            />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="submit"
                              disabled={busy || !reviewReason.trim()}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-700 px-3 text-xs font-black text-white transition hover:bg-rose-600 disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <AlertTriangle
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              )}
                              Confirm rejection
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setReviewingRequestId(null);
                                setReviewReason('');
                              }}
                              className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setReviewingRequestId(request.request_id);
                            setReviewReason('');
                          }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 text-xs font-black text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:bg-slate-950 dark:text-rose-300 dark:hover:bg-rose-950/40"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          Reject
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {hasMore ? (
          <div className="flex justify-center border-t border-slate-200 px-5 py-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => void loadMoreRequests()}
              disabled={loadingMore || busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {loadingMore ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Single overlay for every success / warning / error / info          */}
      {/* ------------------------------------------------------------------ */}
      <SaMiOverlay
        open={overlay.open}
        type={overlay.type}
        title={overlay.title}
        message={overlay.message}
        onClose={closeOverlay}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Field sub-components                                                      */
/* -------------------------------------------------------------------------- */

function FieldText({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
      />
    </label>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm tabular-nums focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
      />
      {hint ? (
        <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      ) : null}
    </label>
  );
}