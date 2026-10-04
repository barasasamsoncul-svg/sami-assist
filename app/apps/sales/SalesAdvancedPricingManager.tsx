'use client';

import {
  Plus,
  Trash2,
} from 'lucide-react';

import {
  useEffect,
  useState,
} from 'react';

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

function id() {
  return globalThis.crypto
    ?.randomUUID?.() ||
    Math.random()
      .toString(36)
      .slice(2);
}

function blank(): Rule {
  return {
    key:
      id(),
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

function normalize(
  rule:
    Pricelist['rules'][number],
): Rule {
  return {
    key:
      rule.id ||
      id(),
    catalogItemId:
      rule.catalogItemId ||
      '',
    minQuantity:
      String(
        rule.minQuantity ??
        1,
      ),
    calculation:
      rule.calculation ===
        'discount_percent' ||
      rule.calculation ===
        'markup_percent'
        ? rule.calculation
        : 'fixed',
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

export default function SalesAdvancedPricingManager({
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
    selectedId,
    setSelectedId,
  ] =
    useState('');

  const [
    rules,
    setRules,
  ] =
    useState<Rule[]>([
      blank(),
    ]);

  const [
    loading,
    setLoading,
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
          'SaMi could not load advanced pricing.',
        );
      }

      const rows =
        body.commercial
          ?.pricelists ||
        [];

      setPricelists(
        rows,
      );

      if (
        selectedId
      ) {
        const current =
          rows.find(
            item =>
              item.id ===
              selectedId,
          );

        setRules(
          current &&
          current.rules.length >
            0
            ? current.rules.map(
                normalize,
              )
            : [
                blank(),
              ],
        );
      }
    } catch (
      error
    ) {
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

  useEffect(
    () => {
      void refresh();
    },
    [],
  );

  function choose(
    next:
      string,
  ) {
    setSelectedId(
      next,
    );

    const item =
      pricelists.find(
        row =>
          row.id ===
          next,
      );

    setRules(
      item &&
      item.rules.length >
        0
        ? item.rules.map(
            normalize,
          )
        : [
            blank(),
          ],
    );
  }

  function patch(
    index:
      number,
    update:
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
                  ...update,
                }
              : rule,
        ),
    );
  }

  async function save() {
    const selected =
      pricelists.find(
        item =>
          item.id ===
          selectedId,
      );

    if (
      !selected
    ) {
      showError(
        'Choose a pricelist',
        'Create or select the Part 8 pricelist before adding Part 9 pricing rules.',
      );
      return;
    }

    try {
      await request({
        action:
          'save_pricelist',
        id:
          selected.id,
        name:
          selected.name,
        code:
          selected.code ||
          undefined,
        currency:
          selected.currency,
        billingCustomerId:
          selected
            .billingCustomerId ||
          undefined,
        validFrom:
          selected.validFrom ||
          undefined,
        validUntil:
          selected.validUntil ||
          undefined,
        priority:
          selected.priority,
        isActive:
          selected.isActive,
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
        'Advanced pricing saved',
        'Product and quantity pricing rules were replaced atomically for this pricelist.',
      );

      await refresh();
    } catch (
      error
    ) {
      showError(
        'Advanced pricing save failed',
        error instanceof Error
          ? error.message
          : 'SaMi could not save advanced pricing.',
      );
    }
  }

  return (
    <section className="space-y-4">
      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
          Roadmap Part 9
        </p>
        <h2 className="mt-1 text-xl font-black">
          Advanced pricing
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Configure product-specific and quantity-break rules using fixed prices, percentage discounts or markups. Rule precedence is resolved server-side.
        </p>
      </div>

      <div className="sami-surface rounded-[24px] p-4">
        <label className="block max-w-xl">
          <span className="text-xs font-black">
            Pricelist
          </span>
          <select
            value={
              selectedId
            }
            onChange={
              event =>
                choose(
                  event.target.value,
                )
            }
            disabled={
              loading
            }
            className="mt-1 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
          >
            <option value="">
              Choose pricelist
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
        </label>

        <div className="mt-4 rounded-2xl border border-[var(--sami-border)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--sami-border)] p-3">
            <div>
              <p className="text-xs font-black">
                Pricing rules
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                Product rules outrank global rules. The highest eligible quantity break is evaluated before priority.
              </p>
            </div>
            <button
              type="button"
              onClick={
                () =>
                  setRules(
                    current => [
                      ...current,
                      blank(),
                    ],
                  )
              }
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
            >
              <Plus
                className="h-4 w-4"
              />
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
                    className="grid gap-3 rounded-xl border border-[var(--sami-border)] p-3 md:grid-cols-2 xl:grid-cols-[1.6fr_0.7fr_1fr_0.8fr_0.7fr_auto]"
                  >
                    <label>
                      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                        Product
                      </span>
                      <select
                        value={
                          rule.catalogItemId
                        }
                        onChange={
                          event =>
                            patch(
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
                          patch(
                            index,
                            {
                              minQuantity:
                                value,
                            },
                          )
                      }
                    />

                    <label>
                      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                        Method
                      </span>
                      <select
                        value={
                          rule.calculation
                        }
                        onChange={
                          event =>
                            patch(
                              index,
                              {
                                calculation:
                                  event.target.value as
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
                          patch(
                            index,
                            {
                              amount:
                                value,
                            },
                          )
                      }
                    />

                    <Field
                      label="Priority"
                      value={
                        rule.priority
                      }
                      onChange={
                        value =>
                          patch(
                            index,
                            {
                              priority:
                                value,
                            },
                          )
                      }
                    />

                    <button
                      type="button"
                      disabled={
                        rules.length ===
                          1
                      }
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
                      className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-red-500/30 px-3 text-red-600 disabled:opacity-30"
                      aria-label="Remove pricing rule"
                    >
                      <Trash2
                        className="h-4 w-4"
                      />
                    </button>
                  </div>
                ),
              )
            }
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={
              busy ||
              loading ||
              !selectedId
            }
            onClick={
              save
            }
            className="h-10 rounded-xl bg-blue-600 px-5 text-xs font-black text-white disabled:opacity-60"
          >
            Save advanced pricing
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
}: {
  label: string;
  value: string;
  onChange:
    (
      value:
        string,
    ) => void;
}) {
  return (
    <label>
      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
        {
          label
        }
      </span>
      <input
        type="number"
        value={
          value
        }
        onChange={
          event =>
            onChange(
              event.target.value,
            )
        }
        className="mt-1 h-10 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs"
      />
    </label>
  );
}
