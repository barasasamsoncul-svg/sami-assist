'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
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
};

type FieldError = Partial<Record<'name' | 'currency' | 'priority' | 'validUntil', string>>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-KE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function validityTone(row: Pricelist): {
  label: string;
  tone: 'active' | 'upcoming' | 'expired' | 'inactive';
} {
  if (!row.isActive) return { label: 'Inactive', tone: 'inactive' };
  const today = todayIso();
  if (row.validUntil && row.validUntil < today) return { label: 'Expired', tone: 'expired' };
  if (row.validFrom && row.validFrom > today) return { label: 'Upcoming', tone: 'upcoming' };
  return { label: 'Active', tone: 'active' };
}

function toneClass(tone: 'active' | 'upcoming' | 'expired' | 'inactive'): string {
  switch (tone) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30';
    case 'upcoming':
      return 'bg-indigo-50 text-indigo-700 ring-indigo-500/20 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-500/30';
    case 'expired':
      return 'bg-red-50 text-red-700 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30';
    case 'inactive':
      return 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/30';
  }
}

export default function SalesPricelistsManager({
  data,
  busy,
  request,
  showSuccess,
  showError,
}: {
  data: SalesWorkspaceData;
  busy: boolean;
  request: (
    payload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}) {
  const defaultCurrency = data.settings.defaultCurrency || data.company.currency;

  const [pricelists, setPricelists] = useState<Pricelist[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all');

  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [customerId, setCustomerId] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [priority, setPriority] = useState('100');
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<FieldError>({});

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
        commercial?: { pricelists?: Pricelist[] };
      };

      if (!response.ok || body.success !== true) {
        throw new Error(body.error || 'SaMi could not load pricelists.');
      }

      setPricelists(body.commercial?.pricelists || []);
    } catch (error) {
      showError(
        'Pricelists unavailable',
        error instanceof Error ? error.message : 'SaMi could not load pricelists.',
      );
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const customerName = useCallback(
    (id: string | null) => {
      if (!id) return 'All customers';
      return data.billingCustomers.find((c) => c.id === id)?.name || 'Unknown customer';
    },
    [data.billingCustomers],
  );

  function reset() {
    setSelected('');
    setName('');
    setCode('');
    setCurrency(defaultCurrency);
    setCustomerId('');
    setValidFrom('');
    setValidUntil('');
    setPriority('100');
    setActive(true);
    setErrors({});
  }

  function load(id: string) {
    setSelected(id);
    setErrors({});
    const item = pricelists.find((row) => row.id === id);
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
  }

  function validate(): FieldError {
    const next: FieldError = {};
    if (!name.trim()) next.name = 'Name is required.';
    if (!/^[A-Z]{3}$/.test(currency)) next.currency = 'Use a 3-letter ISO currency (e.g. KES).';
    const p = Number(priority);
    if (!Number.isFinite(p) || p < 0) next.priority = 'Priority must be 0 or greater.';
    if (validFrom && validUntil && validUntil < validFrom) {
      next.validUntil = 'Valid until cannot be before valid from.';
    }
    return next;
  }

  async function save() {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      showError('Check the form', 'Please correct the highlighted fields before saving.');
      return;
    }

    try {
      await request({
        action: 'save_pricelist',
        id: selected || undefined,
        name: name.trim(),
        code: code.trim() || undefined,
        currency,
        billingCustomerId: customerId || undefined,
        validFrom: validFrom || undefined,
        validUntil: validUntil || undefined,
        priority: Number(priority),
        isActive: active,
      });

      showSuccess(
        selected ? 'Pricelist updated' : 'Pricelist created',
        'Scope, currency, validity and precedence saved. Advanced product/quantity rules in Part 9 are unchanged.',
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

  async function remove(row: Pricelist) {
    if (!window.confirm(`Deactivate pricelist "${row.name}"? This can be reversed by editing it.`)) {
      return;
    }
    try {
      await request({
        action: 'save_pricelist',
        id: row.id,
        name: row.name,
        code: row.code || undefined,
        currency: row.currency,
        billingCustomerId: row.billingCustomerId || undefined,
        validFrom: row.validFrom || undefined,
        validUntil: row.validUntil || undefined,
        priority: row.priority,
        isActive: false,
      });
      showSuccess('Pricelist deactivated', `"${row.name}" is now inactive.`);
      if (selected === row.id) reset();
      await refresh();
    } catch (error) {
      showError(
        'Deactivate failed',
        error instanceof Error ? error.message : 'SaMi could not deactivate the pricelist.',
      );
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pricelists.filter((row) => {
      const state = validityTone(row).tone;
      if (filter === 'active' && state !== 'active' && state !== 'upcoming') return false;
      if (filter === 'inactive' && row.isActive) return false;
      if (filter === 'expired' && state !== 'expired') return false;
      if (!q) return true;
      const haystack = [
        row.name,
        row.code || '',
        row.currency,
        customerName(row.billingCustomerId),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [pricelists, query, filter, customerName]);

  const canSave = !busy && !loading && name.trim().length > 0;

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
          Roadmap Part 8
        </p>
        <h2 className="mt-1 text-xl font-black">Pricelists</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Control customer scope, currency, validity and precedence separately from the
          advanced product and quantity rules in Part 9.
        </p>
      </div>

      {/* Editor */}
      <div className="sami-surface rounded-[24px] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <select
            value={selected}
            disabled={loading}
            onChange={(event) => load(event.target.value)}
            className="h-10 min-w-64 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
            aria-label="Select pricelist"
          >
            <option value="">New pricelist</option>
            {pricelists.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.currency}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
            >
              <Plus className="h-4 w-4" /> New
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Name" value={name} onChange={setName} error={errors.name} required />
          <Field label="Code" value={code} onChange={setCode} />
          <Field
            label="Currency"
            value={currency}
            onChange={(value) => setCurrency(value.toUpperCase().slice(0, 3))}
            error={errors.currency}
            required
            hint="ISO 4217, 3 letters"
          />
          <Field
            label="Priority"
            type="number"
            value={priority}
            onChange={setPriority}
            error={errors.priority}
            hint="Lower number = higher precedence"
          />

          <label className="block">
            <span className="text-xs font-black">
              Customer <span className="text-red-500">*</span>
            </span>
            <select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
            >
              <option value="">All customers</option>
              {data.billingCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>

          <Field label="Valid from" type="date" value={validFrom} onChange={setValidFrom} />
          <Field
            label="Valid until"
            type="date"
            value={validUntil}
            onChange={setValidUntil}
            error={errors.validUntil}
          />

          <label className="mt-5 flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            Active pricelist
          </label>
        </div>

        {Object.keys(errors).length > 0 ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 ring-1 ring-red-500/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-500/30">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Please fix the highlighted fields.</span>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <Info className="h-3 w-3" />
            {selected ? 'Editing existing pricelist' : 'Creating a new pricelist'}
          </p>
          <div className="flex gap-2">
            {selected ? (
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            ) : null}
            <button
              type="button"
              disabled={!canSave}
              onClick={() => void save()}
              className="h-10 rounded-xl bg-blue-600 px-5 text-xs font-black text-white disabled:opacity-60"
            >
              {busy ? 'Saving…' : selected ? 'Update pricelist' : 'Save pricelist'}
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="sami-surface rounded-[24px] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black">Existing pricelists</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {pricelists.length}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, code, customer…"
                className="h-9 w-56 rounded-xl border border-[var(--sami-border)] bg-transparent pl-8 pr-3 text-xs"
                aria-label="Search pricelists"
              />
            </label>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as typeof filter)}
              className="h-9 rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
              aria-label="Filter pricelists"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 space-y-2" aria-live="polite" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyList
            hasAny={pricelists.length > 0}
            onReset={() => {
              setQuery('');
              setFilter('all');
            }}
          />
        ) : (
          <ul className="mt-3 divide-y divide-[var(--sami-border)]">
            {filtered.map((row) => {
              const state = validityTone(row);
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => load(row.id)}
                        className="truncate text-left text-sm font-black underline decoration-slate-300 underline-offset-4 hover:decoration-current dark:decoration-slate-600"
                      >
                        {row.name}
                      </button>
                      {row.code ? (
                        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                          {row.code}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {row.currency}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.06em] ring-1 ${toneClass(state.tone)}`}
                      >
                        {state.label}
                      </span>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> {customerName(row.billingCustomerId)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3 w-3" /> {formatDate(row.validFrom)} →{' '}
                        {formatDate(row.validUntil)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Priority {row.priority}</span>
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => load(row.id)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--sami-border)] px-2.5 text-[11px] font-black"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    {row.isActive ? (
                      <button
                        type="button"
                        onClick={() => void remove(row)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 px-2.5 text-[11px] font-black text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-3 w-3" /> Deactivate
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400">
                        <CheckCircle2 className="h-3 w-3" /> Inactive
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  error,
  hint,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        className={`mt-1 h-10 w-full rounded-xl border bg-transparent px-3 text-sm ${
          error
            ? 'border-red-400 ring-1 ring-red-400/40'
            : 'border-[var(--sami-border)]'
        }`}
      />
      {error ? (
        <span className="mt-1 block text-[10px] font-bold text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}

function EmptyList({ hasAny, onReset }: { hasAny: boolean; onReset: () => void }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-[var(--sami-border)] px-4 py-8 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <Info className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-black">
        {hasAny ? 'No pricelists match your filters' : 'No pricelists yet'}
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
        {hasAny
          ? 'Try clearing the search or switching the filter back to All.'
          : 'Create your first pricelist to control customer scope, currency and validity.'}
      </p>
      {hasAny ? (
        <button
          type="button"
          onClick={onReset}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}