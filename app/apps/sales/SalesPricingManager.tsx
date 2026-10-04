'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Plus,
  Trash2,
} from 'lucide-react';

import type {
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';

type Rule = {
  key: string;
  catalogItemId: string;
  minQuantity: string;
  calculation:
    'fixed' |
    'discount_percent' |
    'markup_percent';
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

function key() {
  return globalThis.crypto
    ?.randomUUID?.() ||
    Math.random()
      .toString(36)
      .slice(2);
}

function blankRule():
  Rule {
  return {
    key:
      key(),
    catalogItemId:
      '',
    minQuantity:
      '1',
    calculation:
      'fixed',
    amount:
      '0',
    priority:
      '100',
  };
}

function normalizeRule(
  rule:
    CommercialPricelist['rules'][number],
): Rule {
  const calculation =
    rule.calculation ===
      'discount_percent' ||
    rule.calculation ===
      'markup_percent'
      ? rule.calculation
      : 'fixed';

  return {
    key:
      rule.id ||
      key(),
    catalogItemId:
      rule.catalogItemId ||
      '',
    minQuantity:
      String(
        rule.minQuantity ??
        1,
      ),
    calculation,
    amount:
      String(
        rule.amount ??
        0,
      ),
    priority:
      String(
        rule.priority ??
        100,
      ),
  };
}

export default function SalesPricingManager({
  data,
  busy,
  request,
  showSuccess,
  showError,
}: {
  data:
    SalesWorkspaceData;
  busy:
    boolean;
  request:
    (
      payload:
        Record<
          string,
          unknown
        >,
    ) =>
      Promise<
        Record<
          string,
          unknown
        >
      >;
  showSuccess:
    (
      title:
        string,
      message:
        string,
    ) =>
      void;
  showError:
    (
      title:
        string,
      message:
        string,
    ) =>
      void;
}) {
  const [
    pricelists,
    setPricelists,
  ] =
    useState<
      CommercialPricelist[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    selectedId,
    setSelectedId,
  ] =
    useState(
      '',
    );

  const [
    name,
    setName,
  ] =
    useState(
      '',
    );

  const [
    code,
    setCode,
  ] =
    useState(
      '',
    );

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
    useState(
      '',
    );

  const [
    validFrom,
    setValidFrom,
  ] =
    useState(
      '',
    );

  const [
    validUntil,
    setValidUntil,
  ] =
    useState(
      '',
    );

  const [
    priority,
    setPriority,
  ] =
    useState(
      '100',
    );

  const [
    active,
    setActive,
  ] =
    useState(
      true,
    );

  const [
    rules,
    setRules,
  ] =
    useState<
      Rule[]
    >([
      blankRule(),
    ]);

  async function refresh() {
    setLoading(
      true,
    );

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
        await response
          .json()
          .catch(
            () => ({}),
          ) as {
            success?:
              boolean;
            error?:
              string;
            commercial?: {
              pricelists?:
                CommercialPricelist[];
            };
          };

      if (
        !response.ok ||
        body.success !==
          true
      ) {
        throw new Error(
          body.error ||
          'SaMi could not load Sales pricelists.',
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
        error instanceof
          Error
          ? error.message
          : 'SaMi could not load Sales pricelists.',
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  useEffect(
    () => {
      void refresh();
    },
    [],
  );

  const selected =
    useMemo(
      () =>
        pricelists.find(
          item =>
            item.id ===
            selectedId,
        ) ||
        null,
      [
        pricelists,
        selectedId,
      ],
    );

  function reset() {
    setSelectedId(
      '',
    );
    setName(
      '',
    );
    setCode(
      '',
    );
    setCurrency(
      data.settings
        .defaultCurrency ||
      data.company.currency,
    );
    setCustomerId(
      '',
    );
    setValidFrom(
      '',
    );
    setValidUntil(
      '',
    );
    setPriority(
      '100',
    );
    setActive(
      true,
    );
    setRules([
      blankRule(),
    ]);
  }

  function load(
    id:
      string,
  ) {
    setSelectedId(
      id,
    );

    const item =
      pricelists.find(
        candidate =>
          candidate.id ===
          id,
      );

    if (
      !item
    ) {
      reset();

      return;
    }

    setName(
      item.name,
    );
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
    setRules(
      item.rules.length >
        0
        ? item.rules.map(
            normalizeRule,
          )
        : [
            blankRule(),
          ],
    );
  }

  function patchRule(
    index:
      number,
    patch:
      Partial<Rule>,
  ) {
    setRules(
      current =>
        current.map(
          (
            rule,
            position,
          ) =>
            position ===
              index
              ? {
                  ...rule,
                  ...patch,
                }
              : rule,
        ),
    );
  }

  async function submit(
    event:
      React.FormEvent<
        HTMLFormElement
      >,
  ) {
    event.preventDefault();

    try {
      await request({
        action:
          'save_pricelist',
        id:
          selectedId ||
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
        rules:
          rules.map(
            rule => ({
              catalogItemId:
                rule.catalogItemId ||
                undefined,
              minQuantity:
                Number(
                  rule.minQuantity,
                ),
              calculation:
                rule.calculation,
              amount:
                Number(
                  rule.amount,
                ),
              priority:
                Number(
                  rule.priority,
                ),
            }),
          ),
      });

      showSuccess(
        'Pricelist saved',
        'Sales pricing rules were updated.',
      );

      reset();
      await refresh();
    } catch (
      error
    ) {
      showError(
        'Pricelist save failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not save the pricelist.',
      );
    }
  }

  return (
    <section className="sami-surface rounded-[24px] p-4 xl:col-span-2">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
            Commercial pricing
          </p>
          <h2 className="mt-1 text-sm font-black">
            Pricelists & quantity rules
          </h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-500">
            Set customer, product and quantity pricing without changing the base catalog. Rules are applied server-side when a quotation is saved.
          </p>
        </div>

        <select
          value={
            selectedId
          }
          onChange={
            event =>
              load(
                event.target.value,
              )
          }
          disabled={
            loading
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
                  {
                    item.isActive
                      ? ''
                      : ' · inactive'
                  }
                </option>
              ),
            )
          }
        </select>
      </div>

      {
        selected &&
        (
          <p className="mt-3 rounded-xl bg-blue-500/10 px-3 py-2 text-[11px] font-bold text-blue-700 dark:text-blue-300">
            Editing {
              selected.name
            }. Saving replaces its pricing rules atomically.
          </p>
        )
      }

      <form
        onSubmit={
          submit
        }
        className="mt-4 space-y-4"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Name"
            value={
              name
            }
            onChange={
              setName
            }
            required
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
            required
          />
          <Field
            label="Priority"
            value={
              priority
            }
            onChange={
              setPriority
            }
            type="number"
          />

          <label className="block">
            <Label>
              Customer
            </Label>
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
              className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
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
            value={
              validFrom
            }
            onChange={
              setValidFrom
            }
            type="date"
          />
          <Field
            label="Valid until"
            value={
              validUntil
            }
            onChange={
              setValidUntil
            }
            type="date"
          />

          <label className="flex h-11 items-center gap-3 self-end rounded-xl border border-[var(--sami-border)] px-3 text-xs font-bold">
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
            Active
          </label>
        </div>

        <div className="rounded-2xl border border-[var(--sami-border)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--sami-border)] p-3">
            <div>
              <p className="text-xs font-black">
                Pricing rules
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                Product-specific rules outrank general rules. Higher eligible quantity breaks win before priority.
              </p>
            </div>
            <button
              type="button"
              onClick={
                () =>
                  setRules(
                    current => [
                      ...current,
                      blankRule(),
                    ],
                  )
              }
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
            >
              <Plus className="h-4 w-4" />
              Rule
            </button>
          </div>

          <div className="space-y-3 p-3">
            {
              rules.map(
                (
                  rule,
                  index,
                ) => (
                  <div
                    key={
                      rule.key
                    }
                    className="grid gap-3 rounded-xl border border-[var(--sami-border)] p-3 md:grid-cols-2 xl:grid-cols-[1.5fr_0.7fr_1fr_0.8fr_0.7fr_auto]"
                  >
                    <label>
                      <Label>
                        Product
                      </Label>
                      <select
                        value={
                          rule.catalogItemId
                        }
                        onChange={
                          event =>
                            patchRule(
                              index,
                              {
                                catalogItemId:
                                  event.target.value,
                              },
                            )
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                      >
                        <option value="">
                          All products
                        </option>
                        {
                          data.catalogItems.map(
                            product => (
                              <option
                                key={
                                  product.id
                                }
                                value={
                                  product.id
                                }
                              >
                                {
                                  product.name
                                }
                              </option>
                            ),
                          )
                        }
                      </select>
                    </label>

                    <Field
                      label="Min qty"
                      value={
                        rule.minQuantity
                      }
                      onChange={
                        value =>
                          patchRule(
                            index,
                            {
                              minQuantity:
                                value,
                            },
                          )
                      }
                      type="number"
                      compact
                    />

                    <label>
                      <Label>
                        Method
                      </Label>
                      <select
                        value={
                          rule.calculation
                        }
                        onChange={
                          event =>
                            patchRule(
                              index,
                              {
                                calculation:
                                  event.target
                                    .value as
                                      Rule['calculation'],
                              },
                            )
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                      >
                        <option value="fixed">
                          Fixed price
                        </option>
                        <option value="discount_percent">
                          Discount %
                        </option>
                        <option value="markup_percent">
                          Markup %
                        </option>
                      </select>
                    </label>

                    <Field
                      label={
                        rule.calculation ===
                          'fixed'
                          ? 'Price'
                          : 'Percent'
                      }
                      value={
                        rule.amount
                      }
                      onChange={
                        value =>
                          patchRule(
                            index,
                            {
                              amount:
                                value,
                            },
                          )
                      }
                      type="number"
                      compact
                    />

                    <Field
                      label="Priority"
                      value={
                        rule.priority
                      }
                      onChange={
                        value =>
                          patchRule(
                            index,
                            {
                              priority:
                                value,
                            },
                          )
                      }
                      type="number"
                      compact
                    />

                    <button
                      type="button"
                      onClick={
                        () =>
                          setRules(
                            current =>
                              current.filter(
                                (
                                  _item,
                                  position,
                                ) =>
                                  position !==
                                    index,
                              ),
                          )
                      }
                      disabled={
                        rules.length ===
                          1
                      }
                      className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-red-500/30 px-3 text-red-600 disabled:opacity-30"
                      aria-label="Remove pricing rule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ),
              )
            }
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {
            selectedId &&
            (
              <button
                type="button"
                onClick={
                  reset
                }
                className="h-10 rounded-xl border border-[var(--sami-border)] px-4 text-xs font-black"
              >
                New pricelist
              </button>
            )
          }
          <button
            type="submit"
            disabled={
              busy ||
              loading
            }
            className="h-10 rounded-xl bg-blue-600 px-5 text-xs font-black text-white disabled:opacity-60"
          >
            Save pricelist
          </button>
        </div>
      </form>
    </section>
  );
}

function Label({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
      {
        children
      }
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type =
    'text',
  required =
    false,
  compact =
    false,
}: {
  label:
    string;
  value:
    string;
  onChange:
    (
      value:
        string,
    ) =>
      void;
  type?:
    string;
  required?:
    boolean;
  compact?:
    boolean;
}) {
  return (
    <label className="block">
      <Label>
        {
          label
        }
      </Label>
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
        required={
          required
        }
        min={
          type ===
            'number'
            ? '0'
            : undefined
        }
        step={
          type ===
            'number'
            ? '0.01'
            : undefined
        }
        className={
          'mt-1 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-3 text-sm ' +
          (
            compact
              ? 'h-10'
              : 'h-11'
          )
        }
      />
    </label>
  );
}
