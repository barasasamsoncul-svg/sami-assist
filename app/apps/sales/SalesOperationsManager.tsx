'use client';

import {
  useEffect,
  useState,
} from 'react';

import {
  BadgeDollarSign,
  PackageCheck,
  RotateCcw,
  TrendingUp,
  Truck,
} from 'lucide-react';

type OperationsData = {
  capabilities: {
    canViewShipping: boolean;
    canManageShipping: boolean;
    canViewReturns: boolean;
    canManageReturns: boolean;
    canManageDeposits: boolean;
    canViewForecast: boolean;
  };
  shipments: Array<{
    id: string;
    sales_order_id: string;
    order_number: string;
    shipment_number: string;
    status: string;
    carrier: string | null;
    service_level: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    recipient_name: string | null;
    proof_note: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
    inventory_posted_at: string | null;
  }>;
  returns: Array<{
    id: string;
    sales_order_id: string;
    order_number: string;
    return_number: string;
    status: string;
    reason: string;
    credits: Array<{
      id: string;
      invoiceId: string;
      creditNoteId: string;
      creditNoteNumber: string;
      amount: number | string;
      availableCredit: number | string;
      refundedAmount: number | string;
    }>;
  }>;
  deposits: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    currency: string;
    totalAmount: number;
    depositType: string;
    depositValue: number;
    requiredAmount: number;
    receivedAmount: number;
    status: string;
    retainerId: string | null;
    paymentId: string | null;
  }>;
  forecast: {
    horizonDays: number;
    openPipeline: number;
    weightedPipeline: number;
    committedOrders: number;
    expectedRevenue: number;
    expiring7Days: number;
    committedOrderCount: number;
  };
};

function money(
  value:
    number |
    string,
  currency =
    'KES',
) {
  const numeric =
    Number(
      value ||
      0,
    );

  try {
    return new Intl
      .NumberFormat(
        'en-KE',
        {
          style:
            'currency',
          currency,
          maximumFractionDigits:
            2,
        },
      )
      .format(
        numeric,
      );
  } catch {
    return (
      currency +
      ' ' +
      numeric.toLocaleString()
    );
  }
}

export default function SalesOperationsManager({
  busy,
  request,
  showSuccess,
  showError,
}: {
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
    data,
    setData,
  ] =
    useState<
      OperationsData |
      null
    >(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    horizon,
    setHorizon,
  ] =
    useState(
      '90',
    );

  async function refresh(
    nextHorizon =
      horizon,
  ) {
    setLoading(
      true,
    );

    try {
      const response =
        await fetch(
          '/api/apps/sales?operations=1&horizon=' +
          encodeURIComponent(
            nextHorizon,
          ),
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
            operations?:
              OperationsData;
          };

      if (
        !response.ok ||
        body.success !==
          true ||
        !body.operations
      ) {
        throw new Error(
          body.error ||
          'SaMi could not load Sales operations.',
        );
      }

      setData(
        body.operations,
      );
    } catch (
      error
    ) {
      showError(
        'Sales operations unavailable',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not load Sales operations.',
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  useEffect(
    () => {
      void refresh(
        '90',
      );
    },
    [],
  );

  async function action(
    payload:
      Record<
        string,
        unknown
      >,
    message:
      string,
  ) {
    try {
      await request(
        payload,
      );

      showSuccess(
        'Sales operation completed',
        message,
      );

      await refresh();
    } catch (
      error
    ) {
      showError(
        'Sales operation failed',
        error instanceof
          Error
          ? error.message
          : 'SaMi could not complete the Sales operation.',
      );
    }
  }

  if (
    loading &&
    !data
  ) {
    return (
      <div className="sami-surface rounded-[24px] p-6 text-sm text-slate-500">
        Loading Sales operations…
      </div>
    );
  }

  if (
    !data
  ) {
    return null;
  }

  return (
    <section className="space-y-4">
      {
        data.capabilities
          .canViewForecast &&
        (
          <>
            <div className="sami-surface rounded-[24px] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Forecast
                  </p>
                  <h2 className="mt-1 text-sm font-black">
                    Revenue outlook
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Weighted quotations plus confirmed orders that remain uninvoiced.
                  </p>
                </div>

                <label className="flex items-center gap-2 text-xs font-black">
                  Horizon
                  <select
                    value={
                      horizon
                    }
                    onChange={
                      event => {
                        const value =
                          event.target
                            .value;

                        setHorizon(
                          value,
                        );

                        void refresh(
                          value,
                        );
                      }
                    }
                    className="h-10 rounded-xl border border-[var(--sami-border)] bg-transparent px-3"
                  >
                    <option value="30">
                      30 days
                    </option>
                    <option value="60">
                      60 days
                    </option>
                    <option value="90">
                      90 days
                    </option>
                    <option value="180">
                      180 days
                    </option>
                    <option value="365">
                      365 days
                    </option>
                  </select>
                </label>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                icon={
                  TrendingUp
                }
                label="Expected revenue"
                value={
                  money(
                    data.forecast
                      .expectedRevenue,
                  )
                }
              />
              <Metric
                icon={
                  TrendingUp
                }
                label="Weighted pipeline"
                value={
                  money(
                    data.forecast
                      .weightedPipeline,
                  )
                }
              />
              <Metric
                icon={
                  PackageCheck
                }
                label="Committed orders"
                value={
                  money(
                    data.forecast
                      .committedOrders,
                  )
                }
              />
              <Metric
                icon={
                  TrendingUp
                }
                label="Quotes expiring"
                value={
                  String(
                    data.forecast
                      .expiring7Days,
                  ) +
                  ' in 7 days'
                }
              />
            </div>
          </>
        )
      }

      {
        data.capabilities
          .canViewShipping &&
        (
          <div className="sami-surface rounded-[24px] p-4">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-black">
                Shipments & tracking
              </h2>
            </div>

            <div className="mt-3 space-y-2">
              {
                data.shipments.length ===
                  0
                  ? (
                      <Empty>
                        No shipments yet. Create one from a Sales order.
                      </Empty>
                    )
                  : data.shipments.map(
                      shipment => (
                        <div
                          key={
                            shipment.id
                          }
                          className="rounded-2xl border border-[var(--sami-border)] p-3"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs font-black">
                                {
                                  shipment.shipment_number
                                } · {
                                  shipment.order_number
                                }
                              </p>
                              <p className="mt-1 text-[10px] text-slate-500">
                                {
                                  [
                                    shipment.carrier,
                                    shipment.service_level,
                                    shipment.tracking_number,
                                  ]
                                    .filter(
                                      Boolean,
                                    )
                                    .join(
                                      ' · ',
                                    ) ||
                                  'No carrier details'
                                }
                              </p>
                            </div>

                            <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-blue-700 dark:text-blue-300">
                              {
                                shipment.status
                              }
                            </span>
                          </div>

                          {
                            data.capabilities
                              .canManageShipping &&
                            ![
                              'delivered',
                              'cancelled',
                            ].includes(
                              shipment.status,
                            ) &&
                            (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {
                                  shipment.status ===
                                    'ready' &&
                                  (
                                    <ActionButton
                                      disabled={
                                        busy
                                      }
                                      onClick={
                                        () =>
                                          void action(
                                            {
                                              action:
                                                'update_shipment_status',
                                              shipmentId:
                                                shipment.id,
                                              status:
                                                'shipped',
                                            },
                                            'Shipment posted to Inventory and marked shipped.',
                                          )
                                      }
                                    >
                                      Mark shipped
                                    </ActionButton>
                                  )
                                }

                                {
                                  [
                                    'shipped',
                                    'ready',
                                  ].includes(
                                    shipment.status,
                                  ) &&
                                  (
                                    <ActionButton
                                      disabled={
                                        busy
                                      }
                                      onClick={
                                        () =>
                                          void action(
                                            {
                                              action:
                                                'update_shipment_status',
                                              shipmentId:
                                                shipment.id,
                                              status:
                                                'in_transit',
                                            },
                                            'Shipment marked in transit.',
                                          )
                                      }
                                    >
                                      In transit
                                    </ActionButton>
                                  )
                                }

                                {
                                  [
                                    'shipped',
                                    'in_transit',
                                    'ready',
                                  ].includes(
                                    shipment.status,
                                  ) &&
                                  (
                                    <ActionButton
                                      disabled={
                                        busy
                                      }
                                      onClick={
                                        () =>
                                          void action(
                                            {
                                              action:
                                                'update_shipment_status',
                                              shipmentId:
                                                shipment.id,
                                              status:
                                                'delivered',
                                            },
                                            'Shipment marked delivered.',
                                          )
                                      }
                                    >
                                      Delivered
                                    </ActionButton>
                                  )
                                }
                              </div>
                            )
                          }
                        </div>
                      ),
                    )
              }
            </div>
          </div>
        )
      }

      {
        data.capabilities
          .canViewReturns &&
        (
          <div className="sami-surface rounded-[24px] p-4">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-black">
                Returns, credits & refunds
              </h2>
            </div>

            <div className="mt-3 space-y-3">
              {
                data.returns.length ===
                  0
                  ? (
                      <Empty>
                        No Sales returns yet.
                      </Empty>
                    )
                  : data.returns.map(
                      item => (
                        <div
                          key={
                            item.id
                          }
                          className="rounded-2xl border border-[var(--sami-border)] p-3"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs font-black">
                                {
                                  item.return_number
                                } · {
                                  item.order_number
                                }
                              </p>
                              <p className="mt-1 text-[10px] text-slate-500">
                                {
                                  item.reason
                                }
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300">
                              {
                                item.status
                              }
                            </span>
                          </div>

                          {
                            data.capabilities
                              .canManageReturns &&
                            (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {
                                  item.status ===
                                    'requested' &&
                                  (
                                    <ActionButton
                                      disabled={
                                        busy
                                      }
                                      onClick={
                                        () =>
                                          void action(
                                            {
                                              action:
                                                'approve_return',
                                              returnId:
                                                item.id,
                                            },
                                            'Sales return approved.',
                                          )
                                      }
                                    >
                                      Approve
                                    </ActionButton>
                                  )
                                }

                                {
                                  item.status ===
                                    'approved' &&
                                  (
                                    <ActionButton
                                      disabled={
                                        busy
                                      }
                                      onClick={
                                        () =>
                                          void action(
                                            {
                                              action:
                                                'receive_return',
                                              returnId:
                                                item.id,
                                            },
                                            'Returned stock received and Inventory reversed.',
                                          )
                                      }
                                    >
                                      Receive stock
                                    </ActionButton>
                                  )
                                }

                                {
                                  item.status ===
                                    'received' &&
                                  (
                                    <ActionButton
                                      disabled={
                                        busy
                                      }
                                      onClick={
                                        () =>
                                          void action(
                                            {
                                              action:
                                                'issue_return_credit',
                                              returnId:
                                                item.id,
                                            },
                                            'Invoice credit notes created for invoiced return quantities.',
                                          )
                                      }
                                    >
                                      Issue credit
                                    </ActionButton>
                                  )
                                }
                              </div>
                            )
                          }

                          {
                            Array.isArray(
                              item.credits,
                            ) &&
                            item.credits.length >
                              0 &&
                            (
                              <div className="mt-3 space-y-2">
                                {
                                  item.credits.map(
                                    credit => (
                                      <div
                                        key={
                                          credit.id
                                        }
                                        className="flex flex-col gap-2 rounded-xl bg-slate-500/5 p-3 sm:flex-row sm:items-center sm:justify-between"
                                      >
                                        <div>
                                          <p className="text-[11px] font-black">
                                            {
                                              credit.creditNoteNumber
                                            }
                                          </p>
                                          <p className="mt-1 text-[10px] text-slate-500">
                                            Credit {
                                              money(
                                                credit.amount,
                                              )
                                            } · Available {
                                              money(
                                                credit.availableCredit,
                                              )
                                            }
                                          </p>
                                        </div>

                                        {
                                          data.capabilities
                                            .canManageReturns &&
                                          Number(
                                            credit.availableCredit ||
                                            0,
                                          ) >
                                            0 &&
                                          (
                                            <ActionButton
                                              disabled={
                                                busy
                                              }
                                              onClick={
                                                () =>
                                                  void action(
                                                    {
                                                      action:
                                                        'refund_return_credit',
                                                      returnCreditId:
                                                        credit.id,
                                                      amount:
                                                        Number(
                                                          credit.availableCredit,
                                                        ),
                                                      method:
                                                        'bank',
                                                      reason:
                                                        'Refund for Sales return',
                                                      idempotencyKey:
                                                        globalThis.crypto
                                                          ?.randomUUID?.(),
                                                    },
                                                    'Customer credit refunded.',
                                                  )
                                              }
                                            >
                                              Refund available credit
                                            </ActionButton>
                                          )
                                        }
                                      </div>
                                    ),
                                  )
                                }
                              </div>
                            )
                          }
                        </div>
                      ),
                    )
              }
            </div>
          </div>
        )
      }

      {
        data.capabilities
          .canManageDeposits &&
        (
          <div className="sami-surface rounded-[24px] p-4">
            <div className="flex items-center gap-2">
              <BadgeDollarSign className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-black">
                Customer deposits
              </h2>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {
                data.deposits.length ===
                  0
                  ? (
                      <Empty>
                        No Sales orders currently require or hold a deposit.
                      </Empty>
                    )
                  : data.deposits.map(
                      deposit => (
                        <div
                          key={
                            deposit.id
                          }
                          className="rounded-2xl border border-[var(--sami-border)] p-3"
                        >
                          <p className="text-xs font-black">
                            {
                              deposit.orderNumber
                            }
                          </p>
                          <p className="mt-1 text-[10px] text-slate-500">
                            {
                              deposit.customerName
                            }
                          </p>
                          <div className="mt-3 space-y-1 text-[11px]">
                            <Line
                              label="Required"
                              value={
                                money(
                                  deposit.requiredAmount,
                                  deposit.currency,
                                )
                              }
                            />
                            <Line
                              label="Received"
                              value={
                                money(
                                  deposit.receivedAmount,
                                  deposit.currency,
                                )
                              }
                            />
                            <Line
                              label="Status"
                              value={
                                deposit.status
                              }
                            />
                          </div>
                        </div>
                      ),
                    )
              }
            </div>
          </div>
        )
      }
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon:
    typeof TrendingUp;
  label:
    string;
  value:
    string;
}) {
  return (
    <div className="sami-surface rounded-[22px] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
            {
              label
            }
          </p>
          <p className="mt-2 text-lg font-black">
            {
              value
            }
          </p>
        </div>
        <Icon className="h-5 w-5 text-blue-600 dark:text-blue-300" />
      </div>
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children:
    React.ReactNode;
  disabled:
    boolean;
  onClick:
    () =>
      void;
}) {
  return (
    <button
      type="button"
      disabled={
        disabled
      }
      onClick={
        onClick
      }
      className="h-9 rounded-xl border border-[var(--sami-border)] px-3 text-[10px] font-black disabled:opacity-50"
    >
      {
        children
      }
    </button>
  );
}

function Empty({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--sami-border)] p-4 text-xs text-slate-500">
      {
        children
      }
    </div>
  );
}

function Line({
  label,
  value,
}: {
  label:
    string;
  value:
    string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">
        {
          label
        }
      </span>
      <span className="font-black capitalize">
        {
          value
        }
      </span>
    </div>
  );
}
