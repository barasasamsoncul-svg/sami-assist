'use client';

import {
  Plus,
  RefreshCw,
} from 'lucide-react';

import {
  useEffect,
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
  rules: unknown[];
};

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
    payload:
      Record<string, unknown>,
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
    pricelists,
    setPricelists,
  ] =
    useState<Pricelist[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    selected,
    setSelected,
  ] =
    useState('');

  const [
    name,
    setName,
  ] =
    useState('');

  const [
    code,
    setCode,
  ] =
    useState('');

  const [
    currency,
    setCurrency,
  ] =
    useState(
      data.settings
        .defaultCurrency ||
      data.company.currency,
    );

  const [
    customerId,
    setCustomerId,
  ] =
    useState('');

  const [
    validFrom,
    setValidFrom,
  ] =
    useState('');

  const [
    validUntil,
    setValidUntil,
  ] =
    useState('');

  const [
    priority,
    setPriority,
  ] =
    useState('100');

  const [
    active,
    setActive,
  ] =
    useState(true);

  async function refresh() {
    setLoading(true);

    try {
      const response =
        await fetch(
          '/api/apps/sales?commercial=1',
          {
            cache:
              'no-store',
            credentials:
              'same-origin',
          },
        );

      const body =
        await response.json()
          .catch(
            () => ({}),
          ) as {
            success?: boolean;
            error?: string;
            commercial?: {
              pricelists?: Pricelist[];
            };
          };

      if (
        !response.ok ||
        body.success !==
          true
      ) {
        throw new Error(
          body.error ||
          'SaMi could not load pricelists.',
        );
      }

      setPricelists(
        body.commercial
          ?.pricelists ||
        [],
      );
    } catch (
      error
    ) {
      showError(
        'Pricelists unavailable',
        error instanceof Error
          ? error.message
          : 'SaMi could not load pricelists.',
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

  function reset() {
    setSelected('');
    setName('');
    setCode('');
    setCurrency(
      data.settings
        .defaultCurrency ||
      data.company.currency,
    );
    setCustomerId('');
    setValidFrom('');
    setValidUntil('');
    setPriority('100');
    setActive(true);
  }

  function load(
    id:
      string,
  ) {
    setSelected(id);

    const item =
      pricelists.find(
        row =>
          row.id ===
          id,
      );

    if (
      !item
    ) {
      reset();
      return;
    }

    setName(item.name);
    setCode(
      item.code ||
      '',
    );
    setCurrency(
      item.currency,
    );
    setCustomerId(
      item.billingCustomerId ||
      '',
    );
    setValidFrom(
      item.validFrom ||
      '',
    );
    setValidUntil(
      item.validUntil ||
      '',
    );
    setPriority(
      String(
        item.priority,
      ),
    );
    setActive(
      item.isActive,
    );
  }

  async function save() {
    try {
      await request({
        action:
          'save_pricelist',
        id:
          selected ||
          undefined,
        name,
        code:
          code ||
          undefined,
        currency,
        billingCustomerId:
          customerId ||
          undefined,
        validFrom:
          validFrom ||
          undefined,
        validUntil:
          validUntil ||
          undefined,
        priority:
          Number(
            priority,
          ),
        isActive:
          active,
      });

      showSuccess(
        'Pricelist saved',
        'Pricelist scope and validity were updated without replacing advanced pricing rules.',
      );

      reset();
      await refresh();
    } catch (
      error
    ) {
      showError(
        'Pricelist save failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not save the pricelist.',
      );
    }
  }

  return (
    <section className="space-y-4">
      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
          Roadmap Part 8
        </p>
        <h2 className="mt-1 text-xl font-black">
          Pricelists
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Control customer scope, currency, validity and precedence separately from the advanced product and quantity rules in Part 9.
        </p>
      </div>

      <div className="sami-surface rounded-[24px] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <select
            value={
              selected
            }
            disabled={
              loading
            }
            onChange={
              event =>
                load(
                  event.target.value,
                )
            }
            className="h-10 min-w-64 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
          >
            <option value="">
              New pricelist
            </option>
            {
              pricelists.map(
                item => (
                  <option
                    key={
                      item.id
                    }
                    value={
                      item.id
                    }
                  >
                    {
                      item.name
                    } · {
                      item.currency
                    }
                  </option>
                ),
              )
            }
          </select>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={
                reset
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
            >
              <Plus
                className="h-4 w-4"
              />
              New
            </button>
            <button
              type="button"
              onClick={
                refresh
              }
              disabled={
                loading
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-60"
            >
              <RefreshCw
                className="h-4 w-4"
              />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field
            label="Name"
            value={
              name
            }
            onChange={
              setName
            }
          />
          <Field
            label="Code"
            value={
              code
            }
            onChange={
              setCode
            }
          />
          <Field
            label="Currency"
            value={
              currency
            }
            onChange={
              value =>
                setCurrency(
                  value
                    .toUpperCase()
                    .slice(
                      0,
                      3,
                    ),
                )
            }
          />
          <Field
            label="Priority"
            type="number"
            value={
              priority
            }
            onChange={
              setPriority
            }
          />

          <label className="block">
            <span className="text-xs font-black">
              Customer
            </span>
            <select
              value={
                customerId
              }
              onChange={
                event =>
                  setCustomerId(
                    event.target.value,
                  )
              }
              className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
            >
              <option value="">
                All customers
              </option>
              {
                data.billingCustomers.map(
                  customer => (
                    <option
                      key={
                        customer.id
                      }
                      value={
                        customer.id
                      }
                    >
                      {
                        customer.name
                      }
                    </option>
                  ),
                )
              }
            </select>
          </label>

          <Field
            label="Valid from"
            type="date"
            value={
              validFrom
            }
            onChange={
              setValidFrom
            }
          />
          <Field
            label="Valid until"
            type="date"
            value={
              validUntil
            }
            onChange={
              setValidUntil
            }
          />

          <label className="mt-5 flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black">
            <input
              type="checkbox"
              checked={
                active
              }
              onChange={
                event =>
                  setActive(
                    event.target.checked,
                  )
              }
            />
            Active pricelist
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={
              busy ||
              loading ||
              !name.trim()
            }
            onClick={
              save
            }
            className="h-10 rounded-xl bg-blue-600 px-5 text-xs font-black text-white disabled:opacity-60"
          >
            Save pricelist
          </button>
        </div>
      </div>
    </section>
  );
}


function Field({
  label,
  value,
  onChange,
  type =
    'text',
}: {
  label: string;
  value: string;
  onChange:
    (
      value:
        string,
    ) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black">
        {
          label
        }
      </span>
      <input
        type={
          type
        }
        value={
          value
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
