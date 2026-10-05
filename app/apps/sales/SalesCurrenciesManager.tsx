'use client';

import {
  useEffect,
  useState,
} from 'react';

import type {
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';


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


function money(
  value: number,
  currency: string,
) {
  try {
    return new Intl.NumberFormat(
      'en-KE',
      {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      },
    ).format(value);
  } catch {
    return currency + ' ' + value.toLocaleString();
  }
}


export default function SalesCurrenciesManager({
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
  showSuccess: (
    title: string,
    message: string,
  ) => void;
  showError: (
    title: string,
    message: string,
  ) => void;
}) {
  const [
    currencyData,
    setCurrencyData,
  ] = useState<CurrencyData | null>(
    null,
  );
  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    currencyCode,
    setCurrencyCode,
  ] = useState('');
  const [
    currencyName,
    setCurrencyName,
  ] = useState('');
  const [
    currencySymbol,
    setCurrencySymbol,
  ] = useState('');

  const [
    rateCurrency,
    setRateCurrency,
  ] = useState('');
  const [
    rate,
    setRate,
  ] = useState('');
  const [
    rateDate,
    setRateDate,
  ] = useState(
    new Date()
      .toISOString()
      .slice(0, 10),
  );

  async function refresh() {
    setLoading(true);

    try {
      const response =
        await fetch(
          '/api/apps/sales?currencies=1',
          {
            cache: 'no-store',
            credentials: 'same-origin',
          },
        );

      const body =
        await response.json()
          .catch(
            () => ({}),
          ) as {
            success?: boolean;
            currencies?: CurrencyData;
            error?: string;
          };

      if (
        !response.ok ||
        body.success !== true ||
        !body.currencies
      ) {
        throw new Error(
          body.error ||
          'SaMi could not load Sales currency data.',
        );
      }

      setCurrencyData(
        body.currencies,
      );

      if (!rateCurrency) {
        setRateCurrency(
          body.currencies
            .currencies
            .find(
              item =>
                item.isActive &&
                !item.isBase,
            )
            ?.code ||
          '',
        );
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

  useEffect(
    () => {
      void refresh();
    },
    [],
  );

  async function saveCurrency(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    try {
      await request({
        action: 'save_currency',
        code: currencyCode,
        name: currencyName,
        symbol:
          currencySymbol ||
          undefined,
        decimalPlaces: 2,
        isActive: true,
      });

      showSuccess(
        'Currency saved',
        'The shared Currency Center was updated.',
      );

      setCurrencyCode('');
      setCurrencyName('');
      setCurrencySymbol('');
      await refresh();
    } catch (error) {
      showError(
        'Currency save failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not save this currency.',
      );
    }
  }

  async function saveRate(
    event: React.FormEvent<HTMLFormElement>,
  ) {
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

      showSuccess(
        'Exchange rate saved',
        'New Sales documents can now lock this dated rate.',
      );

      setRate('');
      await refresh();
    } catch (error) {
      showError(
        'Exchange rate save failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not save this exchange rate.',
      );
    }
  }

  const baseCurrency =
    currencyData
      ?.baseCurrency ||
    data.company.currency;

  const activeCurrencies =
    currencyData
      ?.currencies
      .filter(
        item =>
          item.isActive,
      ) ||
    [];

  return (
    <section className="space-y-4">
      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
          Roadmap Part 10
        </p>
        <h2 className="mt-1 text-xl font-black">
          Currency & FX
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Preserve transaction currency on quotations and orders, lock dated exchange rates, and report commercial exposure in the company base currency.
        </p>
      </div>

      {
        !loading &&
        currencyData &&
        !currencyData.currencyCenterReady &&
        (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
            <p className="font-black">
              Shared Currency Center is not installed
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Base-currency Sales remains available. For another currency, enter a manual exchange rate in the quotation composer; the rate is locked onto the document.
            </p>
          </div>
        )
      }

      <div className="grid gap-4 md:grid-cols-3">
        <div className="sami-surface rounded-[22px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Base currency
          </p>
          <p className="mt-2 text-2xl font-black">
            {baseCurrency}
          </p>
        </div>

        <div className="sami-surface rounded-[22px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Active currencies
          </p>
          <p className="mt-2 text-2xl font-black">
            {activeCurrencies.length || 1}
          </p>
        </div>

        <div className="sami-surface rounded-[22px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Dated rates
          </p>
          <p className="mt-2 text-2xl font-black">
            {currencyData?.rates.length || 0}
          </p>
        </div>
      </div>

      {
        data.capabilities
          .canManagePricing &&
        currencyData
          ?.currencyCenterReady &&
        (
          <div className="grid gap-4 xl:grid-cols-2">
            <form
              onSubmit={saveCurrency}
              className="sami-surface rounded-[22px] p-4"
            >
              <p className="text-sm font-black">
                Add or update currency
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Input
                  label="ISO code"
                  value={currencyCode}
                  onChange={
                    value =>
                      setCurrencyCode(
                        value
                          .toUpperCase()
                          .slice(0, 3),
                      )
                  }
                  required
                />
                <Input
                  label="Name"
                  value={currencyName}
                  onChange={setCurrencyName}
                  required
                />
                <Input
                  label="Symbol"
                  value={currencySymbol}
                  onChange={setCurrencySymbol}
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="mt-3 h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
              >
                Save currency
              </button>
            </form>

            <form
              onSubmit={saveRate}
              className="sami-surface rounded-[22px] p-4"
            >
              <p className="text-sm font-black">
                Add dated exchange rate
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label>
                  <Label>
                    Currency
                  </Label>
                  <select
                    value={rateCurrency}
                    onChange={
                      event =>
                        setRateCurrency(
                          event.target.value,
                        )
                    }
                    required
                    className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                  >
                    <option value="">
                      Choose currency
                    </option>
                    {
                      activeCurrencies
                        .filter(
                          item =>
                            !item.isBase,
                        )
                        .map(
                          item => (
                            <option
                              key={item.code}
                              value={item.code}
                            >
                              {item.code} · {item.name}
                            </option>
                          ),
                        )
                    }
                  </select>
                </label>

                <Input
                  label={'Rate to ' + baseCurrency}
                  type="number"
                  value={rate}
                  onChange={setRate}
                  required
                />
                <Input
                  label="Effective date"
                  type="date"
                  value={rateDate}
                  onChange={setRateDate}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="mt-3 h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
              >
                Save exchange rate
              </button>
            </form>
          </div>
        )
      }

      <div className="grid gap-4 xl:grid-cols-2">
        <ExposureTable
          title="Quotation exposure"
          rows={
            currencyData
              ?.quoteExposure ||
            []
          }
          baseCurrency={baseCurrency}
        />
        <ExposureTable
          title="Sales-order exposure"
          rows={
            currencyData
              ?.orderExposure ||
            []
          }
          baseCurrency={baseCurrency}
        />
      </div>

      <div className="sami-surface rounded-[22px] p-4">
        <p className="text-sm font-black">
          Latest exchange rates
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="text-slate-400">
              <tr>
                <th className="pb-2">Currency</th>
                <th className="pb-2">Base</th>
                <th className="pb-2">Rate</th>
                <th className="pb-2">Effective</th>
                <th className="pb-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {
                (currencyData?.rates || [])
                  .slice(0, 30)
                  .map(
                    item => (
                      <tr
                        key={item.id}
                        className="border-t border-[var(--sami-border)]"
                      >
                        <td className="py-2 font-black">
                          {item.currency}
                        </td>
                        <td className="py-2">
                          {item.baseCurrency}
                        </td>
                        <td className="py-2">
                          {item.rate}
                        </td>
                        <td className="py-2">
                          {item.effectiveDate}
                        </td>
                        <td className="py-2">
                          {item.sourceName || item.sourceType}
                        </td>
                      </tr>
                    ),
                  )
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}


function ExposureTable({
  title,
  rows,
  baseCurrency,
}: {
  title: string;
  rows: ExposureRow[];
  baseCurrency: string;
}) {
  return (
    <div className="sami-surface rounded-[22px] p-4">
      <p className="text-sm font-black">
        {title}
      </p>

      <div className="mt-3 space-y-2">
        {
          rows.length === 0
            ? (
                <p className="text-xs text-slate-500">
                  No open exposure.
                </p>
              )
            : rows.map(
                row => (
                  <div
                    key={row.currency}
                    className="rounded-xl border border-[var(--sami-border)] p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-black">
                        {row.currency}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {row.documentCount} document{row.documentCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs">
                      {money(row.transactionTotal, row.currency)}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      Base: {money(row.baseTotal, baseCurrency)}
                    </p>
                  </div>
                ),
              )
        }
      </div>
    </div>
  );
}


function Label({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
      {children}
    </span>
  );
}


function Input({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <Label>
        {label}
      </Label>
      <input
        type={type}
        value={value}
        required={required}
        min={
          type === 'number'
            ? '0.00000001'
            : undefined
        }
        step={
          type === 'number'
            ? '0.00000001'
            : undefined
        }
        onChange={
          event =>
            onChange(
              event.target.value,
            )
        }
        className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
      />
    </label>
  );
}
