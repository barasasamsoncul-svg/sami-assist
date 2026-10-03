'use client';

import {
  useCallback,
  useEffect,
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
import PaymentPlansWorkspace from '@/app/apps/invoicing/PaymentPlansWorkspace';
import PaymentIntegrationsWorkspace from '@/app/apps/invoicing/PaymentIntegrationsWorkspace';
import CurrencyCenterWorkspace from '@/app/apps/invoicing/CurrencyCenterWorkspace';
import TaxEngineWorkspace from '@/app/apps/invoicing/TaxEngineWorkspace';
import EtimsWorkspace from '@/app/apps/invoicing/EtimsWorkspace';
import EInvoicingWorkspace from '@/app/apps/invoicing/EInvoicingWorkspace';
import InvoicingReportsWorkspace from '@/app/apps/invoicing/InvoicingReportsWorkspace';
import SaMiOverlay from '@/app/components/SaMiOverlay';
import {
  useSaMiOverlay,
} from '@/app/components/useSaMiOverlay';

import WorkspaceTutorial, {
  type WorkspaceTutorialStep,
} from '@/app/components/workspace/WorkspaceTutorial';

import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  BadgeCheck,
  BellRing,
  BarChart3,
  CalendarClock,
  ChevronDown,
  CircleDollarSign,
  CopyPlus,
  CreditCard,
  Download,
  Filter,
  Plus,
  Receipt,
  RefreshCw,
  Repeat2,
  Search,
  Send,
  Settings2,
  Users,
  X,
} from 'lucide-react';

import type {
  InvoicingInvoiceSummary,
  InvoicingWorkspaceData,
} from '@/lib/apps/invoicing/types';

import {
  canAccessInvoicingView,
  getInvoicingRoutePath,
  INVOICING_NAVIGATION,
  INVOICING_SIDEBAR_VIEWS,
  type InvoicingRouteView,
} from '@/lib/apps/invoicing/navigation';


type ViewKey =
  InvoicingRouteView;


const INVOICING_TUTORIAL_STEPS:
  WorkspaceTutorialStep[] = [
    {
      id:
        'overview',
      section:
        'dashboard',
      title:
        'Start with the receivables overview',
      description:
        'The overview summarizes invoiced value, collections, outstanding balances and overdue receivables for the current company.',
      tip:
        'SaMi keeps these figures company-scoped so users only see billing data they are allowed to access.',
    },
    {
      id:
        'invoices',
      section:
        'invoices',
      title:
        'Create and manage invoices',
      description:
        'Choose a customer, add products or custom lines, taxes, discounts, dates and terms. Save a draft first or confirm when the document is ready.',
      tip:
        'Drafts remain editable. Confirmed documents move through sending, payment, credit, cancellation and audit workflows.',
    },
    {
      id:
        'customers',
      section:
        'customers',
      title:
        'Keep customer billing records clean',
      description:
        'Create and edit billing customers, payment terms, tax identifiers, addresses and contact information. SaMi blocks accidental duplicate customer creation.',
    },
    {
      id:
        'items',
      section:
        'items',
      title:
        'Maintain products and services',
      description:
        'Items provide reusable descriptions, units, prices and taxes for faster invoice creation. Inactive items remain preserved for historical documents.',
    },
    {
      id:
        'payments',
      section:
        'payments',
      title:
        'Track payments and corrections',
      description:
        'The payment register shows customer receipts and invoice allocations. If a payment was posted incorrectly, open its invoice and reverse it with a reason instead of deleting financial history.',
    },
    {
      id:
        'retainers',
      section:
        'retainers',
      title:
        'Manage retainers and deposits',
      description:
        'Receive advance customer funds before an invoice is settled, then apply the available balance to eligible invoices or refund it when required.',
      tip:
        'Retainers stay linked to the underlying posted customer-credit payment, so allocation, refund and reconciliation use the same financial controls as ordinary receipts.',
    },
    {
      id:
        'payment-plans',
      section:
        'paymentPlans',
      title:
        'Schedule invoice installments',
      description:
        'Split an open invoice balance into dated installments. SaMi tracks each due amount from the invoice settlement ledger, so payments, credits and reversals automatically recalculate the plan.',
      tip:
        'The invoice due date follows the final installment while the payment-plan workspace still identifies earlier overdue installments.',
    },
    {
      id:
        'recurring',
      section:
        'recurring',
      title:
        'Automate recurring billing',
      description:
        'Create schedules from an existing invoice, choose the interval and delivery channels, and pause, resume or cancel the schedule when circumstances change.',
    },
    {
      id:
        'reports',
      section:
        'reports',
      title:
        'Use aging and invoice reports',
      description:
        'Reports separate current and overdue receivables, show monthly billing activity and provide an exportable invoice register for reconciliation.',
    },
    {
      id:
        'settings',
      section:
        'settings',
      title:
        'Finish with company invoicing settings',
      description:
        'Configure appearance templates, taxes, payment terms, reminder behavior, payment instructions and invoice defaults for the current company.',
      tip:
        'Turn guided help on or off from Workspace Settings. Invoicing only shows the tutorial after that workspace-level preference is enabled.',
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


function displayDateTime(
  value:
    string |
    null |
    undefined,
) {
  if (!value) {
    return '—';
  }

  const raw =
    String(
      value,
    );

  const candidate =
    /^\d{4}-\d{2}-\d{2}$/.test(
      raw,
    )
      ? raw +
        'T00:00:00Z'
      : raw;

  const parsed =
    new Date(
      candidate,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return raw;
  }

  return new Intl
    .DateTimeFormat(
      'en-KE',
      {
        dateStyle:
          'medium',
        timeStyle:
          raw.length >
            10
            ? 'short'
            : undefined,
      },
    )
    .format(
      parsed,
    );
}


function monthLabel(
  value:
    string,
) {
  const text =
    value
      ?.trim();

  if (
    !text
  ) {
    return '—';
  }

  const candidate =
    /^\d{4}-\d{2}-\d{2}$/.test(
      text,
    )
      ? text +
        'T00:00:00Z'
      : text;

  const parsed =
    new Date(
      candidate,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return text.slice(
      0,
      7,
    );
  }

  return new Intl
    .DateTimeFormat(
      'en-KE',
      {
        month:
          'short',
      },
    )
    .format(
      parsed,
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
      'rejected',
      'cancelled',
      'void',
      'written_off',
      'reversed',
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

  if (
    status ===
      'pending_approval'
  ) {
    return 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300';
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
        value ===
          'confirmed'
          ? 'posted'
          : value.replaceAll(
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
    <label className="block min-w-0 space-y-1">
      <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
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
        className="h-11 w-full min-w-0 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm outline-none transition focus:border-blue-500"
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
    <label className="block min-w-0 space-y-1">
      <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
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
        className="w-full min-w-0 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm outline-none transition focus:border-blue-500"
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
  tone =
    'blue',
  progress,
}: {
  label:
    string;
  value:
    string;
  note:
    string;
  icon:
    typeof Receipt;
  tone?:
    'blue' |
    'emerald' |
    'amber' |
    'rose';
  progress?:
    number;
}) {
  const palette = {
    blue: {
      icon:
        'bg-blue-500/10 text-blue-700 ring-blue-500/15 dark:text-blue-300',
      bar:
        'bg-blue-600',
      glow:
        'bg-blue-500/10',
    },
    emerald: {
      icon:
        'bg-emerald-500/10 text-emerald-700 ring-emerald-500/15 dark:text-emerald-300',
      bar:
        'bg-emerald-500',
      glow:
        'bg-emerald-500/10',
    },
    amber: {
      icon:
        'bg-amber-500/10 text-amber-700 ring-amber-500/15 dark:text-amber-300',
      bar:
        'bg-amber-500',
      glow:
        'bg-amber-500/10',
    },
    rose: {
      icon:
        'bg-rose-500/10 text-rose-700 ring-rose-500/15 dark:text-rose-300',
      bar:
        'bg-rose-500',
      glow:
        'bg-rose-500/10',
    },
  }[
    tone
  ];

  const safeProgress =
    progress ===
      undefined
      ? null
      : Math.max(
          0,
          Math.min(
            100,
            progress,
          ),
        );

  return (
    <div className="sami-surface group relative overflow-hidden rounded-[22px] border border-[var(--sami-border)] p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div
        className={[
          'pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full blur-2xl',
          palette.glow,
        ].join(
          ' ',
        )}
      />

      <div
        className={[
          'absolute inset-x-0 top-0 h-1',
          palette.bar,
        ].join(
          ' ',
        )}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            {
              label
            }
          </p>

          <p className="mt-2 break-words whitespace-normal text-[1.35rem] font-black tracking-[-0.04em] text-slate-950 dark:text-white sm:text-2xl">
            {
              value
            }
          </p>
        </div>

        <div
          className={[
            'rounded-2xl p-2.5 ring-1 ring-inset',
            palette.icon,
          ].join(
            ' ',
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="relative mt-3 flex items-end justify-between gap-3">
        <p className="min-w-0 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          {
            note
          }
        </p>

        {
          safeProgress !==
            null &&
          (
            <span className="shrink-0 text-[11px] font-black text-slate-700 dark:text-slate-200">
              {
                Math.round(
                  safeProgress,
                )
              }%
            </span>
          )
        }
      </div>

      {
        safeProgress !==
          null &&
        (
          <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
            <div
              className={[
                'h-full rounded-full',
                palette.bar,
              ].join(
                ' ',
              )}
              style={{
                width:
                  safeProgress +
                  '%',
              }}
            />
          </div>
        )
      }
    </div>
  );
}

export default function InvoicingWorkspaceClient({
  initialData,
  initialView =
    'dashboard',
  userId,
}: {
  initialData:
    InvoicingWorkspaceData;
  initialView?:
    ViewKey;
  userId:
    string;
}) {
  const router =
    useRouter();

  const [
    view,
    setView,
  ] =
    useState<ViewKey>(
      initialView,
    );

  useEffect(
    () => {
      setView(
        initialView,
      );
    },
    [
      initialView,
    ],
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

  const navigateToView =
    useCallback(
      (
        nextView:
          ViewKey,
      ) => {
        setView(
          nextView,
        );

        router.push(
          getInvoicingRoutePath(
            nextView,
          ),
        );
      },
      [
        router,
      ],
    );


  const visibleNav =
    useMemo(
      () =>
        INVOICING_SIDEBAR_VIEWS
          .filter(
            item =>
              canAccessInvoicingView(
                initialData
                  .capabilities,
                item,
              ),
          ),
      [
        initialData
          .capabilities,
      ],
    );

  const tutorialSteps =
    useMemo(
      () =>
        INVOICING_TUTORIAL_STEPS
          .filter(
            step =>
              !step.section ||
              visibleNav.some(
                item =>
                  item ===
                  step.section,
              ),
          ),
      [
        visibleNav,
      ],
    );


  const handleTutorialStep =
    useCallback(
      (
        step:
          WorkspaceTutorialStep,
      ) => {
        const section =
          step.section as
            | ViewKey
            | undefined;

        if (
          section &&
          visibleNav.some(
            item =>
              item ===
              section,
          )
        ) {
          navigateToView(
            section,
          );
        }
      },
      [
        navigateToView,
        visibleNav,
      ],
    );


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

      <WorkspaceTutorial
        userId={
          userId
        }
        moduleKey="invoicing"
        title="Invoicing tutorial"
        steps={
          tutorialSteps
        }
        onStepChange={
          handleTutorialStep
        }
      />

      <div className="space-y-4">
      <section className="sami-surface overflow-hidden rounded-[22px] sm:rounded-[26px]">
        <div className="flex flex-col gap-3 border-b border-[var(--sami-border)] p-3 sm:gap-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">
              {
                initialData
                  .company
                  .name
              }
            </p>

            <h1 className="mt-1 text-lg font-black tracking-[-0.03em] sm:text-2xl">
              {
                INVOICING_NAVIGATION[view].title
              }
            </h1>

            <p className="mt-1 max-w-2xl break-words text-xs leading-5 text-slate-500 dark:text-slate-400">
              {
                INVOICING_NAVIGATION[view].description
              }
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {
              view ===
                'invoices' &&
              initialData
                .capabilities
                .canCreate &&
              (
                <button
                  type="button"
                  onClick={
                    () =>
                      navigateToView(
                        'newInvoice',
                      )
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white shadow-sm transition hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  New invoice
                </button>
              )
            }

            {
              view ===
                'customers' &&
              initialData
                .capabilities
                .canManageCustomers &&
              (
                <button
                  type="button"
                  onClick={
                    () =>
                      navigateToView(
                        'newCustomer',
                      )
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white"
                >
                  <Plus className="h-4 w-4" />
                  New customer
                </button>
              )
            }

            {
              view ===
                'items' &&
              initialData
                .capabilities
                .canManageCatalog &&
              (
                <button
                  type="button"
                  onClick={
                    () =>
                      navigateToView(
                        'newItem',
                      )
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white"
                >
                  <Plus className="h-4 w-4" />
                  New item
                </button>
              )
            }

            {
              view ===
                'payments' &&
              initialData
                .capabilities
                .canRecordPayment &&
              (
                <button
                  type="button"
                  onClick={
                    () =>
                      navigateToView(
                        'receivePayment',
                      )
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white"
                >
                  <Plus className="h-4 w-4" />
                  Receive payment
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
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-2.5 text-[11px] font-bold disabled:opacity-60 sm:h-10 sm:px-3 sm:text-xs"
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
              <span className="hidden sm:inline">
                Refresh
              </span>
            </button>
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
            onNavigate={
              navigateToView
            }
          />
        )
      }

      {
        view ===
          'newInvoice' &&
        initialData
          .capabilities
          .canCreate &&
        (
          <section className="sami-surface rounded-[24px] border border-[var(--sami-border)] p-3 sm:p-5">
            <InvoiceComposer
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
          </section>
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
          'newCustomer' &&
        initialData
          .capabilities
          .canManageCustomers &&
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
            mode="create"
          />
        )
      }

      {
        view ===
          'customers' &&
        initialData
          .capabilities
          .canViewCustomers &&
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
            mode="list"
          />
        )
      }

      {
        view ===
          'newItem' &&
        initialData
          .capabilities
          .canManageCatalog &&
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
            mode="create"
          />
        )
      }

      {
        view ===
          'items' &&
        initialData
          .capabilities
          .canViewCatalog &&
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
          
            mode="list"/>
        )
      }

      {
        view ===
          'receivePayment' &&
        initialData
          .capabilities
          .canRecordPayment &&
        (
          <Payments
            data={
              initialData
            }
            pending={
              busy
            }
            run={
              run
            }
            mode="receive"
          />
        )
      }

      {
        view ===
          'payments' &&
        initialData
          .capabilities
          .canViewPayments &&
        (
          <Payments
            data={
              initialData
            }
            pending={
              busy
            }
            run={
              run
            }
          
            mode="register"/>
        )
      }

      {
        view ===
          'paymentIntegrations' &&
        initialData
          .capabilities
          .canViewPayments &&
        (
          <PaymentIntegrationsWorkspace />
        )
      }

      {
        view ===
          'currencies' &&
        initialData
          .capabilities
          .canView &&
        (
          <CurrencyCenterWorkspace
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
          'taxEngine' &&
        initialData
          .capabilities
          .canView &&
        (
          <TaxEngineWorkspace
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
          'etims' &&
        (
          <EtimsWorkspace
            invoicingData={
              initialData
            }
          />
        )
      }

      {
        view ===
          'eInvoicing' &&
        (
          <EInvoicingWorkspace />
        )
      }

      {
        view ===
          'retainers' &&
        initialData
          .capabilities
          .canViewPayments &&
        (
          <Retainers
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
          'paymentPlans' &&
        initialData
          .capabilities
          .canViewPayments &&
        (
          <PaymentPlansWorkspace
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
          'recurring' &&
        initialData
          .capabilities
          .canManageRecurring &&
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
          'portal' &&
        initialData
          .capabilities
          .canViewCustomers &&
        (
          <CustomerPortal
            data={
              initialData
            }
            pending={
              busy
            }
            request={
              request
            }
            run={
              run
            }
          />
        )
      }

      {
        view ===
          'reminders' &&
        initialData
          .capabilities
          .canSend &&
        (
          <RemindersAndDunning
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
        initialData
          .capabilities
          .canViewReports &&
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
        initialData
          .capabilities
          .canManageSettings &&
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
  onNavigate,
}: {
  data:
    InvoicingWorkspaceData;
  onNavigate:
    (
      view:
        ViewKey,
    ) =>
      void;
}) {
  const collectionRate =
    data.metrics
      .invoicedTotal >
    0
      ? data.metrics
          .paidTotal /
        data.metrics
          .invoicedTotal *
        100
      : 0;

  const overdueShare =
    data.metrics
      .outstandingTotal >
    0
      ? data.metrics
          .overdueTotal /
        data.metrics
          .outstandingTotal *
        100
      : 0;

  const openInvoices =
    data.invoices
      .filter(
        invoice =>
          invoice
            .balanceDue >
            0 &&
          ![
            'cancelled',
            'void',
            'written_off',
          ].includes(
            invoice.status,
          ),
      );

  const overdueInvoices =
    openInvoices
      .filter(
        invoice =>
          invoice
            .daysOverdue >
            0 ||
          invoice.status ===
            'overdue',
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.daysOverdue -
            left.daysOverdue ||
          right.balanceDue -
            left.balanceDue,
      );

  const latestPayments =
    [
      ...data.payments,
    ]
      .filter(
        payment =>
          payment.status !==
            'reversed',
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.paymentDate
            .localeCompare(
              left.paymentDate,
            ),
      )
      .slice(
        0,
        5,
      );

  const topDebtors =
    [
      ...data.customers,
    ]
      .filter(
        customer =>
          customer
            .outstandingTotal >
          0,
      )
      .sort(
        (
          left,
          right,
        ) =>
          right
            .outstandingTotal -
          left
            .outstandingTotal,
      )
      .slice(
        0,
        5,
      );

  const activeRecurring =
    data.recurring
      .filter(
        item =>
          item.status ===
            'active',
      );

  const nextRecurring =
    [
      ...activeRecurring,
    ]
      .sort(
        (
          left,
          right,
        ) =>
          left.nextRunAt
            .localeCompare(
              right.nextRunAt,
            ),
      )
      .slice(
        0,
        5,
      );

  const maxMonthly =
    Math.max(
      1,
      ...data.monthly
        .map(
          item =>
            item.amount,
        ),
    );

  const maxAging =
    Math.max(
      1,
      ...data.aging
        .map(
          item =>
            item.amount,
        ),
    );

  const highestExposure =
    topDebtors[0]
      ?.outstandingTotal ||
    0;

  const recurringAttention =
    data.recurring
      .filter(
        item =>
          ![
            'active',
            'completed',
            'cancelled',
          ].includes(
            item.status,
          ),
      )
      .length;

  const statusTotal =
    Math.max(
      1,
      data.statusCounts
        .reduce(
          (
            total,
            row,
          ) =>
            total +
            row.count,
          0,
        ),
    );

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-900/10 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white shadow-[0_18px_50px_rgba(15,23,42,0.16)] sm:p-6 lg:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(290px,0.65fr)] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-100">
                Receivables command center
              </span>

              <span className="text-xs font-bold text-slate-300">
                {
                  data.company
                    .name
                }
              </span>
            </div>

            <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
              Total outstanding
            </p>

            <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] sm:text-4xl lg:text-[2.7rem]">
              {
                formatMoney(
                  data.metrics
                    .outstandingTotal,
                  data.company
                    .currency,
                )
              }
            </h2>

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300">
              <span>
                <strong className="text-white">
                  {
                    openInvoices
                      .length
                  }
                </strong>{' '}
                open invoices
              </span>

              <span>
                <strong className="text-rose-300">
                  {
                    data.metrics
                      .overdueCount
                  }
                </strong>{' '}
                overdue
              </span>

              <span>
                <strong className="text-emerald-300">
                  {
                    Math.round(
                      collectionRate,
                    )
                  }%
                </strong>{' '}
                collection rate
              </span>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {
                data.capabilities
                  .canCreate &&
                (
                  <button
                    type="button"
                    onClick={
                      () =>
                        onNavigate(
                          'invoices',
                        )
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3.5 text-xs font-black text-slate-950 shadow-sm transition hover:bg-blue-50"
                  >
                    <Plus className="h-4 w-4" />
                    New invoice
                  </button>
                )
              }

              <button
                type="button"
                onClick={
                  () =>
                    onNavigate(
                      'invoices',
                    )
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 text-xs font-black text-white transition hover:bg-white/10"
              >
                <Receipt className="h-4 w-4" />
                Review invoices
                <ArrowRight className="h-4 w-4" />
              </button>

              {
                data.capabilities
                  .canViewReports &&
                (
                  <button
                    type="button"
                    onClick={
                      () =>
                        onNavigate(
                          'reports',
                        )
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 text-xs font-black text-white transition hover:bg-white/10"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Reports
                  </button>
                )
              }
            </div>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white/[0.07] p-4 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Collection health
                </p>

                <p className="mt-2 text-2xl font-black">
                  {
                    Math.round(
                      collectionRate,
                    )
                  }%
                </p>
              </div>

              <BadgeCheck className="h-7 w-7 text-emerald-300" />
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{
                  width:
                    Math.max(
                      0,
                      Math.min(
                        100,
                        collectionRate,
                      ),
                    ) +
                    '%',
                }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-black/10 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Collected
                </p>
                <p className="mt-1 break-words whitespace-normal text-sm font-black">
                  {
                    formatMoney(
                      data.metrics
                        .paidTotal,
                      data.company
                        .currency,
                    )
                  }
                </p>
              </div>

              <div className="rounded-2xl bg-black/10 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Overdue share
                </p>
                <p className="mt-1 text-sm font-black text-rose-200">
                  {
                    Math.round(
                      overdueShare,
                    )
                  }%
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

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
            ' invoices issued'
          }
          icon={
            Receipt
          }
          tone="blue"
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
            ' fully paid invoices'
          }
          icon={
            BadgeCheck
          }
          tone="emerald"
          progress={
            collectionRate
          }
        />

        <MetricCard
          label="Open receivables"
          value={
            formatMoney(
              data.metrics
                .outstandingTotal,
              data.company
                .currency,
            )
          }
          note={
            openInvoices
              .length +
            ' invoices still open'
          }
          icon={
            CircleDollarSign
          }
          tone="amber"
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
            ' invoices need attention'
          }
          icon={
            AlertTriangle
          }
          tone="rose"
          progress={
            overdueShare
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="sami-surface overflow-hidden rounded-[24px] border border-[var(--sami-border)]">
          <div className="flex flex-col gap-3 border-b border-[var(--sami-border)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="text-sm font-black text-slate-950 dark:text-white">
                Billing trend
              </p>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Invoiced value across the latest available months
              </p>
            </div>

            {
              data.capabilities
                .canViewReports &&
              (
                <button
                  type="button"
                  onClick={
                    () =>
                      onNavigate(
                        'reports',
                      )
                  }
                  className="inline-flex h-9 items-center gap-1.5 self-start rounded-xl border border-[var(--sami-border)] px-3 text-[11px] font-black sm:self-auto"
                >
                  Full reports
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )
            }
          </div>

          <div className="p-4 sm:p-5">
            {
              data.monthly
                .length >
                0
                ? (
                  <div className="grid min-h-[220px] grid-cols-6 items-end gap-2 sm:grid-cols-12 sm:gap-3">
                    {
                      data.monthly
                        .slice(
                          -12,
                        )
                        .map(
                          item => {
                            const percent =
                              Math.max(
                                4,
                                item.amount /
                                  maxMonthly *
                                  100,
                              );

                            const month =
                              monthLabel(
                                item.month,
                              );

                            return (
                              <div
                                key={
                                  item.month
                                }
                                className="group flex min-w-0 flex-col items-center justify-end gap-2"
                              >
                                <div className="relative flex h-40 w-full items-end overflow-hidden rounded-xl bg-slate-100/80 p-1 dark:bg-white/5">
                                  <div
                                    className="w-full rounded-lg bg-gradient-to-t from-blue-700 to-blue-400 transition duration-200 group-hover:from-blue-600 group-hover:to-cyan-400"
                                    style={{
                                      height:
                                        percent +
                                        '%',
                                    }}
                                    title={
                                      formatMoney(
                                        item.amount,
                                        data.company
                                          .currency,
                                      ) +
                                      ' · ' +
                                      item.invoiceCount +
                                      ' invoices'
                                    }
                                  />
                                </div>

                                <span className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                                  {
                                    month
                                  }
                                </span>
                              </div>
                            );
                          },
                        )
                    }
                  </div>
                )
                : (
                  <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[var(--sami-border)] bg-[var(--sami-surface-soft)]">
                    <div className="max-w-sm px-5 text-center">
                      <BarChart3 className="mx-auto h-7 w-7 text-slate-300" />
                      <p className="mt-3 text-sm font-black">
                        No billing history yet
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Monthly billing activity will appear here after invoices are issued.
                      </p>
                    </div>
                  </div>
                )
            }
          </div>
        </section>

        <section className="sami-surface rounded-[24px] border border-[var(--sami-border)] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950 dark:text-white">
                Receivables aging
              </p>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Where unpaid balances are sitting
              </p>
            </div>

            <div className="rounded-2xl bg-blue-500/10 p-2.5 text-blue-700 dark:text-blue-300">
              <CalendarClock className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {
              [
                'current',
                '1-30',
                '31-60',
                '61-90',
                '90+',
              ].map(
                (
                  bucket,
                  index,
                ) => {
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

                  const percent =
                    Math.min(
                      100,
                      amount /
                        maxAging *
                        100,
                    );

                  const barClass =
                    index === 0
                      ? 'bg-emerald-500'
                      : index === 1
                        ? 'bg-amber-400'
                        : index === 2
                          ? 'bg-orange-500'
                          : 'bg-rose-500';

                  return (
                    <div
                      key={
                        bucket
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black">
                            {
                              bucket ===
                                'current'
                                ? 'Current'
                                : bucket +
                                  ' days'
                            }
                          </p>

                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {
                              row?.count ||
                              0
                            } invoice{
                              (
                                row?.count ||
                                0
                              ) ===
                                1
                                ? ''
                                : 's'
                            }
                          </p>
                        </div>

                        <span className="text-xs font-black">
                          {
                            formatMoney(
                              amount,
                              data.company
                                .currency,
                            )
                          }
                        </span>
                      </div>

                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                        <div
                          className={[
                            'h-full rounded-full',
                            barClass,
                          ].join(
                            ' ',
                          )}
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

          {
            data.capabilities
              .canViewReports &&
            (
              <button
                type="button"
                onClick={
                  () =>
                    onNavigate(
                      'reports',
                    )
                }
                className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] text-xs font-black transition hover:bg-[var(--sami-surface-soft)]"
              >
                Open aging report
                <ArrowRight className="h-4 w-4" />
              </button>
            )
          }
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="sami-surface overflow-hidden rounded-[24px] border border-[var(--sami-border)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--sami-border)] p-4 sm:p-5">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-black text-slate-950 dark:text-white">
                  Collection attention
                </p>

                {
                  overdueInvoices
                    .length >
                    0 &&
                  (
                    <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[10px] font-black text-rose-700 dark:text-rose-300">
                      {
                        overdueInvoices
                          .length
                      } overdue
                    </span>
                  )
                }
              </div>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Highest-priority overdue invoices first
              </p>
            </div>

            <AlertTriangle className="h-5 w-5 text-rose-500" />
          </div>

          <div className="divide-y divide-[var(--sami-border)]">
            {
              overdueInvoices
                .slice(
                  0,
                  6,
                )
                .map(
                  invoice => (
                    <Link
                      key={
                        invoice.id
                      }
                      href={
                        '/apps/invoicing/' +
                        invoice.id
                      }
                      className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-[var(--sami-surface-soft)] sm:px-5"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-300">
                        <Receipt className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="break-words whitespace-normal text-sm font-black">
                            {
                              invoice
                                .invoiceNumber
                            }
                          </p>

                          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-rose-700 dark:text-rose-300">
                            {
                              Math.max(
                                0,
                                invoice
                                  .daysOverdue,
                              )
                            }d overdue
                          </span>
                        </div>

                        <p className="mt-1 break-words whitespace-normal text-xs text-slate-500">
                          {
                            invoice
                              .customerName
                          }
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black">
                          {
                            formatMoney(
                              invoice
                                .balanceDue,
                              invoice
                                .currency,
                            )
                          }
                        </p>

                        <p className="mt-1 text-[10px] font-bold text-slate-400">
                          due {
                            invoice
                              .dueDate
                          }
                        </p>
                      </div>

                      <ArrowRight className="hidden h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600 sm:block" />
                    </Link>
                  ),
                )
            }

            {
              overdueInvoices
                .length ===
                0 &&
              (
                <div className="px-5 py-10 text-center">
                  <BadgeCheck className="mx-auto h-8 w-8 text-emerald-500" />
                  <p className="mt-3 text-sm font-black">
                    No overdue invoices
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Nothing currently requires overdue collection action.
                  </p>
                </div>
              )
            }
          </div>

          {
            overdueInvoices
              .length >
              6 &&
            (
              <button
                type="button"
                onClick={
                  () =>
                    onNavigate(
                      'invoices',
                    )
                }
                className="flex h-11 w-full items-center justify-center gap-2 border-t border-[var(--sami-border)] text-xs font-black hover:bg-[var(--sami-surface-soft)]"
              >
                Review all overdue invoices
                <ArrowRight className="h-4 w-4" />
              </button>
            )
          }
        </section>

        <section className="sami-surface overflow-hidden rounded-[24px] border border-[var(--sami-border)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--sami-border)] p-4 sm:p-5">
            <div>
              <p className="text-sm font-black text-slate-950 dark:text-white">
                Recent collections
              </p>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Latest posted customer payments
              </p>
            </div>

            <CreditCard className="h-5 w-5 text-emerald-600" />
          </div>

          <div className="divide-y divide-[var(--sami-border)]">
            {
              latestPayments
                .map(
                  payment => (
                    <div
                      key={
                        payment.id
                      }
                      className="flex items-center gap-3 px-4 py-3.5 sm:px-5"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                        <CircleDollarSign className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="break-words whitespace-normal text-xs font-black">
                          {
                            payment
                              .customerName ||
                            'Customer payment'
                          }
                        </p>

                        <p className="mt-1 break-words whitespace-normal text-[10px] text-slate-400">
                          {
                            payment
                              .paymentNumber
                          } · {
                            payment
                              .method
                              .replaceAll(
                                '_',
                                ' ',
                              )
                          } · {
                            payment
                              .paymentDate
                          }
                        </p>
                      </div>

                      <p className="shrink-0 text-xs font-black text-emerald-700 dark:text-emerald-300">
                        +{
                          formatMoney(
                            payment
                              .amount,
                            payment
                              .currency,
                          )
                        }
                      </p>
                    </div>
                  ),
                )
            }

            {
              latestPayments
                .length ===
                0 &&
              (
                <div className="px-5 py-10 text-center">
                  <CreditCard className="mx-auto h-7 w-7 text-slate-300" />
                  <p className="mt-3 text-sm font-black">
                    No payments posted yet
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Customer receipts will appear here once payments are recorded.
                  </p>
                </div>
              )
            }
          </div>

          {
            data.capabilities
              .canViewPayments &&
            (
              <button
                type="button"
                onClick={
                  () =>
                    onNavigate(
                      'payments',
                    )
                }
                className="flex h-11 w-full items-center justify-center gap-2 border-t border-[var(--sami-border)] text-xs font-black hover:bg-[var(--sami-surface-soft)]"
              >
                Open payment register
                <ArrowRight className="h-4 w-4" />
              </button>
            )
          }
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <section className="sami-surface rounded-[24px] border border-[var(--sami-border)] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950 dark:text-white">
                Customer exposure
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Largest outstanding balances
              </p>
            </div>

            <Users className="h-5 w-5 text-blue-600" />
          </div>

          <div className="mt-4 space-y-3">
            {
              topDebtors
                .length >
                0
                ? topDebtors
                    .map(
                      customer => {
                        const width =
                          highestExposure >
                          0
                            ? customer
                                .outstandingTotal /
                              highestExposure *
                              100
                            : 0;

                        return (
                          <div
                            key={
                              customer.id
                            }
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="break-words whitespace-normal text-xs font-black">
                                {
                                  customer
                                    .name
                                }
                              </p>
                              <span className="shrink-0 text-xs font-black">
                                {
                                  formatMoney(
                                    customer
                                      .outstandingTotal,
                                    customer
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
                                    width +
                                    '%',
                                }}
                              />
                            </div>
                          </div>
                        );
                      },
                    )
                : (
                  <p className="rounded-2xl bg-[var(--sami-surface-soft)] px-4 py-6 text-center text-xs text-slate-500">
                    No customer balances are outstanding.
                  </p>
                )
            }
          </div>

          {
            data.capabilities
              .canViewCustomers &&
            (
              <button
                type="button"
                onClick={
                  () =>
                    onNavigate(
                      'customers',
                    )
                }
                className="mt-5 inline-flex items-center gap-1.5 text-xs font-black text-blue-700 dark:text-blue-300"
              >
                View customers
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )
          }
        </section>

        <section className="sami-surface rounded-[24px] border border-[var(--sami-border)] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950 dark:text-white">
                Recurring pipeline
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Upcoming automated billing runs
              </p>
            </div>

            <Repeat2 className="h-5 w-5 text-violet-600" />
          </div>

          <div className="mt-4 space-y-2.5">
            {
              nextRecurring
                .length >
                0
                ? nextRecurring
                    .map(
                      item => (
                        <div
                          key={
                            item.id
                          }
                          className="flex items-center gap-3 rounded-2xl border border-[var(--sami-border)] p-3"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
                            <CalendarClock className="h-4 w-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="break-words whitespace-normal text-xs font-black">
                              {
                                item.name
                              }
                            </p>
                            <p className="mt-1 break-words whitespace-normal text-[10px] text-slate-400">
                              {
                                item
                                  .customerName
                              } · every {
                                item
                                  .intervalCount >
                                  1
                                  ? item
                                      .intervalCount +
                                    ' '
                                  : ''
                              }{
                                item
                                  .intervalUnit
                              }
                            </p>
                          </div>

                          <span className="shrink-0 text-[10px] font-black text-slate-500">
                            {
                              item
                                .nextRunAt
                            }
                          </span>
                        </div>
                      ),
                    )
                : (
                  <p className="rounded-2xl bg-[var(--sami-surface-soft)] px-4 py-6 text-center text-xs text-slate-500">
                    No active recurring schedules.
                  </p>
                )
            }
          </div>

          {
            data.capabilities
              .canManageRecurring &&
            (
              <button
                type="button"
                onClick={
                  () =>
                    onNavigate(
                      'recurring',
                    )
                }
                className="mt-5 inline-flex items-center gap-1.5 text-xs font-black text-blue-700 dark:text-blue-300"
              >
                Manage recurring billing
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )
          }
        </section>

        <section className="sami-surface rounded-[24px] border border-[var(--sami-border)] p-4 sm:p-5 lg:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950 dark:text-white">
                Invoice status mix
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Current document lifecycle
              </p>
            </div>

            <BarChart3 className="h-5 w-5 text-cyan-600" />
          </div>

          <div className="mt-4 space-y-3">
            {
              data.statusCounts
                .slice(
                  0,
                  6,
                )
                .map(
                  row => {
                    const percent =
                      row.count /
                      statusTotal *
                      100;

                    return (
                      <div
                        key={
                          row.status
                        }
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <StatusPill
                              value={
                                row.status
                              }
                            />
                          </div>

                          <span className="text-xs font-black">
                            {
                              row.count
                            }
                          </span>
                        </div>

                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                          <div
                            className="h-full rounded-full bg-cyan-600"
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
              data.statusCounts
                .length ===
                0 &&
              (
                <p className="rounded-2xl bg-[var(--sami-surface-soft)] px-4 py-6 text-center text-xs text-slate-500">
                  Invoice status analytics will appear after billing begins.
                </p>
              )
            }
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-[var(--sami-surface-soft)] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                Drafts
              </p>
              <p className="mt-1 text-lg font-black">
                {
                  data.metrics
                    .draftCount
                }
              </p>
            </div>

            <div className="rounded-2xl bg-[var(--sami-surface-soft)] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                Recurring alerts
              </p>
              <p className="mt-1 text-lg font-black">
                {
                  recurringAttention
                }
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="sami-surface overflow-hidden rounded-[24px] border border-[var(--sami-border)]">
        <div className="flex flex-col gap-3 border-b border-[var(--sami-border)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-sm font-black text-slate-950 dark:text-white">
              Recent invoices
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Latest billing documents and collection position
            </p>
          </div>

          <button
            type="button"
            onClick={
              () =>
                onNavigate(
                  'invoices',
                )
            }
            className="inline-flex h-9 items-center gap-1.5 self-start rounded-xl border border-[var(--sami-border)] px-3 text-[11px] font-black sm:self-auto"
          >
            View invoice register
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-[var(--sami-surface-soft)] text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
              <tr>
                <th className="px-5 py-3">
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
                <th className="px-5 py-3 text-right">
                  Balance
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--sami-border)]">
              {
                data.invoices
                  .slice(
                    0,
                    8,
                  )
                  .map(
                    invoice => (
                      <tr
                        key={
                          invoice.id
                        }
                        className="transition hover:bg-[var(--sami-surface-soft)]"
                      >
                        <td className="px-5 py-3.5">
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
                        </td>

                        <td className="max-w-[220px] break-words whitespace-normal px-4 py-3.5 text-xs font-bold">
                          {
                            invoice
                              .customerName
                          }
                        </td>

                        <td className="px-4 py-3.5">
                          <StatusPill
                            value={
                              invoice
                                .status
                            }
                          />
                        </td>

                        <td className="px-4 py-3.5 text-xs text-slate-500">
                          {
                            invoice
                              .dueDate
                          }
                        </td>

                        <td className="px-4 py-3.5 text-right text-xs font-black">
                          {
                            formatMoney(
                              invoice
                                .totalAmount,
                              invoice
                                .currency,
                            )
                          }
                        </td>

                        <td className="px-5 py-3.5 text-right text-xs font-black">
                          <span
                            className={
                              invoice
                                .balanceDue >
                                0
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-emerald-700 dark:text-emerald-300'
                            }
                          >
                            {
                              formatMoney(
                                invoice
                                  .balanceDue,
                                invoice
                                  .currency,
                              )
                            }
                          </span>
                        </td>
                      </tr>
                    ),
                  )
              }
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-[var(--sami-border)] sm:hidden">
          {
            data.invoices
              .slice(
                0,
                8,
              )
              .map(
                invoice => (
                  <Link
                    key={
                      invoice.id
                    }
                    href={
                      '/apps/invoicing/' +
                      invoice.id
                    }
                    className="block p-4 transition hover:bg-[var(--sami-surface-soft)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words whitespace-normal text-sm font-black">
                          {
                            invoice
                              .invoiceNumber
                          }
                        </p>
                        <p className="mt-1 break-words whitespace-normal text-xs text-slate-500">
                          {
                            invoice
                              .customerName
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

                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
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

                      <p className="text-[10px] font-bold text-slate-400">
                        Due {
                          invoice
                            .dueDate
                        }
                      </p>
                    </div>
                  </Link>
                ),
              )
          }
        </div>

        {
          data.invoices
            .length ===
            0 &&
          (
            <div className="px-5 py-12 text-center">
              <Receipt className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-black">
                No invoices yet
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Create your first invoice to start building the receivables dashboard.
              </p>
            </div>
          )
        }
      </section>
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
  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState(
      'all',
    );

  const [
    receivableFilter,
    setReceivableFilter,
  ] =
    useState(
      'all',
    );

  const [
    sortBy,
    setSortBy,
  ] =
    useState(
      'newest',
    );

  const displayInvoices =
    useMemo(
      () => {
        const next =
          invoices.filter(
            invoice => {
              if (
                statusFilter !==
                  'all' &&
                invoice.status !==
                  statusFilter
              ) {
                return false;
              }

              if (
                receivableFilter ===
                  'open' &&
                invoice.balanceDue <=
                  0
              ) {
                return false;
              }

              if (
                receivableFilter ===
                  'overdue' &&
                !(
                  invoice.balanceDue >
                    0 &&
                  (
                    invoice
                      .daysOverdue >
                      0 ||
                    invoice.status ===
                      'overdue'
                  )
                )
              ) {
                return false;
              }

              if (
                receivableFilter ===
                  'settled' &&
                invoice.balanceDue >
                  0
              ) {
                return false;
              }

              return true;
            },
          );

        next.sort(
          (
            left,
            right,
          ) => {
            if (
              sortBy ===
                'oldest'
            ) {
              return (
                (
                  left.createdAt ||
                  left.invoiceDate
                )
                  .localeCompare(
                    right.createdAt ||
                    right.invoiceDate,
                  )
              );
            }

            if (
              sortBy ===
                'due'
            ) {
              return left.dueDate
                .localeCompare(
                  right.dueDate,
                );
            }

            if (
              sortBy ===
                'balance'
            ) {
              return (
                right.balanceDue -
                left.balanceDue
              );
            }

            if (
              sortBy ===
                'total'
            ) {
              return (
                right.totalAmount -
                left.totalAmount
              );
            }

            if (
              sortBy ===
                'customer'
            ) {
              return left.customerName
                .localeCompare(
                  right.customerName,
                );
            }

            return (
              right.createdAt ||
              right.invoiceDate
            )
              .localeCompare(
                left.createdAt ||
                left.invoiceDate,
              );
          },
        );

        return next;
      },
      [
        invoices,
        receivableFilter,
        sortBy,
        statusFilter,
      ],
    );

  const lifecycle = {
    all:
      data.invoices.length,
    draft:
      data.invoices.filter(
        invoice =>
          invoice.status ===
            'draft',
      ).length,
    open:
      data.invoices.filter(
        invoice =>
          invoice.balanceDue >
            0 &&
          ![
            'cancelled',
            'void',
            'written_off',
          ].includes(
            invoice.status,
          ),
      ).length,
    overdue:
      data.invoices.filter(
        invoice =>
          invoice.balanceDue >
            0 &&
          (
            invoice.daysOverdue >
              0 ||
            invoice.status ===
              'overdue'
          ),
      ).length,
    paid:
      data.invoices.filter(
        invoice =>
          invoice.status ===
            'paid',
      ).length,
  };

  const visibleTotal =
    displayInvoices.reduce(
      (
        total,
        invoice,
      ) =>
        total +
        invoice.totalAmount,
      0,
    );

  const visibleBalance =
    displayInvoices.reduce(
      (
        total,
        invoice,
      ) =>
        total +
        invoice.balanceDue,
      0,
    );

  const hasFilters =
    Boolean(
      search.trim(),
    ) ||
    statusFilter !==
      'all' ||
    receivableFilter !==
      'all' ||
    sortBy !==
      'newest';

  function clearFilters() {
    setSearch(
      '',
    );

    setStatusFilter(
      'all',
    );

    setReceivableFilter(
      'all',
    );

    setSortBy(
      'newest',
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[20px] border border-[var(--sami-border)] bg-[var(--sami-surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black">
            Invoice register
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Existing invoices only. Creating a new invoice now has its own page.
          </p>
        </div>
        {
          data.capabilities
            .canCreate &&
          (
            <Link
              href="/apps/invoicing/new"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white"
            >
              <Plus className="h-4 w-4" />
              New invoice
            </Link>
          )
        }
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {
          [
            {
              key:
                'all',
              label:
                'All invoices',
              count:
                lifecycle.all,
              action:
                () => {
                  setStatusFilter(
                    'all',
                  );
                  setReceivableFilter(
                    'all',
                  );
                },
            },
            {
              key:
                'draft',
              label:
                'Drafts',
              count:
                lifecycle.draft,
              action:
                () => {
                  setStatusFilter(
                    'draft',
                  );
                  setReceivableFilter(
                    'all',
                  );
                },
            },
            {
              key:
                'open',
              label:
                'Open',
              count:
                lifecycle.open,
              action:
                () => {
                  setStatusFilter(
                    'all',
                  );
                  setReceivableFilter(
                    'open',
                  );
                },
            },
            {
              key:
                'overdue',
              label:
                'Overdue',
              count:
                lifecycle.overdue,
              action:
                () => {
                  setStatusFilter(
                    'all',
                  );
                  setReceivableFilter(
                    'overdue',
                  );
                },
            },
            {
              key:
                'paid',
              label:
                'Paid',
              count:
                lifecycle.paid,
              action:
                () => {
                  setStatusFilter(
                    'paid',
                  );
                  setReceivableFilter(
                    'all',
                  );
                },
            },
          ].map(
            item => (
              <button
                key={
                  item.key
                }
                type="button"
                onClick={
                  item.action
                }
                className={[
                  'sami-surface rounded-[18px] border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm',
                  (
                    item.key ===
                      'draft' &&
                    statusFilter ===
                      'draft'
                  ) ||
                  (
                    item.key ===
                      'paid' &&
                    statusFilter ===
                      'paid'
                  ) ||
                  (
                    item.key ===
                      'open' &&
                    receivableFilter ===
                      'open'
                  ) ||
                  (
                    item.key ===
                      'overdue' &&
                    receivableFilter ===
                      'overdue'
                  ) ||
                  (
                    item.key ===
                      'all' &&
                    statusFilter ===
                      'all' &&
                    receivableFilter ===
                      'all'
                  )
                    ? 'border-blue-500/40 ring-2 ring-blue-500/10'
                    : 'border-[var(--sami-border)]',
                ].join(
                  ' ',
                )}
              >
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                  {
                    item.label
                  }
                </p>

                <p className="mt-1.5 text-xl font-black tracking-[-0.04em]">
                  {
                    item.count
                  }
                </p>
              </button>
            ),
          )
        }
      </div>

      <section className="sami-surface overflow-hidden rounded-[24px] border border-[var(--sami-border)]">
        <div className="border-b border-[var(--sami-border)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm font-black text-slate-950 dark:text-white">
                Invoice register
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {
                  displayInvoices.length
                } shown of {
                  data.invoices.length
                } · {
                  formatMoney(
                    visibleBalance,
                    data.company
                      .currency,
                  )
                } outstanding in this view
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-right sm:flex sm:items-center">
              <div className="rounded-xl bg-[var(--sami-surface-soft)] px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                  Visible total
                </p>
                <p className="mt-0.5 text-xs font-black">
                  {
                    formatMoney(
                      visibleTotal,
                      data.company
                        .currency,
                    )
                  }
                </p>
              </div>

              <div className="rounded-xl bg-[var(--sami-surface-soft)] px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                  Visible balance
                </p>
                <p className="mt-0.5 text-xs font-black text-amber-700 dark:text-amber-300">
                  {
                    formatMoney(
                      visibleBalance,
                      data.company
                        .currency,
                    )
                  }
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(250px,1fr)_170px_170px_180px_auto]">
            <div className="relative">
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
                placeholder="Search invoice, customer or status"
                className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent pl-9 pr-3 text-sm outline-none transition focus:border-blue-500"
              />
            </div>

            <label className="relative">
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <select
                value={
                  statusFilter
                }
                onChange={
                  event =>
                    setStatusFilter(
                      event
                        .target
                        .value,
                    )
                }
                className="h-11 w-full appearance-none rounded-xl border border-[var(--sami-border)] bg-transparent pl-9 pr-3 text-xs font-bold"
              >
                <option value="all">
                  All statuses
                </option>
                <option value="draft">
                  Draft
                </option>
                <option value="pending_approval">
                  Pending approval
                </option>
                <option value="rejected">
                  Rejected
                </option>
                <option value="confirmed">
                  Confirmed
                </option>
                <option value="sent">
                  Sent
                </option>
                <option value="viewed">
                  Viewed
                </option>
                <option value="partially_paid">
                  Partially paid
                </option>
                <option value="overdue">
                  Overdue
                </option>
                <option value="paid">
                  Paid
                </option>
                <option value="cancelled">
                  Cancelled
                </option>
                <option value="void">
                  Void
                </option>
                <option value="written_off">
                  Written off
                </option>
              </select>
            </label>

            <select
              value={
                receivableFilter
              }
              onChange={
                event =>
                  setReceivableFilter(
                    event
                      .target
                      .value,
                  )
              }
              className="h-11 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs font-bold"
            >
              <option value="all">
                All balances
              </option>
              <option value="open">
                Open balance
              </option>
              <option value="overdue">
                Overdue balance
              </option>
              <option value="settled">
                Settled / zero balance
              </option>
            </select>

            <label className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <select
                value={
                  sortBy
                }
                onChange={
                  event =>
                    setSortBy(
                      event
                        .target
                        .value,
                    )
                }
                className="h-11 w-full appearance-none rounded-xl border border-[var(--sami-border)] bg-transparent pl-9 pr-3 text-xs font-bold"
              >
                <option value="newest">
                  Newest first
                </option>
                <option value="oldest">
                  Oldest first
                </option>
                <option value="due">
                  Due date
                </option>
                <option value="balance">
                  Highest balance
                </option>
                <option value="total">
                  Highest total
                </option>
                <option value="customer">
                  Customer A–Z
                </option>
              </select>
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={
                  displayInvoices.length ===
                    0
                }
                onClick={
                  () =>
                    exportInvoiceRegister(
                      displayInvoices,
                    )
                }
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-40"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>

              {
                hasFilters &&
                (
                  <button
                    type="button"
                    onClick={
                      clearFilters
                    }
                    title="Clear filters"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--sami-border)] text-slate-500 transition hover:bg-[var(--sami-surface-soft)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )
              }
            </div>
          </div>
        </div>

        <div className="space-y-3 p-3 sm:hidden">
          {
            displayInvoices.map(
              invoice => (
                <article
                  key={
                    invoice.id
                  }
                  className="rounded-[20px] border border-[var(--sami-border)] bg-[var(--sami-surface)] p-3.5"
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

                      <p className="mt-1 break-words whitespace-normal text-xs font-semibold">
                        {
                          invoice
                            .customerName
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

                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-[var(--sami-surface-soft)] p-3">
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">
                        Total
                      </p>

                      <p className="mt-1 break-words whitespace-normal text-xs font-black">
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
                      <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">
                        Paid
                      </p>

                      <p className="mt-1 break-words whitespace-normal text-xs font-black text-emerald-700 dark:text-emerald-300">
                        {
                          formatMoney(
                            invoice
                              .paidAmount,
                            invoice
                              .currency,
                          )
                        }
                      </p>
                    </div>

                    <div>
                      <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">
                        Balance
                      </p>

                      <p className="mt-1 break-words whitespace-normal text-xs font-black text-amber-700 dark:text-amber-300">
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

                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">
                        Issued {
                          invoice
                            .invoiceDate
                        }
                      </p>

                      <p
                        className={[
                          'mt-1 text-[10px] font-bold',
                          invoice.daysOverdue >
                            0 &&
                          invoice.balanceDue >
                            0
                            ? 'text-rose-600 dark:text-rose-300'
                            : 'text-slate-500',
                        ].join(
                          ' ',
                        )}
                      >
                        Due {
                          invoice
                            .dueDate
                        }{
                          invoice.daysOverdue >
                            0 &&
                          invoice.balanceDue >
                            0
                            ? ' · ' +
                              invoice.daysOverdue +
                              'd overdue'
                            : ''
                        }
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <a
                        href={`/api/apps/invoicing/${invoice.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
                      >
                        PDF
                      </a>

                      <Link
                        href={
                          '/apps/invoicing/' +
                          invoice.id
                        }
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white"
                      >
                        Open
                      </Link>
                    </div>
                  </div>
                </article>
              ),
            )
          }

          {
            displayInvoices.length ===
              0 &&
            (
              <div className="py-10 text-center">
                <Receipt className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-black">
                  No invoices match these filters
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Change the search, status or balance filter to widen the register.
                </p>
              </div>
            )
          }
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[1180px] text-left">
            <thead className="bg-[var(--sami-surface-soft)] text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
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
                  Dates
                </th>

                <th className="px-4 py-3 text-right">
                  Total
                </th>

                <th className="px-4 py-3 text-right">
                  Paid / credits
                </th>

                <th className="px-4 py-3 text-right">
                  Balance
                </th>

                <th className="px-4 py-3">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--sami-border)]">
              {
                displayInvoices.map(
                  invoice => (
                    <tr
                      key={
                        invoice.id
                      }
                      className="text-sm transition hover:bg-[var(--sami-surface-soft)]"
                    >
                      <td className="px-4 py-3.5">
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

                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                          {
                            invoice
                              .currency
                          }
                        </p>
                      </td>

                      <td className="max-w-[230px] px-4 py-3.5">
                        <p className="break-words whitespace-normal font-bold">
                          {
                            invoice
                              .customerName
                          }
                        </p>

                        <p className="mt-1 break-words whitespace-normal text-[11px] text-slate-500">
                          {
                            invoice
                              .customerEmail ||
                            'No email on billing snapshot'
                          }
                        </p>
                      </td>

                      <td className="px-4 py-3.5">
                        <StatusPill
                          value={
                            invoice
                              .status
                          }
                        />
                      </td>

                      <td className="px-4 py-3.5">
                        <p className="text-xs font-bold">
                          Issued {
                            invoice
                              .invoiceDate
                          }
                        </p>

                        <p
                          className={[
                            'mt-1 text-[10px] font-bold',
                            invoice.daysOverdue >
                              0 &&
                            invoice.balanceDue >
                              0
                              ? 'text-rose-600 dark:text-rose-300'
                              : 'text-slate-400',
                          ].join(
                            ' ',
                          )}
                        >
                          Due {
                            invoice
                              .dueDate
                          }{
                            invoice.daysOverdue >
                              0 &&
                            invoice.balanceDue >
                              0
                              ? ' · ' +
                                invoice.daysOverdue +
                                'd overdue'
                              : ''
                          }
                        </p>
                      </td>

                      <td className="px-4 py-3.5 text-right font-black">
                        {
                          formatMoney(
                            invoice
                              .totalAmount,
                            invoice
                              .currency,
                          )
                        }
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <p className="text-xs font-black text-emerald-700 dark:text-emerald-300">
                          {
                            formatMoney(
                              invoice
                                .paidAmount,
                              invoice
                                .currency,
                            )
                          }
                        </p>

                        {
                          invoice.creditedAmount >
                            0 &&
                          (
                            <p className="mt-1 text-[10px] font-bold text-violet-600 dark:text-violet-300">
                              + {
                                formatMoney(
                                  invoice
                                    .creditedAmount,
                                  invoice
                                    .currency,
                                )
                              } credit
                            </p>
                          )
                        }
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <p
                          className={[
                            'font-black',
                            invoice.balanceDue >
                              0
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-emerald-700 dark:text-emerald-300',
                          ].join(
                            ' ',
                          )}
                        >
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

                      <td className="px-4 py-3.5">
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

                          <a
                            href={`/api/apps/invoicing/${invoice.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-xl border border-[var(--sami-border)] px-2.5 py-2 text-xs font-black"
                          >
                            PDF
                          </a>

                          <InvoiceActions
                            invoice={
                              invoice
                            }
                            capabilities={
                              data.capabilities
                            }
                            settings={
                              data.settings
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
                displayInvoices.length ===
                  0 &&
                (
                  <tr>
                    <td
                      colSpan={
                        8
                      }
                      className="px-4 py-12 text-center"
                    >
                      <Receipt className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-3 text-sm font-black">
                        No invoices match these filters
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Clear the filters to return to the full register.
                      </p>
                    </td>
                  </tr>
                )
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function InvoiceActions({
  invoice,
  capabilities,
  settings,
  pending,
  run,
}: {
  invoice:
    InvoicingInvoiceSummary;
  capabilities:
    InvoicingWorkspaceData[
      'capabilities'
    ];
  settings:
    InvoicingWorkspaceData[
      'settings'
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
  const collectible =
    invoice.balanceDue >
      0 &&
    ![
      'draft',
      'pending_approval',
      'rejected',
      'paid',
      'cancelled',
      'void',
      'written_off',
    ].includes(
      invoice.status,
    );

  return (
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-xl border border-[var(--sami-border)] px-2.5 py-2 text-xs font-bold">
        Manage
        <ChevronDown className="h-3.5 w-3.5" />
      </summary>

      <div className="mt-2 min-w-[260px] space-y-2 rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-3 shadow-xl">
        <a
          href={
            '/api/apps/invoicing/' +
            invoice.id +
            '/pdf'
          }
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold hover:bg-slate-100 dark:hover:bg-white/5"
        >
          <Download className="h-3.5 w-3.5" />
          Open printable PDF
        </a>

        {
          capabilities
            .canCreate &&
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
                        'duplicate_invoice',
                      invoiceId:
                        invoice.id,
                    },
                    'Duplicate invoice created as a new draft.',
                  )
              }
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/5"
            >
              <CopyPlus className="h-3.5 w-3.5" />
              Duplicate as draft
            </button>
          )
        }

        {
          invoice.status ===
            'draft' &&
          settings
            .requireApproval &&
          capabilities
            .canEdit &&
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
                        'pending_approval',
                    },
                    'Invoice submitted for approval.',
                  )
              }
              className="w-full rounded-xl bg-amber-500/10 px-3 py-2 text-left text-xs font-bold text-amber-700 disabled:opacity-50 dark:text-amber-300"
            >
              Submit for approval
            </button>
          )
        }

        {
          invoice.status ===
            'draft' &&
          !settings
            .requireApproval &&
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
                    'Invoice posted.',
                  )
              }
              className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/5"
            >
              Post invoice
            </button>
          )
        }

        {
          invoice.status ===
            'pending_approval' &&
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
                    'Invoice approved and posted.',
                  )
              }
              className="w-full rounded-xl bg-emerald-500/10 px-3 py-2 text-left text-xs font-bold text-emerald-700 disabled:opacity-50 dark:text-emerald-300"
            >
              Approve & post
            </button>
          )
        }

        {
          invoice.status ===
            'rejected' &&
          capabilities
            .canEdit &&
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
                        'draft',
                    },
                    'Invoice returned to draft for rework.',
                  )
              }
              className="w-full rounded-xl px-3 py-2 text-left text-xs font-bold hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/5"
            >
              Return to draft
            </button>
          )
        }

        {
          capabilities
            .canSend &&
          invoice.customerEmail &&
          ![
            'draft',
            'pending_approval',
            'rejected',
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
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/5"
            >
              <Send className="h-3.5 w-3.5" />
              Send by email
            </button>
          )
        }

        {
          capabilities
            .canSendReminder &&
          invoice.customerEmail &&
          collectible &&
          (
            invoice.daysOverdue >
              0 ||
            invoice.status ===
              'overdue'
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
                        'send_reminder',
                      invoiceId:
                        invoice.id,
                      channels: [
                        'email',
                      ],
                    },
                    'Payment reminder sent.',
                  )
              }
              className="flex w-full items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-left text-xs font-bold text-amber-700 disabled:opacity-50 dark:text-amber-300"
            >
              <BellRing className="h-3.5 w-3.5" />
              Send overdue reminder
            </button>
          )
        }

        {
          capabilities
            .canRecordPayment &&
          collectible &&
          (
            <form
              className="space-y-2 rounded-xl bg-slate-50 p-2 dark:bg-white/[0.03]"
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

                  if (
                    saved
                  ) {
                    element.reset();
                  }
                }
              }
            >
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Record payment
              </p>

              <input
                name="amount"
                type="number"
                min={
                  settings
                    .allowPartialPayments
                    ? 0.01
                    : invoice.balanceDue
                }
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
                placeholder="Transaction reference"
                className="h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs"
              />

              <button
                type="submit"
                disabled={
                  pending
                }
                className="h-9 w-full rounded-lg bg-blue-600 text-xs font-black text-white disabled:opacity-50"
              >
                Post payment
              </button>
            </form>
          )
        }

        {
          capabilities
            .canIssueCredit &&
          settings
            .allowCreditNotes &&
          collectible &&
          (
            <form
              className="space-y-2 rounded-xl bg-slate-50 p-2 dark:bg-white/[0.03]"
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

                  if (
                    saved
                  ) {
                    element.reset();
                  }
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
                maxLength={
                  2000
                }
                placeholder="Reason"
                className="h-9 w-full rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs"
              />

              <button
                type="submit"
                disabled={
                  pending
                }
                className="h-9 w-full rounded-lg border border-[var(--sami-border)] text-xs font-black disabled:opacity-50"
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
  mode = 'list',
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
  mode?:
    'create' |
    'list';
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
    <div className="min-w-0">
      {
        data.capabilities
          .canManageCustomers &&
        (
          <form
            className={[
              'sami-surface mx-auto h-fit max-w-4xl rounded-[24px] p-4 sm:p-5',
              mode ===
                'create'
                ? ''
                : 'hidden',
            ].join(
              ' ',
            )}
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
                      fiscalPositionId:
                        form.get(
                          'fiscalPositionId',
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
              <label className="block min-w-0 space-y-1">
                <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
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

              <label className="block min-w-0 space-y-1">
                <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
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

              <label className="block min-w-0 space-y-1">
                <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                  Fiscal position
                </span>
                <select
                  name="fiscalPositionId"
                  className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="">
                    Automatic tax rules
                  </option>
                  {
                    data.fiscalPositions
                      .filter(
                        position =>
                          position.isActive,
                      )
                      .map(
                        position => (
                          <option
                            key={
                              position.id
                            }
                            value={
                              position.id
                            }
                          >
                            {
                              position.name
                            }
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

      <div
        className={[
          'sami-surface overflow-hidden rounded-[24px]',
          mode ===
            'list'
            ? ''
            : 'hidden',
        ].join(
          ' ',
        )}
      >
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
                          <p className="break-words whitespace-normal font-black">
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

                        <p className="mt-1 break-words whitespace-normal text-xs text-slate-500">
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
                                  fiscalPositionId:
                                    form.get(
                                      'fiscalPositionId',
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
                            <label className="block min-w-0 space-y-1">
                              <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
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

                            <label className="block min-w-0 space-y-1">
                              <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
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

                            <label className="block min-w-0 space-y-1">
                              <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                                Fiscal position
                              </span>
                              <select
                                name="fiscalPositionId"
                                defaultValue={
                                  customer.fiscalPositionId ||
                                  ''
                                }
                                className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                              >
                                <option value="">
                                  Automatic tax rules
                                </option>
                                {
                                  data.fiscalPositions
                                    .filter(
                                      position =>
                                        position.isActive ||
                                        position.id ===
                                          customer.fiscalPositionId,
                                    )
                                    .map(
                                      position => (
                                        <option
                                          key={
                                            position.id
                                          }
                                          value={
                                            position.id
                                          }
                                        >
                                          {
                                            position.name
                                          }
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
  mode = 'list',
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
  mode?:
    'create' |
    'list';
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
    <div className="min-w-0">
      {
        data.capabilities
          .canManageCatalog &&
        (
          <form
            className={[
              'sami-surface mx-auto h-fit max-w-4xl rounded-[24px] p-4 sm:p-5',
              mode ===
                'create'
                ? ''
                : 'hidden',
            ].join(
              ' ',
            )}
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
                      taxGroupId:
                        form.get(
                          'taxGroupId',
                        ),
                      taxCategory:
                        form.get(
                          'taxCategory',
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
              <label className="block min-w-0 space-y-1">
                <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
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

              <label className="block min-w-0 space-y-1">
                <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
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

              <label className="block min-w-0 space-y-1">
                <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                  Default tax group
                </span>
                <select
                  name="taxGroupId"
                  className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="">
                    No default tax group
                  </option>
                  {
                    data.taxGroups
                      .filter(
                        group =>
                          group.isActive,
                      )
                      .map(
                        group => (
                          <option
                            key={
                              group.id
                            }
                            value={
                              group.id
                            }
                          >
                            {
                              group.name
                            } · {
                              group.calculationMode
                            }
                          </option>
                        ),
                      )
                  }
                </select>
              </label>

              <Field
                label="Tax category"
                name="taxCategory"
              />

              <p className="text-[10px] leading-4 text-slate-500">
                If a tax group is selected it takes precedence over the single default tax rate. Tax category is used by rule matching.
              </p>

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

      <div
        className={[
          'sami-surface overflow-hidden rounded-[24px]',
          mode ===
            'list'
            ? ''
            : 'hidden',
        ].join(
          ' ',
        )}
      >
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
                          <p className="break-words whitespace-normal font-black">
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

                        <p className="mt-1 break-words whitespace-normal text-xs text-slate-500">
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
                                  taxGroupId:
                                    form.get(
                                      'taxGroupId',
                                    ),
                                  taxCategory:
                                    form.get(
                                      'taxCategory',
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
                            <label className="block min-w-0 space-y-1">
                              <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
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

                            <label className="block min-w-0 space-y-1">
                              <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
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

                            <label className="block min-w-0 space-y-1">
                              <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                                Default tax group
                              </span>
                              <select
                                name="taxGroupId"
                                defaultValue={
                                  item.taxGroupId ||
                                  ''
                                }
                                className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                              >
                                <option value="">
                                  No default tax group
                                </option>
                                {
                                  data.taxGroups
                                    .filter(
                                      group =>
                                        group.isActive ||
                                        group.id ===
                                          item.taxGroupId,
                                    )
                                    .map(
                                      group => (
                                        <option
                                          key={
                                            group.id
                                          }
                                          value={
                                            group.id
                                          }
                                        >
                                          {
                                            group.name
                                          } · {
                                            group.calculationMode
                                          }
                                        </option>
                                      ),
                                    )
                                }
                              </select>
                            </label>

                            <Field
                              label="Tax category"
                              name="taxCategory"
                              defaultValue={
                                item.taxCategory ||
                                ''
                              }
                            />

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


function Retainers({
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
        Record<string, unknown>,
      message:
        string,
    ) =>
      Promise<boolean>;
}) {
  const active =
    data.retainers.filter(
      retainer =>
        retainer.status ===
          'active' &&
        retainer.availableAmount >
          0,
    );

  const totalAvailable =
    active
      .filter(
        retainer =>
          retainer.currency ===
          data.company.currency,
      )
      .reduce(
        (
          sum,
          retainer,
        ) =>
          sum +
          retainer.availableAmount,
        0,
      );

  const totalAllocated =
    data.retainers
      .filter(
        retainer =>
          retainer.currency ===
          data.company.currency,
      )
      .reduce(
        (
          sum,
          retainer,
        ) =>
          sum +
          retainer.allocatedAmount,
        0,
      );

  const totalRefunded =
    data.retainers
      .filter(
        retainer =>
          retainer.currency ===
          data.company.currency,
      )
      .reduce(
        (
          sum,
          retainer,
        ) =>
          sum +
          retainer.refundedAmount,
        0,
      );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active advances"
          value={
            String(
              active.length,
            )
          }
          note="Retainers or deposits with money still available"
          icon={CircleDollarSign}
          tone="blue"
        />

        <MetricCard
          label="Available"
          value={
            formatMoney(
              totalAvailable,
              data.company.currency,
            )
          }
          note={
            data.company.currency +
            ' ready to apply or refund'
          }
          icon={CircleDollarSign}
          tone="emerald"
        />

        <MetricCard
          label="Applied"
          value={
            formatMoney(
              totalAllocated,
              data.company.currency,
            )
          }
          note="Advance money already allocated to invoices"
          icon={Receipt}
          tone="blue"
        />

        <MetricCard
          label="Refunded"
          value={
            formatMoney(
              totalRefunded,
              data.company.currency,
            )
          }
          note="Advance money returned to customers"
          icon={RefreshCw}
          tone="amber"
        />
      </div>

      {
        data.capabilities
          .canManageRetainers &&
        (
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
                        'record_retainer',
                      customerId:
                        form.get(
                          'customerId',
                        ),
                      retainerType:
                        form.get(
                          'retainerType',
                        ),
                      amount:
                        form.get(
                          'amount',
                        ),
                      receivedDate:
                        form.get(
                          'receivedDate',
                        ),
                      method:
                        form.get(
                          'method',
                        ),
                      reference:
                        form.get(
                          'reference',
                        ),
                      purpose:
                        form.get(
                          'purpose',
                        ),
                      expectedUseDate:
                        form.get(
                          'expectedUseDate',
                        ),
                      idempotencyKey:
                        (
                          typeof crypto !==
                            'undefined' &&
                          'randomUUID' in
                            crypto
                        )
                          ? crypto
                              .randomUUID()
                          : (
                              Date.now()
                                .toString(
                                  36,
                                ) +
                              Math.random()
                                .toString(
                                  36,
                                )
                                .slice(
                                  2,
                                )
                            ),
                    },
                    'Customer advance received and posted as available credit.',
                  );

                if (
                  saved
                ) {
                  element.reset();
                }
              }
            }
          >
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-black">
                  Receive retainer or deposit
                </p>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
                  Record advance money before it is tied to an invoice. SaMi posts the receipt as customer credit and keeps a dedicated retainer/deposit record for lifecycle tracking.
                </p>
              </div>

              <div className="rounded-xl bg-blue-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300">
                Advance → customer credit
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
              <label className="xl:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Customer
                </span>
                <select
                  name="customerId"
                  required
                  defaultValue=""
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="" disabled>
                    Choose customer
                  </option>
                  {
                    data.customers
                      .filter(
                        customer =>
                          customer.status ===
                            'active',
                      )
                      .map(
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
                            } · {
                              customer.currency
                            }
                          </option>
                        ),
                      )
                  }
                </select>
              </label>

              <label>
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Type
                </span>
                <select
                  name="retainerType"
                  defaultValue="retainer"
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="retainer">
                    Retainer
                  </option>
                  <option value="deposit">
                    Deposit
                  </option>
                </select>
              </label>

              <Field
                label="Amount"
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
              />

              <Field
                label="Received date"
                name="receivedDate"
                type="date"
              />

              <label>
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                  Method
                </span>
                <select
                  name="method"
                  defaultValue="mpesa"
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option value="mpesa">M-Pesa</option>
                  <option value="bank">Bank</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <Field
                label="Expected use"
                name="expectedUseDate"
                type="date"
              />
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_auto] lg:items-end">
              <Field
                label="Reference"
                name="reference"
                maxLength={255}
              />

              <TextArea
                label="Purpose / agreement"
                name="purpose"
              />

              <button
                type="submit"
                disabled={
                  pending
                }
                className="h-11 rounded-xl bg-blue-600 px-5 text-xs font-black text-white disabled:opacity-60"
              >
                Receive advance
              </button>
            </div>
          </form>
        )
      }

      <div className="sami-surface overflow-hidden rounded-[24px]">
        <div className="border-b border-[var(--sami-border)] p-4 sm:p-5">
          <p className="text-sm font-black">
            Retainer & deposit register
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
            Each advance remains linked to its posted receipt. Allocate, refund and reconcile through the same controlled payment ledger while this register preserves purpose and expected-use context.
          </p>
        </div>

        <div className="divide-y divide-[var(--sami-border)]">
          {
            data.retainers.map(
              retainer => {
                const eligibleInvoices =
                  data.invoices.filter(
                    invoice =>
                      invoice.customerId ===
                        retainer.customerId &&
                      invoice.currency ===
                        retainer.currency &&
                      invoice.balanceDue >
                        0 &&
                      ![
                        'draft',
                        'pending_approval',
                        'rejected',
                        'paid',
                        'cancelled',
                        'void',
                        'written_off',
                      ].includes(
                        invoice.status,
                      ),
                  );

                return (
                  <div
                    key={
                      retainer.id
                    }
                    className="p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black">
                            {
                              retainer.retainerNumber
                            }
                          </p>
                          <StatusPill
                            value={
                              retainer.status
                            }
                          />
                          <span className="rounded-full border border-[var(--sami-border)] px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                            {
                              retainer.retainerType
                            }
                          </span>
                        </div>

                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          {
                            retainer.customerName
                          } · {
                            retainer.receivedDate
                          } · {
                            retainer.method
                          }
                          {
                            retainer.reference
                              ? ' · ' +
                                retainer.reference
                              : ''
                          }
                        </p>

                        {
                          retainer.purpose &&
                          (
                            <p className="mt-2 max-w-3xl text-[11px] leading-5 text-slate-500">
                              {
                                retainer.purpose
                              }
                            </p>
                          )
                        }

                        {
                          retainer.expectedUseDate &&
                          (
                            <p className="mt-1 text-[10px] font-semibold text-slate-500">
                              Expected use: {
                                retainer.expectedUseDate
                              }
                            </p>
                          )
                        }
                      </div>

                      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[560px]">
                        <PaymentAmount
                          label="Received"
                          value={
                            formatMoney(
                              retainer.amount,
                              retainer.currency,
                            )
                          }
                        />
                        <PaymentAmount
                          label="Applied"
                          value={
                            formatMoney(
                              retainer.allocatedAmount,
                              retainer.currency,
                            )
                          }
                        />
                        <PaymentAmount
                          label="Refunded"
                          value={
                            formatMoney(
                              retainer.refundedAmount,
                              retainer.currency,
                            )
                          }
                        />
                        <PaymentAmount
                          label="Available"
                          value={
                            formatMoney(
                              retainer.availableAmount,
                              retainer.currency,
                            )
                          }
                        />
                      </div>
                    </div>

                    {
                      (
                        data.capabilities.canAllocatePayment ||
                        data.capabilities.canRefundPayment ||
                        data.capabilities.canReconcilePayment
                      ) &&
                      retainer.status ===
                        'active' &&
                      (
                        <div className="mt-4 grid gap-3 lg:grid-cols-3">
                          {
                            retainer.availableAmount >
                              0 &&
                            eligibleInvoices.length >
                              0 &&
                            (
                              <form
                                className="rounded-2xl border border-blue-500/15 bg-blue-500/[0.04] p-3"
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
                                            'allocate_payment',
                                          paymentId:
                                            retainer.paymentId,
                                          invoiceId:
                                            form.get(
                                              'invoiceId',
                                            ),
                                          amount:
                                            form.get(
                                              'amount',
                                            ),
                                        },
                                        'Retainer amount applied to invoice.',
                                      );

                                    if (
                                      saved
                                    ) {
                                      element.reset();
                                    }
                                  }
                                }
                              >
                                <p className="text-xs font-black text-blue-700 dark:text-blue-300">
                                  Apply to invoice
                                </p>
                                <select
                                  name="invoiceId"
                                  required
                                  defaultValue=""
                                  className="mt-2 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                >
                                  <option value="" disabled>
                                    Choose invoice
                                  </option>
                                  {
                                    eligibleInvoices.map(
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
                                            formatMoney(
                                              invoice.balanceDue,
                                              invoice.currency,
                                            )
                                          }
                                        </option>
                                      ),
                                    )
                                  }
                                </select>
                                <div className="mt-2 flex gap-2">
                                  <input
                                    name="amount"
                                    type="number"
                                    min="0.01"
                                    max={
                                      retainer.availableAmount
                                    }
                                    step="0.01"
                                    required
                                    placeholder="Amount"
                                    className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                  />
                                  <button
                                    type="submit"
                                    disabled={
                                      pending
                                    }
                                    className="h-10 rounded-xl bg-blue-600 px-3 text-[10px] font-black text-white disabled:opacity-60"
                                  >
                                    Apply
                                  </button>
                                </div>
                              </form>
                            )
                          }

                          {
                            retainer.availableAmount >
                              0 &&
                            (
                              <form
                                className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-3"
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
                                            'refund_payment',
                                          paymentId:
                                            retainer.paymentId,
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
                                          reason:
                                            form.get(
                                              'reason',
                                            ),
                                        },
                                        'Unused retainer amount refunded.',
                                      );

                                    if (
                                      saved
                                    ) {
                                      element.reset();
                                    }
                                  }
                                }
                              >
                                <p className="text-xs font-black text-amber-700 dark:text-amber-300">
                                  Refund unused advance
                                </p>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <input
                                    name="amount"
                                    type="number"
                                    min="0.01"
                                    max={
                                      retainer.availableAmount
                                    }
                                    step="0.01"
                                    required
                                    placeholder="Amount"
                                    className="h-10 rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                  />
                                  <select
                                    name="method"
                                    defaultValue={
                                      retainer.method
                                    }
                                    className="h-10 rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                  >
                                    <option value="mpesa">M-Pesa</option>
                                    <option value="bank">Bank</option>
                                    <option value="cash">Cash</option>
                                    <option value="card">Card</option>
                                    <option value="other">Other</option>
                                  </select>
                                </div>
                                <input
                                  name="reference"
                                  maxLength={255}
                                  placeholder="Refund reference"
                                  className="mt-2 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                />
                                <div className="mt-2 flex gap-2">
                                  <input
                                    name="reason"
                                    required
                                    maxLength={2000}
                                    placeholder="Reason"
                                    className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                  />
                                  <button
                                    type="submit"
                                    disabled={
                                      pending
                                    }
                                    className="h-10 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-[10px] font-black text-amber-700 disabled:opacity-60 dark:text-amber-300"
                                  >
                                    Refund
                                  </button>
                                </div>
                              </form>
                            )
                          }

                          {
                            !retainer.reconciledAt &&
                            (
                              <form
                                className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-3"
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
                                            'reconcile_payment',
                                          paymentId:
                                            retainer.paymentId,
                                          reference:
                                            form.get(
                                              'reference',
                                            ),
                                          notes:
                                            form.get(
                                              'notes',
                                            ),
                                        },
                                        'Retainer receipt reconciled.',
                                      );

                                    if (
                                      saved
                                    ) {
                                      element.reset();
                                    }
                                  }
                                }
                              >
                                <p className="text-xs font-black text-emerald-700 dark:text-emerald-300">
                                  Reconcile advance
                                </p>
                                <input
                                  name="reference"
                                  maxLength={255}
                                  defaultValue={
                                    retainer.reference ||
                                    ''
                                  }
                                  placeholder="Statement reference"
                                  className="mt-2 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                />
                                <div className="mt-2 flex gap-2">
                                  <input
                                    name="notes"
                                    maxLength={3000}
                                    placeholder="Reconciliation notes"
                                    className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                  />
                                  <button
                                    type="submit"
                                    disabled={
                                      pending
                                    }
                                    className="h-10 rounded-xl bg-emerald-600 px-3 text-[10px] font-black text-white disabled:opacity-60"
                                  >
                                    Reconcile
                                  </button>
                                </div>
                              </form>
                            )
                          }
                        </div>
                      )
                    }

                    {
                      retainer.allocations.length >
                        0 &&
                      (
                        <div className="mt-3 rounded-2xl border border-[var(--sami-border)] p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                            Allocation history
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {
                              retainer.allocations.map(
                                allocation => (
                                  <span
                                    key={
                                      allocation.id
                                    }
                                    className="rounded-xl bg-blue-500/[0.06] px-2.5 py-1.5 text-[10px] font-semibold text-blue-800 dark:text-blue-200"
                                  >
                                    {
                                      allocation.invoiceNumber
                                    } · {
                                      formatMoney(
                                        allocation.amount,
                                        retainer.currency,
                                      )
                                    } · {
                                      allocation.status
                                    }
                                  </span>
                                ),
                              )
                            }
                          </div>
                        </div>
                      )
                    }

                    {
                      retainer.refunds.length >
                        0 &&
                      (
                        <div className="mt-3 rounded-2xl border border-[var(--sami-border)] p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                            Refund history
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {
                              retainer.refunds.map(
                                refund => (
                                  <span
                                    key={
                                      refund.id
                                    }
                                    className="rounded-xl bg-amber-500/[0.06] px-2.5 py-1.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200"
                                  >
                                    {
                                      refund.refundNumber
                                    } · {
                                      formatMoney(
                                        refund.amount,
                                        retainer.currency,
                                      )
                                    } · {
                                      refund.status
                                    }
                                  </span>
                                ),
                              )
                            }
                          </div>
                        </div>
                      )
                    }
                  </div>
                );
              },
            )
          }

          {
            data.retainers.length ===
              0 &&
            (
              <p className="p-8 text-center text-sm text-slate-600 dark:text-slate-300">
                No retainers or deposits received yet.
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
  pending,
  run,
  mode = 'register',
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
  mode?:
    'receive' |
    'register';
}) {
  const postedPayments =
    data.payments.filter(
      payment =>
        payment.status ===
          'posted',
    );

  const companyCurrencyPayments =
    postedPayments.filter(
      payment =>
        payment.currency ===
          data.company.currency,
    );

  const companyCurrencyUnapplied =
    companyCurrencyPayments.reduce(
      (
        total,
        payment,
      ) =>
        total +
        payment.unappliedAmount,
      0,
    );

  const unreconciledCount =
    postedPayments.filter(
      payment =>
        !payment.reconciledAt,
    ).length;

  return (
    <div className="space-y-4">
      <div
        className={[
          'grid gap-3 sm:grid-cols-2 xl:grid-cols-4',
          mode ===
            'register'
            ? ''
            : 'hidden',
        ].join(
          ' ',
        )}
      >
        <MetricCard
          label="Posted receipts"
          value={
            String(
              postedPayments.length,
            )
          }
          note="Cash receipts still active"
          icon={Receipt}
          tone="blue"
        />

        <MetricCard
          label="Unreconciled"
          value={
            String(
              unreconciledCount,
            )
          }
          note="Receipts awaiting bank / cash matching"
          icon={RefreshCw}
          tone="amber"
        />

        <MetricCard
          label="Unapplied"
          value={
            formatMoney(
              companyCurrencyUnapplied,
              data.company.currency,
            )
          }
          note={
            data.company.currency +
            ' customer credit available'
          }
          icon={CircleDollarSign}
          tone="emerald"
        />

        <MetricCard
          label="Reversed"
          value={
            String(
              data.payments.filter(
                payment =>
                  payment.status ===
                    'reversed',
              ).length,
            )
          }
          note="Retained for audit"
          icon={RefreshCw}
          tone="rose"
        />
      </div>

      {
        data.capabilities
          .canRecordPayment &&
        (
          <form
            className={[
              'sami-surface mx-auto max-w-5xl rounded-[24px] p-4 sm:p-5',
              mode ===
                'receive'
                ? ''
                : 'hidden',
            ].join(
              ' ',
            )}
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
                        'record_customer_payment',
                      customerId:
                        form.get(
                          'customerId',
                        ),
                      amount:
                        form.get(
                          'amount',
                        ),
                      paymentDate:
                        form.get(
                          'paymentDate',
                        ),
                      method:
                        form.get(
                          'method',
                        ),
                      reference:
                        form.get(
                          'reference',
                        ),
                      notes:
                        form.get(
                          'notes',
                        ),
                    },
                    'Payment received. Allocate it to invoices when ready.',
                  );

                if (
                  saved
                ) {
                  element.reset();
                }
              }
            }
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-black">
                  Receive customer payment
                </p>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                  Record the money first. SaMi keeps it as unapplied customer credit until you allocate it to one or more invoices.
                </p>
              </div>

              <div className="rounded-xl bg-blue-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300">
                Cash receipt → customer credit
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <label className="xl:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Customer
                </span>
                <select
                  name="customerId"
                  required
                  defaultValue=""
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                >
                  <option
                    value=""
                    disabled
                  >
                    Choose customer
                  </option>
                  {
                    data.customers
                      .filter(
                        customer =>
                          customer.status ===
                            'active',
                      )
                      .map(
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
                            } · {
                              customer.currency
                            }
                          </option>
                        ),
                      )
                  }
                </select>
              </label>

              <label>
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Amount
                </span>
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="0.00"
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                />
              </label>

              <label>
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Date
                </span>
                <input
                  name="paymentDate"
                  type="date"
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                />
              </label>

              <label>
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Method
                </span>
                <select
                  name="method"
                  defaultValue="mpesa"
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
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
              </label>

              <label>
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Reference
                </span>
                <input
                  name="reference"
                  maxLength={255}
                  placeholder="Txn / bank reference"
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-col gap-3 lg:flex-row">
              <textarea
                name="notes"
                rows={2}
                maxLength={3000}
                placeholder="Receipt notes (optional)"
                className="min-h-[44px] flex-1 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2.5 text-sm"
              />

              <button
                type="submit"
                disabled={
                  pending
                }
                className="h-11 rounded-xl bg-blue-600 px-5 text-xs font-black text-white disabled:opacity-60"
              >
                Receive payment
              </button>
            </div>
          </form>
        )
      }

      <div
        className={[
          'sami-surface overflow-hidden rounded-[24px]',
          mode ===
            'register'
            ? ''
            : 'hidden',
        ].join(
          ' ',
        )}
      >
        <div className="border-b border-[var(--sami-border)] p-4 sm:p-5">
          <p className="text-sm font-black">
            Payment register
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Receipts, allocations, refunds, reconciliation and reversals remain visible as one audit trail.
          </p>
        </div>

        <div className="divide-y divide-[var(--sami-border)]">
          {
            data.payments.map(
              payment => {
                const eligibleInvoices =
                  data.invoices.filter(
                    invoice =>
                      invoice.customerId ===
                        payment.customerId &&
                      invoice.currency ===
                        payment.currency &&
                      invoice.balanceDue >
                        0 &&
                      ![
                        'draft',
                        'pending_approval',
                        'rejected',
                        'paid',
                        'cancelled',
                        'void',
                        'written_off',
                      ].includes(
                        invoice.status,
                      ),
                  );

                const postedRefunds =
                  payment.refunds.filter(
                    refund =>
                      refund.status ===
                        'posted',
                  );

                return (
                  <div
                    key={
                      payment.id
                    }
                    className="p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black">
                            {
                              payment
                                .paymentNumber
                            }
                          </p>

                          <StatusPill
                            value={
                              payment.status
                            }
                          />

                          {
                            payment.reconciledAt
                              ? (
                                <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                                  Reconciled
                                </span>
                              )
                              : payment.status ===
                                  'posted'
                                ? (
                                  <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                    Unreconciled
                                  </span>
                                )
                                : null
                          }
                        </div>

                        <p className="mt-1 text-xs text-slate-500">
                          {
                            payment
                              .customerName ||
                            'Customer'
                          } · {
                            payment.paymentDate
                          } · {
                            payment.method
                          }
                          {
                            payment.reference
                              ? ' · ' +
                                payment.reference
                              : ''
                          }
                        </p>

                        <p className="mt-1 text-[11px] text-slate-400">
                          {
                            payment.invoiceNumbers.length >
                              0
                              ? 'Applied to ' +
                                payment.invoiceNumbers.join(
                                  ', ',
                                )
                              : 'No active invoice allocations yet'
                          }
                        </p>
                      </div>

                      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[520px]">
                        <PaymentAmount
                          label="Received"
                          value={
                            formatMoney(
                              payment.amount,
                              payment.currency,
                            )
                          }
                        />
                        <PaymentAmount
                          label="Allocated"
                          value={
                            formatMoney(
                              payment.allocatedAmount,
                              payment.currency,
                            )
                          }
                        />
                        <PaymentAmount
                          label="Unapplied"
                          value={
                            formatMoney(
                              payment.unappliedAmount,
                              payment.currency,
                            )
                          }
                          emphasis={
                            payment.unappliedAmount >
                              0
                          }
                        />
                        <PaymentAmount
                          label="Refunded"
                          value={
                            formatMoney(
                              payment.refundedAmount,
                              payment.currency,
                            )
                          }
                        />
                      </div>
                    </div>

                    {
                      payment.allocations.length >
                        0 &&
                      (
                        <div className="mt-4 rounded-2xl border border-[var(--sami-border)] p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                            Allocations
                          </p>

                          <div className="mt-2 space-y-2">
                            {
                              payment.allocations.map(
                                allocation => (
                                  <div
                                    key={
                                      allocation.id
                                    }
                                    className="flex flex-col gap-2 rounded-xl bg-[var(--sami-surface-soft)] p-3 sm:flex-row sm:items-center sm:justify-between"
                                  >
                                    <div>
                                      <p className="text-xs font-black">
                                        {
                                          allocation.invoiceNumber
                                        } · {
                                          formatMoney(
                                            allocation.amount,
                                            payment.currency,
                                          )
                                        }
                                      </p>
                                      <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                                        {
                                          allocation.status
                                        }
                                      </p>
                                    </div>

                                    {
                                      data.capabilities
                                        .canReversePayment &&
                                      payment.status ===
                                        'posted' &&
                                      !payment.reconciledAt &&
                                      allocation.status ===
                                        'posted' &&
                                      allocation.operationKey &&
                                      (
                                        <form
                                          className="flex gap-2"
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
                                                      'reverse_payment_allocation',
                                                    allocationId:
                                                      allocation.id,
                                                    reason:
                                                      form.get(
                                                        'reason',
                                                      ),
                                                  },
                                                  'Allocation reversed. The amount is unapplied again.',
                                                );

                                              if (
                                                saved
                                              ) {
                                                element.reset();
                                              }
                                            }
                                          }
                                        >
                                          <input
                                            name="reason"
                                            required
                                            maxLength={2000}
                                            placeholder="Reason"
                                            className="h-9 min-w-0 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-[11px]"
                                          />
                                          <button
                                            type="submit"
                                            disabled={
                                              pending
                                            }
                                            className="h-9 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-[10px] font-black text-amber-700 disabled:opacity-60 dark:text-amber-300"
                                          >
                                            Unallocate
                                          </button>
                                        </form>
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
                      payment.refunds.length >
                        0 &&
                      (
                        <div className="mt-3 rounded-2xl border border-[var(--sami-border)] p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                            Refunds
                          </p>

                          <div className="mt-2 space-y-2">
                            {
                              payment.refunds.map(
                                refund => (
                                  <div
                                    key={
                                      refund.id
                                    }
                                    className="flex flex-col gap-2 rounded-xl bg-[var(--sami-surface-soft)] p-3 sm:flex-row sm:items-center sm:justify-between"
                                  >
                                    <div>
                                      <p className="text-xs font-black">
                                        {
                                          refund.refundNumber
                                        } · {
                                          formatMoney(
                                            refund.amount,
                                            payment.currency,
                                          )
                                        }
                                      </p>
                                      <p className="mt-1 text-[10px] text-slate-400">
                                        {
                                          refund.refundDate
                                        } · {
                                          refund.status
                                        } · {
                                          refund.reason
                                        }
                                      </p>
                                    </div>

                                    {
                                      data.capabilities
                                        .canReversePayment &&
                                      !payment.reconciledAt &&
                                      refund.status ===
                                        'posted' &&
                                      (
                                        <form
                                          className="flex gap-2"
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
                                                      'reverse_payment_refund',
                                                    refundId:
                                                      refund.id,
                                                    reason:
                                                      form.get(
                                                        'reason',
                                                      ),
                                                  },
                                                  'Refund reversed.',
                                                );

                                              if (
                                                saved
                                              ) {
                                                element.reset();
                                              }
                                            }
                                          }
                                        >
                                          <input
                                            name="reason"
                                            required
                                            maxLength={2000}
                                            placeholder="Reason"
                                            className="h-9 min-w-0 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-[11px]"
                                          />
                                          <button
                                            type="submit"
                                            disabled={
                                              pending
                                            }
                                            className="h-9 rounded-lg border border-[var(--sami-border)] px-3 text-[10px] font-black disabled:opacity-60"
                                          >
                                            Reverse refund
                                          </button>
                                        </form>
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
                      (
                        data.capabilities.canAllocatePayment ||
                        data.capabilities.canRefundPayment ||
                        data.capabilities.canReconcilePayment
                      ) &&
                      payment.status ===
                        'posted' &&
                      (
                        <div className="mt-4 grid gap-3 xl:grid-cols-3">
                          {
                            !payment.reconciledAt &&
                            payment.unappliedAmount >
                              0 &&
                            eligibleInvoices.length >
                              0 &&
                            (
                              <form
                                className="rounded-2xl border border-blue-500/15 bg-blue-500/[0.04] p-3"
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
                                            'allocate_payment',
                                          paymentId:
                                            payment.id,
                                          invoiceId:
                                            form.get(
                                              'invoiceId',
                                            ),
                                          amount:
                                            form.get(
                                              'amount',
                                            ),
                                        },
                                        'Payment allocated to invoice.',
                                      );

                                    if (
                                      saved
                                    ) {
                                      element.reset();
                                    }
                                  }
                                }
                              >
                                <p className="text-xs font-black text-blue-700 dark:text-blue-300">
                                  Allocate balance
                                </p>
                                <select
                                  name="invoiceId"
                                  required
                                  defaultValue=""
                                  className="mt-2 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                >
                                  <option
                                    value=""
                                    disabled
                                  >
                                    Choose invoice
                                  </option>
                                  {
                                    eligibleInvoices.map(
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
                                            formatMoney(
                                              invoice.balanceDue,
                                              invoice.currency,
                                            )
                                          }
                                        </option>
                                      ),
                                    )
                                  }
                                </select>
                                <div className="mt-2 flex gap-2">
                                  <input
                                    name="amount"
                                    type="number"
                                    min="0.01"
                                    max={
                                      payment.unappliedAmount
                                    }
                                    step="0.01"
                                    required
                                    placeholder="Amount"
                                    className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                  />
                                  <button
                                    type="submit"
                                    disabled={
                                      pending
                                    }
                                    className="h-10 rounded-xl bg-blue-600 px-3 text-[10px] font-black text-white disabled:opacity-60"
                                  >
                                    Allocate
                                  </button>
                                </div>
                              </form>
                            )
                          }

                          {
                            !payment.reconciledAt &&
                            payment.unappliedAmount >
                              0 &&
                            (
                              <form
                                className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-3"
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
                                            'refund_payment',
                                          paymentId:
                                            payment.id,
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
                                          reason:
                                            form.get(
                                              'reason',
                                            ),
                                        },
                                        'Unapplied payment amount refunded.',
                                      );

                                    if (
                                      saved
                                    ) {
                                      element.reset();
                                    }
                                  }
                                }
                              >
                                <p className="text-xs font-black text-amber-700 dark:text-amber-300">
                                  Refund unapplied money
                                </p>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <input
                                    name="amount"
                                    type="number"
                                    min="0.01"
                                    max={
                                      payment.unappliedAmount
                                    }
                                    step="0.01"
                                    required
                                    placeholder="Amount"
                                    className="h-10 rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                  />
                                  <select
                                    name="method"
                                    defaultValue={
                                      payment.method
                                    }
                                    className="h-10 rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
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
                                </div>
                                <input
                                  name="reference"
                                  maxLength={255}
                                  placeholder="Refund reference"
                                  className="mt-2 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                />
                                <div className="mt-2 flex gap-2">
                                  <input
                                    name="reason"
                                    required
                                    maxLength={2000}
                                    placeholder="Reason"
                                    className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                  />
                                  <button
                                    type="submit"
                                    disabled={
                                      pending
                                    }
                                    className="h-10 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-[10px] font-black text-amber-700 disabled:opacity-60 dark:text-amber-300"
                                  >
                                    Refund
                                  </button>
                                </div>
                              </form>
                            )
                          }

                          {
                            !payment.reconciledAt &&
                            (
                              <form
                                className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-3"
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
                                            'reconcile_payment',
                                          paymentId:
                                            payment.id,
                                          reference:
                                            form.get(
                                              'reference',
                                            ),
                                          notes:
                                            form.get(
                                              'notes',
                                            ),
                                        },
                                        'Payment reconciled.',
                                      );

                                    if (
                                      saved
                                    ) {
                                      element.reset();
                                    }
                                  }
                                }
                              >
                                <p className="text-xs font-black text-emerald-700 dark:text-emerald-300">
                                  Reconcile receipt
                                </p>
                                <input
                                  name="reference"
                                  maxLength={255}
                                  defaultValue={
                                    payment.reference ||
                                    ''
                                  }
                                  placeholder="Statement / cash-up reference"
                                  className="mt-2 h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                />
                                <div className="mt-2 flex gap-2">
                                  <input
                                    name="notes"
                                    maxLength={3000}
                                    placeholder="Reconciliation notes"
                                    className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--sami-border)] bg-transparent px-2 text-xs"
                                  />
                                  <button
                                    type="submit"
                                    disabled={
                                      pending
                                    }
                                    className="h-10 rounded-xl bg-emerald-600 px-3 text-[10px] font-black text-white disabled:opacity-60"
                                  >
                                    Reconcile
                                  </button>
                                </div>
                              </form>
                            )
                          }
                        </div>
                      )
                    }

                    {
                      data.capabilities
                        .canReversePayment &&
                      payment.status ===
                        'posted' &&
                      !payment.reconciledAt &&
                      (
                        <details className="mt-3 rounded-xl border border-red-500/15 p-3">
                          <summary className="cursor-pointer text-xs font-black text-red-700 dark:text-red-300">
                            Reverse entire receipt
                          </summary>

                          <p className="mt-2 text-[11px] leading-5 text-slate-500">
                            SaMi reverses every active allocation first, restores affected invoice balances, then reverses the cash receipt. Posted refunds must be reversed first.
                          </p>

                          {
                            postedRefunds.length >
                              0
                              ? (
                                <p className="mt-2 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                                  Reverse the posted refund{
                                    postedRefunds.length ===
                                      1
                                      ? ''
                                      : 's'
                                  } above before reversing this receipt.
                                </p>
                              )
                              : (
                                <form
                                  className="mt-3 flex flex-col gap-2 sm:flex-row"
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
                                              'reverse_payment',
                                            paymentId:
                                              payment.id,
                                            reason:
                                              form.get(
                                                'reason',
                                              ),
                                          },
                                          'Payment receipt and active allocations reversed.',
                                        );

                                      if (
                                        saved
                                      ) {
                                        element.reset();
                                      }
                                    }
                                  }
                                >
                                  <input
                                    name="reason"
                                    required
                                    maxLength={2000}
                                    placeholder="Reason for reversal"
                                    className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
                                  />

                                  <button
                                    type="submit"
                                    disabled={
                                      pending
                                    }
                                    className="h-10 rounded-xl border border-red-500/30 bg-red-500/10 px-4 text-xs font-black text-red-700 disabled:opacity-60 dark:text-red-300"
                                  >
                                    Reverse receipt
                                  </button>
                                </form>
                              )
                          }
                        </details>
                      )
                    }

                    {
                      payment.reconciledAt &&
                      (
                        <div className="mt-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700 dark:text-emerald-300">
                            Reconciled receipt · financial edits locked
                          </p>

                          <p className="mt-1 text-[11px] leading-5 text-slate-500">
                            Reconciled {
                              payment.reconciledAt
                            }{
                              payment.reconciliationReference
                                ? ' · ' +
                                  payment.reconciliationReference
                                : ''
                            }{
                              payment.reconciliationNotes
                                ? ' · ' +
                                  payment.reconciliationNotes
                                : ''
                            }
                          </p>

                          {
                            data.capabilities
                              .canReconcilePayment &&
                            payment.status ===
                              'posted' &&
                            (
                              <form
                                className="mt-3 flex flex-col gap-2 sm:flex-row"
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
                                            'unreconcile_payment',
                                          paymentId:
                                            payment.id,
                                          reason:
                                            form.get(
                                              'reason',
                                            ),
                                        },
                                        'Payment unreconciled. Financial corrections are available again.',
                                      );

                                    if (
                                      saved
                                    ) {
                                      element.reset();
                                    }
                                  }
                                }
                              >
                                <input
                                  name="reason"
                                  required
                                  maxLength={2000}
                                  placeholder="Reason for unreconciling"
                                  className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs"
                                />

                                <button
                                  type="submit"
                                  disabled={
                                    pending
                                  }
                                  className="h-10 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 text-xs font-black text-emerald-700 disabled:opacity-60 dark:text-emerald-300"
                                >
                                  Unreconcile
                                </button>
                              </form>
                            )
                          }
                        </div>
                      )
                    }
                  </div>
                );
              },
            )
          }

          {
            data.payments.length ===
              0 &&
            (
              <p className="p-8 text-center text-sm text-slate-500">
                No payments recorded yet.
              </p>
            )
          }
        </div>
      </div>
    </div>
  );
}


function PaymentAmount({
  label,
  value,
  emphasis =
    false,
}: {
  label:
    string;
  value:
    string;
  emphasis?:
    boolean;
}) {
  return (
    <div
      className={
        'rounded-xl border p-2.5 ' +
        (
          emphasis
            ? 'border-amber-500/20 bg-amber-500/[0.06]'
            : 'border-[var(--sami-border)]'
        )
      }
    >
      <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
        {
          label
        }
      </p>
      <p className="mt-1 break-words whitespace-normal text-xs font-black">
        {
          value
        }
      </p>
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
  const activeSchedules =
    data.recurring.filter(
      item =>
        item.status ===
        'active',
    ).length;

  const failedSchedules =
    data.recurring.filter(
      item =>
        item.consecutiveFailures >
        0,
    ).length;

  const generatedInvoices =
    data.recurring.reduce(
      (
        total,
        item,
      ) =>
        total +
        item.runCount,
      0,
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sami-surface rounded-[20px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Active schedules
          </p>
          <p className="mt-2 text-2xl font-black">
            {
              activeSchedules
            }
          </p>
        </div>

        <div className="sami-surface rounded-[20px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Generated invoices
          </p>
          <p className="mt-2 text-2xl font-black">
            {
              generatedInvoices
            }
          </p>
        </div>

        <div className="sami-surface rounded-[20px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Schedules needing attention
          </p>
          <p className="mt-2 text-2xl font-black">
            {
              failedSchedules
            }
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
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
                        startDate:
                          form.get(
                            'startDate',
                          ),
                        nextRunAt:
                          form.get(
                            'nextRunAt',
                          ),
                        endDate:
                          form.get(
                            'endDate',
                          ),
                        maxOccurrences:
                          form.get(
                            'maxOccurrences',
                          ),
                        maxRetryAttempts:
                          form.get(
                            'maxRetryAttempts',
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

              <p className="mt-1 text-xs leading-5 text-slate-500">
                Use an existing invoice as the commercial template. SaMi snapshots its customer, lines, pricing, taxes and terms, then creates each occurrence through the normal approval and accounting lifecycle.
              </p>

              <div className="mt-4 space-y-3">
                <Field
                  label="Schedule name"
                  name="name"
                  required
                />

                <label className="block min-w-0 space-y-1">
                  <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                    Source invoice
                  </span>

                  <select
                    name="sourceInvoiceId"
                    required
                    className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm"
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
                    required
                  />

                  <label className="block min-w-0 space-y-1">
                    <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                      Period
                    </span>

                    <select
                      name="intervalUnit"
                      defaultValue="month"
                      className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm"
                    >
                      <option value="day">
                        Day
                      </option>
                      <option value="week">
                        Week
                      </option>
                      <option value="month">
                        Month
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

                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Start date"
                    name="startDate"
                    type="date"
                  />

                  <Field
                    label="First run"
                    name="nextRunAt"
                    type="date"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="End date"
                    name="endDate"
                    type="date"
                  />

                  <Field
                    label="Maximum invoices"
                    name="maxOccurrences"
                    type="number"
                    min="1"
                    max="10000"
                  />
                </div>

                <Field
                  label="Retry attempts before auto-pause"
                  name="maxRetryAttempts"
                  type="number"
                  min="1"
                  max="20"
                  defaultValue="3"
                  required
                />

                <label className="flex items-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] px-3 py-3 text-xs font-semibold">
                  <input
                    type="checkbox"
                    name="autoSend"
                  />
                  Auto-send generated invoices after posting
                </label>

                <div className="rounded-xl border border-[var(--sami-border)] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Delivery channels
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
                className="mt-4 h-10 w-full rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:cursor-not-allowed"
              >
                Save schedule
              </button>
            </form>
          )
        }

        <div className="sami-surface rounded-[24px] p-4 sm:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black">
                Recurring invoices
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Schedule health, generated documents, delivery state and recent worker runs.
              </p>
            </div>

            <span className="mt-2 w-fit rounded-full border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] px-3 py-1 text-[10px] font-black sm:mt-0">
              {
                data.recurring.length
              } schedules
            </span>
          </div>

          <div className="mt-3 divide-y divide-[var(--sami-border)]">
            {
              data.recurring
                .map(
                  item => {
                    const hasFailedRun =
                      item.runs.some(
                        recurringRun =>
                          recurringRun.status ===
                          'failed',
                      );

                    return (
                      <details
                        key={
                          item.id
                        }
                        className="group"
                      >
                        <summary className="cursor-pointer list-none py-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-black">
                                  {
                                    item.name
                                  }
                                </p>

                                <StatusPill
                                  value={
                                    item.status
                                  }
                                />
                              </div>

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

                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-500">
                                <span>
                                  Next: {
                                    displayDateTime(
                                      item.nextRunAt,
                                    )
                                  }
                                </span>
                                <span>
                                  Generated: {
                                    item.runCount
                                  }{
                                    item.maxOccurrences
                                      ? ' / ' +
                                        item.maxOccurrences
                                      : ''
                                  }
                                </span>
                                {
                                  item.endDate &&
                                  (
                                    <span>
                                      Ends: {
                                        displayDateTime(
                                          item.endDate,
                                        )
                                      }
                                    </span>
                                  )
                                }
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-3">
                              {
                                item.lastInvoiceId &&
                                item.lastInvoiceNumber &&
                                (
                                  <Link
                                    href={
                                      '/apps/invoicing/' +
                                      item.lastInvoiceId
                                    }
                                    className="rounded-xl border border-[var(--sami-border)] px-3 py-2 text-[10px] font-black text-blue-700 transition hover:bg-[var(--sami-surface-soft)] dark:text-blue-300"
                                  >
                                    {
                                      item.lastInvoiceNumber
                                    }
                                  </Link>
                                )
                              }

                              <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
                            </div>
                          </div>
                        </summary>

                        <div className="mb-4 space-y-3">
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl bg-[var(--sami-surface-soft)] p-3">
                              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                                Last success
                              </p>
                              <p className="mt-1 text-xs font-bold">
                                {
                                  displayDateTime(
                                    item.lastSuccessAt,
                                  )
                                }
                              </p>
                            </div>

                            <div className="rounded-xl bg-[var(--sami-surface-soft)] p-3">
                              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                                Failures
                              </p>
                              <p className="mt-1 text-xs font-bold">
                                {
                                  item.consecutiveFailures
                                } / {
                                  item.maxRetryAttempts
                                }
                              </p>
                            </div>

                            <div className="rounded-xl bg-[var(--sami-surface-soft)] p-3">
                              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                                Retry after
                              </p>
                              <p className="mt-1 text-xs font-bold">
                                {
                                  displayDateTime(
                                    item.retryAfter,
                                  )
                                }
                              </p>
                            </div>

                            <div className="rounded-xl bg-[var(--sami-surface-soft)] p-3">
                              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                                Completion
                              </p>
                              <p className="mt-1 text-xs font-bold">
                                {
                                  item.completionReason ||
                                  'Running'
                                }
                              </p>
                            </div>
                          </div>

                          {
                            (
                              item.lastErrorCode ||
                              item.lastErrorMessage
                            ) &&
                            (
                              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] p-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.1em] text-rose-700 dark:text-rose-300">
                                  Latest recurring error
                                </p>
                                <p className="mt-1 text-xs font-bold text-rose-900 dark:text-rose-100">
                                  {
                                    item.lastErrorCode ||
                                    'RECURRING_GENERATION_FAILED'
                                  }
                                </p>
                                {
                                  item.lastErrorMessage &&
                                  (
                                    <p className="mt-1 text-xs leading-5 text-rose-800 dark:text-rose-200">
                                      {
                                        item.lastErrorMessage
                                      }
                                    </p>
                                  )
                                }
                              </div>
                            )
                          }

                          {
                            data.capabilities
                              .canManageRecurring &&
                            item.status !==
                              'cancelled' &&
                            item.status !==
                              'completed' &&
                            (
                              <form
                                className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] p-3"
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
                                        endDate:
                                          form.get(
                                            'endDate',
                                          ),
                                        maxOccurrences:
                                          form.get(
                                            'maxOccurrences',
                                          ),
                                        maxRetryAttempts:
                                          form.get(
                                            'maxRetryAttempts',
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

                                  <label className="block min-w-0 space-y-1">
                                    <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
                                      Period
                                    </span>
                                    <select
                                      name="intervalUnit"
                                      defaultValue={
                                        item.intervalUnit
                                      }
                                      className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm"
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

                                  <Field
                                    label="End date"
                                    name="endDate"
                                    type="date"
                                    defaultValue={
                                      item.endDate
                                        ?.slice(
                                          0,
                                          10,
                                        ) ||
                                      ''
                                    }
                                  />

                                  <Field
                                    label="Maximum invoices"
                                    name="maxOccurrences"
                                    type="number"
                                    min="1"
                                    max="10000"
                                    defaultValue={
                                      item.maxOccurrences ===
                                        null
                                        ? ''
                                        : String(
                                            item.maxOccurrences,
                                          )
                                    }
                                  />

                                  <Field
                                    label="Retry attempts"
                                    name="maxRetryAttempts"
                                    type="number"
                                    min="1"
                                    max="20"
                                    required
                                    defaultValue={
                                      String(
                                        item.maxRetryAttempts,
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
                                  <div className="flex flex-wrap gap-2">
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
                                      className="h-9 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-[10px] font-black disabled:cursor-not-allowed"
                                    >
                                      {
                                        item.status ===
                                          'active'
                                          ? 'Pause'
                                          : 'Resume'
                                      }
                                    </button>

                                    {
                                      hasFailedRun &&
                                      data.capabilities
                                        .canRunRecurring &&
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
                                                    'retry_recurring',
                                                  recurringId:
                                                    item.id,
                                                },
                                                'Recurring retry queued.',
                                              )
                                          }
                                          className="h-9 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 text-[10px] font-black text-amber-800 disabled:cursor-not-allowed dark:text-amber-200"
                                        >
                                          Retry failed run
                                        </button>
                                      )
                                    }

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
                                      className="h-9 rounded-xl border border-red-500/30 bg-red-500/[0.04] px-3 text-[10px] font-black text-red-700 disabled:cursor-not-allowed dark:text-red-300"
                                    >
                                      Cancel
                                    </button>
                                  </div>

                                  <button
                                    type="submit"
                                    disabled={
                                      pending
                                    }
                                    className="h-9 rounded-xl bg-blue-600 px-3 text-[10px] font-black text-white disabled:cursor-not-allowed"
                                  >
                                    Save schedule
                                  </button>
                                </div>
                              </form>
                            )
                          }

                          <div className="overflow-hidden rounded-2xl border border-[var(--sami-border)]">
                            <div className="flex items-center justify-between gap-2 border-b border-[var(--sami-border)] bg-[var(--sami-surface-soft)] px-3 py-2.5">
                              <p className="text-[10px] font-black uppercase tracking-[0.1em]">
                                Recent runs
                              </p>
                              <p className="text-[10px] font-semibold text-slate-500">
                                Latest {
                                  item.runs.length
                                }
                              </p>
                            </div>

                            <div className="divide-y divide-[var(--sami-border)]">
                              {
                                item.runs.map(
                                  recurringRun => (
                                    <div
                                      key={
                                        recurringRun.id
                                      }
                                      className="grid gap-2 px-3 py-3 text-xs sm:grid-cols-[130px_100px_minmax(0,1fr)_130px]"
                                    >
                                      <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                                          Scheduled
                                        </p>
                                        <p className="mt-1 font-bold">
                                          {
                                            displayDateTime(
                                              recurringRun.scheduledFor,
                                            )
                                          }
                                        </p>
                                      </div>

                                      <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                                          Run
                                        </p>
                                        <p className="mt-1 font-bold">
                                          {
                                            recurringRun.status
                                          } · try {
                                            recurringRun.attemptCount
                                          }
                                        </p>
                                      </div>

                                      <div className="min-w-0">
                                        <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                                          Result
                                        </p>
                                        {
                                          recurringRun.invoiceId &&
                                          recurringRun.invoiceNumber
                                            ? (
                                                <Link
                                                  href={
                                                    '/apps/invoicing/' +
                                                    recurringRun.invoiceId
                                                  }
                                                  className="mt-1 inline-block break-words whitespace-normal font-black text-blue-700 hover:underline dark:text-blue-300"
                                                >
                                                  {
                                                    recurringRun.invoiceNumber
                                                  }
                                                </Link>
                                              )
                                            : (
                                                <p className="mt-1 break-words whitespace-normal font-semibold">
                                                  {
                                                    recurringRun.errorCode ||
                                                    recurringRun.errorMessage ||
                                                    'No invoice generated'
                                                  }
                                                </p>
                                              )
                                        }
                                      </div>

                                      <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                                          Delivery
                                        </p>
                                        <p className="mt-1 font-bold">
                                          {
                                            recurringRun.deliveryStatus
                                          }
                                        </p>
                                      </div>
                                    </div>
                                  ),
                                )
                              }

                              {
                                item.runs.length ===
                                  0 &&
                                (
                                  <p className="px-4 py-6 text-center text-xs text-slate-500">
                                    No recurring runs have executed yet.
                                  </p>
                                )
                              }
                            </div>
                          </div>
                        </div>
                      </details>
                    );
                  },
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
    </div>
  );
}

function CustomerPortal({
  data,
  pending,
  request,
  run,
}: {
  data:
    InvoicingWorkspaceData;
  pending:
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
    issuedLinks,
    setIssuedLinks,
  ] =
    useState<
      Record<
        string,
        string
      >
    >(
      {},
    );

  const [
    issueMessage,
    setIssueMessage,
  ] =
    useState<
      string |
      null
    >(
      null,
    );

  const activeAccess =
    data.portalAccess.filter(
      access =>
        access.status ===
        'active',
    );

  const openMessages =
    data.portalMessages.filter(
      message =>
        message.direction ===
          'customer_to_business' &&
        message.status ===
          'open',
    );

  const portalCustomers =
    data.customers
      .filter(
        customer =>
          customer.status ===
          'active',
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.outstandingTotal -
          left.outstandingTotal,
      );

  async function issue(
    customerId:
      string,
  ) {
    setIssueMessage(
      null,
    );

    try {
      const result =
        await request({
          action:
            'issue_customer_portal',
          customerId,
          expiresDays:
            data.settings
              .portalAccessDays,
        });

      const portalUrl =
        typeof result
          .portalUrl ===
          'string'
          ? result.portalUrl
          : '';

      if (
        portalUrl
      ) {
        setIssuedLinks(
          current => ({
            ...current,
            [customerId]:
              portalUrl,
          }),
        );
      }

      setIssueMessage(
        result
          .emailDelivered ===
          true
          ? 'Portal access issued and invitation email sent.'
          : 'Portal access issued. Email delivery was unavailable; copy the secure link below.',
      );
    } catch (
      error
    ) {
      setIssueMessage(
        error instanceof
          Error
          ? error.message
          : 'Portal access could not be issued.',
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="sami-surface rounded-[20px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
            Active portal customers
          </p>
          <p className="mt-2 text-2xl font-black">
            {
              activeAccess.length
            }
          </p>
        </div>

        <div className="sami-surface rounded-[20px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
            Open customer messages
          </p>
          <p className="mt-2 text-2xl font-black">
            {
              openMessages.length
            }
          </p>
        </div>

        <div className="sami-surface rounded-[20px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
            Portal access period
          </p>
          <p className="mt-2 text-2xl font-black">
            {
              data.settings
                .portalAccessDays
            }d
          </p>
        </div>

        <div className="sami-surface rounded-[20px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
            Portal status
          </p>
          <p className="mt-2 text-sm font-black">
            {
              data.settings
                .portalEnabled
                ? 'Enabled'
                : 'Disabled'
            }
          </p>
        </div>
      </div>

      {
        issueMessage &&
        (
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.07] px-4 py-3 text-xs font-semibold text-blue-900 dark:text-blue-100">
            {
              issueMessage
            }
          </div>
        )
      }

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]">
        <section className="sami-surface rounded-[24px] p-4 sm:p-5">
          <div>
            <p className="text-sm font-black">
              Customer access
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              Portal links are customer-scoped, expiring and revocable. Reissuing access immediately revokes the previous customer portal token.
            </p>
          </div>

          <div className="mt-4 max-h-[720px] space-y-2 overflow-auto pr-1">
            {
              portalCustomers.map(
                customer => {
                  const access =
                    data.portalAccess
                      .find(
                        item =>
                          item.customerId ===
                            customer.id &&
                          item.status ===
                            'active',
                      );

                  const issuedLink =
                    issuedLinks[
                      customer.id
                    ];

                  return (
                    <div
                      key={
                        customer.id
                      }
                      className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] p-3"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-words whitespace-normal text-xs font-black">
                            {
                              customer.name
                            }
                          </p>
                          <p className="mt-1 break-words whitespace-normal text-[10px] text-slate-600 dark:text-slate-300">
                            {
                              customer.email ||
                              'No customer email'
                            } · Outstanding {
                              formatMoney(
                                customer.outstandingTotal,
                                customer.currency,
                              )
                            }
                          </p>

                          {
                            access &&
                            (
                              <p className="mt-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                                Active until {
                                  displayDateTime(
                                    access.expiresAt,
                                  )
                                } · Last used {
                                  displayDateTime(
                                    access.lastUsedAt,
                                  )
                                }
                              </p>
                            )
                          }
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          {
                            data.capabilities
                              .canManagePortal &&
                            (
                              <button
                                type="button"
                                disabled={
                                  pending ||
                                  !customer.email ||
                                  !data.settings
                                    .portalEnabled
                                }
                                onClick={
                                  () =>
                                    issue(
                                      customer.id,
                                    )
                                }
                                className="h-9 rounded-xl bg-blue-600 px-3 text-[10px] font-black text-white disabled:cursor-not-allowed"
                              >
                                {
                                  access
                                    ? 'Reissue access'
                                    : 'Invite'
                                }
                              </button>
                            )
                          }

                          {
                            access &&
                            data.capabilities
                              .canManagePortal &&
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
                                          'revoke_customer_portal',
                                        customerId:
                                          customer.id,
                                      },
                                      'Customer portal access revoked.',
                                    )
                                }
                                className="h-9 rounded-xl border border-red-500/30 bg-red-500/[0.05] px-3 text-[10px] font-black text-red-700 dark:text-red-300"
                              >
                                Revoke
                              </button>
                            )
                          }
                        </div>
                      </div>

                      {
                        issuedLink &&
                        (
                          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-2 sm:flex-row sm:items-center">
                            <input
                              readOnly
                              value={
                                issuedLink
                              }
                              className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] px-2 text-[10px]"
                            />
                            <button
                              type="button"
                              onClick={
                                async () => {
                                  try {
                                    await navigator
                                      .clipboard
                                      .writeText(
                                        issuedLink,
                                      );

                                    setIssueMessage(
                                      'Secure portal link copied.',
                                    );
                                  } catch {
                                    setIssueMessage(
                                      'Copy the secure portal link manually.',
                                    );
                                  }
                                }
                              }
                              className="h-9 rounded-lg border border-[var(--sami-border)] px-3 text-[10px] font-black"
                            >
                              Copy link
                            </button>
                          </div>
                        )
                      }
                    </div>
                  );
                },
              )
            }
          </div>
        </section>

        <section className="sami-surface rounded-[24px] p-4 sm:p-5">
          <div>
            <p className="text-sm font-black">
              Customer message inbox
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              Reply to invoice questions, disputes and payment promises. Replies are retained in the customer portal history.
            </p>
          </div>

          <div className="mt-4 max-h-[720px] space-y-3 overflow-auto pr-1">
            {
              openMessages.map(
                message => (
                  <div
                    key={
                      message.id
                    }
                    className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-black">
                          {
                            message.customerName
                          }
                        </p>
                        <p className="mt-1 text-[9px] font-black uppercase tracking-[0.08em] text-slate-600 dark:text-slate-300">
                          {
                            message.category
                              .replaceAll(
                                '_',
                                ' ',
                              )
                          }{
                            message.invoiceNumber
                              ? ' · ' +
                                message.invoiceNumber
                              : ''
                          }
                        </p>
                      </div>

                      <p className="text-[9px] font-semibold text-slate-600 dark:text-slate-300">
                        {
                          displayDateTime(
                            message.createdAt,
                          )
                        }
                      </p>
                    </div>

                    {
                      message.subject &&
                      (
                        <p className="mt-3 text-xs font-black">
                          {
                            message.subject
                          }
                        </p>
                      )
                    }

                    <p className="mt-1 whitespace-pre-line text-xs leading-5">
                      {
                        message.body
                      }
                    </p>

                    {
                      message.promisedAmount !==
                        null &&
                      (
                        <p className="mt-2 rounded-xl bg-emerald-500/[0.08] px-3 py-2 text-[10px] font-black text-emerald-800 dark:text-emerald-200">
                          Payment promise: {
                            formatMoney(
                              message.promisedAmount,
                              data.company
                                .currency,
                            )
                          } by {
                            message.promisedDate ||
                            'date not set'
                          }
                        </p>
                      )
                    }

                    {
                      data.capabilities
                        .canManagePortal &&
                      (
                        <form
                          className="mt-3"
                          onSubmit={
                            async event => {
                              event.preventDefault();

                              const form =
                                new FormData(
                                  event.currentTarget,
                                );

                              const reply =
                                String(
                                  form.get(
                                    'reply',
                                  ) ||
                                  '',
                                )
                                  .trim();

                              if (
                                !reply
                              ) {
                                return;
                              }

                              const saved =
                                await run(
                                  {
                                    action:
                                      'reply_customer_portal_message',
                                    messageId:
                                      message.id,
                                    body:
                                      reply,
                                  },
                                  'Portal reply sent.',
                                );

                              if (
                                saved
                              ) {
                                event
                                  .currentTarget
                                  .reset();
                              }
                            }
                          }
                        >
                          <textarea
                            name="reply"
                            rows={
                              3
                            }
                            maxLength={
                              5000
                            }
                            required
                            placeholder="Write a reply…"
                            className="w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2 text-xs leading-5 placeholder:text-slate-500"
                          />

                          <div className="mt-2 flex flex-wrap justify-end gap-2">
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
                                        'resolve_customer_portal_message',
                                      messageId:
                                        message.id,
                                    },
                                    'Portal message resolved.',
                                  )
                              }
                              className="h-9 rounded-xl border border-[var(--sami-border)] px-3 text-[10px] font-black"
                            >
                              Resolve
                            </button>

                            <button
                              type="submit"
                              disabled={
                                pending
                              }
                              className="h-9 rounded-xl bg-blue-600 px-3 text-[10px] font-black text-white"
                            >
                              Reply & resolve
                            </button>
                          </div>
                        </form>
                      )
                    }
                  </div>
                ),
              )
            }

            {
              openMessages.length ===
                0 &&
              (
                <p className="py-8 text-center text-xs text-slate-600 dark:text-slate-300">
                  No open customer portal messages.
                </p>
              )
            }
          </div>
        </section>
      </div>

      <section className="sami-surface overflow-hidden rounded-[24px]">
        <div className="border-b border-[var(--sami-border)] px-4 py-4 sm:px-5">
          <p className="text-sm font-black">
            Portal message history
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Customer messages and business replies stay visible for audit and follow-up.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="bg-[var(--sami-surface-soft)] text-[9px] font-black uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Direction</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sami-border)]">
              {
                data.portalMessages
                  .slice(
                    0,
                    200,
                  )
                  .map(
                    message => (
                      <tr
                        key={
                          message.id
                        }
                      >
                        <td className="px-4 py-3 font-bold">
                          {
                            message.customerName
                          }
                        </td>
                        <td className="px-4 py-3">
                          {
                            message.invoiceNumber ||
                            '—'
                          }
                        </td>
                        <td className="px-4 py-3 capitalize">
                          {
                            message.category
                              .replaceAll(
                                '_',
                                ' ',
                              )
                          }
                        </td>
                        <td className="px-4 py-3 capitalize">
                          {
                            message.direction
                              .replaceAll(
                                '_',
                                ' ',
                              )
                          }
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill
                            value={
                              message.status
                            }
                          />
                        </td>
                        <td className="px-4 py-3">
                          {
                            displayDateTime(
                              message.createdAt,
                            )
                          }
                        </td>
                      </tr>
                    ),
                  )
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}


function RemindersAndDunning({
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
  const defaultPolicy =
    data.dunningPolicies.find(
      policy =>
        policy.isDefault,
    ) ||
    data.dunningPolicies[0] ||
    null;

  const initialStages =
    defaultPolicy
      ?.stages.length
      ? defaultPolicy.stages.map(
          stage => ({
            name:
              stage.name,
            offsetDays:
              stage.offsetDays,
            severity:
              stage.severity,
            channels:
              [
                ...stage.channels,
              ],
            autoSend:
              stage.autoSend,
            retryLimit:
              stage.retryLimit,
            retryDelayMinutes:
              stage.retryDelayMinutes,
          }),
        )
      : [
          {
            name:
              '3 days before due',
            offsetDays:
              -3,
            severity:
              'friendly',
            channels: [
              'email',
            ],
            autoSend:
              true,
            retryLimit:
              3,
            retryDelayMinutes:
              60,
          },
          {
            name:
              '1 day overdue',
            offsetDays:
              1,
            severity:
              'friendly',
            channels: [
              'email',
            ],
            autoSend:
              true,
            retryLimit:
              3,
            retryDelayMinutes:
              60,
          },
          {
            name:
              '7 days overdue',
            offsetDays:
              7,
            severity:
              'firm',
            channels: [
              'email',
            ],
            autoSend:
              true,
            retryLimit:
              3,
            retryDelayMinutes:
              60,
          },
          {
            name:
              '14 days overdue',
            offsetDays:
              14,
            severity:
              'final',
            channels: [
              'email',
            ],
            autoSend:
              true,
            retryLimit:
              3,
            retryDelayMinutes:
              60,
          },
        ];

  const [
    policyName,
    setPolicyName,
  ] =
    useState(
      defaultPolicy?.name ||
      'Standard payment follow-up',
    );

  const [
    stages,
    setStages,
  ] =
    useState(
      initialStages,
    );

  useEffect(
    () => {
      setPolicyName(
        defaultPolicy?.name ||
        'Standard payment follow-up',
      );

      setStages(
        defaultPolicy
          ?.stages.length
          ? defaultPolicy.stages.map(
              stage => ({
                name:
                  stage.name,
                offsetDays:
                  stage.offsetDays,
                severity:
                  stage.severity,
                channels: [
                  ...stage.channels,
                ],
                autoSend:
                  stage.autoSend,
                retryLimit:
                  stage.retryLimit,
                retryDelayMinutes:
                  stage.retryDelayMinutes,
              }),
            )
          : initialStages,
      );
    },
    [
      defaultPolicy?.id,
    ],
  );

  const failed =
    data.reminders.filter(
      reminder =>
        reminder.status ===
        'failed',
    ).length;

  const pendingReminders =
    data.reminders.filter(
      reminder =>
        reminder.status ===
          'scheduled' ||
        reminder.status ===
          'sending',
    ).length;

  const sent =
    data.reminders.filter(
      reminder =>
        reminder.status ===
        'sent',
    ).length;

  const overdueInvoices =
    data.invoices.filter(
      invoice =>
        invoice.balanceDue >
          0 &&
        (
          invoice.daysOverdue >
            0 ||
          invoice.status ===
            'overdue'
        ),
    );

  const customersWithBalance =
    data.customers.filter(
      customer =>
        customer.outstandingTotal >
        0,
    );

  function updateStage(
    index:
      number,
    patch:
      Record<
        string,
        unknown
      >,
  ) {
    setStages(
      current =>
        current.map(
          (
            stage,
            stageIndex,
          ) =>
            stageIndex ===
              index
              ? {
                  ...stage,
                  ...patch,
                }
              : stage,
        ),
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="sami-surface rounded-[20px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
            Overdue invoices
          </p>
          <p className="mt-2 text-2xl font-black">
            {
              overdueInvoices.length
            }
          </p>
        </div>

        <div className="sami-surface rounded-[20px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
            Reminders sent
          </p>
          <p className="mt-2 text-2xl font-black">
            {
              sent
            }
          </p>
        </div>

        <div className="sami-surface rounded-[20px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
            Pending / retrying
          </p>
          <p className="mt-2 text-2xl font-black">
            {
              pendingReminders
            }
          </p>
        </div>

        <div className="sami-surface rounded-[20px] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">
            Failed
          </p>
          <p className="mt-2 text-2xl font-black">
            {
              failed
            }
          </p>
        </div>
      </div>

      {
        data.capabilities
          .canManageDunning &&
        (
          <section className="sami-surface rounded-[24px] p-4 sm:p-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-black">
                  Dunning policy
                </p>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
                  SaMi selects the latest eligible stage for each unpaid invoice. Failed channel deliveries retry independently and never create duplicate stage sends.
                </p>
              </div>

              <button
                type="button"
                disabled={
                  pending
                }
                onClick={
                  async () => {
                    await run(
                      {
                        action:
                          'save_dunning_policy',
                        policyId:
                          defaultPolicy?.id ||
                          undefined,
                        name:
                          policyName,
                        stages,
                      },
                      'Dunning policy saved.',
                    );
                  }
                }
                className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:cursor-not-allowed"
              >
                Save dunning policy
              </button>
            </div>

            <div className="mt-4 max-w-xl">
              <label className="block min-w-0 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-600 dark:text-slate-300">
                  Policy name
                </span>
                <input
                  value={
                    policyName
                  }
                  onChange={
                    event =>
                      setPolicyName(
                        event.target
                          .value,
                      )
                  }
                  className="h-11 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 space-y-3">
              {
                stages.map(
                  (
                    stage,
                    index,
                  ) => (
                    <div
                      key={
                        String(
                          index,
                        ) +
                        ':' +
                        stage.offsetDays
                      }
                      className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface-soft)] p-3"
                    >
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                        <label className="block space-y-1 xl:col-span-2">
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300">
                            Stage name
                          </span>
                          <input
                            value={
                              stage.name
                            }
                            onChange={
                              event =>
                                updateStage(
                                  index,
                                  {
                                    name:
                                      event.target
                                        .value,
                                  },
                                )
                            }
                            className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs"
                          />
                        </label>

                        <label className="block min-w-0 space-y-1">
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300">
                            Due offset
                          </span>
                          <input
                            type="number"
                            min="-365"
                            max="3650"
                            value={
                              stage.offsetDays
                            }
                            onChange={
                              event =>
                                updateStage(
                                  index,
                                  {
                                    offsetDays:
                                      Number(
                                        event.target
                                          .value,
                                      ),
                                  },
                                )
                            }
                            className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs"
                          />
                        </label>

                        <label className="block min-w-0 space-y-1">
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300">
                            Tone
                          </span>
                          <select
                            value={
                              stage.severity
                            }
                            onChange={
                              event =>
                                updateStage(
                                  index,
                                  {
                                    severity:
                                      event.target
                                        .value,
                                  },
                                )
                            }
                            className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs"
                          >
                            <option value="friendly">
                              Friendly
                            </option>
                            <option value="firm">
                              Firm
                            </option>
                            <option value="final">
                              Final
                            </option>
                          </select>
                        </label>

                        <label className="block min-w-0 space-y-1">
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300">
                            Retry limit
                          </span>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={
                              stage.retryLimit
                            }
                            onChange={
                              event =>
                                updateStage(
                                  index,
                                  {
                                    retryLimit:
                                      Number(
                                        event.target
                                          .value,
                                      ),
                                  },
                                )
                            }
                            className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs"
                          />
                        </label>

                        <label className="block min-w-0 space-y-1">
                          <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300">
                            Retry delay min
                          </span>
                          <input
                            type="number"
                            min="5"
                            max="10080"
                            value={
                              stage.retryDelayMinutes
                            }
                            onChange={
                              event =>
                                updateStage(
                                  index,
                                  {
                                    retryDelayMinutes:
                                      Number(
                                        event.target
                                          .value,
                                      ),
                                  },
                                )
                            }
                            className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-xs"
                          />
                        </label>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {
                          [
                            'email',
                            'whatsapp',
                            'sms',
                          ].map(
                            channel => {
                              const checked =
                                stage.channels
                                  .includes(
                                    channel,
                                  );

                              return (
                                <label
                                  key={
                                    channel
                                  }
                                  className="flex items-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2 text-[10px] font-black"
                                >
                                  <input
                                    type="checkbox"
                                    checked={
                                      checked
                                    }
                                    onChange={
                                      event => {
                                        const channels =
                                          event.target
                                            .checked
                                            ? [
                                                ...stage.channels,
                                                channel,
                                              ]
                                            : stage.channels
                                                .filter(
                                                  value =>
                                                    value !==
                                                    channel,
                                                );

                                        updateStage(
                                          index,
                                          {
                                            channels,
                                          },
                                        );
                                      }
                                    }
                                  />
                                  {
                                    channel
                                  }
                                </label>
                              );
                            },
                          )
                        }

                        <label className="flex items-center gap-2 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 py-2 text-[10px] font-black">
                          <input
                            type="checkbox"
                            checked={
                              stage.autoSend
                            }
                            onChange={
                              event =>
                                updateStage(
                                  index,
                                  {
                                    autoSend:
                                      event.target
                                        .checked,
                                  },
                                )
                            }
                          />
                          Auto-send
                        </label>

                        <button
                          type="button"
                          disabled={
                            stages.length <=
                            1
                          }
                          onClick={
                            () =>
                              setStages(
                                current =>
                                  current.filter(
                                    (
                                      _,
                                      stageIndex,
                                    ) =>
                                      stageIndex !==
                                      index,
                                  ),
                              )
                          }
                          className="ml-auto h-9 rounded-xl border border-red-500/30 px-3 text-[10px] font-black text-red-700 disabled:opacity-50 dark:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ),
                )
              }
            </div>

            <button
              type="button"
              onClick={
                () => {
                  const lastOffset =
                    stages[
                      stages.length -
                      1
                    ]?.offsetDays ||
                    0;

                  setStages(
                    current => [
                      ...current,
                      {
                        name:
                          'Next collection stage',
                        offsetDays:
                          Math.max(
                            1,
                            lastOffset +
                            7,
                          ),
                        severity:
                          'firm',
                        channels: [
                          'email',
                        ],
                        autoSend:
                          true,
                        retryLimit:
                          3,
                        retryDelayMinutes:
                          60,
                      },
                    ],
                  );
                }
              }
              className="mt-3 h-9 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-3 text-[10px] font-black"
            >
              Add stage
            </button>
          </section>
        )
      }

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="sami-surface rounded-[24px] p-4 sm:p-5">
          <p className="text-sm font-black">
            Invoice collection controls
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Pause one invoice without silencing the customer&apos;s other invoices.
          </p>

          <div className="mt-3 max-h-[520px] space-y-2 overflow-auto pr-1">
            {
              overdueInvoices
                .slice(
                  0,
                  50,
                )
                .map(
                  invoice => (
                    <form
                      key={
                        invoice.id
                      }
                      className="rounded-2xl border border-[var(--sami-border)] p-3"
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
                                'set_invoice_reminder_control',
                              invoiceId:
                                invoice.id,
                              mode:
                                form.get(
                                  'mode',
                                ),
                              pauseUntil:
                                form.get(
                                  'pauseUntil',
                                ),
                              reason:
                                form.get(
                                  'reason',
                                ),
                            },
                            'Invoice reminder control updated.',
                          );
                        }
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link
                            href={
                              '/apps/invoicing/' +
                              invoice.id
                            }
                            className="text-xs font-black text-blue-700 hover:underline dark:text-blue-300"
                          >
                            {
                              invoice.invoiceNumber
                            }
                          </Link>
                          <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">
                            {
                              invoice.customerName
                            } · {
                              invoice.daysOverdue
                            } days overdue · {
                              formatMoney(
                                invoice.balanceDue,
                                invoice.currency,
                              )
                            }
                          </p>
                        </div>

                        <button
                          type="submit"
                          disabled={
                            pending
                          }
                          className="h-8 rounded-lg bg-blue-600 px-2.5 text-[9px] font-black text-white"
                        >
                          Save
                        </button>
                      </div>

                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <select
                          name="mode"
                          defaultValue={
                            invoice.reminderMode
                          }
                          className="h-9 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-2 text-[10px] font-bold"
                        >
                          <option value="inherit">Inherit</option>
                          <option value="enabled">Enabled</option>
                          <option value="paused">Paused</option>
                          <option value="disabled">Disabled</option>
                        </select>
                        <input
                          type="datetime-local"
                          name="pauseUntil"
                          defaultValue={
                            invoice.reminderPauseUntil
                              ?.slice(
                                0,
                                16,
                              ) ||
                            ''
                          }
                          className="h-9 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-2 text-[10px]"
                        />
                        <input
                          name="reason"
                          defaultValue={
                            invoice.reminderPauseReason ||
                            ''
                          }
                          placeholder="Pause/disable reason"
                          className="h-9 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-2 text-[10px]"
                        />
                      </div>
                    </form>
                  ),
                )
            }

            {
              overdueInvoices.length ===
                0 &&
              (
                <p className="py-8 text-center text-xs text-slate-600 dark:text-slate-300">
                  No overdue invoices need collection controls.
                </p>
              )
            }
          </div>
        </section>

        <section className="sami-surface rounded-[24px] p-4 sm:p-5">
          <p className="text-sm font-black">
            Customer reminder controls
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Apply a collection hold across all invoices for one customer.
          </p>

          <div className="mt-3 max-h-[520px] space-y-2 overflow-auto pr-1">
            {
              customersWithBalance
                .slice(
                  0,
                  50,
                )
                .map(
                  customer => (
                    <form
                      key={
                        customer.id
                      }
                      className="rounded-2xl border border-[var(--sami-border)] p-3"
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
                                'set_customer_reminder_control',
                              customerId:
                                customer.id,
                              mode:
                                form.get(
                                  'mode',
                                ),
                              pauseUntil:
                                form.get(
                                  'pauseUntil',
                                ),
                              reason:
                                form.get(
                                  'reason',
                                ),
                            },
                            'Customer reminder control updated.',
                          );
                        }
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black">
                            {
                              customer.name
                            }
                          </p>
                          <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">
                            Outstanding {
                              formatMoney(
                                customer.outstandingTotal,
                                customer.currency,
                              )
                            }
                          </p>
                        </div>

                        <button
                          type="submit"
                          disabled={
                            pending
                          }
                          className="h-8 rounded-lg bg-blue-600 px-2.5 text-[9px] font-black text-white"
                        >
                          Save
                        </button>
                      </div>

                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <select
                          name="mode"
                          defaultValue={
                            customer.reminderMode
                          }
                          className="h-9 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-2 text-[10px] font-bold"
                        >
                          <option value="inherit">Inherit</option>
                          <option value="enabled">Enabled</option>
                          <option value="paused">Paused</option>
                          <option value="disabled">Disabled</option>
                        </select>
                        <input
                          type="datetime-local"
                          name="pauseUntil"
                          defaultValue={
                            customer.reminderPauseUntil
                              ?.slice(
                                0,
                                16,
                              ) ||
                            ''
                          }
                          className="h-9 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-2 text-[10px]"
                        />
                        <input
                          name="reason"
                          defaultValue={
                            customer.reminderPauseReason ||
                            ''
                          }
                          placeholder="Pause/disable reason"
                          className="h-9 rounded-xl border border-[var(--sami-border)] bg-[var(--sami-surface)] px-2 text-[10px]"
                        />
                      </div>
                    </form>
                  ),
                )
            }
          </div>
        </section>
      </div>

      <section className="sami-surface overflow-hidden rounded-[24px]">
        <div className="border-b border-[var(--sami-border)] p-4 sm:p-5">
          <p className="text-sm font-black">
            Reminder delivery history
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Every automatic, manual and retried reminder is retained with its stage, channel, attempt count and failure outcome.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-xs">
            <thead className="bg-[var(--sami-surface-soft)] text-[9px] font-black uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last / next</th>
                <th className="px-4 py-3">Failure</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sami-border)]">
              {
                data.reminders.map(
                  reminder => (
                    <tr
                      key={
                        reminder.id
                      }
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={
                            '/apps/invoicing/' +
                            reminder.invoiceId
                          }
                          className="font-black text-blue-700 hover:underline dark:text-blue-300"
                        >
                          {
                            reminder.invoiceNumber
                          }
                        </Link>
                        <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">
                          {
                            reminder.customerName
                          }
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold">
                          {
                            reminder.stageName
                          }
                        </p>
                        <p className="mt-1 text-[9px] uppercase text-slate-600 dark:text-slate-300">
                          {
                            reminder.severity
                          } · {
                            reminder.source
                          }
                        </p>
                      </td>
                      <td className="px-4 py-3 font-bold">
                        {
                          reminder.channel
                        }
                      </td>
                      <td className="px-4 py-3 font-bold">
                        {
                          reminder.attemptCount
                        } / {
                          reminder.maxAttempts
                        }
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill
                          value={
                            reminder.status
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">
                          {
                            displayDateTime(
                              reminder.lastAttemptAt ||
                              reminder.scheduledFor,
                            )
                          }
                        </p>
                        {
                          reminder.nextAttemptAt &&
                          (
                            <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">
                              Retry {
                                displayDateTime(
                                  reminder.nextAttemptAt,
                                )
                              }
                            </p>
                          )
                        }
                      </td>
                      <td className="max-w-[260px] px-4 py-3">
                        <p className="break-words whitespace-normal font-semibold">
                          {
                            reminder.failureCode ||
                            reminder.failureMessage ||
                            '—'
                          }
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {
                          reminder.status ===
                            'failed' &&
                          reminder.attemptCount <
                            reminder.maxAttempts
                            ? (
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
                                            'retry_reminder',
                                          reminderId:
                                            reminder.id,
                                        },
                                        'Reminder retry queued.',
                                      )
                                  }
                                  className="h-8 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-2.5 text-[9px] font-black text-amber-800 dark:text-amber-200"
                                >
                                  Retry
                                </button>
                              )
                            : (
                                <span className="text-[10px] text-slate-600 dark:text-slate-300">
                                  —
                                </span>
                              )
                        }
                      </td>
                    </tr>
                  ),
                )
              }

              {
                data.reminders.length ===
                  0 &&
                (
                  <tr>
                    <td
                      colSpan={
                        8
                      }
                      className="px-4 py-10 text-center text-xs text-slate-600 dark:text-slate-300"
                    >
                      No reminder attempts have been recorded yet.
                    </td>
                  </tr>
                )
              }
            </tbody>
          </table>
        </div>
      </section>
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
    <InvoicingReportsWorkspace
      data={
        data
      }
    />
  );
}

type InvoicingSettingsSection =
  | 'general'
  | 'workflow'
  | 'reminders'
  | 'portal'
  | 'documents'
  | 'appearance'
  | 'paymentTerms'
  | 'taxRates';


type InvoicingSettingsRun =
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


const INVOICING_SETTINGS_SECTIONS:
  Array<{
    key:
      InvoicingSettingsSection;
    label:
      string;
    description:
      string;
  }> = [
    {
      key:
        'general',
      label:
        'General',
      description:
        'Currency, due dates and tax defaults',
    },
    {
      key:
        'workflow',
      label:
        'Workflow',
      description:
        'Approvals and payment behavior',
    },
    {
      key:
        'reminders',
      label:
        'Reminders',
      description:
        'Dunning defaults and delivery channels',
    },
    {
      key:
        'portal',
      label:
        'Portal',
      description:
        'Customer self-service controls',
    },
    {
      key:
        'documents',
      label:
        'Documents',
      description:
        'Instructions, bank details and terms',
    },
    {
      key:
        'appearance',
      label:
        'Appearance',
      description:
        'Invoice templates and presentation',
    },
    {
      key:
        'paymentTerms',
      label:
        'Payment terms',
      description:
        'Reusable customer due-date policies',
    },
    {
      key:
        'taxRates',
      label:
        'Tax rates',
      description:
        'Reusable basic invoice tax rates',
    },
  ];


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
    InvoicingSettingsRun;
}) {
  const [
    section,
    setSection,
  ] =
    useState<InvoicingSettingsSection>(
      'general',
    );

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

  const activeSection =
    INVOICING_SETTINGS_SECTIONS
      .find(
        item =>
          item.key ===
          section,
      ) ||
    INVOICING_SETTINGS_SECTIONS[
      0
    ];

  return (
    <div className="space-y-4">
      <section className="sami-surface overflow-hidden rounded-[24px]">
        <div className="border-b border-[var(--sami-border)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-950 dark:text-white">
                Invoicing settings
              </p>

              <p className="mt-1 max-w-3xl break-words text-xs leading-5 text-slate-500 dark:text-slate-400">
                Configure one area at a time. Company billing defaults stay inside Invoicing; provider credentials remain in SaMi Integrations/Core, and tutorials are enabled from Workspace Settings.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/apps/invoicing/currencies"
                className="inline-flex min-h-9 items-center rounded-xl border border-[var(--sami-border)] px-3 text-[10px] font-black text-slate-600 dark:text-slate-300"
              >
                Currency Center
              </Link>

              <Link
                href="/apps/invoicing/tax-engine"
                className="inline-flex min-h-9 items-center rounded-xl border border-[var(--sami-border)] px-3 text-[10px] font-black text-slate-600 dark:text-slate-300"
              >
                Tax Engine
              </Link>

              <Link
                href="/apps/invoicing/etims"
                className="inline-flex min-h-9 items-center rounded-xl border border-[var(--sami-border)] px-3 text-[10px] font-black text-slate-600 dark:text-slate-300"
              >
                Kenya eTIMS
              </Link>
            </div>
          </div>

          <div className="-mx-1 mt-4 overflow-x-auto pb-1">
            <div
              role="tablist"
              aria-label="Invoicing settings sections"
              className="flex min-w-max gap-2 px-1"
            >
              {
                INVOICING_SETTINGS_SECTIONS
                  .map(
                    item => {
                      const active =
                        item.key ===
                        section;

                      return (
                        <button
                          key={
                            item.key
                          }
                          type="button"
                          role="tab"
                          aria-selected={
                            active
                          }
                          onClick={
                            () =>
                              setSection(
                                item.key,
                              )
                          }
                          className={[
                            'min-h-10 rounded-xl border px-3 py-2 text-left transition',
                            active
                              ? 'border-blue-300 bg-blue-50 text-blue-800 shadow-sm dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200'
                              : 'border-[var(--sami-border)] bg-[var(--sami-surface)] text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white',
                          ].join(
                            ' ',
                          )}
                        >
                          <span className="block whitespace-nowrap text-[11px] font-black">
                            {
                              item.label
                            }
                          </span>

                          <span className="mt-0.5 hidden whitespace-nowrap text-[9px] font-semibold opacity-70 sm:block">
                            {
                              item.description
                            }
                          </span>
                        </button>
                      );
                    },
                  )
              }
            </div>
          </div>
        </div>

        <div className="bg-[var(--sami-surface-soft)] px-4 py-3 sm:px-5">
          <p className="break-words text-xs font-black text-slate-900 dark:text-white">
            {
              activeSection
                .label
            }
          </p>

          <p className="mt-0.5 break-words text-[10px] leading-4 text-slate-500 dark:text-slate-400">
            {
              activeSection
                .description
            }
          </p>
        </div>
      </section>

      {
        (
          section ===
            'general' ||
          section ===
            'workflow' ||
          section ===
            'reminders' ||
          section ===
            'portal' ||
          section ===
            'documents'
        ) &&
        (
          <CommercialSettingsForm
            data={
              data
            }
            pending={
              pending
            }
            run={
              run
            }
            section={
              section
            }
          />
        )
      }

      {
        section ===
          'appearance' &&
        (
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
        )
      }

      {
        section ===
          'paymentTerms' &&
        (
          <PaymentTermsSettings
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
        )
      }

      {
        section ===
          'taxRates' &&
        (
          <TaxRatesSettings
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
        )
      }
    </div>
  );
}


function CommercialSettingsForm({
  data,
  pending,
  run,
  section,
}: {
  data:
    InvoicingWorkspaceData;
  pending:
    boolean;
  run:
    InvoicingSettingsRun;
  section:
    'general' |
    'workflow' |
    'reminders' |
    'portal' |
    'documents';
}) {
  return (
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
              exchangeRateMode:
                form.get(
                  'exchangeRateMode',
                ),
              allowCrossCurrencyPayments:
                form.get(
                  'allowCrossCurrencyPayments',
                ) ===
                'on',
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
              portalEnabled:
                form.get(
                  'portalEnabled',
                ) ===
                'on',
              portalAccessDays:
                form.get(
                  'portalAccessDays',
                ),
              portalAllowMessages:
                form.get(
                  'portalAllowMessages',
                ) ===
                'on',
              portalShowPaymentHistory:
                form.get(
                  'portalShowPaymentHistory',
                ) ===
                'on',
              portalShowCreditNotes:
                form.get(
                  'portalShowCreditNotes',
                ) ===
                'on',
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
      <div
        className={
          section ===
            'general'
            ? 'block'
            : 'hidden'
        }
      >
        <div>
          <p className="text-sm font-black">
            General billing defaults
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Defaults apply to the current company. Currency rates and advanced tax rules are maintained in their dedicated Invoicing workspaces.
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block min-w-0 space-y-1">
            <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
              Default currency
            </span>

            <select
              name="defaultCurrency"
              defaultValue={
                data.settings
                  .defaultCurrency
              }
              className="h-11 w-full min-w-0 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
            >
              {
                data.currencies
                  .filter(
                    currency =>
                      currency.isActive,
                  )
                  .map(
                    currency => (
                      <option
                        key={
                          currency.id
                        }
                        value={
                          currency.code
                        }
                      >
                        {
                          currency.code
                        } — {
                          currency.name
                        }
                      </option>
                    ),
                  )
              }
            </select>
          </label>

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

          <label className="block min-w-0 space-y-1">
            <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
              Exchange-rate mode
            </span>

            <select
              name="exchangeRateMode"
              defaultValue={
                data.settings
                  .exchangeRateMode
              }
              className="h-11 w-full min-w-0 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
            >
              <option value="table">
                Dated Currency Center rates
              </option>
              <option value="manual">
                Manual override allowed
              </option>
            </select>
          </label>

          <label className="block min-w-0 space-y-1">
            <span className="break-words text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">
              Tax calculation
            </span>

            <select
              name="taxCalculation"
              defaultValue={
                data.settings
                  .taxCalculation
              }
              className="h-11 w-full min-w-0 rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
            >
              <option value="exclusive">
                Tax exclusive
              </option>
              <option value="inclusive">
                Tax inclusive
              </option>
            </select>
          </label>
        </div>
      </div>

      <div
        className={
          section ===
            'workflow'
            ? 'block'
            : 'hidden'
        }
      >
        <div>
          <p className="text-sm font-black">
            Invoice workflow
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Control approval, settlement and recurring behavior without weakening the invoice state machine or audit trail.
          </p>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <Toggle
            name="allowCrossCurrencyPayments"
            label="Cross-currency payments"
            defaultChecked={
              data.settings
                .allowCrossCurrencyPayments
            }
          />

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
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/apps/invoicing/payment-plans"
            className="inline-flex min-h-9 items-center rounded-xl border border-[var(--sami-border)] px-3 text-[10px] font-black"
          >
            Payment plans
          </Link>

          <Link
            href="/apps/invoicing/recurring"
            className="inline-flex min-h-9 items-center rounded-xl border border-[var(--sami-border)] px-3 text-[10px] font-black"
          >
            Recurring invoices
          </Link>
        </div>
      </div>

      <div
        className={
          section ===
            'reminders'
            ? 'block'
            : 'hidden'
        }
      >
        <div>
          <p className="text-sm font-black">
            Reminder defaults
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Configure the default reminder schedule and allowed delivery channels. Detailed dunning policies remain in the Reminders workspace.
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            label="Overdue reminder days"
            name="reminderDaysAfter"
            defaultValue={
              data.settings
                .reminderDaysAfter
                .join(
                  ', ',
                )
            }
          />

          <Toggle
            name="reminderEnabled"
            label="Payment reminders enabled"
            defaultChecked={
              data.settings
                .reminderEnabled
            }
          />
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--sami-border)] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-600 dark:text-slate-300">
            Delivery channels
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

        <div className="mt-4">
          <Link
            href="/apps/invoicing/reminders"
            className="inline-flex min-h-9 items-center rounded-xl border border-[var(--sami-border)] px-3 text-[10px] font-black"
          >
            Open Reminders workspace
          </Link>
        </div>
      </div>

      <div
        className={
          section ===
            'portal'
            ? 'block'
            : 'hidden'
        }
      >
        <div>
          <p className="text-sm font-black">
            Customer portal
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Control secure customer self-service. Portal links remain customer-scoped, revocable and time-limited.
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle
              name="portalEnabled"
              label="Enable customer portal"
              defaultChecked={
                data.settings
                  .portalEnabled
              }
            />

            <Toggle
              name="portalAllowMessages"
              label="Customer messages"
              defaultChecked={
                data.settings
                  .portalAllowMessages
              }
            />

            <Toggle
              name="portalShowPaymentHistory"
              label="Show payments"
              defaultChecked={
                data.settings
                  .portalShowPaymentHistory
              }
            />

            <Toggle
              name="portalShowCreditNotes"
              label="Show credits"
              defaultChecked={
                data.settings
                  .portalShowCreditNotes
              }
            />
          </div>

          <Field
            label="Portal access days"
            name="portalAccessDays"
            type="number"
            min="1"
            max="3650"
            required
            defaultValue={
              String(
                data.settings
                  .portalAccessDays,
              )
            }
          />
        </div>

        <div className="mt-4">
          <Link
            href="/apps/invoicing/portal"
            className="inline-flex min-h-9 items-center rounded-xl border border-[var(--sami-border)] px-3 text-[10px] font-black"
          >
            Open Customer Portal workspace
          </Link>
        </div>
      </div>

      <div
        className={
          section ===
            'documents'
            ? 'block'
            : 'hidden'
        }
      >
        <div>
          <p className="text-sm font-black">
            Document defaults
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            These values become the company-level defaults used on generated invoice documents.
          </p>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
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
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t border-[var(--sami-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="break-words text-[10px] leading-4 text-slate-400">
          Saving preserves all Invoicing defaults, including settings from the other tabs.
        </p>

        <button
          type="submit"
          disabled={
            pending
          }
          className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
        >
          {
            pending
              ? 'Saving…'
              : 'Save settings'
          }
        </button>
      </div>
    </form>
  );
}


function PaymentTermsSettings({
  data,
  pending,
  run,
}: {
  data:
    InvoicingWorkspaceData;
  pending:
    boolean;
  run:
    InvoicingSettingsRun;
}) {
  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-black">
            Payment terms
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Reusable company terms drive customer invoice due dates. Historical invoices keep their issued dates.
          </p>
        </div>

        <span className="inline-flex w-fit rounded-full bg-[var(--sami-surface-soft)] px-3 py-1 text-[10px] font-black text-slate-500">
          {
            data.paymentTerms
              .length
          } terms
        </span>
      </div>

      <form
        className="mt-4 rounded-2xl border border-[var(--sami-border)] p-3 sm:p-4"
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
        <p className="text-xs font-black">
          Add payment term
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
          Make current company default
        </label>

        <button
          type="submit"
          disabled={
            pending
          }
          className="mt-4 h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
        >
          Add payment term
        </button>
      </form>

      <div className="mt-4 space-y-2">
        {
          data.paymentTerms
            .length ===
            0
            ? (
              <p className="rounded-2xl border border-dashed border-[var(--sami-border)] px-4 py-8 text-center text-xs text-slate-500">
                No payment terms yet.
              </p>
            )
            : data.paymentTerms
                .map(
                  term => (
                    <details
                      key={
                        term.id
                      }
                      className="overflow-hidden rounded-xl border border-[var(--sami-border)]"
                    >
                      <summary className="cursor-pointer list-none px-3 py-3">
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words whitespace-normal text-xs font-black">
                              {
                                term.name
                              } · {
                                term.dueDays
                              } days
                            </p>

                            <p className="mt-1 text-[10px] text-slate-400">
                              {
                                term.isDefault
                                  ? 'Company default'
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
                          Current company default
                        </label>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
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
                                void run(
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
    </section>
  );
}


function TaxRatesSettings({
  data,
  pending,
  run,
}: {
  data:
    InvoicingWorkspaceData;
  pending:
    boolean;
  run:
    InvoicingSettingsRun;
}) {
  return (
    <section className="sami-surface rounded-[24px] p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-black">
            Basic tax rates
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Maintain reusable invoice rates here. Use Tax Engine for groups, fiscal positions, exemptions, localizations and rule priority.
          </p>
        </div>

        <Link
          href="/apps/invoicing/tax-engine"
          className="inline-flex min-h-9 w-fit items-center rounded-xl border border-[var(--sami-border)] px-3 text-[10px] font-black"
        >
          Open Tax Engine
        </Link>
      </div>

      <form
        className="mt-4 rounded-2xl border border-[var(--sami-border)] p-3 sm:p-4"
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
        <p className="text-xs font-black">
          Add tax rate
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
          Make current company default
        </label>

        <button
          type="submit"
          disabled={
            pending
          }
          className="mt-4 h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-60"
        >
          Add tax rate
        </button>
      </form>

      <div className="mt-4 space-y-2">
        {
          data.taxRates
            .length ===
            0
            ? (
              <p className="rounded-2xl border border-dashed border-[var(--sami-border)] px-4 py-8 text-center text-xs text-slate-500">
                No tax rates yet.
              </p>
            )
            : data.taxRates
                .map(
                  tax => (
                    <details
                      key={
                        tax.id
                      }
                      className="overflow-hidden rounded-xl border border-[var(--sami-border)]"
                    >
                      <summary className="cursor-pointer list-none px-3 py-3">
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words whitespace-normal text-xs font-black">
                              {
                                tax.name
                              } · {
                                tax.rate
                              }%
                            </p>

                            <p className="mt-1 text-[10px] text-slate-400">
                              {
                                tax.isDefault
                                  ? 'Company default'
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
                          Current company default
                        </label>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
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
                                void run(
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
    </section>
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
    <label className="flex min-w-0 items-start gap-2 rounded-xl border border-[var(--sami-border)] px-3 py-3 text-xs font-bold">
      <input
        type="checkbox"
        name={
          name
        }
        defaultChecked={
          defaultChecked
        }
        className="mt-0.5 shrink-0"
      />

      <span className="min-w-0 break-words leading-5">
        {
          label
        }
      </span>
    </label>
  );
}
