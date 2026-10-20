'use client';

import {
  AlertTriangle,
  ChevronDown,
  CircleDollarSign,
  Info,
  Percent,
  Plus,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import type {
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type Rule = {
  key: string;
  catalogItemId: string;
  minQuantity: string;
  calculation: 'fixed' | 'discount_percent' | 'markup_percent';
  amount: string;
  priority: string;
};

type Pricelist = {
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

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function id(): string {
  return (
    globalThis.crypto?.randomUUID?.() ||
    Math.random().toString(36).slice(2)
  );
}

function blank(): Rule {
  return {
    key: id(),
    catalogItemId: '',
    minQuantity: '1',
    calculation: 'fixed',
    amount: '0',
    priority: '100',
  };
}

function normalize(rule: Pricelist['rules'][number]): Rule {
  return {
    key: rule.id || id(),
    catalogItemId: rule.catalogItemId || '',
    minQuantity: String(rule.minQuantity ?? 1),
    calculation:
      rule.calculation === 'discount_percent' ||
      rule.calculation === 'markup_percent'
        ? rule.calculation
        : 'fixed',
    amount: String(rule.amount ?? 0),
    priority: String(rule.priority ?? 100),
  };
}

function calculationLabel(value: Rule['calculation']): string {
  switch (value) {
    case 'fixed':
      return 'Fixed price';
    case 'discount_percent':
      return 'Discount %';
    case 'markup_percent':
      return 'Markup %';
  }
}

function calculationIcon(value: Rule['calculation']) {
  switch (value) {
    case 'fixed':
      return <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />;
    case 'discount_percent':
      return <Percent className="h-3.5 w-3.5" aria-hidden="true" />;
    case 'markup_percent':
      return <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />;
  }
}

function calculationTone(value: Rule['calculation']): string {
  switch (value) {
    case 'fixed':
      return 'bg-indigo-50 text-indigo-700 ring-indigo-500/20 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-500/30';
    case 'discount_percent':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-500/30';
    case 'markup_percent':
      return 'bg-amber-50 text-amber-700 ring-amber-500/20 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-500/30';
  }
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function SalesAdvancedPricingManager({
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
  const [pricelists, setPricelists] = useState<Pricelist[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [rules, setRules] = useState<Rule[]>([blank()]);
  const [loading, setLoading] = useState(true);

  const selected = useMemo(
    () => pricelists.find((item) => item.id === selectedId) || null,
    [pricelists, selectedId],
  );

  const catalogById = useMemo(() => {
    const map = new Map<string, SalesWorkspaceData['catalogItems'][number]>();
    for (const item of data.catalogItems) map.set(item.id, item);
    return map;
  }, [data.catalogItems]);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/apps/sales?commercial=1', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        commercial?: { pricelists?: Pricelist[] };
      };

      if (!response.ok || body.success !== true) {
        throw new Error(body.error || 'SaMi could not load advanced pricing.');
      }

      const rows = body.commercial?.pricelists || [];
      setPricelists(rows);

      if (selectedId) {
        const current = rows.find((item) => item.id === selectedId);
        setRules(
          current && current.rules.length > 0
            ? current.rules.map(normalize)
            : [blank()],
        );
      }
    } catch (error) {
      showError(
        'Advanced pricing unavailable',
        error instanceof Error
          ? error.message
          : 'SaMi could not load advanced pricing.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function choose(next: string) {
    setSelectedId(next);
    const item = pricelists.find((row) => row.id === next);
    setRules(
      item && item.rules.length > 0 ? item.rules.map(normalize) : [blank()],
    );
  }

  function patch(index: number, update: Partial<Rule>) {
    setRules((current) =>
      current.map((rule, position) =>
        position === index ? { ...rule, ...update } : rule,
      ),
    );
  }

  function remove(index: number) {
    setRules((current) => current.filter((_, position) => position !== index));
  }

  async function save() {
    const current = pricelists.find((item) => item.id === selectedId);

    if (!current) {
      showError(
        'Choose a pricelist',
        'Create or select a pricelist before adding pricing rules.',
      );
      return;
    }

    try {
      await request({
        action: 'save_pricelist',
        id: current.id,
        name: current.name,
        code: current.code || undefined,
        currency: current.currency,
        billingCustomerId: current.billingCustomerId || undefined,
        validFrom: current.validFrom || undefined,
        validUntil: current.validUntil || undefined,
        priority: current.priority,
        isActive: current.isActive,
        rules: rules.map((rule) => ({
          catalogItemId: rule.catalogItemId || undefined,
          minQuantity: Number(rule.minQuantity),
          calculation: rule.calculation,
          amount: Number(rule.amount),
          priority: Number(rule.priority),
        })),
      });

      showSuccess(
        'Advanced pricing saved',
        'Product and quantity pricing rules were replaced atomically for this pricelist.',
      );

      await refresh();
    } catch (error) {
      showError(
        'Advanced pricing save failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not save advanced pricing.',
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /*  Render                                                                 */
  /* ------------------------------------------------------------------------ */

  const saveDisabled = busy || loading || !selectedId;

  return (
    <section className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-black tracking-tight">Advanced pricing</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Product-specific and quantity-break rules using fixed prices,
            percentage discounts or markups. Precedence is resolved server-side.
          </p>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saveDisabled}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          {busy ? (
            <>
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              Saving…
            </>
          ) : (
            'Save advanced pricing'
          )}
        </button>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Pricelist selector                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="block max-w-xl">
          <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
            Pricelist
          </span>
          <div className="relative mt-1">
            <select
              value={selectedId}
              onChange={(event) => choose(event.target.value)}
              disabled={loading}
              className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pr-9 pl-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
            >
              <option value="">Choose pricelist</option>
              {pricelists.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.currency}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
          </div>
        </label>

        {selected ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Tag className="h-3 w-3" aria-hidden="true" />
              {selected.currency}
            </span>
            <span
              className={
                selected.isActive
                  ? 'inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }
            >
              {selected.isActive ? 'Active' : 'Inactive'}
            </span>
            {selected.validUntil ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Valid until {selected.validUntil}
              </span>
            ) : null}
            <span className="ml-auto text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
              Priority {selected.priority}
            </span>
          </div>
        ) : (
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            Select a pricelist to edit its product and quantity rules.
          </p>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Rules editor                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-black">Pricing rules</h3>
            <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Product rules outrank global rules. The highest eligible quantity
              break wins before priority.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRules((current) => [...current, blank()])}
            disabled={!selectedId}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add rule
          </button>
        </div>

        {rules.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No rules yet. Add a rule to apply product- or quantity-based pricing.
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {rules.map((rule, index) => (
              <li key={rule.key} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                      Rule {index + 1}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] ring-1 ${calculationTone(rule.calculation)}`}
                    >
                      {calculationIcon(rule.calculation)}
                      {calculationLabel(rule.calculation)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => remove(index)}
                    disabled={rules.length === 1}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                    aria-label={`Remove pricing rule ${index + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.6fr_0.7fr_1fr_0.8fr_0.7fr]">
                  <FieldSelect
                    label="Product"
                    value={rule.catalogItemId}
                    onChange={(value) => patch(index, { catalogItemId: value })}
                  >
                    <option value="">All products</option>
                    {data.catalogItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.sku ? ` · ${item.sku}` : ''}
                      </option>
                    ))}
                  </FieldSelect>

                  <FieldInput
                    label="Min qty"
                    value={rule.minQuantity}
                    onChange={(value) => patch(index, { minQuantity: value })}
                    suffix="units"
                  />

                  <FieldSelect
                    label="Method"
                    value={rule.calculation}
                    onChange={(value) =>
                      patch(index, { calculation: value as Rule['calculation'] })
                    }
                  >
                    <option value="fixed">Fixed price</option>
                    <option value="discount_percent">Discount %</option>
                    <option value="markup_percent">Markup %</option>
                  </FieldSelect>

                  <FieldInput
                    label={rule.calculation === 'fixed' ? 'Price' : 'Percent'}
                    value={rule.amount}
                    onChange={(value) => patch(index, { amount: value })}
                    suffix={rule.calculation === 'fixed' ? selected?.currency ?? '' : '%'}
                  />

                  <FieldInput
                    label="Priority"
                    value={rule.priority}
                    onChange={(value) => patch(index, { priority: value })}
                    suffix="rank"
                  />
                </div>

                {/* Contextual preview line */}
                {rule.catalogItemId ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    Applies to {catalogById.get(rule.catalogItemId)?.name ?? 'selected product'} from{' '}
                    {rule.minQuantity || '1'} units.
                  </p>
                ) : (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    Global rule — applies to any product without a more specific rule.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Footer hint                                                        */}
      {/* ------------------------------------------------------------------ */}
      <p className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        Saving replaces this pricelist&apos;s rules atomically — no partial rule set
        can be persisted.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-fields                                                                */
/* -------------------------------------------------------------------------- */

function FieldInput({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <div className="relative mt-1">
        <input
          type="number"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 pr-12 text-sm tabular-nums focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
            {suffix}
          </span>
        ) : null}
      </div>
    </label>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <div className="relative mt-1">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pr-9 pl-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
      </div>
    </label>
  );
}