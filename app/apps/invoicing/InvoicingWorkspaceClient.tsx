'use client';

import {
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';

import Link from 'next/link';

import {
  useRouter,
} from 'next/navigation';

import InvoiceComposer from '@/app/apps/invoicing/InvoiceComposer';
import InvoiceAppearanceSettings from '@/app/apps/invoicing/InvoiceAppearanceSettings';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import {
  useSaMiOverlay,
} from '@/app/components/useSaMiOverlay';

import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  CalendarClock,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Download,
  LayoutDashboard,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Repeat2,
  Search,
  Send,
  Settings2,
  Users,
} from 'lucide-react';

import type {
  InvoicingInvoiceSummary,
  InvoicingWorkspaceData,
} from '@/lib/apps/invoicing/types';


type ViewKey =
  | 'dashboard'
  | 'invoices'
  | 'customers'
  | 'items'
  | 'payments'
  | 'recurring'
  | 'reports'
  | 'settings';



const NAV:
  Array<{
    key: ViewKey;
    label: string;
    icon:
      typeof Receipt;
  }> = [
    {
      key:
        'dashboard',
      label:
        'Overview',
      icon:
        LayoutDashboard,
    },
    {
      key:
        'invoices',
      label:
        'Invoices',
      icon:
        Receipt,
    },
    {
      key:
        'customers',
      label:
        'Customers',
      icon:
        Users,
    },
    {
      key:
        'items',
      label:
        'Items',
      icon:
        Package,
    },
    {
      key:
        'payments',
      label:
        'Payments',
      icon:
        CreditCard,
    },
    {
      key:
        'recurring',
      label:
        'Recurring',
      icon:
        Repeat2,
    },
    {
      key:
        'reports',
      label:
        'Reports',
      icon:
        BarChart3,
    },
    {
      key:
        'settings',
      label:
        'Settings',
      icon:
        Settings2,
    },
  ];


function formatMoney(
  value:
    number,
  currency =
    'KES',
) {
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
        value,
      );
  } catch {
    return (
      currency +
      ' ' +
      value
        .toLocaleString()
    );
  }
}


function csvCell(
  value:
    unknown,
) {
  const text =
    String(
      value ??
      '',
    );

  return (
    '"' +
    text.replaceAll(
      '"',
      '""',
    ) +
    '"'
  );
}


function exportInvoiceRegister(
  invoices:
    InvoicingInvoiceSummary[],
) {
  const rows = [
    [
      'Invoice',
      'Customer',
      'Status',
      'Invoice date',
      'Due date',
      'Currency',
      'Total',
      'Paid',
      'Credits',
      'Balance',
    ],
    ...invoices.map(
      invoice => [
        invoice.invoiceNumber,
        invoice.customerName,
        invoice.status,
        invoice.invoiceDate,
        invoice.dueDate,
        invoice.currency,
        invoice.totalAmount,
        invoice.paidAmount,
        invoice.creditedAmount,
        invoice.balanceDue,
      ],
    ),
  ];

  const csv =
    rows
      .map(
        row =>
          row
            .map(
              csvCell,
            )
            .join(
              ',',
            ),
      )
      .join(
        '\n',
      );

  const blob =
    new Blob(
      [
        csv,
      ],
      {
        type:
          'text/csv;charset=utf-8',
      },
    );

  const url =
    URL.createObjectURL(
      blob,
    );

  const link =
    document.createElement(
      'a',
    );

  link.href =
    url;
  link.download =
    'invoices-' +
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      ) +
    '.csv';

  document.body
    .appendChild(
      link,
    );

  link.click();
  link.remove();

  URL.revokeObjectURL(
    url,
  );
}


function statusClass(
  status:
    string,
) {
  if (
    [
      'paid',
      'active',
      'cleared',
    ].includes(
      status,
    )
  ) {
    return 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300';
  }

  if (
    [
      'overdue',
      'cancelled',
      'void',
      'written_off',
      'blocked',
    ].includes(
      status,
    )
  ) {
    return 'bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300';
  }

  if (
    [
      'sent',
      'viewed',
      'partially_paid',
      'confirmed',
    ].includes(
      status,
    )
  ) {
    return 'bg-blue-500/10 text-blue-700 ring-blue-500/20 dark:text-blue-300';
  }

  return 'bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300';
}


function StatusPill({
  value,
}: {
  value:
    string;
}) {
  return (
    <span
      className={[
        'inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ring-1 ring-inset',
        statusClass(
          value,
        ),
      ].join(
        ' ',
      )}
    >
      {
        value.replaceAll(
          '_',
          ' ',
        )
      }
    </span>
  );
}


function Field({
  label,
  name,
  type =
    'text',
  required =
    false,
  defaultValue,
  maxLength,
  min,
  max,
  step,
}: {
  label:
    string;
  name:
    string;
  type?:
    string;
  required?:
    boolean;
  defaultValue?:
    string;
  maxLength?:
    number;
  min?:
    string;
  max?:
    string;
  step?:
    string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
        {
          label
        }
      </span>

      <input
        name={
          name
        }
        type={
          type
        }
        required={
          required
        }
        defaultValue={
          defaultValue
        }
        maxLength={
          maxLength
        }
        min={
          min
        }
        max={
          max
        }
        step={
          step
        }
        className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm outline-none transition focus:border-blue-500"
      />
    </label>
  );
}


function TextArea({
  label,
  name,
  defaultValue =
    '',
}: {
  label:
    string;
  name:
    string;
  defaultValue?:
    string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
        {
          label
        }
      </span>

      <textarea
        name={
          name
        }
        rows={
          5
        }
        defaultValue={
          defaultValue
        }
        className="w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm outline-none transition focus:border-blue-500"
      />
    </label>
  );
}


function MetricCard({
  label,
  value,
  note,
  icon:
    Icon,
}: {
  label:
    string;
  value:
    string;
  note:
    string;
  icon:
    typeof Receipt;
}) {
  return (
    <div className="sami-surface rounded-[22px] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            {
              label
            }
          </p>

          <p className="mt-2 truncate text-xl font-black tracking-[-0.03em] text-slate-950 dark:text-white">
            {
              value
            }
          </p>

          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {
              note
            }
          </p>
        </div>

        <div className="rounded-2xl bg-blue-500/10 p-2.5 text-blue-700 dark:text-blue-300">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}


export default function InvoicingWorkspaceClient({
  initialData,
}: {
  initialData:
    InvoicingWorkspaceData;
}) {
  const router =
    useRouter();

  const [
    view,
    setView,
  ] =
    useState<ViewKey>(
      'dashboard',
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      '',
    );

  const {
    overlay,
    closeOverlay,
    showSuccess,
    showError,
    showWarning,
  } =
    useSaMiOverlay();

  const [
    pending,
    startTransition,
  ] =
    useTransition();

  const [
    requestBusy,
    setRequestBusy,
  ] =
    useState(
      false,
    );

  const requestInFlight =
    useRef(
      false,
    );

  const busy =
    pending ||
    requestBusy;



  const filteredInvoices =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        if (
          !query
        ) {
          return initialData
            .invoices;
        }

        return initialData
          .invoices
          .filter(
            invoice =>
              invoice
                .invoiceNumber
                .toLowerCase()
                .includes(
                  query,
                ) ||
              invoice
                .customerName
                .toLowerCase()
                .includes(
                  query,
                ) ||
              invoice
                .status
                .toLowerCase()
                .includes(
                  query,
                ),
          );
      },
      [
        initialData
          .invoices,
        search,
      ],
    );

  async function request(
    payload:
      Record<
        string,
        unknown
      >,
  ) {
    if (
      requestInFlight
        .current
    ) {
      throw new Error(
        'Another Invoicing action is still being saved. Please wait for it to finish.',
      );
    }

    requestInFlight
      .current =
      true;

    setRequestBusy(
      true,
    );

    try {
      const response =
        await fetch(
          '/api/apps/invoicing',
          {
            method:
              'POST',
            credentials:
              'same-origin',
            cache:
              'no-store',
            headers: {
              'Content-Type':
                'application/json',
              Accept:
                'application/json',
            },
            body:
              JSON.stringify(
                payload,
              ),
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
            result?:
              Record<
                string,
                unknown
              >;
          };

      if (
        !response.ok ||
        body.success !==
          true
      ) {
        throw new Error(
          body.error ||
          'SaMi could not complete the Invoicing action.',
        );
      }

      startTransition(
        () => {
          router.refresh();
        },
      );

      return body.result ||
        {};
    } finally {
      requestInFlight
        .current =
        false;

      setRequestBusy(
        false,
      );
    }
  }

  async function run(
    payload:
      Record<
        string,
        unknown
      >,
    successMessage:
      string,
  ) {
    try {
      await request(
        payload,
      );

      showSuccess(
        'Action completed',
        successMessage,
      );

      return true;
    } catch (
      caught
    ) {
      const message =
        caught instanceof
          Error
          ? caught.message
          : 'SaMi could not complete the action.';

      if (
        message.includes(
          'still being saved',
        )
      ) {
        showWarning(
          'Action already in progress',
          message,
        );
      } else {
        showError(
          'Invoicing action failed',
          message,
        );
      }

      return false;
    }
  }

  return (
    <>
      <SaMiOverlay
        {...overlay}
        onClose={
          closeOverlay
        }
      />

      <div className="space-y-4">
      <section className="sami-surface overflow-hidden rounded-[26px]">
        <div className="flex flex-col gap-4 border-b border-[var(--sami-border)] p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">
              {
                initialData
                  .company
                  .name
              }
            </p>

            <h1 className="mt-1 text-xl font-black tracking-[-0.03em] sm:text-2xl">
              Receivables command center
            </h1>

            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
              Invoices, customer billing, collections, credit notes and recurring schedules are isolated to the current company.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {
              initialData
                .capabilities
                .canCreate &&
              (
                <button
                  type="button"
                  onClick={
                    () =>
                      setView(
                        'invoices',
                      )
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white shadow-sm transition hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  New invoice
                </button>
              )
            }

            <button
              type="button"
              disabled={
                busy
              }
              onClick={
                () =>
                  startTransition(
                    () => {
                      router.refresh();
                    },
                  )
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs font-bold disabled:opacity-60"
            >
              <RefreshCw
                className={[
                  'h-4 w-4',
                  pending
                    ? 'animate-spin'
                    : '',
                ].join(
                  ' ',
                )}
              />
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto px-3 py-2">
          <div className="flex min-w-max gap-1">
            {
              NAV.map(
                item => {
                  const Icon =
                    item.icon;

                  const active =
                    item.key ===
                    view;

                  return (
                    <button
                      key={
                        item.key
                      }
                      type="button"
                      onClick={
                        () =>
                          setView(
                            item.key,
                          )
                      }
                      className={[
                        'inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold transition',
                        active
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5',
                      ].join(
                        ' ',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {
                        item.label
                      }
                    </button>
                  );
                },
              )
            }
          </div>
        </div>
      </section>

      {
        view ===
          'dashboard' &&
        (
          <Dashboard
            data={
              initialData
            }
          />
        )
      }

      {
        view ===
          'invoices' &&
        (
          <Invoices
            data={
              initialData
            }
            invoices={
              filteredInvoices
            }
            search={
              search
            }
            setSearch={
              setSearch
            }
            pending={
              busy
            }
            run={
              run
            }
          />
        )
      }

      {
        view ===
          'customers' &&
        (
          <Customers
            data={
              initialData
            }
            pending={
              busy
            }
            run={
              run
            }
          />
        )
      }

      {
        view ===
          'items' &&
        (
          <Items
            data={
              initialData
            }
            pending={
              busy
            }
            run={
              run
            }
          />
        )
      }

      {
        view ===
          'payments' &&
        (
          <Payments
            data={
              initialData
            }
          />
        )
      }

      {
        view ===
          'recurring' &&
        (
          <Recurring
            data={
              initialData
            }
            pending={
              busy
            }
            run={
              run
            }
          />
        )
      }

      {
        view ===
          'reports' &&
        (
          <Reports
            data={
              initialData
            }
          />
        )
      }

      {
        view ===
          'settings' &&
        (
          <Settings
            data={
              initialData
            }
            pending={
              busy
            }
            run={
              run
            }
          />
        )
      }
      </div>
    </>
  );
}


function Dashboard({
  data,
}: {
  data:
    InvoicingWorkspaceData;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Invoiced"
          value={
            formatMoney(
              data.metrics
                .invoicedTotal,
              data.company
                .currency,
            )
          }
          note={
            data.metrics
              .invoiceCount +
            ' invoices'
          }
          icon={
            Receipt
          }
        />

        <MetricCard
          label="Collected"
          value={
            formatMoney(
              data.metrics
                .paidTotal,
              data.company
                .currency,
            )
          }
          note={
            data.metrics
              .paidCount +
            ' paid'
          }
          icon={
            BadgeCheck
          }
        />

        <MetricCard
          label="Outstanding"
          value={
            formatMoney(
              data.metrics
                .outstandingTotal,
              data.company
                .currency,
            )
          }
          note="Open receivables"
          icon={
            CircleDollarSign
          }
        />

        <MetricCard
          label="Overdue"
          value={
            formatMoney(
              data.metrics
                .overdueTotal,
              data.company
                .currency,
            )
          }
          note={
            data.metrics
              .overdueCount +
            ' overdue'
          }
          icon={
            AlertTriangle
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="sami-surface rounded-[24px] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black">
                Recent invoices
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Latest billing activity in this company
              </p>
            </div>

            <Receipt className="h-5 w-5 text-blue-600" />
          </div>

          <div className="mt-4 divide-y divide-[var(--sami-border)]">
            {
              data.invoices
                .slice(
                  0,
                  8,
                )
                .map(
                  invoice => (
                    <div
                      key={
                        invoice.id
                      }
                      className="flex items-center gap-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-black">
                            {
                              invoice
                                .invoiceNumber
                            }
                          </p>

                          <StatusPill
                            value={
                              invoice
                                .status
                            }
                          />
                        </div>

                        <p className="mt-1 truncate text-xs text-slate-500">
                          {
                            invoice
                              .customerName
                          } · due {
                            invoice
                              .dueDate
                          }
                        </p>
                      </div>

                      <p className="text-sm font-black">
                        {
                          formatMoney(
                            invoice
                              .totalAmount,
                            invoice
                              .currency,
                          )
                        }
                      </p>
                    </div>
                  ),
                )
            }

            {
              data.invoices
                .length ===
                0 &&
              (
                <p className="py-10 text-center text-sm text-slate-500">
                  No invoices yet.
                </p>
              )
            }
          </div>
        </div>

        <div className="sami-surface rounded-[24px] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black">
                Receivables aging
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Open balance by overdue range
              </p>
            </div>

            <CalendarClock className="h-5 w-5 text-blue-600" />
          </div>

          <div className="mt-4 space-y-3">
            {
              [
                'current',
                '1-30',
                '31-60',
                '61-90',
                '90+',
              ].map(
                bucket => {
                  const row =
                    data.aging
                      .find(
                        item =>
                          item.bucket ===
                          bucket,
                      );

                  const amount =
                    row?.amount ||
                    0;

                  const maxAmount =
                    Math.max(
                      1,
                      ...data.aging
                        .map(
                          item =>
                            item.amount,
                        ),
                    );

                  const percent =
                    Math.min(
                      100,
                      amount /
                      maxAmount *
                      100,
                    );

                  return (
                    <div
                      key={
                        bucket
                      }
                    >
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-bold">
                          {
                            bucket ===
                              'current'
                              ? 'Current'
                              : bucket +
                                ' days'
                          }
                        </span>

                        <span className="font-black">
                          {
                            formatMoney(
                              amount,
                              data.company
                                .currency,
                            )
                          }
                        </span>
                      </div>

                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                        <div
                          className="h-full rounded-full bg-blue-600"
                          style={{
                            width:
                              percent +
                              '%',
                          }}
                        />
                      </div>
                    </div>
                  );
                },
              )
            }
          </div>
        </div>
      </div>
    </div>
  );
}


function Invoices({
  data,
  invoices,
  search,
  setSearch,
  pending,
  run,
}: {
  data:
    InvoicingWorkspaceData;
  invoices:
    InvoicingInvoiceSummary[];
  search:
    string;
  setSearch:
    (
      value:
        string,
    ) =>
      void;
  pending:
    boolean;
  run:
    (
      payload:
        Record<
          string,
          unknown
        >,
      message:
        string,
    ) =>
      Promise<boolean>;
}) {
  return (
    <div className="space-y-4">
      {
        data.capabilities
          .canCreate &&
        (
          <details className="sami-surface rounded-[24px]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5">
              <div>
                <p className="text-sm font-black">
                  Create invoice
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Choose a customer and real products/services, then review live totals before saving or confirming.
                </p>
              </div>

              <Plus className="h-5 w-5 text-blue-600" />
            </summary>

            <div className="border-t border-[var(--sami-border)] p-3 sm:p-5">
              <InvoiceComposer
                data={
                  data
                }
                pending={
                  pending
                }
                run={
                  run
                }
              />
            </div>
          </details>
        )
      }

      <div className="sami-surface overflow-hidden rounded-[24px]">
        <div className="flex flex-col gap-3 border-b border-[var(--sami-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black">
              Invoices
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {
                data.invoices
                  .length
              } records in the current company
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              type="button"
              disabled={
                invoices.length ===
                  0
              }
              onClick={
                () =>
                  exportInvoiceRegister(
                    invoices,
                  )
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              value={
                search
              }
              onChange={
                event =>
                  setSearch(
                    event
                      .target
                      .value,
                  )
              }
              placeholder="Search invoice or customer"
              className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent pl-9 pr-3 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 p-3 sm:hidden">
          {
            invoices.map(
              invoice => (
                <article
                  key={
                    invoice.id
                  }
                  className="rounded-2xl border border-[var(--sami-border)] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={
                          '/apps/invoicing/' +
                          invoice.id
                        }
                        className="font-black text-blue-700 dark:text-blue-300"
                      >
                        {
                          invoice
                            .invoiceNumber
                        }
                      </Link>

                      <p className="mt-1 truncate text-xs font-semibold">
                        {
                          invoice
                            .customerName
                        }
                      </p>

                      <p className="mt-1 text-[11px] text-slate-500">
                        Due {
                          invoice
                            .dueDate
                        }
                      </p>
                    </div>

                    <StatusPill
                      value={
                        invoice
                          .status
                      }
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 dark:bg-white/[0.03]">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                        Total
                      </p>

                      <p className="mt-1 text-sm font-black">
                        {
                          formatMoney(
                            invoice
                              .totalAmount,
                            invoice
                              .currency,
                          )
                        }
                      </p>
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                        Balance
                      </p>

                      <p className="mt-1 text-sm font-black">
                        {
                          formatMoney(
                            invoice
                              .balanceDue,
                            invoice
                              .currency,
                          )
                        }
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    {
                      invoice
                        .daysOverdue >
                        0 &&
                      invoice
                        .balanceDue >
                        0
                        ? (
                          <p className="text-[10px] font-bold text-red-600">
                            {
                              invoice
                                .daysOverdue
                            } days overdue
                          </p>
                        )
                        : (
                          <span />
                        )
                    }

                    <Link
                      href={
                        '/apps/invoicing/' +
                        invoice.id
                      }
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white"
                    >
                      Open invoice
                    </Link>
                  </div>
                </article>
              ),
            )
          }

          {
            invoices.length ===
              0 &&
            (
              <p className="py-8 text-center text-sm text-slate-500">
                No invoices match this view.
              </p>
            )
          }
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[1080px] text-left">
            <thead className="bg-slate-50/70 text-[10px] uppercase tracking-[0.1em] text-slate-400 dark:bg-white/[0.02]">
              <tr>
                <th className="px-4 py-3">
                  Invoice
                </th>

                <th className="px-4 py-3">
                  Customer
                </th>

                <th className="px-4 py-3">
                  Status
                </th>

                <th className="px-4 py-3">
                  Due
                </th>

                <th className="px-4 py-3 text-right">
                  Total
                </th>

                <th className="px-4 py-3 text-right">
                  Balance
                </th>

                <th className="px-4 py-3">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {
                invoices.map(
                  invoice => (
                    <tr
                      key={
                        invoice.id
                      }
                      className="border-t border-[var(--sami-border)] text-sm"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={
                            '/apps/invoicing/' +
                            invoice.id
                          }
                          className="font-black text-blue-700 hover:underline dark:text-blue-300"
                        >
                          {
                            invoice
                              .invoiceNumber
                          }
                        </Link>

                        <p className="mt-1 text-[11px] text-slate-500">
                          {
                            invoice
                              .invoiceDate
                          }
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-bold">
                          {
                            invoice
                              .customerName
                          }
                        </p>

                        <p className="mt-1 text-[11px] text-slate-500">
                          {
                            invoice
                              .customerEmail ||
                            'No email'
                          }
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <StatusPill
                          value={
                            invoice
                              .status
                          }
                        />
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-semibold">
                          {
                            invoice
                              .dueDate
                          }
                        </p>

                        {
                          invoice
                            .daysOverdue >
                            0 &&
                          invoice
                            .balanceDue >
                            0 &&
                          (
                            <p className="mt-1 text-[10px] font-bold text-red-600">
                              {
                                invoice
                                  .daysOverdue
                              } days overdue
                            </p>
                          )
                        }
                      </td>

                      <td className="px-4 py-3 text-right font-black">
                        {
                          formatMoney(
                            invoice
                              .totalAmount,
                            invoice
                              .currency,
                          )
                        }
                      </td>

                      <td className="px-4 py-3 text-right">
                        <p className="font-black">
                          {
                            formatMoney(
                              invoice
                                .balanceDue,
                              invoice
                                .currency,
                            )
                          }
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={
                              '/apps/invoicing/' +
                              invoice.id
                            }
                            className="rounded-xl border border-[var(--sami-border)] px-2.5 py-2 text-xs font-black"
                          >
                            Open
                          </Link>

                          <InvoiceActions
                            invoice={
                              invoice
                            }
                            capabilities={
                              data.capabilities
                            }
                            pending={
                              pending
                            }
                            run={
                              run
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  ),
                )
              }

              {
                invoices.length ===
                  0 &&
                (
                  <tr>
                    <td
                      colSpan={
                        7
                      }
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      No invoices match this view.
                    </td>
                  </tr>
                )
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


function InvoiceActions({
  invoice,
  capabilities,
  pending,
  run,
}: {
  invoice:
    InvoicingInvoiceSummary;
  capabilities:
    InvoicingWorkspaceData[
      'capabilities'
    ];
  pending:
    boolean;
  run:
    (
      payload:
        Record<
          string,
          unknown
        >,
      message:
        string,
    ) =>
      Promise<boolean>;
}) {
  return (
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-xl border border-[var(--sami-border)] px-2.5 py-2 text-xs font-bold">
        Manage
        <ChevronDown className="h-3.5 w-3.5" />
      </summary>

      <div className="mt-2 min-w-[250px] space-y-2 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-3 shadow-xl">
        {
          invoice.status ===
            'draft' &&
          capabilities
            .canConfirm &&
          (
            <button
              type="button"
              disabled={
                pending
              }
              onClick={
                () =>
                  run(
                    {
                      action:
                        'change_status',
                      invoiceId:
                        invoice.id,
                      status:
                        'confirmed',
                    },
                    'Invoice confirmed.',
                  )
              }
              className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold hover:bg-slate-100 dark:hover:bg-white/5"
            >
              Confirm invoice
            </button>
          )
        }

        {
          capabilities
            .canSend &&
          ![
            'paid',
            'cancelled',
            'void',
            'written_off',
          ].includes(
            invoice.status,
          ) &&
          (
            <button
              type="button"
              disabled={
                pending
              }
              onClick={
                () =>
                  run(
                    {
                      action:
                        'send_invoice',
                      invoiceId:
                        invoice.id,
                      channels: [
                        'email',
                      ],
                    },
                    'Invoice sent to the customer.',
                  )
              }
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <Send className="h-3.5 w-3.5" />
              Send by email
            </button>
          )
        }

        {
          capabilities
            .canRecordPayment &&
          invoice
            .balanceDue >
            0 &&
          ![
            'draft',
            'cancelled',
            'void',
            'written_off',
            'paid',
          ].includes(
            invoice.status,
          ) &&
          (
            <form
              className="space-y-2 rounded-xl bg-slate-50 p-2 dark:bg-white/[0.03]"
              onSubmit={
                async event => {
                  event
                    .preventDefault();

                  const form =
                    new FormData(
                      event
                        .currentTarget,
                    );

                  await run(
                    {
                      action:
                        'record_payment',
                      invoiceId:
                        invoice.id,
                      amount:
                        form.get(
                          'amount',
                        ),
                      method:
                        form.get(
                          'method',
                        ),
                      reference:
                        form.get(
                          'reference',
                        ),
                    },
                    'Payment recorded.',
                  );
                }
              }
            >
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Record payment
              </p>

              <input
                name="amount"
                type="number"
                min="0.01"
                max={
                  invoice
                    .balanceDue
                }
                step="0.01"
                defaultValue={
                  invoice
                    .balanceDue
                }
                required
                className="h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs"
              />

              <select
                name="method"
                className="h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs"
              >
                <option value="mpesa">
                  M-Pesa
                </option>
                <option value="bank">
                  Bank
                </option>
                <option value="cash">
                  Cash
                </option>
                <option value="card">
                  Card
                </option>
                <option value="other">
                  Other
                </option>
              </select>

              <input
                name="reference"
                placeholder="Reference"
                className="h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs"
              />

              <button
                type="submit"
                disabled={
                  pending
                }
                className="h-9 w-full rounded-lg bg-blue-600 text-xs font-black text-white"
              >
                Save payment
              </button>
            </form>
          )
        }

        {
          capabilities
            .canCredit &&
          invoice
            .balanceDue >
            0 &&
          ![
            'draft',
            'cancelled',
            'void',
            'written_off',
          ].includes(
            invoice.status,
          ) &&
          (
            <form
              className="space-y-2 rounded-xl bg-slate-50 p-2 dark:bg-white/[0.03]"
              onSubmit={
                async event => {
                  event
                    .preventDefault();

                  const form =
                    new FormData(
                      event
                        .currentTarget,
                    );

                  await run(
                    {
                      action:
                        'issue_credit_note',
                      invoiceId:
                        invoice.id,
                      amount:
                        form.get(
                          'amount',
                        ),
                      reason:
                        form.get(
                          'reason',
                        ),
                    },
                    'Credit note issued.',
                  );
                }
              }
            >
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Credit note
              </p>

              <input
                name="amount"
                type="number"
                min="0.01"
                max={
                  invoice
                    .balanceDue
                }
                step="0.01"
                required
                placeholder="Amount"
                className="h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs"
              />

              <input
                name="reason"
                required
                placeholder="Reason"
                className="h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs"
              />

              <button
                type="submit"
                disabled={
                  pending
                }
                className="h-9 w-full rounded-lg border border-[var(--sami-border)] text-xs font-black"
              >
                Issue credit
              </button>
            </form>
          )
        }
      </div>
    </details>
  );
}


function Customers({
  data,
  pending,
  run,
}: {
  data:
    InvoicingWorkspaceData;
  pending:
    boolean;
  run:
    (
      payload:
        Record<
          string,
          unknown
        >,
      message:
        string,
    ) =>
      Promise<boolean>;
}) {
  const [
    query,
    setQuery,
  ] =
    useState(
      '',
    );

  const filtered =
    useMemo(
      () => {
        const needle =
          query
            .trim()
            .toLowerCase();

        if (!needle) {
          return data.customers;
        }

        return data.customers.filter(
          customer =>
            [
              customer.name,
              customer.legalName,
              customer.contactName,
              customer.email,
              customer.phone,
              customer.taxId,
              customer.registrationNumber,
              customer.status,
            ]
              .filter(
                Boolean,
              )
              .some(
                value =>
                  String(
                    value,
                  )
                    .toLowerCase()
                    .includes(
                      needle,
                    ),
              ),
        );
      },
      [
        data.customers,
        query,
      ],
    );

  return (
    <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
      {
        data.capabilities
          .canManageCustomers &&
        (
          <form
            className="sami-surface h-fit rounded-[24px] p-4 sm:p-5"
            onSubmit={
              async event => {
                event
                  .preventDefault();

                const element =
                  event.currentTarget;

                const form =
                  new FormData(
                    element,
                  );

                const saved =
                  await run(
                    {
                      action:
                        'create_customer',
                      customerType:
                        form.get(
                          'customerType',
                        ),
                      name:
                        form.get(
                          'name',
                        ),
                      legalName:
                        form.get(
                          'legalName',
                        ),
                      contactName:
                        form.get(
                          'contactName',
                        ),
                      email:
                        form.get(
                          'email',
                        ),
                      phone:
                        form.get(
                          'phone',
                        ),
                      taxId:
                        form.get(
                          'taxId',
                        ),
                      registrationNumber:
                        form.get(
                          'registrationNumber',
                        ),
                      currency:
                        form.get(
                          'currency',
                        ),
                      paymentTermsId:
                        form.get(
                          'paymentTermsId',
                        ),
                      creditLimit:
                        form.get(
                          'creditLimit',
                        ),
                      billingAddress:
                        form.get(
                          'billingAddress',
                        ),
                      shippingAddress:
                        form.get(
                          'shippingAddress',
                        ),
                      city:
                        form.get(
                          'city',
                        ),
                      state:
                        form.get(
                          'state',
                        ),
                      postalCode:
                        form.get(
                          'postalCode',
                        ),
                      country:
                        form.get(
                          'country',
                        ),
                      countryCode:
                        form.get(
                          'countryCode',
                        ),
                      notes:
                        form.get(
                          'notes',
                        ),
                    },
                    'Customer created.',
                  );

                if (
                  saved
                ) {
                  element.reset();
                }
              }
            }
          >
            <p className="text-sm font-black">
              Add billing customer
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              Complete billing master data. Duplicate billing identities are rejected server-side.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                  Customer type
                </span>
                <select
                  name="customerType"
                  defaultValue="company"
                  className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="company">
                    Company
                  </option>
                  <option value="individual">
                    Individual
                  </option>
                  <option value="government">
                    Government
                  </option>
                  <option value="non_profit">
                    Non-profit
                  </option>
                </select>
              </label>

              <Field
                label="Customer name"
                name="name"
                required
              />

              <Field
                label="Legal name"
                name="legalName"
              />

              <Field
                label="Contact person"
                name="contactName"
              />

              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Email"
                  name="email"
                  type="email"
                />

                <Field
                  label="Phone"
                  name="phone"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Tax / PIN"
                  name="taxId"
                />

                <Field
                  label="Registration no."
                  name="registrationNumber"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Currency"
                  name="currency"
                  maxLength={
                    3
                  }
                  defaultValue={
                    data.company
                      .currency
                  }
                />

                <Field
                  label="Credit limit"
                  name="creditLimit"
                  type="number"
                  min="0"
                  step="0.01"
                />
              </div>

              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                  Payment terms
                </span>

                <select
                  name="paymentTermsId"
                  className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="">
                    Workspace default
                  </option>

                  {
                    data.paymentTerms
                      .filter(
                        term =>
                          term.isActive,
                      )
                      .map(
                        term => (
                          <option
                            key={
                              term.id
                            }
                            value={
                              term.id
                            }
                          >
                            {
                              term.name
                            } · {
                              term.dueDays
                            } days
                          </option>
                        ),
                      )
                  }
                </select>
              </label>

              <TextArea
                label="Billing address"
                name="billingAddress"
              />

              <details className="rounded-xl border border-[var(--sami-border)]">
                <summary className="cursor-pointer list-none px-3 py-3 text-xs font-black text-slate-500">
                  More customer details
                </summary>

                <div className="grid gap-3 border-t border-[var(--sami-border)] p-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <TextArea
                      label="Shipping address"
                      name="shippingAddress"
                    />
                  </div>

                  <Field
                    label="City"
                    name="city"
                  />

                  <Field
                    label="State / county"
                    name="state"
                  />

                  <Field
                    label="Postal code"
                    name="postalCode"
                  />

                  <Field
                    label="Country"
                    name="country"
                  />

                  <Field
                    label="Country code"
                    name="countryCode"
                    maxLength={
                      2
                    }
                  />

                  <div className="sm:col-span-2">
                    <TextArea
                      label="Internal notes"
                      name="notes"
                    />
                  </div>
                </div>
              </details>
            </div>

            <button
              type="submit"
              disabled={
                pending
              }
              className="mt-4 h-10 w-full rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-60"
            >
              {
                pending
                  ? 'Saving…'
                  : 'Create customer'
              }
            </button>
          </form>
        )
      }

      <div className="sami-surface overflow-hidden rounded-[24px]">
        <div className="border-b border-[var(--sami-border)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black">
                Customers
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Billing identity, status and receivable exposure
              </p>
            </div>

            <label className="relative block sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={
                  query
                }
                onChange={
                  event =>
                    setQuery(
                      event.target.value,
                    )
                }
                placeholder="Search customers"
                className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent pl-9 pr-3 text-xs outline-none focus:border-blue-500"
              />
            </label>
          </div>
        </div>

        <div className="divide-y divide-[var(--sami-border)]">
          {
            filtered.map(
              customer => (
                <details
                  key={
                    customer.id
                  }
                  className="group"
                >
                  <summary className="cursor-pointer list-none p-4">
                    <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_110px_160px_28px]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-black">
                            {
                              customer.name
                            }
                          </p>
                          <StatusPill
                            value={
                              customer.status
                            }
                          />
                        </div>

                        <p className="mt-1 truncate text-xs text-slate-500">
                          {
                            customer.email ||
                            customer.phone ||
                            customer.taxId ||
                            'No contact details'
                          }
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                          Invoices
                        </p>
                        <p className="mt-1 text-sm font-black">
                          {
                            customer.invoiceCount
                          }
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                          Outstanding
                        </p>
                        <p className="mt-1 text-sm font-black">
                          {
                            formatMoney(
                              customer
                                .outstandingTotal,
                              customer
                                .currency,
                            )
                          }
                        </p>
                      </div>

                      <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
                    </div>
                  </summary>

                  {
                    data.capabilities
                      .canManageCustomers &&
                    (
                      <div className="border-t border-[var(--sami-border)] bg-slate-50/40 p-4 dark:bg-white/[0.02]">
                        <form
                          onSubmit={
                            async event => {
                              event
                                .preventDefault();

                              const form =
                                new FormData(
                                  event.currentTarget,
                                );

                              await run(
                                {
                                  action:
                                    'update_customer',
                                  customerId:
                                    customer.id,
                                  customerType:
                                    form.get(
                                      'customerType',
                                    ),
                                  name:
                                    form.get(
                                      'name',
                                    ),
                                  legalName:
                                    form.get(
                                      'legalName',
                                    ),
                                  contactName:
                                    form.get(
                                      'contactName',
                                    ),
                                  email:
                                    form.get(
                                      'email',
                                    ),
                                  phone:
                                    form.get(
                                      'phone',
                                    ),
                                  taxId:
                                    form.get(
                                      'taxId',
                                    ),
                                  registrationNumber:
                                    form.get(
                                      'registrationNumber',
                                    ),
                                  currency:
                                    form.get(
                                      'currency',
                                    ),
                                  paymentTermsId:
                                    form.get(
                                      'paymentTermsId',
                                    ),
                                  creditLimit:
                                    form.get(
                                      'creditLimit',
                                    ),
                                  billingAddress:
                                    form.get(
                                      'billingAddress',
                                    ),
                                  shippingAddress:
                                    form.get(
                                      'shippingAddress',
                                    ),
                                  city:
                                    form.get(
                                      'city',
                                    ),
                                  state:
                                    form.get(
                                      'state',
                                    ),
                                  postalCode:
                                    form.get(
                                      'postalCode',
                                    ),
                                  country:
                                    form.get(
                                      'country',
                                    ),
                                  countryCode:
                                    form.get(
                                      'countryCode',
                                    ),
                                  notes:
                                    form.get(
                                      'notes',
                                    ),
                                },
                                'Customer updated.',
                              );
                            }
                          }
                        >
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <label className="block space-y-1">
                              <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                                Type
                              </span>
                              <select
                                name="customerType"
                                defaultValue={
                                  customer.customerType
                                }
                                className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                              >
                                <option value="company">Company</option>
                                <option value="individual">Individual</option>
                                <option value="government">Government</option>
                                <option value="non_profit">Non-profit</option>
                              </select>
                            </label>

                            <Field
                              label="Customer name"
                              name="name"
                              required
                              defaultValue={
                                customer.name
                              }
                            />

                            <Field
                              label="Legal name"
                              name="legalName"
                              defaultValue={
                                customer.legalName ||
                                ''
                              }
                            />

                            <Field
                              label="Contact"
                              name="contactName"
                              defaultValue={
                                customer.contactName ||
                                ''
                              }
                            />

                            <Field
                              label="Email"
                              name="email"
                              type="email"
                              defaultValue={
                                customer.email ||
                                ''
                              }
                            />

                            <Field
                              label="Phone"
                              name="phone"
                              defaultValue={
                                customer.phone ||
                                ''
                              }
                            />

                            <Field
                              label="Tax / PIN"
                              name="taxId"
                              defaultValue={
                                customer.taxId ||
                                ''
                              }
                            />

                            <Field
                              label="Registration no."
                              name="registrationNumber"
                              defaultValue={
                                customer.registrationNumber ||
                                ''
                              }
                            />

                            <Field
                              label="Currency"
                              name="currency"
                              maxLength={
                                3
                              }
                              defaultValue={
                                customer.currency
                              }
                            />

                            <Field
                              label="Credit limit"
                              name="creditLimit"
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={
                                customer.creditLimit ===
                                  null
                                  ? ''
                                  : String(
                                      customer.creditLimit,
                                    )
                              }
                            />

                            <label className="block space-y-1">
                              <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                                Payment terms
                              </span>
                              <select
                                name="paymentTermsId"
                                defaultValue={
                                  customer.paymentTermsId ||
                                  ''
                                }
                                className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                              >
                                <option value="">
                                  Workspace default
                                </option>
                                {
                                  data.paymentTerms
                                    .filter(
                                      term =>
                                        term.isActive ||
                                        term.id ===
                                          customer.paymentTermsId,
                                    )
                                    .map(
                                      term => (
                                        <option
                                          key={
                                            term.id
                                          }
                                          value={
                                            term.id
                                          }
                                        >
                                          {
                                            term.name
                                          } · {
                                            term.dueDays
                                          } days
                                        </option>
                                      ),
                                    )
                                }
                              </select>
                            </label>

                            <Field
                              label="City"
                              name="city"
                              defaultValue={
                                customer.city ||
                                ''
                              }
                            />

                            <Field
                              label="State / county"
                              name="state"
                              defaultValue={
                                customer.state ||
                                ''
                              }
                            />

                            <Field
                              label="Postal code"
                              name="postalCode"
                              defaultValue={
                                customer.postalCode ||
                                ''
                              }
                            />

                            <Field
                              label="Country"
                              name="country"
                              defaultValue={
                                customer.country ||
                                ''
                              }
                            />

                            <Field
                              label="Country code"
                              name="countryCode"
                              maxLength={
                                2
                              }
                              defaultValue={
                                customer.countryCode ||
                                ''
                              }
                            />

                            <div className="sm:col-span-2">
                              <TextArea
                                label="Billing address"
                                name="billingAddress"
                                defaultValue={
                                  customer.billingAddress ||
                                  ''
                                }
                              />
                            </div>

                            <div className="sm:col-span-2">
                              <TextArea
                                label="Shipping address"
                                name="shippingAddress"
                                defaultValue={
                                  customer.shippingAddress ||
                                  ''
                                }
                              />
                            </div>

                            <div className="sm:col-span-2 xl:col-span-4">
                              <TextArea
                                label="Internal notes"
                                name="notes"
                                defaultValue={
                                  customer.notes ||
                                  ''
                                }
                              />
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-2">
                              {
                                customer.status !==
                                  'active' &&
                                (
                                  <button
                                    type="button"
                                    disabled={
                                      pending
                                    }
                                    onClick={
                                      () =>
                                        run(
                                          {
                                            action:
                                              'set_customer_status',
                                            customerId:
                                              customer.id,
                                            status:
                                              'active',
                                          },
                                          'Customer activated.',
                                        )
                                    }
                                    className="h-9 rounded-xl border border-emerald-500/30 px-3 text-[10px] font-black text-emerald-700 dark:text-emerald-300"
                                  >
                                    Activate
                                  </button>
                                )
                              }

                              {
                                customer.status ===
                                  'active' &&
                                (
                                  <>
                                    <button
                                      type="button"
                                      disabled={
                                        pending
                                      }
                                      onClick={
                                        () =>
                                          run(
                                            {
                                              action:
                                                'set_customer_status',
                                              customerId:
                                                customer.id,
                                              status:
                                                'inactive',
                                            },
                                            'Customer deactivated.',
                                          )
                                      }
                                      className="h-9 rounded-xl border border-[var(--sami-border)] px-3 text-[10px] font-black"
                                    >
                                      Deactivate
                                    </button>

                                    <button
                                      type="button"
                                      disabled={
                                        pending
                                      }
                                      onClick={
                                        () =>
                                          run(
                                            {
                                              action:
                                                'set_customer_status',
                                              customerId:
                                                customer.id,
                                              status:
                                                'blocked',
                                            },
                                            'Customer blocked.',
                                          )
                                      }
                                      className="h-9 rounded-xl border border-red-500/30 px-3 text-[10px] font-black text-red-600"
                                    >
                                      Block
                                    </button>
                                  </>
                                )
                              }
                            </div>

                            <button
                              type="submit"
                              disabled={
                                pending
                              }
                              className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
                            >
                              Save customer
                            </button>
                          </div>
                        </form>
                      </div>
                    )
                  }
                </details>
              ),
            )
          }

          {
            filtered.length ===
              0 &&
            (
              <p className="p-8 text-center text-sm text-slate-500">
                {
                  data.customers.length ===
                    0
                    ? 'No billing customers yet.'
                    : 'No customers match your search.'
                }
              </p>
            )
          }
        </div>
      </div>
    </div>
  );
}


function Items({
  data,
  pending,
  run,
}: {
  data:
    InvoicingWorkspaceData;
  pending:
    boolean;
  run:
    (
      payload:
        Record<
          string,
          unknown
        >,
      message:
        string,
    ) =>
      Promise<boolean>;
}) {
  const [
    query,
    setQuery,
  ] =
    useState(
      '',
    );

  const filtered =
    useMemo(
      () => {
        const needle =
          query
            .trim()
            .toLowerCase();

        if (!needle) {
          return data.catalogItems;
        }

        return data.catalogItems.filter(
          item =>
            [
              item.name,
              item.sku,
              item.description,
              item.unit,
              item.itemType,
              item.isActive
                ? 'active'
                : 'inactive',
            ]
              .filter(
                Boolean,
              )
              .some(
                value =>
                  String(
                    value,
                  )
                    .toLowerCase()
                    .includes(
                      needle,
                    ),
              ),
        );
      },
      [
        data.catalogItems,
        query,
      ],
    );

  return (
    <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
      {
        data.capabilities
          .canManageCatalog &&
        (
          <form
            className="sami-surface h-fit rounded-[24px] p-4 sm:p-5"
            onSubmit={
              async event => {
                event
                  .preventDefault();

                const element =
                  event.currentTarget;

                const form =
                  new FormData(
                    element,
                  );

                const saved =
                  await run(
                    {
                      action:
                        'create_catalog_item',
                      itemType:
                        form.get(
                          'itemType',
                        ),
                      name:
                        form.get(
                          'name',
                        ),
                      sku:
                        form.get(
                          'sku',
                        ),
                      unit:
                        form.get(
                          'unit',
                        ),
                      unitPrice:
                        form.get(
                          'unitPrice',
                        ),
                      taxRateId:
                        form.get(
                          'taxRateId',
                        ),
                      description:
                        form.get(
                          'description',
                        ),
                    },
                    'Invoice item created.',
                  );

                if (
                  saved
                ) {
                  element.reset();
                }
              }
            }
          >
            <p className="text-sm font-black">
              Add invoice item
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              Reusable products and services. Duplicate SKUs or identical items are rejected.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                  Type
                </span>

                <select
                  name="itemType"
                  defaultValue="service"
                  className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="service">
                    Service
                  </option>
                  <option value="product">
                    Product
                  </option>
                </select>
              </label>

              <Field
                label="Name"
                name="name"
                required
              />

              <Field
                label="SKU"
                name="sku"
              />

              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Unit"
                  name="unit"
                  defaultValue="unit"
                />

                <Field
                  label="Unit price"
                  name="unitPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                  Default tax
                </span>

                <select
                  name="taxRateId"
                  className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="">
                    No default tax
                  </option>

                  {
                    data.taxRates
                      .filter(
                        tax =>
                          tax.isActive,
                      )
                      .map(
                        tax => (
                          <option
                            key={
                              tax.id
                            }
                            value={
                              tax.id
                            }
                          >
                            {
                              tax.name
                            } ({tax.rate}%)
                          </option>
                        ),
                      )
                  }
                </select>
              </label>

              <TextArea
                label="Description"
                name="description"
              />
            </div>

            <button
              type="submit"
              disabled={
                pending
              }
              className="mt-4 h-10 w-full rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-60"
            >
              {
                pending
                  ? 'Saving…'
                  : 'Create item'
              }
            </button>
          </form>
        )
      }

      <div className="sami-surface overflow-hidden rounded-[24px]">
        <div className="border-b border-[var(--sami-border)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black">
                Products & services
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Reusable invoice lines with active/inactive lifecycle
              </p>
            </div>

            <label className="relative block sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={
                  query
                }
                onChange={
                  event =>
                    setQuery(
                      event.target.value,
                    )
                }
                placeholder="Search items"
                className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent pl-9 pr-3 text-xs outline-none focus:border-blue-500"
              />
            </label>
          </div>
        </div>

        <div className="divide-y divide-[var(--sami-border)]">
          {
            filtered.map(
              item => (
                <details
                  key={
                    item.id
                  }
                  className="group"
                >
                  <summary className="cursor-pointer list-none p-4">
                    <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_110px_140px_28px]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-black">
                            {
                              item.name
                            }
                          </p>
                          <StatusPill
                            value={
                              item.isActive
                                ? 'active'
                                : 'inactive'
                            }
                          />
                        </div>

                        <p className="mt-1 truncate text-xs text-slate-500">
                          {
                            item.sku
                              ? 'SKU ' +
                                item.sku
                              : item.description ||
                                'No SKU'
                          }
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                          Type
                        </p>
                        <p className="mt-1 text-sm font-black capitalize">
                          {
                            item.itemType
                          }
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                          Unit price
                        </p>
                        <p className="mt-1 text-sm font-black">
                          {
                            formatMoney(
                              item.unitPrice,
                              data.company
                                .currency,
                            )
                          }
                        </p>
                      </div>

                      <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
                    </div>
                  </summary>

                  {
                    data.capabilities
                      .canManageCatalog &&
                    (
                      <div className="border-t border-[var(--sami-border)] bg-slate-50/40 p-4 dark:bg-white/[0.02]">
                        <form
                          onSubmit={
                            async event => {
                              event
                                .preventDefault();

                              const form =
                                new FormData(
                                  event.currentTarget,
                                );

                              await run(
                                {
                                  action:
                                    'update_catalog_item',
                                  itemId:
                                    item.id,
                                  itemType:
                                    form.get(
                                      'itemType',
                                    ),
                                  name:
                                    form.get(
                                      'name',
                                    ),
                                  sku:
                                    form.get(
                                      'sku',
                                    ),
                                  unit:
                                    form.get(
                                      'unit',
                                    ),
                                  unitPrice:
                                    form.get(
                                      'unitPrice',
                                    ),
                                  taxRateId:
                                    form.get(
                                      'taxRateId',
                                    ),
                                  description:
                                    form.get(
                                      'description',
                                    ),
                                },
                                'Invoice item updated.',
                              );
                            }
                          }
                        >
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <label className="block space-y-1">
                              <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                                Type
                              </span>
                              <select
                                name="itemType"
                                defaultValue={
                                  item.itemType
                                }
                                className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                              >
                                <option value="service">
                                  Service
                                </option>
                                <option value="product">
                                  Product
                                </option>
                              </select>
                            </label>

                            <Field
                              label="Name"
                              name="name"
                              required
                              defaultValue={
                                item.name
                              }
                            />

                            <Field
                              label="SKU"
                              name="sku"
                              defaultValue={
                                item.sku ||
                                ''
                              }
                            />

                            <Field
                              label="Unit"
                              name="unit"
                              defaultValue={
                                item.unit
                              }
                            />

                            <Field
                              label="Unit price"
                              name="unitPrice"
                              type="number"
                              min="0"
                              step="0.01"
                              required
                              defaultValue={
                                String(
                                  item.unitPrice,
                                )
                              }
                            />

                            <label className="block space-y-1">
                              <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                                Default tax
                              </span>
                              <select
                                name="taxRateId"
                                defaultValue={
                                  item.taxRateId ||
                                  ''
                                }
                                className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                              >
                                <option value="">
                                  No default tax
                                </option>
                                {
                                  data.taxRates
                                    .filter(
                                      tax =>
                                        tax.isActive ||
                                        tax.id ===
                                          item.taxRateId,
                                    )
                                    .map(
                                      tax => (
                                        <option
                                          key={
                                            tax.id
                                          }
                                          value={
                                            tax.id
                                          }
                                        >
                                          {
                                            tax.name
                                          } ({tax.rate}%)
                                        </option>
                                      ),
                                    )
                                }
                              </select>
                            </label>

                            <div className="sm:col-span-2">
                              <TextArea
                                label="Description"
                                name="description"
                                defaultValue={
                                  item.description ||
                                  ''
                                }
                              />
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              disabled={
                                pending
                              }
                              onClick={
                                () =>
                                  run(
                                    {
                                      action:
                                        'set_catalog_item_active',
                                      itemId:
                                        item.id,
                                      isActive:
                                        !item.isActive,
                                    },
                                    item.isActive
                                      ? 'Invoice item deactivated.'
                                      : 'Invoice item activated.',
                                  )
                              }
                              className="h-9 rounded-xl border border-[var(--sami-border)] px-3 text-[10px] font-black"
                            >
                              {
                                item.isActive
                                  ? 'Deactivate'
                                  : 'Activate'
                              }
                            </button>

                            <button
                              type="submit"
                              disabled={
                                pending
                              }
                              className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
                            >
                              Save item
                            </button>
                          </div>
                        </form>
                      </div>
                    )
                  }
                </details>
              ),
            )
          }

          {
            filtered.length ===
              0 &&
            (
              <p className="p-8 text-center text-sm text-slate-500">
                {
                  data.catalogItems.length ===
                    0
                    ? 'No invoice items yet.'
                    : 'No items match your search.'
                }
              </p>
            )
          }
        </div>
      </div>
    </div>
  );
}


function Payments({
  data,
}: {
  data:
    InvoicingWorkspaceData;
}) {
  return (
    <div className="sami-surface overflow-hidden rounded-[24px]">
      <div className="border-b border-[var(--sami-border)] p-4 sm:p-5">
        <p className="text-sm font-black">
          Payment register
        </p>

        <p className="mt-1 text-xs text-slate-500">
          Posted payments are allocated to invoices without mutating invoice totals.
        </p>
      </div>

      <div className="divide-y divide-[var(--sami-border)]">
        {
          data.payments
            .map(
              payment => (
                <div
                  key={
                    payment.id
                  }
                  className="grid gap-3 p-4 md:grid-cols-[150px_minmax(0,1fr)_160px_160px]"
                >
                  <div>
                    <p className="font-black">
                      {
                        payment
                          .paymentNumber
                      }
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {
                        payment
                          .paymentDate
                      }
                    </p>
                  </div>

                  <div>
                    <p className="font-bold">
                      {
                        payment
                          .customerName ||
                        'Customer'
                      }
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {
                        payment
                          .invoiceNumbers
                          .join(
                            ', ',
                          ) ||
                        'Unallocated'
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-black">
                      {
                        formatMoney(
                          payment.amount,
                          payment.currency,
                        )
                      }
                    </p>

                    <p className="mt-1 text-xs capitalize text-slate-500">
                      {
                        payment.method
                      }
                    </p>
                  </div>

                  <div className="text-xs text-slate-500">
                    {
                      payment.reference ||
                      'No reference'
                    }
                  </div>
                </div>
              ),
            )
        }

        {
          data.payments
            .length ===
            0 &&
          (
            <p className="p-8 text-center text-sm text-slate-500">
              No payments recorded yet.
            </p>
          )
        }
      </div>
    </div>
  );
}


function Recurring({
  data,
  pending,
  run,
}: {
  data:
    InvoicingWorkspaceData;
  pending:
    boolean;
  run:
    (
      payload:
        Record<
          string,
          unknown
        >,
      message:
        string,
    ) =>
      Promise<boolean>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      {
        data.capabilities
          .canManageRecurring &&
        (
          <form
            className="sami-surface h-fit rounded-[24px] p-4 sm:p-5"
            onSubmit={
              async event => {
                event
                  .preventDefault();

                const element =
                  event.currentTarget;

                const form =
                  new FormData(
                    element,
                  );

                const saved =
                  await run(
                  {
                    action:
                      'create_recurring',
                    name:
                      form.get(
                        'name',
                      ),
                    sourceInvoiceId:
                      form.get(
                        'sourceInvoiceId',
                      ),
                    intervalUnit:
                      form.get(
                        'intervalUnit',
                      ),
                    intervalCount:
                      form.get(
                        'intervalCount',
                      ),
                    nextRunAt:
                      form.get(
                        'nextRunAt',
                      ),
                    autoSend:
                      form.get(
                        'autoSend',
                      ) ===
                      'on',
                    deliveryChannels: [
                      form.get(
                        'deliveryEmail',
                      ) ===
                        'on'
                        ? 'email'
                        : null,
                      form.get(
                        'deliveryWhatsApp',
                      ) ===
                        'on'
                        ? 'whatsapp'
                        : null,
                      form.get(
                        'deliverySms',
                      ) ===
                        'on'
                        ? 'sms'
                        : null,
                    ].filter(
                      Boolean,
                    ),

                  },
                  'Recurring schedule created.',
                );

                if (
                  saved
                ) {
                  element.reset();
                }
              }
            }
          >
            <p className="text-sm font-black">
              New recurring schedule
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Choose an existing invoice as the commercial template. SaMi reuses its customer, items, prices, discounts, taxes and terms for every scheduled invoice.
            </p>

            <div className="mt-4 space-y-3">
              <Field
                label="Schedule name"
                name="name"
                required
              />

              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                  Source invoice
                </span>

                <select
                  name="sourceInvoiceId"
                  required
                  className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="">
                    Choose invoice template
                  </option>

                  {
                    data.invoices
                      .filter(
                        invoice =>
                          ![
                            'cancelled',
                            'void',
                            'written_off',
                          ].includes(
                            invoice.status,
                          ),
                      )
                      .map(
                        invoice => (
                          <option
                            key={
                              invoice.id
                            }
                            value={
                              invoice.id
                            }
                          >
                            {
                              invoice.invoiceNumber
                            } · {
                              invoice.customerName
                            } · {
                              formatMoney(
                                invoice.totalAmount,
                                invoice.currency,
                              )
                            }
                          </option>
                        ),
                      )
                  }
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Every"
                  name="intervalCount"
                  type="number"
                  min="1"
                  max="120"
                  defaultValue="1"
                />

                <label className="block space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                    Period
                  </span>

                  <select
                    name="intervalUnit"
                    className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                  >
                    <option value="month">
                      Month
                    </option>

                    <option value="week">
                      Week
                    </option>

                    <option value="quarter">
                      Quarter
                    </option>

                    <option value="year">
                      Year
                    </option>
                  </select>
                </label>
              </div>

              <Field
                label="Next run"
                name="nextRunAt"
                type="date"
                required
              />

              <label className="flex items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 py-3 text-xs font-semibold">
                <input
                  type="checkbox"
                  name="autoSend"
                />
                Auto-send generated invoices
              </label>

              <div className="rounded-xl border border-[var(--sami-border)] p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                  Auto-send channels
                </p>

                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <Toggle
                    name="deliveryEmail"
                    label="Email PDF"
                    defaultChecked={
                      true
                    }
                  />
                  <Toggle
                    name="deliveryWhatsApp"
                    label="WhatsApp PDF"
                    defaultChecked={
                      false
                    }
                  />
                  <Toggle
                    name="deliverySms"
                    label="SMS link"
                    defaultChecked={
                      false
                    }
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={
                pending
              }
              className="mt-4 h-10 w-full rounded-xl bg-blue-600 text-xs font-black text-white"
            >
              Save schedule
            </button>
          </form>
        )
      }

      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <p className="text-sm font-black">
          Recurring invoices
        </p>

        <div className="mt-3 divide-y divide-[var(--sami-border)]">
          {
            data.recurring
              .map(
                item => (
                  <details
                    key={
                      item.id
                    }
                    className="group"
                  >
                    <summary className="cursor-pointer list-none py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="font-black">
                            {
                              item.name
                            }
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {
                              item.customerName
                            } · {
                              item.sourceInvoiceNumber ||
                              'invoice template'
                            } · every {
                              item.intervalCount
                            } {
                              item.intervalUnit
                            }
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-3 sm:justify-end">
                          <div className="sm:text-right">
                            <StatusPill
                              value={
                                item.status
                              }
                            />

                            <p className="mt-1 text-[11px] text-slate-500">
                              Next {
                                item.nextRunAt
                              }
                            </p>
                          </div>

                          <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
                        </div>
                      </div>
                    </summary>

                    {
                      data.capabilities
                        .canManageRecurring &&
                      item.status !==
                        'cancelled' &&
                      item.status !==
                        'completed' &&
                      (
                        <form
                          className="mb-3 rounded-2xl border border-[var(--sami-border)] bg-slate-50/40 p-3 dark:bg-white/[0.02]"
                          onSubmit={
                            async event => {
                              event.preventDefault();

                              const form =
                                new FormData(
                                  event.currentTarget,
                                );

                              await run(
                                {
                                  action:
                                    'update_recurring',
                                  recurringId:
                                    item.id,
                                  name:
                                    form.get(
                                      'name',
                                    ),
                                  intervalUnit:
                                    form.get(
                                      'intervalUnit',
                                    ),
                                  intervalCount:
                                    form.get(
                                      'intervalCount',
                                    ),
                                  nextRunAt:
                                    form.get(
                                      'nextRunAt',
                                    ),
                                  autoSend:
                                    form.get(
                                      'autoSend',
                                    ) ===
                                    'on',
                                  deliveryChannels: [
                                    form.get(
                                      'deliveryEmail',
                                    ) ===
                                      'on'
                                      ? 'email'
                                      : null,
                                    form.get(
                                      'deliveryWhatsApp',
                                    ) ===
                                      'on'
                                      ? 'whatsapp'
                                      : null,
                                    form.get(
                                      'deliverySms',
                                    ) ===
                                      'on'
                                      ? 'sms'
                                      : null,
                                  ].filter(
                                    Boolean,
                                  ),
                                },
                                'Recurring schedule updated.',
                              );
                            }
                          }
                        >
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <Field
                              label="Schedule name"
                              name="name"
                              required
                              defaultValue={
                                item.name
                              }
                            />

                            <Field
                              label="Every"
                              name="intervalCount"
                              type="number"
                              min="1"
                              max="120"
                              required
                              defaultValue={
                                String(
                                  item.intervalCount,
                                )
                              }
                            />

                            <label className="block space-y-1">
                              <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                                Period
                              </span>
                              <select
                                name="intervalUnit"
                                defaultValue={
                                  item.intervalUnit
                                }
                                className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                              >
                                <option value="day">Day</option>
                                <option value="week">Week</option>
                                <option value="month">Month</option>
                                <option value="quarter">Quarter</option>
                                <option value="year">Year</option>
                              </select>
                            </label>

                            <Field
                              label="Next run"
                              name="nextRunAt"
                              type="date"
                              required
                              defaultValue={
                                item.nextRunAt
                                  .slice(
                                    0,
                                    10,
                                  )
                              }
                            />
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-4">
                            <Toggle
                              name="autoSend"
                              label="Auto-send"
                              defaultChecked={
                                item.autoSend
                              }
                            />
                            <Toggle
                              name="deliveryEmail"
                              label="Email"
                              defaultChecked={
                                item.deliveryChannels
                                  .includes(
                                    'email',
                                  )
                              }
                            />
                            <Toggle
                              name="deliveryWhatsApp"
                              label="WhatsApp"
                              defaultChecked={
                                item.deliveryChannels
                                  .includes(
                                    'whatsapp',
                                  )
                              }
                            />
                            <Toggle
                              name="deliverySms"
                              label="SMS"
                              defaultChecked={
                                item.deliveryChannels
                                  .includes(
                                    'sms',
                                  )
                              }
                            />
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={
                                  pending
                                }
                                onClick={
                                  () =>
                                    run(
                                      {
                                        action:
                                          'set_recurring_status',
                                        recurringId:
                                          item.id,
                                        status:
                                          item.status ===
                                            'active'
                                            ? 'paused'
                                            : 'active',
                                      },
                                      item.status ===
                                        'active'
                                        ? 'Recurring schedule paused.'
                                        : 'Recurring schedule resumed.',
                                    )
                                }
                                className="h-9 rounded-xl border border-[var(--sami-border)] px-3 text-[10px] font-black disabled:opacity-50"
                              >
                                {
                                  item.status ===
                                    'active'
                                    ? 'Pause'
                                    : 'Resume'
                                }
                              </button>

                              <button
                                type="button"
                                disabled={
                                  pending
                                }
                                onClick={
                                  () =>
                                    run(
                                      {
                                        action:
                                          'set_recurring_status',
                                        recurringId:
                                          item.id,
                                        status:
                                          'cancelled',
                                      },
                                      'Recurring schedule cancelled.',
                                    )
                                }
                                className="h-9 rounded-xl border border-red-500/30 px-3 text-[10px] font-black text-red-600 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>

                            <button
                              type="submit"
                              disabled={
                                pending
                              }
                              className="h-9 rounded-xl bg-blue-600 px-3 text-[10px] font-black text-white disabled:opacity-60"
                            >
                              Save schedule
                            </button>
                          </div>
                        </form>
                      )
                    }
                  </details>
                ),
              )
          }

          {
            data.recurring
              .length ===
              0 &&
            (
              <p className="py-8 text-center text-sm text-slate-500">
                No recurring schedules yet.
              </p>
            )
          }
        </div>
      </div>
    </div>
  );
}


function Reports({
  data,
}: {
  data:
    InvoicingWorkspaceData;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <p className="text-sm font-black">
          Status analysis
        </p>

        <p className="mt-1 text-xs text-slate-500">
          Invoice volume and value by current status.
        </p>

        <div className="mt-4 space-y-2">
          {
            data.statusCounts
              .map(
                item => (
                  <div
                    key={
                      item.status
                    }
                    className="flex items-center gap-3 rounded-xl border border-[var(--sami-border)] px-3 py-2.5"
                  >
                    <StatusPill
                      value={
                        item.status
                      }
                    />

                    <span className="text-xs font-bold text-slate-500">
                      {
                        item.count
                      } invoices
                    </span>

                    <span className="ml-auto text-sm font-black">
                      {
                        formatMoney(
                          item.amount,
                          data.company
                            .currency,
                        )
                      }
                    </span>
                  </div>
                ),
              )
          }
        </div>
      </div>

      <div className="sami-surface rounded-[24px] p-4 sm:p-5">
        <p className="text-sm font-black">
          Monthly invoicing
        </p>

        <p className="mt-1 text-xs text-slate-500">
          Last 12 active billing months.
        </p>

        <div className="mt-4 space-y-3">
          {
            data.monthly
              .map(
                item => {
                  const maxAmount =
                    Math.max(
                      1,
                      ...data.monthly
                        .map(
                          row =>
                            row.amount,
                        ),
                    );

                  const percent =
                    Math.min(
                      100,
                      item.amount /
                      maxAmount *
                      100,
                    );

                  return (
                    <div
                      key={
                        item.month
                      }
                    >
                      <div className="flex justify-between gap-3 text-xs">
                        <span className="font-bold">
                          {
                            item.month
                          }
                        </span>

                        <span className="font-black">
                          {
                            formatMoney(
                              item.amount,
                              data.company
                                .currency,
                            )
                          }
                        </span>
                      </div>

                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                        <div
                          className="h-full rounded-full bg-blue-600"
                          style={{
                            width:
                              percent +
                              '%',
                          }}
                        />
                      </div>
                    </div>
                  );
                },
              )
          }

          {
            data.monthly
              .length ===
              0 &&
            (
              <p className="py-8 text-center text-sm text-slate-500">
                Monthly reporting will populate as invoices are created.
              </p>
            )
          }
        </div>
      </div>
    </div>
  );
}


function Settings({
  data,
  pending,
  run,
}: {
  data:
    InvoicingWorkspaceData;
  pending:
    boolean;
  run:
    (
      payload:
        Record<
          string,
          unknown
        >,
      message:
        string,
    ) =>
      Promise<boolean>;
}) {
  if (
    !data.capabilities
      .canManageSettings
  ) {
    return (
      <div className="sami-surface rounded-[24px] p-8 text-center">
        <Settings2 className="mx-auto h-8 w-8 text-slate-400" />

        <p className="mt-3 font-black">
          Settings are restricted
        </p>

        <p className="mt-1 text-sm text-slate-500">
          An invoicing administrator can manage company billing defaults.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form
        className="sami-surface rounded-[24px] p-4 sm:p-5"
        onSubmit={
          async event => {
            event.preventDefault();

            const form =
              new FormData(
                event.currentTarget,
              );

            await run(
              {
                action:
                  'update_settings',
                defaultCurrency:
                  form.get(
                    'defaultCurrency',
                  ),
                defaultDueDays:
                  form.get(
                    'defaultDueDays',
                  ),
                taxCalculation:
                  form.get(
                    'taxCalculation',
                  ),
                allowPartialPayments:
                  form.get(
                    'allowPartialPayments',
                  ) ===
                  'on',
                allowCreditNotes:
                  form.get(
                    'allowCreditNotes',
                  ) ===
                  'on',
                requireApproval:
                  form.get(
                    'requireApproval',
                  ) ===
                  'on',
                autoSendRecurring:
                  form.get(
                    'autoSendRecurring',
                  ) ===
                  'on',
                reminderEnabled:
                  form.get(
                    'reminderEnabled',
                  ) ===
                  'on',
                reminderChannels: [
                  form.get(
                    'reminderEmail',
                  ) ===
                    'on'
                    ? 'email'
                    : null,
                  form.get(
                    'reminderWhatsApp',
                  ) ===
                    'on'
                    ? 'whatsapp'
                    : null,
                  form.get(
                    'reminderSms',
                  ) ===
                    'on'
                    ? 'sms'
                    : null,
                ].filter(
                  Boolean,
                ),
                reminderDaysBefore:
                  form.get(
                    'reminderDaysBefore',
                  ),
                reminderDaysAfter:
                  form.get(
                    'reminderDaysAfter',
                  ),
                paymentInstructions:
                  form.get(
                    'paymentInstructions',
                  ),
                bankDetails:
                  form.get(
                    'bankDetails',
                  ),
                termsAndConditions:
                  form.get(
                    'termsAndConditions',
                  ),
              },
              'Invoicing settings saved.',
            );
          }
        }
      >
        <div>
          <p className="text-sm font-black">
            Invoicing settings
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Company commercial defaults. Delivery provider credentials stay in SaMi Integrations/Core.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Field
            label="Default currency"
            name="defaultCurrency"
            defaultValue={
              data.settings
                .defaultCurrency
            }
            maxLength={
              3
            }
          />

          <Field
            label="Default due days"
            name="defaultDueDays"
            type="number"
            min="0"
            max="3650"
            defaultValue={
              String(
                data.settings
                  .defaultDueDays,
              )
            }
          />

          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
              Tax calculation
            </span>

            <select
              name="taxCalculation"
              defaultValue={
                data.settings
                  .taxCalculation
              }
              className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
            >
              <option value="exclusive">
                Tax exclusive
              </option>
              <option value="inclusive">
                Tax inclusive
              </option>
            </select>
          </label>

          <Field
            label="Reminder before due"
            name="reminderDaysBefore"
            type="number"
            min="0"
            max="365"
            defaultValue={
              String(
                data.settings
                  .reminderDaysBefore,
              )
            }
          />

          <Field
            label="Overdue reminders"
            name="reminderDaysAfter"
            defaultValue={
              data.settings
                .reminderDaysAfter
                .join(
                  ', ',
                )
            }
          />
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <Toggle
            name="allowPartialPayments"
            label="Partial payments"
            defaultChecked={
              data.settings
                .allowPartialPayments
            }
          />

          <Toggle
            name="allowCreditNotes"
            label="Credit notes"
            defaultChecked={
              data.settings
                .allowCreditNotes
            }
          />

          <Toggle
            name="requireApproval"
            label="Require approval"
            defaultChecked={
              data.settings
                .requireApproval
            }
          />

          <Toggle
            name="autoSendRecurring"
            label="Auto-send recurring"
            defaultChecked={
              data.settings
                .autoSendRecurring
            }
          />

          <Toggle
            name="reminderEnabled"
            label="Payment reminders"
            defaultChecked={
              data.settings
                .reminderEnabled
            }
          />
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--sami-border)] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
            Reminder delivery channels
          </p>

          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Toggle
              name="reminderEmail"
              label="Email PDF"
              defaultChecked={
                data.settings
                  .reminderChannels
                  .includes(
                    'email',
                  )
              }
            />
            <Toggle
              name="reminderWhatsApp"
              label="WhatsApp PDF"
              defaultChecked={
                data.settings
                  .reminderChannels
                  .includes(
                    'whatsapp',
                  )
              }
            />
            <Toggle
              name="reminderSms"
              label="SMS link"
              defaultChecked={
                data.settings
                  .reminderChannels
                  .includes(
                    'sms',
                  )
              }
            />
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <TextArea
            label="Payment instructions"
            name="paymentInstructions"
            defaultValue={
              data.settings
                .paymentInstructions ||
              ''
            }
          />

          <TextArea
            label="Bank details"
            name="bankDetails"
            defaultValue={
              data.settings
                .bankDetails ||
              ''
            }
          />

          <TextArea
            label="Terms & conditions"
            name="termsAndConditions"
            defaultValue={
              data.settings
                .termsAndConditions ||
              ''
            }
          />
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={
              pending
            }
            className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white"
          >
            Save settings
          </button>
        </div>
      </form>

      <InvoiceAppearanceSettings
        data={
          data
        }
        pending={
          pending
        }
        run={
          run
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <form
          className="sami-surface rounded-[24px] p-4 sm:p-5"
          onSubmit={
            async event => {
              event.preventDefault();

              const element =
                event.currentTarget;

              const form =
                new FormData(
                  element,
                );

              const saved =
                await run(
                {
                  action:
                    'create_payment_term',
                  name:
                    form.get(
                      'name',
                    ),
                  dueDays:
                    form.get(
                      'dueDays',
                    ),
                  description:
                    form.get(
                      'description',
                    ),
                  isDefault:
                    form.get(
                      'isDefault',
                    ) ===
                    'on',
                },
                'Payment term created.',
              );

              if (
                saved
              ) {
                element.reset();
              }
            }
          }
        >
          <p className="text-sm font-black">
            Payment terms
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Customer terms drive invoice due dates.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field
              label="Term name"
              name="name"
              required
            />

            <Field
              label="Due days"
              name="dueDays"
              type="number"
              min="0"
              max="3650"
              required
            />
          </div>

          <div className="mt-3">
            <TextArea
              label="Description"
              name="description"
            />
          </div>

          <label className="mt-3 flex min-h-11 items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              name="isDefault"
            />
            Make workspace default
          </label>

          <button
            type="submit"
            disabled={
              pending
            }
            className="mt-4 h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white"
          >
            Add payment term
          </button>

          <div className="mt-4 space-y-2">
            {
              data.paymentTerms.map(
                term => (
                  <details
                    key={
                      term.id
                    }
                    className="rounded-xl border border-[var(--sami-border)]"
                  >
                    <summary className="cursor-pointer list-none px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black">
                            {
                              term.name
                            } · {
                              term.dueDays
                            } days
                          </p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {
                              term.isDefault
                                ? 'Default'
                                : term.isActive
                                  ? 'Active'
                                  : 'Inactive'
                            }
                          </p>
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      </div>
                    </summary>

                    <form
                      className="border-t border-[var(--sami-border)] p-3"
                      onSubmit={
                        async event => {
                          event.preventDefault();

                          const form =
                            new FormData(
                              event.currentTarget,
                            );

                          await run(
                            {
                              action:
                                'update_payment_term',
                              termId:
                                term.id,
                              name:
                                form.get(
                                  'name',
                                ),
                              dueDays:
                                form.get(
                                  'dueDays',
                                ),
                              description:
                                form.get(
                                  'description',
                                ),
                              isDefault:
                                form.get(
                                  'isDefault',
                                ) ===
                                'on',
                            },
                            'Payment term updated.',
                          );
                        }
                      }
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label="Term name"
                          name="name"
                          required
                          defaultValue={
                            term.name
                          }
                        />
                        <Field
                          label="Due days"
                          name="dueDays"
                          type="number"
                          min="0"
                          max="3650"
                          required
                          defaultValue={
                            String(
                              term.dueDays,
                            )
                          }
                        />
                      </div>

                      <div className="mt-3">
                        <TextArea
                          label="Description"
                          name="description"
                          defaultValue={
                            term.description ||
                            ''
                          }
                        />
                      </div>

                      <label className="mt-3 flex min-h-10 items-center gap-2 text-xs font-bold">
                        <input
                          type="checkbox"
                          name="isDefault"
                          defaultChecked={
                            term.isDefault
                          }
                        />
                        Workspace default
                      </label>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          disabled={
                            pending ||
                            (
                              term.isDefault &&
                              term.isActive
                            )
                          }
                          onClick={
                            () =>
                              run(
                                {
                                  action:
                                    'set_payment_term_active',
                                  termId:
                                    term.id,
                                  isActive:
                                    !term.isActive,
                                },
                                term.isActive
                                  ? 'Payment term deactivated.'
                                  : 'Payment term activated.',
                              )
                          }
                          className="h-9 rounded-xl border border-[var(--sami-border)] px-3 text-[10px] font-black disabled:opacity-40"
                        >
                          {
                            term.isActive
                              ? 'Deactivate'
                              : 'Activate'
                          }
                        </button>

                        <button
                          type="submit"
                          disabled={
                            pending
                          }
                          className="h-9 rounded-xl bg-blue-600 px-3 text-[10px] font-black text-white disabled:opacity-60"
                        >
                          Save term
                        </button>
                      </div>
                    </form>
                  </details>
                ),
              )
            }
          </div>
        </form>

        <form
          className="sami-surface rounded-[24px] p-4 sm:p-5"
          onSubmit={
            async event => {
              event.preventDefault();

              const element =
                event.currentTarget;

              const form =
                new FormData(
                  element,
                );

              const saved =
                await run(
                {
                  action:
                    'create_tax_rate',
                  name:
                    form.get(
                      'name',
                    ),
                  rate:
                    form.get(
                      'rate',
                    ),
                  taxType:
                    form.get(
                      'taxType',
                    ),
                  countryCode:
                    form.get(
                      'countryCode',
                    ),
                  isDefault:
                    form.get(
                      'isDefault',
                    ) ===
                    'on',
                },
                'Tax rate created.',
              );

              if (
                saved
              ) {
                element.reset();
              }
            }
          }
        >
          <p className="text-sm font-black">
            Taxes
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Reusable tax rates default onto items and can still be changed per invoice line.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field
              label="Tax name"
              name="name"
              required
            />

            <Field
              label="Rate %"
              name="rate"
              type="number"
              min="0"
              max="100"
              step="0.0001"
              required
            />

            <Field
              label="Tax type"
              name="taxType"
              defaultValue="vat"
            />

            <Field
              label="Country code"
              name="countryCode"
              maxLength={
                2
              }
            />
          </div>

          <label className="mt-3 flex min-h-11 items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              name="isDefault"
            />
            Make workspace default
          </label>

          <button
            type="submit"
            disabled={
              pending
            }
            className="mt-4 h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white"
          >
            Add tax rate
          </button>

          <div className="mt-4 space-y-2">
            {
              data.taxRates.map(
                tax => (
                  <details
                    key={
                      tax.id
                    }
                    className="rounded-xl border border-[var(--sami-border)]"
                  >
                    <summary className="cursor-pointer list-none px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black">
                            {
                              tax.name
                            } · {
                              tax.rate
                            }%
                          </p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {
                              tax.isDefault
                                ? 'Default'
                                : tax.isActive
                                  ? 'Active'
                                  : 'Inactive'
                            }
                          </p>
                        </div>
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      </div>
                    </summary>

                    <form
                      className="border-t border-[var(--sami-border)] p-3"
                      onSubmit={
                        async event => {
                          event.preventDefault();

                          const form =
                            new FormData(
                              event.currentTarget,
                            );

                          await run(
                            {
                              action:
                                'update_tax_rate',
                              taxId:
                                tax.id,
                              name:
                                form.get(
                                  'name',
                                ),
                              rate:
                                form.get(
                                  'rate',
                                ),
                              taxType:
                                form.get(
                                  'taxType',
                                ),
                              countryCode:
                                form.get(
                                  'countryCode',
                                ),
                              isDefault:
                                form.get(
                                  'isDefault',
                                ) ===
                                'on',
                            },
                            'Tax rate updated.',
                          );
                        }
                      }
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label="Tax name"
                          name="name"
                          required
                          defaultValue={
                            tax.name
                          }
                        />
                        <Field
                          label="Rate %"
                          name="rate"
                          type="number"
                          min="0"
                          max="100"
                          step="0.0001"
                          required
                          defaultValue={
                            String(
                              tax.rate,
                            )
                          }
                        />
                        <Field
                          label="Tax type"
                          name="taxType"
                          defaultValue={
                            tax.taxType
                          }
                        />
                        <Field
                          label="Country code"
                          name="countryCode"
                          maxLength={
                            2
                          }
                          defaultValue={
                            tax.countryCode ||
                            ''
                          }
                        />
                      </div>

                      <label className="mt-3 flex min-h-10 items-center gap-2 text-xs font-bold">
                        <input
                          type="checkbox"
                          name="isDefault"
                          defaultChecked={
                            tax.isDefault
                          }
                        />
                        Workspace default
                      </label>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          disabled={
                            pending ||
                            (
                              tax.isDefault &&
                              tax.isActive
                            )
                          }
                          onClick={
                            () =>
                              run(
                                {
                                  action:
                                    'set_tax_rate_active',
                                  taxId:
                                    tax.id,
                                  isActive:
                                    !tax.isActive,
                                },
                                tax.isActive
                                  ? 'Tax rate deactivated.'
                                  : 'Tax rate activated.',
                              )
                          }
                          className="h-9 rounded-xl border border-[var(--sami-border)] px-3 text-[10px] font-black disabled:opacity-40"
                        >
                          {
                            tax.isActive
                              ? 'Deactivate'
                              : 'Activate'
                          }
                        </button>

                        <button
                          type="submit"
                          disabled={
                            pending
                          }
                          className="h-9 rounded-xl bg-blue-600 px-3 text-[10px] font-black text-white disabled:opacity-60"
                        >
                          Save tax
                        </button>
                      </div>
                    </form>
                  </details>
                ),
              )
            }
          </div>
        </form>
      </div>
    </div>
  );
}


function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name:
    string;
  label:
    string;
  defaultChecked:
    boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 py-3 text-xs font-bold">
      <input
        type="checkbox"
        name={
          name
        }
        defaultChecked={
          defaultChecked
        }
      />

      {
        label
      }
    </label>
  );
}
