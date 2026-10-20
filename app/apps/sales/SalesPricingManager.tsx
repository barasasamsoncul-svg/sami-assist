'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
} from 'lucide-react';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type {
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';

type Rule = {
  key: string;
  catalogItemId: string;
  minQuantity: string;
  calculation: 'fixed' | 'discount_percent' | 'markup_percent';
  amount: string;
  priority: string;
};

type CommercialPricelist = {
  id: string;
  name: string;
  code: string | null;
  currency: string;
  billingCustomerId: string | null;
  validFrom: string | null;
  validUntil: string | null;
  priority: number;
  isActive: boolean;
  rules: Array<{
    id?: string;
    catalogItemId?: string | null;
    minQuantity?: number | string;
    calculation?: string;
    amount?: number | string;
    priority?: number | string;
  }>;
};

type RuleError = {
  catalogItemId?: string;
  minQuantity?: string;
  amount?: string;
  priority?: string;
};

function key(): string {
  return (
    globalThis.crypto?.randomUUID?.() ||
    Math.random().toString(36).slice(2)
  );
}

function blankRule(): Rule {
  return {
    key: key(),
    catalogItemId: '',
    minQuantity: '1',
    calculation: 'fixed',
    amount: '0',
    priority: '100',
  };
}

function normalizeRule(rule: CommercialPricelist['rules'][number]): Rule {
  const calculation =
    rule.calculation === 'discount_percent' || rule.calculation === 'markup_percent'
      ? rule.calculation
      : 'fixed';

  return {
    key: rule.id || key(),
    catalogItemId: rule.catalogItemId || '',
    minQuantity: String(rule.minQuantity ?? 1),
    calculation,
    amount: String(rule.amount ?? 0),
    priority: String(rule.priority ?? 100),
  };
}

function calculationLabel(rule: Rule): string {
  if (rule.calculation === 'discount_percent') return `-${rule.amount}%`;
  if (rule.calculation === 'markup_percent') return `+${rule.amount}%`;
  return `Fixed ${rule.amount}`;
}

export default function SalesPricingManager({
  data,
  busy,
  request,
  showSuccess,
  showError,
}: {
  data: SalesWorkspaceData;
  busy: boolean;
  request: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}) {
  const defaultCurrency = data.settings.defaultCurrency || data.company.currency;

  const [pricelists, setPricelists] = useState<CommercialPricelist[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [customerId, setCustomerId] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [priority, setPriority] = useState('100');
  const [active, setActive] = useState(true);
  const [rules, setRules] = useState<Rule[]>([blankRule()]);
  const [ruleErrors, setRuleErrors] = useState<Record<string, RuleError>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/apps/sales?commercial=1', {
        cache: 'no-store',
        credentials: 'same-origin',
      });

      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        commercial?: { pricelists?: CommercialPricelist[] };
      };

      if (!response.ok || body.success !== true) {
        throw new Error(body.error || 'SaMi could not load Sales pricelists.');
      }

      setPricelists(body.commercial?.pricelists || []);
    } catch (error) {
      showError(
        'Pricelists unavailable',
        error instanceof Error ? error.message : 'SaMi could not load Sales pricelists.',
      );
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = useMemo(
    () => pricelists.find((item) => item.id === selectedId) || null,
    [pricelists, selectedId],
  );

  function reset() {
    setSelectedId('');
    setName('');
    setCode('');
    setCurrency(defaultCurrency);
    setCustomerId('');
    setValidFrom('');
    setValidUntil('');
    setPriority('100');
    setActive(true);
    setRules([blankRule()]);
    setRuleErrors({});
    setFormError(null);
    setRuleToDelete(null);
  }

  function load(id: string) {
    setSelectedId(id);
    setRuleErrors({});
    setFormError(null);
    setRuleToDelete(null);

    const item = pricelists.find((candidate) => candidate.id === id);
    if (!item) {
      reset();
      return;
    }

    setName(item.name);
    setCode(item.code || '');
    setCurrency(item.currency);
    setCustomerId(item.billingCustomerId || '');
    setValidFrom(item.validFrom || '');
    setValidUntil(item.validUntil || '');
    setPriority(String(item.priority));
    setActive(item.isActive);
    setRules(item.rules.length > 0 ? item.rules.map(normalizeRule) : [blankRule()]);
  }

  function patchRule(index: number, patch: Partial<Rule>) {
    setRules((current) =>
      current.map((rule, position) =>
        position === index ? { ...rule, ...patch } : rule,
      ),
    );
    const ruleKey = rules[index]?.key;
    if (ruleKey && ruleErrors[ruleKey]) {
      setRuleErrors((current) => {
        const next = { ...current };
        delete next[ruleKey];
        return next;
      });
    }
  }

  function requestDeleteRule(ruleKey: string) {
    if (rules.length === 1) return;
    setRuleToDelete(ruleKey);
  }

  function confirmDeleteRule() {
    if (!ruleToDelete) return;
    setRules((current) => current.filter((rule) => rule.key !== ruleToDelete));
    setRuleErrors((current) => {
      const next = { ...current };
      delete next[ruleToDelete];
      return next;
    });
    setRuleToDelete(null);
  }

  function validate(): { form?: string; rules: Record<string, RuleError> } {
    const nextRules: Record<string, RuleError> = {};
    let form: string | undefined;

    if (!name.trim()) form = 'Pricelist name is required.';
    else if (!/^[A-Z]{3}$/.test(currency))
      form = 'Currency must be a 3-letter ISO code (e.g. KES).';
    else if (validFrom && validUntil && validUntil < validFrom)
      form = 'Valid until cannot be before valid from.';

    rules.forEach((rule) => {
      const error: RuleError = {};
      const minQty = Number(rule.minQuantity);
      const amount = Number(rule.amount);
      const rulePriority = Number(rule.priority);

      if (!Number.isFinite(minQty) || minQty < 1)
        error.minQuantity = 'Min qty must be ≥ 1.';
      if (!Number.isFinite(amount))
        error.amount = 'Enter a number.';
      else if (rule.calculation !== 'fixed' && (amount < 0 || amount > 100))
        error.amount = 'Percent must be between 0 and 100.';
      else if (rule.calculation === 'fixed' && amount < 0)
        error.amount = 'Price cannot be negative.';
      if (!Number.isFinite(rulePriority) || rulePriority < 0)
        error.priority = 'Priority must be ≥ 0.';

      if (Object.keys(error).length > 0) nextRules[rule.key] = error;
    });

    return { form, rules: nextRules };
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const result = validate();
    setRuleErrors(result.rules);
    if (result.form) setFormError(result.form);
    if (result.form || Object.keys(result.rules).length > 0) {
      showError(
        'Check the form',
        result.form || 'Some pricing rules have invalid values. Fix the highlighted fields.',
      );
      return;
    }

    try {
      await request({
        action: 'save_pricelist',
        id: selectedId || undefined,
        name: name.trim(),
        code: code.trim() || undefined,
        currency,
        billingCustomerId: customerId || undefined,
        validFrom: validFrom || undefined,
        validUntil: validUntil || undefined,
        priority: Number(priority),
        isActive: active,
        rules: rules.map((rule) => ({
          catalogItemId: rule.catalogItemId || undefined,
          minQuantity: Number(rule.minQuantity),
          calculation: rule.calculation,
          amount: Number(rule.amount),
          priority: Number(rule.priority),
        })),
      });

      showSuccess(
        selectedId ? 'Pricelist updated' : 'Pricelist created',
        `${rules.length} pricing rule${rules.length === 1 ? '' : 's'} saved. Applied server-side on the next quotation save.`,
      );

      reset();
      await refresh();
    } catch (error) {
      showError(
        'Pricelist save failed',
        error instanceof Error ? error.message : 'SaMi could not save the pricelist.',
      );
    }
  }

  const ruleToDeleteRule = rules.find((rule) => rule.key === ruleToDelete) || null;

  return (
    <section className="sami-surface rounded-[24px] p-4 xl:col-span-2">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
            Commercial pricing
          </p>
          <h2 className="mt-1 text-sm font-black">Pricelists & quantity rules</h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            Set customer, product and quantity pricing without changing the base
            catalog. Rules are applied server-side when a quotation is saved.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(event) => load(event.target.value)}
            disabled={loading}
            className="h-10 min-w-64 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
            aria-label="Select pricelist"
          >
            <option value="">New pricelist</option>
            {pricelists.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.currency}
                {item.isActive ? '' : ' · inactive'}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {selected ? (
        <p className="mt-3 inline-flex items-start gap-1.5 rounded-xl bg-blue-500/10 px-3 py-2 text-[11px] font-bold text-blue-700 dark:text-blue-300">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Editing <strong>{selected.name}</strong>. Saving replaces its pricing rules
            atomically.
          </span>
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name" value={name} onChange={setName} required />
          <Field label="Code" value={code} onChange={setCode} />
          <Field
            label="Currency"
            value={currency}
            onChange={(value) => setCurrency(value.toUpperCase().slice(0, 3))}
            required
            hint="ISO 4217, 3 letters"
          />
          <Field
            label="Priority"
            value={priority}
            onChange={setPriority}
            type="number"
            hint="Lower = higher precedence"
          />

          <label className="block">
            <Label>Customer</Label>
            <select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
            >
              <option value="">All customers</option>
              {data.billingCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>

          <Field label="Valid from" value={validFrom} onChange={setValidFrom} type="date" />
          <Field
            label="Valid until"
            value={validUntil}
            onChange={setValidUntil}
            type="date"
          />

          <label className="flex h-11 items-center gap-3 self-end rounded-xl border border-[var(--sami-border)] px-3 text-xs font-bold">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            Active
          </label>
        </div>

        {formError ? (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 ring-1 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{formError}</span>
          </div>
        ) : null}

        <div className="rounded-2xl border border-[var(--sami-border)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--sami-border)] p-3">
            <div>
              <p className="text-xs font-black">Pricing rules</p>
              <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                Product-specific rules outrank general rules. Higher eligible quantity
                breaks win before priority.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRules((current) => [...current, blankRule()])}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
            >
              <Plus className="h-4 w-4" /> Add rule
            </button>
          </div>

          <div className="space-y-3 p-3">
            {rules.map((rule, index) => {
              const errors = ruleErrors[rule.key] || {};
              const hasError = Object.keys(errors).length > 0;
              const product = rule.catalogItemId
                ? data.catalogItems.find((item) => item.id === rule.catalogItemId)
                : null;

              return (
                <div
                  key={rule.key}
                  className={`rounded-xl border p-3 transition-colors ${
                    hasError
                      ? 'border-red-400/70 bg-red-50/40 dark:bg-red-950/20'
                      : 'border-[var(--sami-border)]'
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        Rule {index + 1}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700 ring-1 ring-indigo-500/20 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-500/30">
                        <Tag className="h-3 w-3" />
                        {product ? product.name : 'All products'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        ≥ {rule.minQuantity} · {calculationLabel(rule)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => requestDeleteRule(rule.key)}
                      disabled={rules.length === 1}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-500/30 px-2 text-[11px] font-black text-red-600 hover:bg-red-50 disabled:opacity-30 dark:hover:bg-red-950/40"
                      aria-label={`Remove pricing rule ${index + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.5fr_0.7fr_1fr_0.8fr_0.7fr]">
                    <label>
                      <Label>Product</Label>
                      <select
                        value={rule.catalogItemId}
                        onChange={(event) =>
                          patchRule(index, { catalogItemId: event.target.value })
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                      >
                        <option value="">All products</option>
                        {data.catalogItems.map((productOption) => (
                          <option key={productOption.id} value={productOption.id}>
                            {productOption.name}
                          </option>
                        ))}
                      </select>
                      {errors.catalogItemId ? (
                        <ErrorText>{errors.catalogItemId}</ErrorText>
                      ) : null}
                    </label>

                    <Field
                      label="Min qty"
                      value={rule.minQuantity}
                      onChange={(value) => patchRule(index, { minQuantity: value })}
                      type="number"
                      compact
                      error={errors.minQuantity}
                    />

                    <label>
                      <Label>Method</Label>
                      <select
                        value={rule.calculation}
                        onChange={(event) =>
                          patchRule(index, {
                            calculation: event.target.value as Rule['calculation'],
                          })
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                      >
                        <option value="fixed">Fixed price</option>
                        <option value="discount_percent">Discount %</option>
                        <option value="markup_percent">Markup %</option>
                      </select>
                    </label>

                    <Field
                      label={rule.calculation === 'fixed' ? 'Price' : 'Percent'}
                      value={rule.amount}
                      onChange={(value) => patchRule(index, { amount: value })}
                      type="number"
                      compact
                      error={errors.amount}
                    />

                    <Field
                      label="Priority"
                      value={rule.priority}
                      onChange={(value) => patchRule(index, { priority: value })}
                      type="number"
                      compact
                      error={errors.priority}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {Object.keys(ruleErrors).length > 0 ? (
            <div className="flex items-start gap-2 border-t border-red-500/20 bg-red-50/60 px-3 py-2 text-[11px] font-bold text-red-700 dark:bg-red-950/30 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {Object.keys(ruleErrors).length} rule
                {Object.keys(ruleErrors).length === 1 ? '' : 's'} need attention.
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {selectedId ? 'Editing existing pricelist' : 'Creating a new pricelist'} ·{' '}
            {rules.length} rule{rules.length === 1 ? '' : 's'}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {selectedId ? (
              <button
                type="button"
                onClick={reset}
                className="h-10 rounded-xl border border-[var(--sami-border)] px-4 text-xs font-black"
              >
                New pricelist
              </button>
            ) : null}
            <button
              type="submit"
              disabled={busy || loading}
              className="h-10 rounded-xl bg-blue-600 px-5 text-xs font-black text-white disabled:opacity-60"
            >
              {busy ? 'Saving…' : selectedId ? 'Update pricelist' : 'Save pricelist'}
            </button>
          </div>
        </div>
      </form>

      {/* Delete-rule confirm overlay (Sami style) */}
      {ruleToDeleteRule ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-rule-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--sami-border)] bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p id="delete-rule-title" className="text-sm font-black">
                  Remove this pricing rule?
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {ruleToDeleteRule.catalogItemId
                    ? data.catalogItems.find(
                        (item) => item.id === ruleToDeleteRule.catalogItemId,
                      )?.name || 'Selected product'
                    : 'All products'}{' '}
                  · ≥ {ruleToDeleteRule.minQuantity} · {calculationLabel(ruleToDeleteRule)}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRuleToDelete(null)}
                className="h-9 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteRule}
                className="h-9 rounded-xl bg-red-600 px-3 text-xs font-black text-white hover:bg-red-700"
              >
                Remove rule
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
      {children}
    </span>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-1 block text-[10px] font-bold text-red-600 dark:text-red-400">
      {children}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  compact = false,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  compact?: boolean;
  error?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <Label>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </Label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min={type === 'number' ? '0' : undefined}
        step={type === 'number' ? '0.01' : undefined}
        aria-invalid={Boolean(error)}
        className={
          'mt-1 w-full rounded-lg border bg-transparent px-3 text-sm ' +
          (compact ? 'h-10 ' : 'h-11 ') +
          (error
            ? 'border-red-400 ring-1 ring-red-400/40'
            : 'border-[var(--sami-border)]')
        }
      />
      {error ? <ErrorText>{error}</ErrorText> : hint ? (
        <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      ) : null}
    </label>
  );
}