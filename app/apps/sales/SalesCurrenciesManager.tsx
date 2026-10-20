'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  ChevronDown,
  CircleDollarSign,
  Coins,
  Globe2,
  Info,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  TrendingUp,
} from 'lucide-react';

import SaMiOverlay, {
  type SaMiOverlayType,
} from '@/app/components/SaMiOverlay';

import type { SalesWorkspaceData } from '@/lib/apps/sales/types';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type CurrencyRow = {
  id: string | null;
  code: string;
  name: string;
  symbol: string | null;
  decimalPlaces: number;
  isBase: boolean;
  isActive: boolean;
};

type RateRow = {
  id: string;
  currency: string;
  baseCurrency: string;
  rate: number;
  effectiveDate: string;
  sourceType: string;
  sourceName: string | null;
  isActive: boolean;
};

type ExposureRow = {
  currency: string;
  documentCount: number;
  transactionTotal: number;
  baseTotal: number;
};

type CurrencyData = {
  baseCurrency: string;
  currencyCenterReady: boolean;
  currencies: CurrencyRow[];
  rates: RateRow[];
  quoteExposure: ExposureRow[];
  orderExposure: ExposureRow[];
};

type OverlayState = {
  open: boolean;
  type: SaMiOverlayType;
  title: string;
  message: string;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function money(value: number, currency: string): string {
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function SalesCurrenciesManager({
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
  const [currencyData, setCurrencyData] = useState<CurrencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currencyCode, setCurrencyCode] = useState('');
  const [currencyName, setCurrencyName] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('');
  const [rateCurrency, setRateCurrency] = useState('');
  const [rate, setRate] = useState('');
  const [rateDate, setRateDate] = useState(todayIso());

  const [overlay, setOverlay] = useState<OverlayState>({
    open: false,
    type: 'info',
    title: '',
    message: '',
  });

  function showOverlay(type: SaMiOverlayType, title: string, message: string) {
    setOverlay({ open: true, type, title, message });
  }

  function closeOverlay() {
    setOverlay((current) => ({ ...current, open: false }));
  }

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/apps/sales?currencies=1', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        currencies?: CurrencyData;
        error?: string;
      };
      if (!response.ok || body.success !== true || !body.currencies) {
        throw new Error(body.error || 'SaMi could not load Sales currency data.');
      }
      setCurrencyData(body.currencies);

      if (!rateCurrency) {
        const next = body.currencies.currencies.find(
          (item) => item.isActive && !item.isBase,
        );
        if (next) setRateCurrency(next.code);
      }
    } catch (error) {
      showError(
        'Currency data unavailable',
        error instanceof Error
          ? error.message
          : 'SaMi could not load Sales currency data.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveCurrency(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await request({
        action: 'save_currency',
        code: currencyCode,
        name: currencyName,
        symbol: currencySymbol || undefined,
        decimalPlaces: 2,
        isActive: true,
      });
      showOverlay(
        'success',
        'Currency saved',
        'The shared Currency Center was updated.',
      );
      setCurrencyCode('');
      setCurrencyName('');
      setCurrencySymbol('');
      await refresh();
    } catch (error) {
      showOverlay(
        'error',
        'Currency save failed',
        error instanceof Error ? error.message : 'SaMi could not save this currency.',
      );
    }
  }

  async function saveRate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await request({
        action: 'save_exchange_rate',
        currency: rateCurrency,
        rate: Number(rate),
        effectiveDate: rateDate,
        sourceType: 'manual',
        sourceName: 'Sales Currency & FX',
      });
      showOverlay(
        'success',
        'Exchange rate saved',
        'New Sales documents can now lock this dated rate.',
      );
      setRate('');
      await refresh();
    } catch (error) {
      showOverlay(
        'error',
        'Exchange rate save failed',
        error instanceof Error ? error.message : 'SaMi could not save this exchange rate.',
      );
    }
  }

  const baseCurrency = currencyData?.baseCurrency || data.company.currency;
  const activeCurrencies = currencyData?.currencies.filter((item) => item.isActive) || [];
  const canManagePricing = data.capabilities.canManagePricing;
  const currencyCenterReady = currencyData?.currencyCenterReady === true;

  return (
    <section className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Sales · Currency & FX
          </p>
          <h2 className="mt-1 text-lg font-black tracking-tight">
            Currency &amp; FX
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            Preserve transaction currency on quotations and orders, lock dated
            exchange rates, and report commercial exposure in the company base
            currency.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Refresh
        </button>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Info: Currency Center missing                                      */}
      {/* ------------------------------------------------------------------ */}
      {!loading && currencyData && !currencyCenterReady ? (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-black">Shared Currency Center is not installed</p>
            <p className="mt-1 text-xs leading-5">
              Base-currency Sales remains available. For another currency, enter
              a manual exchange rate in the quotation composer; the rate is
              locked onto the document.
            </p>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* KPI strip                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          icon={<Banknote className="h-4 w-4" aria-hidden="true" />}
          label="Base currency"
          value={baseCurrency}
          detail="All exposure is reported in this currency"
        />
        <KpiCard
          icon={<Globe2 className="h-4 w-4" aria-hidden="true" />}
          label="Active currencies"
          value={String(activeCurrencies.length || 1)}
          detail="Available in quote & order composers"
        />
        <KpiCard
          icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
          label="Dated rates"
          value={String(currencyData?.rates.length || 0)}
          detail="Locked to document dates"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Editors                                                            */}
      {/* ------------------------------------------------------------------ */}
      {canManagePricing && currencyCenterReady ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {/* Currency editor */}
          <form
            onSubmit={saveCurrency}
            className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          >
            <FormHeader
              icon={<Coins className="h-4 w-4" aria-hidden="true" />}
              title="Add or update currency"
              subtitle="Registers a currency with the shared Currency Center."
            />
            <div className="space-y-3 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <FieldInput
                  label="ISO code"
                  value={currencyCode}
                  onChange={(value) => setCurrencyCode(value.toUpperCase().slice(0, 3))}
                  placeholder="USD"
                  maxLength={3}
                  required
                />
                <FieldInput
                  label="Name"
                  value={currencyName}
                  onChange={setCurrencyName}
                  placeholder="US Dollar"
                  required
                />
                <FieldInput
                  label="Symbol"
                  value={currencySymbol}
                  onChange={setCurrencySymbol}
                  placeholder="$"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Save currency
                </button>
              </div>
            </div>
          </form>

          {/* Rate editor */}
          <form
            onSubmit={saveRate}
            className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          >
            <FormHeader
              icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
              title="Add dated exchange rate"
              subtitle={`Locks a rate against ${baseCurrency} for the effective date.`}
            />
            <div className="space-y-3 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                    Currency
                  </span>
                  <div className="relative mt-1">
                    <select
                      value={rateCurrency}
                      onChange={(event) => setRateCurrency(event.target.value)}
                      required
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pr-9 pl-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                    >
                      <option value="">Choose currency</option>
                      {activeCurrencies
                        .filter((item) => !item.isBase)
                        .map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.code} · {item.name}
                          </option>
                        ))}
                    </select>
                    <ChevronDown
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </label>
                <FieldInput
                  label={`Rate to ${baseCurrency}`}
                  type="number"
                  value={rate}
                  onChange={setRate}
                  placeholder="1.00000000"
                  step="0.00000001"
                  min="0.00000001"
                  required
                />
                <FieldInput
                  label="Effective date"
                  type="date"
                  value={rateDate}
                  onChange={setRateDate}
                  required
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Save exchange rate
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Exposure                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 xl:grid-cols-2">
        <ExposurePanel
          title="Quotation exposure"
          rows={currencyData?.quoteExposure || []}
          baseCurrency={baseCurrency}
        />
        <ExposurePanel
          title="Sales-order exposure"
          rows={currencyData?.orderExposure || []}
          baseCurrency={baseCurrency}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Latest rates                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-black">Latest exchange rates</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Newest first. Historical rates remain available to documents that
              already locked them.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {(currencyData?.rates || []).length} total
          </span>
        </div>

        {(currencyData?.rates || []).length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div
              aria-hidden="true"
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
            >
              <CalendarClock className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-black">No exchange rates yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
              Dated rates added above will appear here, ordered by effective
              date.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th scope="col" className="px-5 py-3 font-black">
                    Currency
                  </th>
                  <th scope="col" className="px-3 py-3 font-black">
                    Base
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-black">
                    Rate
                  </th>
                  <th scope="col" className="px-3 py-3 font-black">
                    Effective
                  </th>
                  <th scope="col" className="px-5 py-3 font-black">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(currencyData?.rates || []).slice(0, 30).map((item) => (
                  <tr
                    key={item.id}
                    className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <th scope="row" className="px-5 py-3 text-left font-black">
                      {item.currency}
                    </th>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400">
                      {item.baseCurrency}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {item.rate.toLocaleString(undefined, {
                        maximumFractionDigits: 8,
                      })}
                    </td>
                    <td className="px-3 py-3 text-slate-500 dark:text-slate-400">
                      {item.effectiveDate}
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                      {item.sourceName || item.sourceType}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function KpiCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
          {label}
        </p>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          {icon}
        </span>
      </div>
      <p className="mt-2 break-words text-2xl font-black tabular-nums tracking-tight">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {detail}
      </p>
    </div>
  );
}

function FormHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
        {icon}
      </span>
      <div>
        <h3 className="text-sm font-black">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
  min,
  max,
  step,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        min={min}
        max={max}
        step={step}
        maxLength={maxLength}
        placeholder={placeholder}
        className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500 dark:focus:ring-slate-800"
      />
    </label>
  );
}

function ExposurePanel({
  title,
  rows,
  baseCurrency,
}: {
  title: string;
  rows: ExposureRow[];
  baseCurrency: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-black">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Reported in {baseCurrency}.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <div
            aria-hidden="true"
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
          >
            <Info className="h-4 w-4" />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            No open exposure.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {rows.map((row) => (
            <li
              key={row.currency}
              className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {row.currency}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {row.documentCount} document{row.documentCount === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="mt-1 text-sm font-black tabular-nums">
                  {money(row.transactionTotal, row.currency)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Base: {money(row.baseTotal, baseCurrency)}
                </p>
              </div>
              <Plus className="hidden" aria-hidden="true" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}