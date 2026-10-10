'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';

import Link from 'next/link';

import {
  BarChart3,
  Download,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';

import {
  useRouter,
} from 'next/navigation';

import SaMiOverlay from '@/app/components/SaMiOverlay';

import {
  useSaMiOverlay,
} from '@/app/components/useSaMiOverlay';

import WorkspaceTutorial, {
  type WorkspaceTutorialStep,
} from '@/app/components/workspace/WorkspaceTutorial';

import SalesQuoteComposer from '@/app/apps/sales/SalesQuoteComposer';

import SalesCustomersManager from '@/app/apps/sales/SalesCustomersManager';

import SalesTemplatesManager from '@/app/apps/sales/SalesTemplatesManager';

import SalesQuotePdfBuilder from '@/app/apps/sales/SalesQuotePdfBuilder';

import SalesProductCatalogueManager from '@/app/apps/sales/SalesProductCatalogueManager';

import SalesPricelistsManager from '@/app/apps/sales/SalesPricelistsManager';

import SalesAdvancedPricingManager from '@/app/apps/sales/SalesAdvancedPricingManager';

import SalesCurrenciesManager from '@/app/apps/sales/SalesCurrenciesManager';

import SalesOrganizationManager from '@/app/apps/sales/SalesOrganizationManager';

import SalesOperationsManager from '@/app/apps/sales/SalesOperationsManager';

import SalesPipelineBoard from '@/app/apps/sales/SalesPipelineBoard';

import type {
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';


type View =
  | 'overview'
  | 'pipeline'
  | 'customers'
  | 'quotes'
  | 'newQuote'
  | 'templates'
  | 'pdfBuilder'
  | 'catalogue'
  | 'pricelists'
  | 'advancedPricing'
  | 'currencies'
  | 'orders'
  | 'organization'
  | 'operations'
  | 'reports'
  | 'settings';


const TUTORIAL:
  WorkspaceTutorialStep[] = [
    {
      id:
        'overview',
      section:
        'overview',
      title:
        'Read the sales pipeline',
      description:
        'Review quoted value, accepted business, converted orders and quotation response activity.',
    },
    {
      id:
        'pipeline',
      section:
        'pipeline',
      title:
        'Work the pipeline board',
      description:
        'Group open quotes into configurable stages with weighted probabilities, expected close dates and a live weighted-pipeline rollup.',
    },
    {
      id:
        'customers',
      section:
        'customers',
      title:
        'Maintain customers and contacts',
      description:
        'Create and edit the shared customer identity used by Sales quotations, orders and downstream Invoicing without duplicating master data.',
    },
    {
      id:
        'quotes',
      section:
        'quotes',
      title:
        'Create and control quotations',
      description:
        'Build quotes from customers and products, apply taxes and discounts, use approval rules, send securely and track customer response.',
    },
    {
      id:
        'templates',
      section:
        'templates',
      title:
        'Build quotation templates',
      description:
        'Create reusable quotation branding, notes, commercial terms and footer defaults without mixing template management into global Sales settings.',
    },
    {
      id:
        'pdf-builder',
      section:
        'pdfBuilder',
      title:
        'Build quotation PDFs',
      description:
        'Apply quotation templates to drafts, preview customer-facing presentation and open the real server-generated PDF.',
    },
    {
      id:
        'catalogue',
      section:
        'catalogue',
      title:
        'Maintain the Sales catalogue',
      description:
        'Create and edit the shared product and service master used by quotations and downstream invoices.',
    },
    {
      id:
        'pricelists',
      section:
        'pricelists',
      title:
        'Manage pricelists',
      description:
        'Set customer scope, currency, validity and precedence without mixing those controls with advanced pricing rules.',
    },
    {
      id:
        'advanced-pricing',
      section:
        'advancedPricing',
      title:
        'Configure advanced pricing',
      description:
        'Set product and quantity rules using fixed pricing, percentage discounts and markups.',
    },
    {
      id:
        'currencies',
      section:
        'currencies',
      title:
        'Control currency and FX',
      description:
        'Maintain dated exchange rates, review transaction-currency exposure and keep Sales reporting normalized to the company base currency.',
    },
    {
      id:
        'orders',
      section:
        'orders',
      title:
        'Run accepted sales',
      description:
        'Accepted quotations become sales orders. Track fulfillment separately from invoicing and create partial invoices safely.',
    },
    {
      id:
        'organization',
      section:
        'organization',
      title:
        'Manage the sales organization',
      description:
        'Build teams and territories, set quotas and manage commission plans against real sales-order performance.',
    },
    {
      id:
        'operations',
      section:
        'operations',
      title:
        'Run deposits, shipping and returns',
      description:
        'Track customer deposits, split shipments, carrier progress, returned stock, invoice credits, refunds and revenue outlook.',
    },
    {
      id:
        'reports',
      section:
        'reports',
      title:
        'Review performance',
      description:
        'Use status, monthly and customer reports to understand conversion and sales value.',
    },
    {
      id:
        'settings',
      section:
        'settings',
      title:
        'Set Sales policy',
      description:
        'Control quotation validity, approvals, ordered-vs-delivered invoicing, partial invoicing, online customer responses and branding.',
    },
  ];


function money(
  value:
    number,
  currency:
    string,
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
      value.toLocaleString()
    );
  }
}


function Status({
  value,
}: {
  value:
    string;
}) {
  const success =
    [
      'accepted',
      'converted',
      'approved',
      'fulfilled',
      'invoiced',
      'closed',
    ].includes(
      value,
    );

  const danger =
    [
      'rejected',
      'expired',
      'cancelled',
    ].includes(
      value,
    );

  return (
    <span
      className={[
        'inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ring-1 ring-inset',
        success
          ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300'
          : danger
            ? 'bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300'
            : 'bg-blue-500/10 text-blue-700 ring-blue-500/20 dark:text-blue-300',
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


function exportSales(
  data:
    SalesWorkspaceData,
) {
  const rows = [
    [
      'Type',
      'Number',
      'Customer',
      'Status',
      'Date',
      'Currency',
      'Amount',
    ],
    ...data.quotes.map(
      quote => [
        'Quotation',
        quote.quoteNumber,
        quote.customerName,
        quote.status,
        quote.quoteDate,
        quote.currency,
        quote.totalAmount,
      ],
    ),
    ...data.orders.map(
      order => [
        'Sales order',
        order.orderNumber,
        order.customerName,
        order.status,
        order.orderDate,
        order.currency,
        order.totalAmount,
      ],
    ),
  ];

  const csv =
    rows
      .map(
        row =>
          row
            .map(
              value =>
                '"' +
                String(
                  value ??
                  '',
                )
                  .replaceAll(
                    '"',
                    '""',
                  ) +
                '"',
            )
            .join(
              ',',
            ),
      )
      .join(
        '\n',
      );

  const url =
    URL.createObjectURL(
      new Blob(
        [
          csv,
        ],
        {
          type:
            'text/csv;charset=utf-8',
        },
      ),
    );

  const anchor =
    document.createElement(
      'a',
    );

  anchor.href =
    url;

  anchor.download =
    'sales-register-' +
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      ) +
    '.csv';

  document.body
    .appendChild(
      anchor,
    );

  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(
    url,
  );
}


export default function SalesWorkspaceClient({
  initialData,
  initialView =
    'overview',
  userId,
}: {
  initialData:
    SalesWorkspaceData;
  initialView?:
    View;
  userId:
    string;
}) {
  const router =
    useRouter();

  const [
    view,
    setView,
  ] =
    useState<View>(
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

  const [
    composerOpen,
    setComposerOpen,
  ] =
    useState(
      false,
    );

  const [
    requestBusy,
    setRequestBusy,
  ] =
    useState(
      false,
    );

  const [
    pending,
    startTransition,
  ] =
    useTransition();

  const inFlight =
    useRef(
      false,
    );

  const {
    overlay,
    closeOverlay,
    showSuccess,
    showError,
    showWarning,
  } =
    useSaMiOverlay();

  const busy =
    requestBusy ||
    pending;

  const visibleQuotes =
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
            .quotes;
        }

        return initialData
          .quotes
          .filter(
            quote =>
              [
                quote.quoteNumber,
                quote.customerName,
                quote.status,
                quote.approvalStatus,
                quote.reference ||
                '',
              ]
                .some(
                  value =>
                    value
                      .toLowerCase()
                      .includes(
                        query,
                      ),
                ),
          );
      },
      [
        initialData.quotes,
        search,
      ],
    );

  const visibleOrders =
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
            .orders;
        }

        return initialData
          .orders
          .filter(
            order =>
              [
                order.orderNumber,
                order.customerName,
                order.status,
                order.fulfillmentStatus,
                order.invoiceStatus,
              ]
                .some(
                  value =>
                    value
                      .toLowerCase()
                      .includes(
                        query,
                      ),
                ),
          );
      },
      [
        initialData.orders,
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
      inFlight.current
    ) {
      throw new Error(
        'Another Sales action is still being saved.',
      );
    }

    inFlight.current =
      true;

    setRequestBusy(
      true,
    );

    try {
      const response =
        await fetch(
          '/api/apps/sales',
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
          'SaMi could not complete the Sales action.',
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
      inFlight.current =
        false;

      setRequestBusy(
        false,
      );
    }
  }

  async function saveQuote(
    payload:
      Record<
        string,
        unknown
      >,
  ) {
    try {
      await request(
        payload,
      );

      setComposerOpen(
        false,
      );

      showSuccess(
        'Quotation saved',
        'The commercial document was saved successfully.',
      );

      return true;
    } catch (
      error
    ) {
      const message =
        error instanceof
          Error
          ? error.message
          : 'SaMi could not save this quotation.';

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
          'Quotation could not be saved',
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
        moduleKey="sales"
        title="Sales tutorial"
        steps={
          TUTORIAL
        }
        onStepChange={
          step => {
            const section =
              step.section as
                View |
                undefined;

            if (
              section
            ) {
              setView(
                section,
              );
            }
          }
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
                Sales command center
              </h1>

              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                Quotations, pipeline stages, pricing, teams, deposits, shipping, returns, commissions, customer responses, forecasting, fulfillment and invoice handoff in one controlled flow.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {
                initialData
                  .capabilities
                  .canCreate &&
                (
                  <button
                    type="button"
                    onClick={
                      () => {
                        setView(
                          'quotes',
                        );
                        setComposerOpen(
                          true,
                        );
                      }
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white"
                  >
                    <Plus className="h-4 w-4" />
                    New quotation
                  </button>
                )
              }

              {
                initialData.capabilities.canManageSettings && (
                  <Link
                    href="/apps/sales/approvals"
                    className="inline-flex h-10 items-center rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
                  >
                    Quote approvals
                  </Link>
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
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black disabled:opacity-60"
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
        </section>

        {
          view ===
            'overview' &&
          (
            <Overview
              data={
                initialData
              }
            />
          )
        }

        {
          view ===
            'pipeline' &&
          initialData
            .capabilities
            .canViewPipeline &&
          (
            <SalesPipelineBoard
              data={
                initialData
              }
              busy={
                busy
              }
              request={
                request
              }
              showSuccess={
                showSuccess
              }
              showError={
                showError
              }
            />
          )
        }

        {
          view ===
            'customers' &&
          initialData
            .capabilities
            .canUseBillingCustomers &&
          (
            <SalesCustomersManager
              data={
                initialData
              }
              busy={
                busy
              }
              request={
                request
              }
              showSuccess={
                showSuccess
              }
              showError={
                showError
              }
            />
          )
        }

        {
          view ===
            'quotes' &&
          (
            <section className="space-y-4">
              {
                composerOpen &&
                (
                  <div className="sami-surface rounded-[26px] p-4 sm:p-5">
                    <div className="mb-4">
                      <h2 className="text-lg font-black">
                        New quotation
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        Build the complete commercial offer once; SaMi preserves it through approval, acceptance, order and invoice conversion.
                      </p>
                    </div>

                    <SalesQuoteComposer
                      data={
                        initialData
                      }
                      busy={
                        busy
                      }
                      onSave={
                        saveQuote
                      }
                      onCancel={
                        () =>
                          setComposerOpen(
                            false,
                          )
                      }
                    />
                  </div>
                )
              }

              <Toolbar
                title="Quotations"
                search={
                  search
                }
                setSearch={
                  setSearch
                }
                onExport={
                  () =>
                    exportSales(
                      initialData,
                    )
                }
              />

              <div className="sami-surface overflow-hidden rounded-[24px]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="border-b border-[var(--sami-border)] bg-slate-500/[0.04] text-[10px] font-black uppercase tracking-[0.09em] text-slate-400">
                      <tr>
                        <th className="px-4 py-3">
                          Quotation
                        </th>
                        <th className="px-4 py-3">
                          Customer
                        </th>
                        <th className="px-4 py-3">
                          Stage
                        </th>
                        <th className="px-4 py-3">
                          Status
                        </th>
                        <th className="px-4 py-3">
                          Approval
                        </th>
                        <th className="px-4 py-3">
                          Valid until
                        </th>
                        <th className="px-4 py-3 text-right">
                          Total
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[var(--sami-border)]">
                      {
                        visibleQuotes.length ===
                          0
                          ? (
                              <tr>
                                <td
                                  colSpan={
                                    7
                                  }
                                  className="px-4 py-10 text-center text-sm text-slate-500"
                                >
                                  No quotations match this view.
                                </td>
                              </tr>
                            )
                          : visibleQuotes.map(
                              quote => (
                                <tr
                                  key={
                                    quote.id
                                  }
                                  className="hover:bg-slate-500/[0.03]"
                                >
                                  <td className="px-4 py-3">
                                    <Link
                                      href={
                                        '/apps/sales/quotes/' +
                                        quote.id
                                      }
                                      className="font-black text-blue-700 hover:underline dark:text-blue-300"
                                    >
                                      {
                                        quote.quoteNumber
                                      }
                                    </Link>
                                    <p className="mt-1 text-[10px] text-slate-400">
                                      {
                                        quote.quoteDate
                                      }
                                    </p>
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="font-bold">
                                      {
                                        quote.customerName
                                      }
                                    </p>
                                    <p className="mt-1 text-[10px] text-slate-400">
                                      {
                                        quote.customerEmail ||
                                        quote.reference ||
                                        '—'
                                      }
                                    </p>
                                  </td>
                                  <td className="px-4 py-3">
                                    {
                                      quote.stageName
                                        ? (
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 dark:text-slate-300">
                                              {
                                                quote.stageName
                                              }
                                              <span className="text-slate-400">
                                                {
                                                  Math.round(
                                                    quote.probability,
                                                  )
                                                }
                                                %
                                              </span>
                                            </span>
                                          )
                                        : (
                                            <span className="text-xs text-slate-400">
                                              —
                                            </span>
                                          )
                                    }
                                  </td>
                                  <td className="px-4 py-3">
                                    <Status
                                      value={
                                        quote.status
                                      }
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <Status
                                      value={
                                        quote.approvalStatus
                                      }
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-xs">
                                    {
                                      quote.validUntil ||
                                      '—'
                                    }
                                  </td>
                                  <td className="px-4 py-3 text-right font-black">
                                    {
                                      money(
                                        quote.totalAmount,
                                        quote.currency,
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
              </div>
            </section>
          )
        }

        {
          view ===
            'templates' &&
          (
            <SalesTemplatesManager
              data={
                initialData
              }
              busy={
                busy
              }
              request={
                request
              }
              showSuccess={
                showSuccess
              }
              showError={
                showError
              }
            />
          )
        }

        {
          view ===
            'pdfBuilder' &&
          (
            <SalesQuotePdfBuilder
              data={
                initialData
              }
              busy={
                busy
              }
              request={
                request
              }
              showSuccess={
                showSuccess
              }
              showError={
                showError
              }
            />
          )
        }

        {
          view ===
            'catalogue' &&
          initialData
            .capabilities
            .canUseCatalog &&
          (
            <SalesProductCatalogueManager
              data={
                initialData
              }
              busy={
                busy
              }
              request={
                request
              }
              showSuccess={
                showSuccess
              }
              showError={
                showError
              }
            />
          )
        }

        {
          view ===
            'pricelists' &&
          initialData
            .capabilities
            .canViewPricing &&
          (
            <SalesPricelistsManager
              data={
                initialData
              }
              busy={
                busy
              }
              request={
                request
              }
              showSuccess={
                showSuccess
              }
              showError={
                showError
              }
            />
          )
        }

        {
          view ===
            'advancedPricing' &&
          initialData
            .capabilities
            .canViewPricing &&
          (
            <SalesAdvancedPricingManager
              data={
                initialData
              }
              busy={
                busy
              }
              request={
                request
              }
              showSuccess={
                showSuccess
              }
              showError={
                showError
              }
            />
          )
        }

        {
          view ===
            'currencies' &&
          initialData
            .capabilities
            .canViewPricing &&
          (
            <SalesCurrenciesManager
              data={
                initialData
              }
              busy={
                busy
              }
              request={
                request
              }
              showSuccess={
                showSuccess
              }
              showError={
                showError
              }
            />
          )
        }

        {
          view ===
            'orders' &&
          (
            <section className="space-y-4">
              <Toolbar
                title="Sales orders"
                search={
                  search
                }
                setSearch={
                  setSearch
                }
                onExport={
                  () =>
                    exportSales(
                      initialData,
                    )
                }
              />

              <div className="grid gap-3">
                {
                  visibleOrders.length ===
                    0
                    ? (
                        <div className="sami-surface rounded-[22px] p-8 text-center text-sm text-slate-500">
                          No sales orders match this view.
                        </div>
                      )
                    : visibleOrders.map(
                        order => (
                          <Link
                            key={
                              order.id
                            }
                            href={
                              '/apps/sales/orders/' +
                              order.id
                            }
                            className="sami-surface rounded-[22px] p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                          >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-black">
                                    {
                                      order.orderNumber
                                    }
                                  </p>
                                  <Status
                                    value={
                                      order.status
                                    }
                                  />
                                </div>
                                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                  {
                                    order.customerName
                                  }
                                </p>
                              </div>

                              <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[460px]">
                                <Progress
                                  label="Delivered"
                                  value={
                                    order.deliveredPercent
                                  }
                                  state={
                                    order.fulfillmentStatus
                                  }
                                />
                                <Progress
                                  label="Invoiced"
                                  value={
                                    order.invoicedPercent
                                  }
                                  state={
                                    order.invoiceStatus
                                  }
                                />
                                <div className="sm:text-right">
                                  <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                                    Order value
                                  </p>
                                  <p className="mt-1 font-black">
                                    {
                                      money(
                                        order.totalAmount,
                                        order.currency,
                                      )
                                    }
                                  </p>
                                </div>
                              </div>
                            </div>
                          </Link>
                        ),
                      )
                }
              </div>
            </section>
          )
        }

        {
          view ===
            'organization' &&
          initialData
            .capabilities
            .canViewOrganization &&
          (
            <SalesOrganizationManager
              busy={
                busy
              }
              request={
                request
              }
              showSuccess={
                showSuccess
              }
              showError={
                showError
              }
            />
          )
        }

        {
          view ===
            'operations' &&
          initialData
            .capabilities
            .canViewOperations &&
          (
            <SalesOperationsManager
              busy={
                busy
              }
              request={
                request
              }
              showSuccess={
                showSuccess
              }
              showError={
                showError
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
              busy={
                busy
              }
              request={
                request
              }
              showSuccess={
                showSuccess
              }
              showError={
                showError
              }
            />
          )
        }

        {
          view ===
            'newQuote' &&
          (
            <section className="sami-surface rounded-[26px] p-4 sm:p-5">
              <div className="mb-4">
                <h2 className="text-lg font-black">
                  New quotation
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Build the complete commercial offer once; SaMi preserves it through approval, acceptance, order and invoice conversion.
                </p>
              </div>

              <SalesQuoteComposer
                data={
                  initialData
                }
                busy={
                  busy
                }
                onSave={
                  saveQuote
                }
                onCancel={
                  () => {
                    router.push(
                      '/apps/sales/quotes',
                    );
                  }
                }
              />
            </section>
          )
        }
      </div>
    </>
  );
}


function Overview({
  data,
}: {
  data:
    SalesWorkspaceData;
}) {
  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Quoted value"
          value={
            money(
              data.metrics
                .quoteValue,
              data.company
                .currency,
            )
          }
          note={
            data.metrics
              .quoteCount +
            ' quotations'
          }
        />
        <Metric
          label="Accepted value"
          value={
            money(
              data.metrics
                .acceptedValue,
              data.company
                .currency,
            )
          }
          note={
            data.metrics
              .acceptedCount +
            ' accepted'
          }
        />
        <Metric
          label="Sales orders"
          value={
            money(
              data.metrics
                .orderValue,
              data.company
                .currency,
            )
          }
          note={
            data.orders
              .length +
            ' orders'
          }
        />
        <Metric
          label="Awaiting response"
          value={
            String(
              data.metrics
                .sentCount,
            )
          }
          note="sent quotations"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="sami-surface rounded-[24px] p-4">
          <h2 className="text-sm font-black">
            Recent quotations
          </h2>
          <div className="mt-3 divide-y divide-[var(--sami-border)]">
            {
              data.quotes
                .slice(
                  0,
                  7,
                )
                .map(
                  quote => (
                    <Link
                      key={
                        quote.id
                      }
                      href={
                        '/apps/sales/quotes/' +
                        quote.id
                      }
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">
                          {
                            quote.quoteNumber
                          }
                          {' · '}
                          {
                            quote.customerName
                          }
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {
                            quote.quoteDate
                          }
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black">
                          {
                            money(
                              quote.totalAmount,
                              quote.currency,
                            )
                          }
                        </p>
                        <div className="mt-1">
                          <Status
                            value={
                              quote.status
                            }
                          />
                        </div>
                      </div>
                    </Link>
                  ),
                )
            }
          </div>
        </div>

        <div className="sami-surface rounded-[24px] p-4">
          <h2 className="text-sm font-black">
            Pipeline health
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <SmallMetric
              label="Draft"
              value={
                data.metrics
                  .draftCount
              }
            />
            <SmallMetric
              label="Sent"
              value={
                data.metrics
                  .sentCount
              }
            />
            <SmallMetric
              label="Accepted"
              value={
                data.metrics
                  .acceptedCount
              }
            />
            <SmallMetric
              label="Converted"
              value={
                data.metrics
                  .convertedCount
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}


function Reports({
  data,
}: {
  data:
    SalesWorkspaceData;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <ReportCard
        title="Quote status"
        rows={
          data.statusCounts.map(
            item => ({
              label:
                item.status
                  .replaceAll(
                    '_',
                    ' ',
                  ),
              primary:
                String(
                  item.count,
                ),
              secondary:
                money(
                  item.amount,
                  data.company
                    .currency,
                ),
            }),
          )
        }
      />
      <ReportCard
        title="Monthly quotation value"
        rows={
          data.monthly.map(
            item => ({
              label:
                item.month,
              primary:
                String(
                  item.quoteCount,
                ) +
                ' quotes',
              secondary:
                money(
                  item.amount,
                  data.company
                    .currency,
                ),
            }),
          )
        }
      />
      <ReportCard
        title="Top customers"
        rows={
          data.topCustomers.map(
            item => ({
              label:
                item.customerName,
              primary:
                String(
                  item.quoteCount,
                ) +
                ' quotes',
              secondary:
                money(
                  item.amount,
                  data.company
                    .currency,
                ),
            }),
          )
        }
      />
    </section>
  );
}


function Settings({
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
  return (
    <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <form
        className="sami-surface rounded-[24px] p-4"
        onSubmit={
          async event => {
            event.preventDefault();

            const form =
              new FormData(
                event.currentTarget,
              );

            try {
              await request({
                action:
                  'update_settings',
                defaultCurrency:
                  form.get(
                    'defaultCurrency',
                  ),
                defaultValidityDays:
                  form.get(
                    'defaultValidityDays',
                  ),
                quoteApprovalThreshold:
                  form.get(
                    'quoteApprovalThreshold',
                  ),
                invoicePolicy:
                  form.get(
                    'invoicePolicy',
                  ),
                requireQuoteApproval:
                  form.get(
                    'requireQuoteApproval',
                  ) ===
                    'on',
                allowPartialInvoicing:
                  form.get(
                    'allowPartialInvoicing',
                  ) ===
                    'on',
                allowOnlineAcceptance:
                  form.get(
                    'allowOnlineAcceptance',
                  ) ===
                    'on',
                allowOnlineRejection:
                  form.get(
                    'allowOnlineRejection',
                  ) ===
                    'on',
                requireBillingCustomerForInvoice:
                  form.get(
                    'requireBillingCustomerForInvoice',
                  ) ===
                    'on',
                lockConfirmedOrders:
                  form.get(
                    'lockConfirmedOrders',
                  ) ===
                    'on',
                primaryColor:
                  form.get(
                    'primaryColor',
                  ),
                secondaryColor:
                  form.get(
                    'secondaryColor',
                  ),
                footerText:
                  form.get(
                    'footerText',
                  ),
                termsAndConditions:
                  form.get(
                    'termsAndConditions',
                  ),
                defaultNotes:
                  form.get(
                    'defaultNotes',
                  ),
                emailMessage:
                  form.get(
                    'emailMessage',
                  ),
              });

              showSuccess(
                'Sales settings saved',
                'The company Sales policy was updated.',
              );
            } catch (
              error
            ) {
              showError(
                'Sales settings failed',
                error instanceof
                  Error
                  ? error.message
                  : 'SaMi could not save Sales settings.',
              );
            }
          }
        }
      >
        <h2 className="text-sm font-black">
          Sales policy
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SettingInput
            name="defaultCurrency"
            label="Default currency"
            defaultValue={
              data.settings
                .defaultCurrency
            }
          />
          <SettingInput
            name="defaultValidityDays"
            label="Quote validity days"
            type="number"
            defaultValue={
              String(
                data.settings
                  .defaultValidityDays,
              )
            }
          />
          <SettingInput
            name="quoteApprovalThreshold"
            label="Approval threshold"
            type="number"
            defaultValue={
              String(
                data.settings
                  .quoteApprovalThreshold,
              )
            }
          />

          <label>
            <SettingLabel>
              Invoicing policy
            </SettingLabel>
            <select
              name="invoicePolicy"
              defaultValue={
                data.settings
                  .invoicePolicy
              }
              className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
            >
              <option value="ordered">
                Ordered quantities
              </option>
              <option value="delivered">
                Delivered quantities
              </option>
            </select>
          </label>

          <SettingInput
            name="primaryColor"
            label="Primary color"
            defaultValue={
              data.settings
                .primaryColor
            }
          />
          <SettingInput
            name="secondaryColor"
            label="Secondary color"
            defaultValue={
              data.settings
                .secondaryColor
            }
          />

          <div className="sm:col-span-2">
            <SettingArea
              name="defaultNotes"
              label="Default quote notes"
              defaultValue={
                data.settings
                  .defaultNotes ||
                ''
              }
            />
          </div>

          <div className="sm:col-span-2">
            <SettingArea
              name="termsAndConditions"
              label="Terms & conditions"
              defaultValue={
                data.settings
                  .termsAndConditions ||
                ''
              }
            />
          </div>

          <div className="sm:col-span-2">
            <SettingArea
              name="emailMessage"
              label="Default delivery message"
              defaultValue={
                data.settings
                  .emailMessage ||
                ''
              }
            />
          </div>

          <div className="sm:col-span-2">
            <SettingArea
              name="footerText"
              label="Document footer"
              defaultValue={
                data.settings
                  .footerText ||
                ''
              }
            />
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Check
            name="requireQuoteApproval"
            label="Require internal quote approval"
            defaultChecked={
              data.settings
                .requireQuoteApproval
            }
          />
          <Check
            name="allowPartialInvoicing"
            label="Allow partial invoicing"
            defaultChecked={
              data.settings
                .allowPartialInvoicing
            }
          />
          <Check
            name="allowOnlineAcceptance"
            label="Allow online acceptance"
            defaultChecked={
              data.settings
                .allowOnlineAcceptance
            }
          />
          <Check
            name="allowOnlineRejection"
            label="Allow online rejection"
            defaultChecked={
              data.settings
                .allowOnlineRejection
            }
          />
          <Check
            name="requireBillingCustomerForInvoice"
            label="Require billing customer"
            defaultChecked={
              data.settings
                .requireBillingCustomerForInvoice
            }
          />
          <Check
            name="lockConfirmedOrders"
            label="Lock confirmed commercial terms"
            defaultChecked={
              data.settings
                .lockConfirmedOrders
            }
          />
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={
              busy
            }
            className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-60"
          >
            Save settings
          </button>
        </div>
      </form>
    </section>
  );
}


function Toolbar({
  title,
  search,
  setSearch,
  onExport,
}: {
  title:
    string;
  search:
    string;
  setSearch:
    (
      value:
        string,
    ) =>
      void;
  onExport:
    () =>
      void;
}) {
  return (
    <div className="sami-surface flex flex-col gap-3 rounded-[22px] p-4 lg:flex-row lg:items-center lg:justify-between">
      <h2 className="text-sm font-black">
        {
          title
        }
      </h2>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            value={
              search
            }
            onChange={
              event =>
                setSearch(
                  event.target
                    .value,
                )
            }
            placeholder="Search"
            className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent pl-9 pr-3 text-xs sm:w-64"
          />
        </label>

        <button
          type="button"
          onClick={
            onExport
          }
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
        >
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>
    </div>
  );
}


function Metric({
  label,
  value,
  note,
}: {
  label:
    string;
  value:
    string;
  note:
    string;
}) {
  return (
    <div className="sami-surface rounded-[22px] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
        {
          label
        }
      </p>
      <p className="mt-2 text-xl font-black">
        {
          value
        }
      </p>
      <p className="mt-1 text-[11px] text-slate-500">
        {
          note
        }
      </p>
    </div>
  );
}


function SmallMetric({
  label,
  value,
}: {
  label:
    string;
  value:
    number;
}) {
  return (
    <div className="rounded-xl border border-[var(--sami-border)] p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
        {
          label
        }
      </p>
      <p className="mt-1 text-xl font-black">
        {
          value
        }
      </p>
    </div>
  );
}


function Progress({
  label,
  value,
  state,
}: {
  label:
    string;
  value:
    number;
  state:
    string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
        <span>
          {
            label
          }
        </span>
        <span>
          {
            value
          }%
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-500/10">
        <div
          className="h-full rounded-full bg-blue-600"
          style={{
            width:
              Math.max(
                0,
                Math.min(
                  100,
                  value,
                ),
              ) +
              '%',
          }}
        />
      </div>
      <p className="mt-1 text-[9px] font-bold text-slate-400">
        {
          state.replaceAll(
            '_',
            ' ',
          )
        }
      </p>
    </div>
  );
}


function ReportCard({
  title,
  rows,
}: {
  title:
    string;
  rows:
    Array<{
      label:
        string;
      primary:
        string;
      secondary:
        string;
    }>;
}) {
  return (
    <div className="sami-surface rounded-[24px] p-4">
      <h2 className="text-sm font-black">
        {
          title
        }
      </h2>

      <div className="mt-3 space-y-2">
        {
          rows.length ===
            0
            ? (
                <p className="text-xs text-slate-500">
                  No report data yet.
                </p>
              )
            : rows.map(
                (
                  row,
                  index,
                ) => (
                  <div
                    key={
                      row.label +
                      index
                    }
                    className="flex items-center justify-between gap-3 border-b border-[var(--sami-border)] py-2 last:border-0"
                  >
                    <p className="text-xs font-black capitalize">
                      {
                        row.label
                      }
                    </p>
                    <div className="text-right">
                      <p className="text-xs font-black">
                        {
                          row.primary
                        }
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {
                          row.secondary
                        }
                      </p>
                    </div>
                  </div>
                ),
              )
        }
      </div>
    </div>
  );
}


function SettingLabel({
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


function SettingInput({
  name,
  label,
  type =
    'text',
  defaultValue =
    '',
  required =
    false,
}: {
  name:
    string;
  label:
    string;
  type?:
    string;
  defaultValue?:
    string;
  required?:
    boolean;
}) {
  return (
    <label className="block">
      <SettingLabel>
        {
          label
        }
      </SettingLabel>
      <input
        name={
          name
        }
        type={
          type
        }
        defaultValue={
          defaultValue
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
        className="mt-1 h-11 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-sm"
      />
    </label>
  );
}


function SettingArea({
  name,
  label,
  defaultValue =
    '',
}: {
  name:
    string;
  label:
    string;
  defaultValue?:
    string;
}) {
  return (
    <label className="block">
      <SettingLabel>
        {
          label
        }
      </SettingLabel>
      <textarea
        name={
          name
        }
        rows={
          4
        }
        defaultValue={
          defaultValue
        }
        className="mt-1 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 py-2 text-sm"
      />
    </label>
  );
}


function Check({
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
    <label className="flex items-center gap-3 rounded-xl border border-[var(--sami-border)] p-3 text-xs font-bold">
      <input
        name={
          name
        }
        type="checkbox"
        defaultChecked={
          defaultChecked
        }
        className="h-4 w-4"
      />
      {
        label
      }
    </label>
  );
}