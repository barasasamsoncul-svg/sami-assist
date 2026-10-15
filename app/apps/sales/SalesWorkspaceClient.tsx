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
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  Send,
  BookmarkPlus,
  Trash2,
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

import SalesPipelineManager from '@/app/apps/sales/SalesPipelineManager';

import type {
  SalesOrderSortBy,
  SalesOrderStatusView,
  SalesQuoteStatusView,
  SalesSavedOrderView,
  SalesSavedQuoteView,
  SalesWorkspaceData,
} from '@/lib/apps/sales/types';


type View =
  | 'overview'
  | 'pipeline'
  | 'opportunities'
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


type QuoteStatusView = SalesQuoteStatusView;


const QUOTE_STATUS_VIEWS: {
  key: QuoteStatusView;
  label: string;
}[] = [
  { key: 'all', label: 'All quotations' },
  { key: 'draft', label: 'Drafts' },
  { key: 'needs_approval', label: 'Awaiting approval' },
  { key: 'awaiting_response', label: 'Awaiting customer' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'converted', label: 'Converted to order' },
  { key: 'expired', label: 'Expired' },
  { key: 'expiring_soon', label: 'Expiring in 7 days' },
  { key: 'closed_without_sale', label: 'Closed without sale' },
];


function isQuoteExpiringWithinSevenDays(
  quote: SalesWorkspaceData['quotes'][number],
) {
  if (
    (quote.status !== 'sent' && quote.status !== 'viewed') ||
    !quote.validUntil
  ) {
    return false;
  }

  const parts = quote.validUntil.slice(0, 10).split('-').map(Number);
  const [year, month, day] = parts;

  if (
    parts.length !== 3 ||
    !year ||
    !month ||
    !day ||
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return false;
  }

  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const expiry = Date.UTC(year, month - 1, day);
  const daysUntilExpiry = Math.round((expiry - today) / 86_400_000);

  return daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
}


function matchesQuoteStatusView(
  quote: SalesWorkspaceData['quotes'][number],
  view: QuoteStatusView,
) {
  switch (view) {
    case 'all':
      return true;
    case 'draft':
      return quote.status === 'draft';
    case 'needs_approval':
      return quote.approvalStatus === 'pending';
    case 'awaiting_response':
      return quote.status === 'sent' ||
        quote.status === 'viewed';
    case 'accepted':
      return quote.status === 'accepted';
    case 'converted':
      return quote.status === 'converted';
    case 'expired':
      return quote.status === 'expired';
    case 'expiring_soon':
      return isQuoteExpiringWithinSevenDays(quote);
    case 'closed_without_sale':
      return quote.status === 'rejected' ||
        quote.status === 'expired' ||
        quote.status === 'cancelled';
  }
}


const ORDER_STATUS_VIEWS: {
  key: SalesOrderStatusView;
  label: string;
}[] = [
  { key: 'all', label: 'All orders' },
  { key: 'awaiting_fulfillment', label: 'Awaiting fulfillment' },
  { key: 'partially_fulfilled', label: 'Partially fulfilled' },
  { key: 'fulfilled', label: 'Fulfilled' },
  { key: 'not_invoiced', label: 'Not invoiced' },
  { key: 'partially_invoiced', label: 'Partially invoiced' },
  { key: 'invoiced', label: 'Fully invoiced' },
];


const ORDER_SORT_OPTIONS: {
  key: SalesOrderSortBy;
  label: string;
}[] = [
  { key: 'newest', label: 'Newest order' },
  { key: 'oldest', label: 'Oldest order' },
  { key: 'value_high', label: 'Highest value' },
  { key: 'value_low', label: 'Lowest value' },
  { key: 'delivery_first', label: 'Delivery progress: lowest first' },
  { key: 'invoice_first', label: 'Invoicing progress: lowest first' },
  { key: 'customer_az', label: 'Customer A–Z' },
];


function salesOrderFulfillmentLabel(status: string) {
  switch (status) {
    case 'not_started':
      return 'Awaiting fulfillment';
    case 'partial':
      return 'Partially fulfilled';
    case 'fulfilled':
      return 'Fulfilled';
    default:
      return status.replaceAll('_', ' ');
  }
}


function salesOrderInvoiceLabel(status: string) {
  switch (status) {
    case 'not_invoiced':
      return 'Not invoiced';
    case 'partial':
      return 'Partially invoiced';
    case 'invoiced':
      return 'Fully invoiced';
    default:
      return status.replaceAll('_', ' ');
  }
}


function matchesSalesOrderView(
  order: SalesWorkspaceData['orders'][number],
  view: SalesOrderStatusView,
) {
  switch (view) {
    case 'all':
      return true;
    case 'awaiting_fulfillment':
      return order.fulfillmentStatus === 'not_started';
    case 'partially_fulfilled':
      return order.fulfillmentStatus === 'partial';
    case 'fulfilled':
      return order.fulfillmentStatus === 'fulfilled';
    case 'not_invoiced':
      return order.invoiceStatus === 'not_invoiced';
    case 'partially_invoiced':
      return order.invoiceStatus === 'partial';
    case 'invoiced':
      return order.invoiceStatus === 'invoiced';
  }
}



type SalesRegisterPage<T> = {
  rows: T[];
  offset: number;
  limit: number;
  totalCount: number;
  hasMore: boolean;
  nextOffset: number;
};

async function requestSalesRegisterPage<T>(
  kind: 'quotes' | 'orders',
  query: URLSearchParams,
  signal?: AbortSignal,
): Promise<SalesRegisterPage<T>> {
  query.set('register', kind);
  const response = await fetch('/api/apps/sales?' + query.toString(), {
    cache: 'no-store',
    signal,
  });
  const body = await response.json().catch(() => ({})) as {
    success?: boolean;
    error?: string;
    register?: SalesRegisterPage<T>;
  };
  if (!response.ok || body.success !== true || !body.register) {
    throw new Error(body.error || 'Could not load the Sales register.');
  }
  return body.register;
}

type LinkedOpportunity = {
  id: string;
  opportunity_number: string;
  name: string;
  billing_customer_id: string | null;
  customer_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  currency: string;
  expected_value: number | string;
  latest_quote_id: string | null;
  stage_type: string;
};


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
  selectedQuotes?:
    SalesWorkspaceData['quotes'],
  selectedOrders?:
    SalesWorkspaceData['orders'],
) {
  const rows: (
    string |
    number |
    null |
    undefined
  )[][] = [
    [
      'Type',
      'Number',
      'Customer',
      'Status',
      'Date',
      'Currency',
      'Amount',
    ],
  ];

  const quotesToExport =
    selectedOrders
      ? []
      : selectedQuotes ??
        data.quotes;

  rows.push(
    ...quotesToExport.map(
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
  );

  if (selectedOrders) {
    rows.push(
      ...selectedOrders.map(
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
    );
  } else if (!selectedQuotes) {
    rows.push(
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
    );
  }

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
    (
      selectedQuotes
        ? 'sales-quotations-selected-'
        : selectedOrders
          ? 'sales-orders-selected-'
          : 'sales-register-'
    ) +
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

  const [
    linkedOpportunityId,
    setLinkedOpportunityId,
  ] = useState('');

  const [
    linkedOpportunity,
    setLinkedOpportunity,
  ] = useState<LinkedOpportunity | null>(null);

  const [
    opportunityLaunchResolved,
    setOpportunityLaunchResolved,
  ] = useState(initialView !== 'newQuote');

  const [
    opportunityLaunchError,
    setOpportunityLaunchError,
  ] = useState('');

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

  useEffect(() => {
    if (initialView !== 'newQuote') {
      setLinkedOpportunityId('');
      setLinkedOpportunity(null);
      setOpportunityLaunchError('');
      setOpportunityLaunchResolved(true);
      return;
    }

    const requestedId = new URLSearchParams(window.location.search)
      .get('opportunityId')
      ?.trim();

    if (!requestedId) {
      setLinkedOpportunityId('');
      setLinkedOpportunity(null);
      setOpportunityLaunchError('');
      setOpportunityLaunchResolved(true);
      return;
    }

    let cancelled = false;
    setLinkedOpportunityId(requestedId);
    setLinkedOpportunity(null);
    setOpportunityLaunchError('');
    setOpportunityLaunchResolved(false);

    void fetch('/api/apps/sales?pipeline=1', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error || 'Could not load the selected opportunity.');
        }
        return body;
      })
      .then(body => {
        const opportunities = body?.pipeline?.opportunities;
        const opportunity = Array.isArray(opportunities)
          ? opportunities.find((item: LinkedOpportunity) => String(item.id) === requestedId)
          : null;
        if (!opportunity) {
          throw new Error('The opportunity is unavailable. Return to Leads & Opportunities and try again.');
        }
        if (!cancelled) setLinkedOpportunity(opportunity as LinkedOpportunity);
      })
      .catch(error => {
        if (cancelled) return;
        setOpportunityLaunchError(
          error instanceof Error
            ? error.message
            : 'Could not load the selected opportunity.',
        );
      })
      .finally(() => {
        if (!cancelled) setOpportunityLaunchResolved(true);
      });

    return () => {
      cancelled = true;
    };
  }, [initialView]);

  const [
    search,
    setSearch,
  ] =
    useState(
      '',
    );

  const [
    quoteStatusView,
    setQuoteStatusView,
  ] =
    useState<QuoteStatusView>(
      'all',
    );

  const [
    orderStatusView,
    setOrderStatusView,
  ] =
    useState<SalesOrderStatusView>(
      'all',
    );

  const [
    orderSortBy,
    setOrderSortBy,
  ] =
    useState<SalesOrderSortBy>(
      'newest',
    );

  const [quoteRecords, setQuoteRecords] = useState<SalesWorkspaceData['quotes']>(initialData.quotes);
  const [orderRecords, setOrderRecords] = useState<SalesWorkspaceData['orders']>(initialData.orders);
  const [quoteRegisterHasMore, setQuoteRegisterHasMore] = useState(initialData.quotes.length >= 250);
  const [orderRegisterHasMore, setOrderRegisterHasMore] = useState(initialData.orders.length >= 250);
  const [quoteRegisterTotalCount, setQuoteRegisterTotalCount] = useState(initialData.metrics.quoteCount);
  const [orderRegisterTotalCount, setOrderRegisterTotalCount] = useState(initialData.metrics.orderCount);
  const [quoteRegisterLoading, setQuoteRegisterLoading] = useState(false);
  const [orderRegisterLoading, setOrderRegisterLoading] = useState(false);
  const [quoteRegisterError, setQuoteRegisterError] = useState('');
  const [orderRegisterError, setOrderRegisterError] = useState('');
  const previousQuoteQuery = useRef('');
  const previousOrderQuery = useRef('');
  const quoteRegisterRequestId = useRef(0);
  const orderRegisterRequestId = useRef(0);
  const quoteBaseData = useRef(initialData.quotes);
  const orderBaseData = useRef(initialData.orders);

  const [
    orderDisplayMode,
    setOrderDisplayMode,
  ] =
    useState<'register' | 'cards'>(
      'register',
    );

  const [
    selectedQuoteIds,
    setSelectedQuoteIds,
  ] =
    useState<string[]>(
      [],
    );

  const [
    selectedOrderIds,
    setSelectedOrderIds,
  ] =
    useState<string[]>(
      [],
    );

  // Retain per-order invoice retry keys when a request response is interrupted.
  const bulkInvoiceIdempotencyKeys =
    useRef<Record<string, string>>(
      {},
    );

  const [
    savedOrderViews,
    setSavedOrderViews,
  ] =
    useState<SalesSavedOrderView[]>(
      [],
    );

  const [
    savedOrderViewName,
    setSavedOrderViewName,
  ] =
    useState(
      '',
    );

  const [
    savedOrderViewsLoading,
    setSavedOrderViewsLoading,
  ] =
    useState(
      true,
    );

  const [
    savedOrderViewsError,
    setSavedOrderViewsError,
  ] =
    useState(
      '',
    );

  const [
    savedQuoteViews,
    setSavedQuoteViews,
  ] =
    useState<SalesSavedQuoteView[]>(
      [],
    );

  const [
    savedViewName,
    setSavedViewName,
  ] =
    useState(
      '',
    );

  const [
    savedViewsLoading,
    setSavedViewsLoading,
  ] =
    useState(
      true,
    );

  const [
    savedViewsError,
    setSavedViewsError,
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

  useEffect(() => {
    let cancelled = false;

    async function loadSavedViews() {
      setSavedViewsLoading(true);
      setSavedViewsError('');

      try {
        const response = await fetch(
          '/api/apps/sales?savedViews=1',
          {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          },
        );
        const body = await response.json().catch(() => ({}));

        if (!response.ok || body.success !== true) {
          throw new Error(body.error || 'Could not load saved quotation views.');
        }

        if (!cancelled) {
          setSavedQuoteViews(
            Array.isArray(body.savedViews)
              ? body.savedViews as SalesSavedQuoteView[]
              : [],
          );
        }
      } catch (error) {
        if (!cancelled) {
          setSavedViewsError(
            error instanceof Error
              ? error.message
              : 'Could not load saved quotation views.',
          );
        }
      } finally {
        if (!cancelled) setSavedViewsLoading(false);
      }
    }

    void loadSavedViews();

    return () => {
      cancelled = true;
    };
  }, [initialData.company.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedOrderViews() {
      setSavedOrderViewsLoading(true);
      setSavedOrderViewsError('');

      try {
        const response = await fetch(
          '/api/apps/sales?savedOrderViews=1',
          {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          },
        );
        const body = await response.json().catch(() => ({}));

        if (!response.ok || body.success !== true) {
          throw new Error(body.error || 'Could not load saved sales order views.');
        }

        if (!cancelled) {
          setSavedOrderViews(
            Array.isArray(body.savedOrderViews)
              ? body.savedOrderViews as SalesSavedOrderView[]
              : [],
          );
        }
      } catch (error) {
        if (!cancelled) {
          setSavedOrderViewsError(
            error instanceof Error
              ? error.message
              : 'Could not load saved sales order views.',
          );
        }
      } finally {
        if (!cancelled) setSavedOrderViewsLoading(false);
      }
    }

    void loadSavedOrderViews();

    return () => {
      cancelled = true;
    };
  }, [initialData.company.id]);

  useEffect(() => {
    if (quoteBaseData.current !== initialData.quotes) {
      setQuoteRecords(initialData.quotes);
      setQuoteRegisterHasMore(initialData.quotes.length >= 250);
      setQuoteRegisterTotalCount(initialData.metrics.quoteCount);
    }
  }, [initialData.quotes, initialData.metrics.quoteCount]);

  useEffect(() => {
    if (orderBaseData.current !== initialData.orders) {
      setOrderRecords(initialData.orders);
      setOrderRegisterHasMore(initialData.orders.length >= 250);
      setOrderRegisterTotalCount(initialData.metrics.orderCount);
    }
  }, [initialData.orders, initialData.metrics.orderCount]);

  useEffect(() => {
    if (view !== 'quotes') return;
    const signature = search.trim() + '|' + quoteStatusView;
    const baseChanged = quoteBaseData.current !== initialData.quotes;
    if (signature === previousQuoteQuery.current && !baseChanged) return;
    const requestId = ++quoteRegisterRequestId.current;
    setSelectedQuoteIds([]);
    const controller = new AbortController();
    setQuoteRegisterLoading(true);
    setQuoteRegisterError('');
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({
        offset: '0',
        limit: '250',
        search: search.trim(),
        statusView: quoteStatusView,
      });
      void requestSalesRegisterPage<SalesWorkspaceData['quotes'][number]>('quotes', query, controller.signal)
        .then(page => {
          if (requestId !== quoteRegisterRequestId.current) return;
          previousQuoteQuery.current = signature;
          quoteBaseData.current = initialData.quotes;
          setQuoteRecords(page.rows);
          setQuoteRegisterHasMore(page.hasMore);
          setQuoteRegisterTotalCount(page.totalCount);
        })
        .catch(error => {
          if (!controller.signal.aborted && requestId === quoteRegisterRequestId.current) {
            setQuoteRegisterError(error instanceof Error ? error.message : 'Could not load quotations.');
          }
        })
        .finally(() => {
          if (!controller.signal.aborted && requestId === quoteRegisterRequestId.current) setQuoteRegisterLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (requestId === quoteRegisterRequestId.current) setQuoteRegisterLoading(false);
    };
  }, [view, search, quoteStatusView, initialData.quotes, initialData.metrics.quoteCount]);

  useEffect(() => {
    if (view !== 'orders') return;
    const signature = search.trim() + '|' + orderStatusView + '|' + orderSortBy;
    const baseChanged = orderBaseData.current !== initialData.orders;
    if (signature === previousOrderQuery.current && !baseChanged) return;
    const requestId = ++orderRegisterRequestId.current;
    setSelectedOrderIds([]);
    const controller = new AbortController();
    setOrderRegisterLoading(true);
    setOrderRegisterError('');
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({
        offset: '0',
        limit: '250',
        search: search.trim(),
        statusView: orderStatusView,
        sortBy: orderSortBy,
      });
      void requestSalesRegisterPage<SalesWorkspaceData['orders'][number]>('orders', query, controller.signal)
        .then(page => {
          if (requestId !== orderRegisterRequestId.current) return;
          previousOrderQuery.current = signature;
          orderBaseData.current = initialData.orders;
          setOrderRecords(page.rows);
          setOrderRegisterHasMore(page.hasMore);
          setOrderRegisterTotalCount(page.totalCount);
        })
        .catch(error => {
          if (!controller.signal.aborted && requestId === orderRegisterRequestId.current) {
            setOrderRegisterError(error instanceof Error ? error.message : 'Could not load sales orders.');
          }
        })
        .finally(() => {
          if (!controller.signal.aborted && requestId === orderRegisterRequestId.current) setOrderRegisterLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (requestId === orderRegisterRequestId.current) setOrderRegisterLoading(false);
    };
  }, [view, search, orderStatusView, orderSortBy, initialData.orders, initialData.metrics.orderCount]);

  async function loadMoreQuoteRecords() {
    if (quoteRegisterLoading || !quoteRegisterHasMore) return;
    const requestId = ++quoteRegisterRequestId.current;
    setQuoteRegisterLoading(true);
    setQuoteRegisterError('');
    try {
      const query = new URLSearchParams({
        offset: String(quoteRecords.length),
        limit: '250',
        search: search.trim(),
        statusView: quoteStatusView,
      });
      const page = await requestSalesRegisterPage<SalesWorkspaceData['quotes'][number]>('quotes', query);
      if (requestId !== quoteRegisterRequestId.current) return;
      setQuoteRecords(current => {
        const existing = new Set(current.map(row => row.id));
        return [...current, ...page.rows.filter(row => !existing.has(row.id))];
      });
      setQuoteRegisterHasMore(page.hasMore);
      setQuoteRegisterTotalCount(page.totalCount);
    } catch (error) {
      if (requestId === quoteRegisterRequestId.current) {
        setQuoteRegisterError(error instanceof Error ? error.message : 'Could not load more quotations.');
      }
    } finally {
      if (requestId === quoteRegisterRequestId.current) setQuoteRegisterLoading(false);
    }
  }

  async function loadMoreOrderRecords() {
    if (orderRegisterLoading || !orderRegisterHasMore) return;
    const requestId = ++orderRegisterRequestId.current;
    setOrderRegisterLoading(true);
    setOrderRegisterError('');
    try {
      const query = new URLSearchParams({
        offset: String(orderRecords.length),
        limit: '250',
        search: search.trim(),
        statusView: orderStatusView,
        sortBy: orderSortBy,
      });
      const page = await requestSalesRegisterPage<SalesWorkspaceData['orders'][number]>('orders', query);
      if (requestId !== orderRegisterRequestId.current) return;
      setOrderRecords(current => {
        const existing = new Set(current.map(row => row.id));
        return [...current, ...page.rows.filter(row => !existing.has(row.id))];
      });
      setOrderRegisterHasMore(page.hasMore);
      setOrderRegisterTotalCount(page.totalCount);
    } catch (error) {
      if (requestId === orderRegisterRequestId.current) {
        setOrderRegisterError(error instanceof Error ? error.message : 'Could not load more sales orders.');
      }
    } finally {
      if (requestId === orderRegisterRequestId.current) setOrderRegisterLoading(false);
    }
  }

  const visibleQuotes =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        return initialData
          .quotes
          .filter(
            quote =>
              matchesQuoteStatusView(
                quote,
                quoteStatusView,
              ) &&
              (
                !query ||
                [
                  quote.quoteNumber,
                  quote.customerName,
                  quote.customerEmail || '',
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
                  )
              ),
          );
      },
      [
        quoteRecords,
        search,
        quoteStatusView,
      ],
    );

  const allVisibleQuotesSelected =
    visibleQuotes.length > 0 &&
    visibleQuotes.every(
      quote =>
        selectedQuoteIds.includes(
          quote.id,
        ),
    );

  const sendableSelectedQuoteIds =
    useMemo(
      () =>
        quoteRecords
          .filter(
            quote =>
              selectedQuoteIds.includes(quote.id) &&
              quote.status === 'draft' &&
              (
                quote.approvalStatus === 'approved' ||
                quote.approvalStatus === 'not_required'
              ),
          )
          .map(quote => quote.id),
      [
        quoteRecords,
        selectedQuoteIds,
      ],
    );

  const visibleOrders =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        const matchingOrders = orderRecords.filter(
          order =>
            matchesSalesOrderView(order, orderStatusView) &&
            (
              !query ||
              [
                order.orderNumber,
                order.customerName,
                order.reference || '',
                order.status,
                order.fulfillmentStatus,
                order.invoiceStatus,
              ].some(value =>
                value
                  .toLowerCase()
                  .includes(query),
              )
            ),
        );

        return matchingOrders.sort((left, right) => {
          let difference = 0;

          switch (orderSortBy) {
            case 'newest':
              difference = right.orderDate.localeCompare(left.orderDate);
              break;
            case 'oldest':
              difference = left.orderDate.localeCompare(right.orderDate);
              break;
            case 'value_high':
              difference = right.baseTotalAmount - left.baseTotalAmount;
              break;
            case 'value_low':
              difference = left.baseTotalAmount - right.baseTotalAmount;
              break;
            case 'delivery_first':
              difference = left.deliveredPercent - right.deliveredPercent;
              break;
            case 'invoice_first':
              difference = left.invoicedPercent - right.invoicedPercent;
              break;
            case 'customer_az':
              difference = left.customerName.localeCompare(right.customerName);
              break;
          }

          return difference || left.orderNumber.localeCompare(right.orderNumber);
        });
      },
      [
        orderRecords,
        orderStatusView,
        orderSortBy,
        search,
      ],
    );

  const allVisibleOrdersSelected =
    visibleOrders.length > 0 &&
    visibleOrders.every(
      order => selectedOrderIds.includes(order.id),
    );

  const invoiceableSelectedOrderIds =
    useMemo(
      () =>
        orderRecords
          .filter(
            order =>
              selectedOrderIds.includes(order.id) &&
              order.status === 'confirmed' &&
              order.invoiceStatus !== 'invoiced',
          )
          .map(order => order.id),
      [
        orderRecords,
        selectedOrderIds,
      ],
    );

  async function saveCurrentQuoteView() {
    const name = savedViewName.trim();

    if (!name) {
      showWarning('Name required', 'Enter a name for this saved quotation view.');
      return;
    }

    try {
      const result = await request({
        action: 'save_quote_view',
        name,
        statusView: quoteStatusView,
        searchQuery: search,
      });

      const savedView = result as unknown as SalesSavedQuoteView;
      setSavedQuoteViews(current => [
        savedView,
        ...current.filter(view => view.id !== savedView.id),
      ]);
      setSavedViewName('');
      setSavedViewsError('');
      showSuccess('View saved', 'Your quotation filters are saved to your Sales workspace.');
    } catch (error) {
      showError(
        'View could not be saved',
        error instanceof Error ? error.message : 'SaMi could not save this quotation view.',
      );
    }
  }

  function applySavedQuoteView(view: SalesSavedQuoteView) {
    setQuoteStatusView(view.statusView);
    setSearch(view.searchQuery);
    setSelectedQuoteIds([]);
  }

  async function removeSavedQuoteView(view: SalesSavedQuoteView) {
    if (!window.confirm('Delete the saved quotation view "' + view.name + '"?')) {
      return;
    }

    try {
      await request({
        action: 'delete_quote_view',
        viewId: view.id,
      });
      setSavedQuoteViews(current => current.filter(item => item.id !== view.id));
      showSuccess('Saved view deleted', 'The saved quotation view was removed.');
    } catch (error) {
      showError(
        'View could not be deleted',
        error instanceof Error ? error.message : 'SaMi could not delete this saved view.',
      );
    }
  }


  async function saveCurrentOrderView() {
    const name = savedOrderViewName.trim();

    if (!name) {
      showWarning('Name required', 'Enter a name for this saved sales order view.');
      return;
    }

    try {
      const result = await request({
        action: 'save_order_view',
        name,
        statusView: orderStatusView,
        searchQuery: search,
        sortBy: orderSortBy,
      });

      const savedView = result as unknown as SalesSavedOrderView;
      setSavedOrderViews(current => [
        savedView,
        ...current.filter(view => view.id !== savedView.id),
      ]);
      setSavedOrderViewName('');
      setSavedOrderViewsError('');
      showSuccess('View saved', 'Your sales order queue and search are saved to your workspace.');
    } catch (error) {
      showError(
        'View could not be saved',
        error instanceof Error ? error.message : 'SaMi could not save this sales order view.',
      );
    }
  }


  function applySavedOrderView(view: SalesSavedOrderView) {
    setOrderStatusView(view.statusView);
    setSearch(view.searchQuery);
    setOrderSortBy(view.sortBy);
    setSelectedQuoteIds([]);
    setSelectedOrderIds([]);
  }


  async function removeSavedOrderView(view: SalesSavedOrderView) {
    if (!window.confirm('Delete the saved sales order view "' + view.name + '"?')) {
      return;
    }

    try {
      await request({
        action: 'delete_order_view',
        viewId: view.id,
      });
      setSavedOrderViews(current => current.filter(item => item.id !== view.id));
      showSuccess('Saved view deleted', 'The saved sales order view was removed.');
    } catch (error) {
      showError(
        'View could not be deleted',
        error instanceof Error ? error.message : 'SaMi could not delete this saved sales order view.',
      );
    }
  }

  async function bulkSendSelectedQuotes() {
    const quoteIds = sendableSelectedQuoteIds;

    if (quoteIds.length === 0) {
      return;
    }

    if (!window.confirm(
      'Send ' + quoteIds.length +
      ' eligible draft quotation(s) to customers now? Each quotation is sent using the configured Sales delivery channel.',
    )) {
      return;
    }

    try {
      const result = await request({
        action: 'bulk_send_quotes',
        quoteIds,
      });

      const sentCount = Number(result.sentCount || 0);
      const failedCount = Number(result.failedCount || 0);
      const outcomes = Array.isArray(result.results)
        ? result.results as Array<{
            quoteId: string;
            success: boolean;
            error?: string;
          }>
        : [];
      const failures = outcomes.filter(outcome => !outcome.success);

      if (failedCount > 0) {
        setSelectedQuoteIds(
          failures
            .map(outcome => outcome.quoteId)
            .filter(Boolean),
        );
        const failureSummary = failures
          .slice(0, 3)
          .map(outcome => {
            const quote = quoteRecords.find(
              item => item.id === outcome.quoteId,
            );
            return (quote?.quoteNumber || 'Quotation') +
              ': ' + (outcome.error || 'Delivery failed');
          })
          .join(' · ');

        showWarning(
          'Some quotations were not sent',
          sentCount + ' sent; ' + failedCount + ' failed.' +
            (failureSummary ? ' ' + failureSummary : ''),
        );
      } else {
        setSelectedQuoteIds([]);
        showSuccess(
          'Quotations sent',
          sentCount + ' draft quotation(s) were sent to customers.',
        );
      }
    } catch (error) {
      showError(
        'Quotations could not be sent',
        error instanceof Error
          ? error.message
          : 'SaMi could not send the selected quotations.',
      );
    }
  }

  async function bulkInvoiceSelectedOrders() {
    const orderIds = invoiceableSelectedOrderIds;

    if (orderIds.length === 0) {
      showWarning(
        'No invoiceable orders selected',
        'Select confirmed orders that are not yet fully invoiced.',
      );
      return;
    }

    if (orderIds.length > 25) {
      showWarning(
        'Batch is too large',
        'Invoice at most 25 sales orders at a time.',
      );
      return;
    }

    if (!window.confirm(
      'Create a separate invoice for each of the ' + orderIds.length +
      ' selected order(s)? Each order follows its own invoice policy. Successful retries reuse the original invoice.',
    )) {
      return;
    }

    const orders = orderIds.map(orderId => {
      let idempotencyKey = bulkInvoiceIdempotencyKeys.current[orderId];

      if (!idempotencyKey) {
        idempotencyKey = 'sales-bulk-' + crypto.randomUUID();
        bulkInvoiceIdempotencyKeys.current[orderId] = idempotencyKey;
      }

      return { orderId, idempotencyKey };
    });

    try {
      const result = await request({
        action: 'bulk_invoice_orders',
        orders,
      });

      const outcomes = Array.isArray(result.results)
        ? result.results as Array<{
            orderId: string;
            success: boolean;
            invoiceId?: string;
            reused?: boolean;
            error?: string;
          }>
        : [];
      const successes = outcomes.filter(outcome => outcome.success);
      const failures = outcomes.filter(outcome => !outcome.success);

      for (const outcome of successes) {
        delete bulkInvoiceIdempotencyKeys.current[outcome.orderId];
      }

      if (failures.length > 0) {
        setSelectedOrderIds(failures.map(outcome => outcome.orderId));
        const details = failures
          .slice(0, 3)
          .map(outcome => {
            const order = orderRecords.find(item => item.id === outcome.orderId);
            return (order?.orderNumber || 'Sales order') + ': ' +
              (outcome.error || 'Invoice creation failed');
          })
          .join(' · ');

        showWarning(
          'Some orders could not be invoiced',
          successes.length + ' succeeded; ' + failures.length + ' failed.' +
            (details ? ' ' + details : ''),
        );
      } else {
        setSelectedOrderIds([]);
        showSuccess(
          'Invoices created',
          successes.length + ' sales-order invoice(s) created or safely recovered.',
        );
      }
    } catch (error) {
      showError(
        'Bulk invoicing interrupted',
        (error instanceof Error
          ? error.message
          : 'SaMi could not complete bulk invoicing.') +
          ' Retry the same selection; request keys are retained to prevent duplicate invoices.',
      );
    }
  }

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
      const result = await request(
        payload,
      );

      setComposerOpen(
        false,
      );

      showSuccess(
        'Quotation saved',
        linkedOpportunityId
          ? 'The quotation is linked to its opportunity.'
          : 'The commercial document was saved successfully.',
      );

      if (linkedOpportunityId && result.id) {
        router.push('/apps/sales/quotes/' + encodeURIComponent(String(result.id)));
      }

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
            'opportunities' &&
          initialData.capabilities.canViewPipeline &&
          (
            <SalesPipelineManager
              canCreateQuote={initialData.capabilities.canCreate}
              canManagePipeline={initialData.capabilities.canManagePipeline}
              defaultCurrency={initialData.company.currency}
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
                  value => {
                    setSearch(value);
                    setSelectedQuoteIds([]);
                    setSelectedOrderIds([]);
                  }
                }
                onExport={
                  () =>
                    exportSales(
                      initialData,
                    )
                }
              />

              <div className="sami-surface rounded-[22px] p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                    Quotation work queues
                  </p>
                  <div
                    role="group"
                    aria-label="Quotation work queues"
                    className="flex flex-wrap gap-2"
                  >
                    {QUOTE_STATUS_VIEWS.map(option => (
                      <button
                        key={option.key}
                        type="button"
                        aria-pressed={quoteStatusView === option.key}
                        onClick={() => {
                          setQuoteStatusView(option.key);
                          setSelectedQuoteIds([]);
                        }}
                        className={[
                          'inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors',
                          quoteStatusView === option.key
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-[var(--sami-border)] hover:border-blue-500/60',
                        ].join(' ')}
                      >
                        {option.label}
                        <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] dark:bg-white/10">
                          {quoteRecords.filter(quote => matchesQuoteStatusView(quote, option.key)).length}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Choose a queue to focus on a stage of the quotation process. The search above continues to narrow the selected queue.
                </p>
              </div>

              <section className="sami-surface rounded-[22px] p-3" aria-label="Saved quotation views">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      Saved quotation views
                    </h3>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Save the current queue and search together so you can reopen the same working list later.
                    </p>
                  </div>
                  <form
                    className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto"
                    onSubmit={event => {
                      event.preventDefault();
                      void saveCurrentQuoteView();
                    }}
                  >
                    <label className="sr-only" htmlFor="sales-saved-view-name">Saved view name</label>
                    <input
                      id="sales-saved-view-name"
                      value={savedViewName}
                      onChange={event => setSavedViewName(event.target.value)}
                      maxLength={80}
                      placeholder="e.g. Large quotes awaiting reply"
                      className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs sm:w-64"
                    />
                    <button
                      type="submit"
                      disabled={busy || !savedViewName.trim()}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white disabled:opacity-60"
                    >
                      <BookmarkPlus className="h-4 w-4" />
                      Save view
                    </button>
                  </form>
                </div>

                {savedViewsError && (
                  <p role="alert" className="mt-3 rounded-xl border border-red-500/30 px-3 py-2 text-xs text-red-600">
                    {savedViewsError}
                  </p>
                )}

                {savedViewsLoading ? (
                  <p className="mt-3 text-xs text-slate-500">Loading your saved views…</p>
                ) : savedQuoteViews.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-[var(--sami-border)] px-3 py-3 text-xs text-slate-500">
                    No saved views yet. Save this queue and search to create your first one.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {savedQuoteViews.map(savedView => (
                      <div key={savedView.id} className="inline-flex max-w-full items-center rounded-xl border border-[var(--sami-border)]">
                        <button
                          type="button"
                          title={'Apply saved view: ' + savedView.name}
                          onClick={() => applySavedQuoteView(savedView)}
                          className="max-w-[260px] truncate px-3 py-2 text-left text-xs font-bold hover:text-blue-600"
                        >
                          {savedView.name}
                        </button>
                        <button
                          type="button"
                          aria-label={'Delete saved view ' + savedView.name}
                          title={'Delete saved view ' + savedView.name}
                          disabled={busy}
                          onClick={() => void removeSavedQuoteView(savedView)}
                          className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-600 disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[10px] text-slate-400">Saved views are private to your account within this company. Up to 25 views per user.</p>
              </section>

              {selectedQuoteIds.length > 0 && (
                <div
                  className="sami-surface rounded-[22px] p-3"
                  aria-live="polite"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black">
                        {selectedQuoteIds.length} quotation{selectedQuoteIds.length === 1 ? '' : 's'} selected
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Send eligible selected drafts or export only selected quotations. Sales orders are not included in this file.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {initialData.capabilities.canSend &&
                        sendableSelectedQuoteIds.length > 0 && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void bulkSendSelectedQuotes()}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white disabled:opacity-60"
                          >
                            <Send className="h-4 w-4" />
                            Send selected drafts ({sendableSelectedQuoteIds.length})
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => {
                          const selectedQuotes = quoteRecords.filter(
                            quote => selectedQuoteIds.includes(quote.id),
                          );
                          if (selectedQuotes.length > 0) {
                            exportSales(initialData, selectedQuotes);
                          }
                        }}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white"
                      >
                        <Download className="h-4 w-4" />
                        Export selected CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedQuoteIds([])}
                        className="inline-flex h-10 items-center rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
                      >
                        Clear selection
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="sami-surface overflow-hidden rounded-[24px]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="border-b border-[var(--sami-border)] bg-slate-500/[0.04] text-[10px] font-black uppercase tracking-[0.09em] text-slate-400">
                      <tr>
                        <th className="w-12 px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label="Select all visible quotations"
                            checked={allVisibleQuotesSelected}
                            onChange={event => {
                              if (event.target.checked) {
                                setSelectedQuoteIds(current => Array.from(new Set([
                                  ...current,
                                  ...visibleQuotes.map(quote => quote.id),
                                ])));
                              } else {
                                const visibleIds = new Set(visibleQuotes.map(quote => quote.id));
                                setSelectedQuoteIds(current => current.filter(id => !visibleIds.has(id)));
                              }
                            }}
                            className="h-4 w-4 rounded accent-blue-600"
                          />
                        </th>
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
                                    8
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
                                    <input
                                      type="checkbox"
                                      aria-label={`Select quotation ${quote.quoteNumber}`}
                                      checked={selectedQuoteIds.includes(quote.id)}
                                      onChange={event => {
                                        if (event.target.checked) {
                                          setSelectedQuoteIds(current =>
                                            current.includes(quote.id)
                                              ? current
                                              : [...current, quote.id],
                                          );
                                        } else {
                                          setSelectedQuoteIds(current =>
                                            current.filter(id => id !== quote.id),
                                          );
                                        }
                                      }}
                                      className="h-4 w-4 rounded accent-blue-600"
                                    />
                                  </td>
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
              {quoteRegisterError && <p role="alert" className="mt-3 text-sm text-red-600">{quoteRegisterError}</p>}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                <span>Showing {quoteRecords.length.toLocaleString()} of {quoteRegisterTotalCount.toLocaleString()} quotations</span>
                {quoteRegisterHasMore && (
                  <button type="button" disabled={quoteRegisterLoading} onClick={() => void loadMoreQuoteRecords()} className="rounded-xl border border-[var(--sami-border)] px-4 py-2 font-semibold disabled:opacity-50">
                    {quoteRegisterLoading ? 'Loading quotations…' : 'Load more quotations'}
                  </button>
                )}
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
                  value => {
                    setSearch(value);
                    setSelectedOrderIds([]);
                  }
                }
                onExport={
                  () =>
                    exportSales(
                      initialData,
                    )
                }
              />

              <div className="sami-surface rounded-[22px] p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                    Order work queues
                  </p>
                  <div
                    role="group"
                    aria-label="Sales order work queues"
                    className="flex flex-wrap gap-2"
                  >
                    {ORDER_STATUS_VIEWS.map(option => (
                      <button
                        key={option.key}
                        type="button"
                        aria-pressed={orderStatusView === option.key}
                        onClick={() => {
                          setOrderStatusView(option.key);
                          setSelectedOrderIds([]);
                        }}
                        className={[
                          'inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors',
                          orderStatusView === option.key
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-[var(--sami-border)] hover:border-blue-500/60',
                        ].join(' ')}
                      >
                        {option.label}
                        <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] dark:bg-white/10">
                          {orderRecords.filter(order => matchesSalesOrderView(order, option.key)).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    Sort
                    <select
                      aria-label="Sort sales orders"
                      value={orderSortBy}
                      onChange={event => setOrderSortBy(event.target.value as SalesOrderSortBy)}
                      className="h-9 rounded-lg border border-[var(--sami-border)] bg-transparent px-2 text-xs font-bold text-[var(--sami-text)]"
                    >
                      {ORDER_SORT_OPTIONS.map(option => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Focus on delivery or invoicing work. Sort by age, value, customer or the least-complete delivery and invoice work.
                </p>
              </div>

              <section className="sami-surface rounded-[22px] p-3" aria-label="Saved sales order views">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                      Saved order views
                    </h3>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Save the current fulfillment or invoicing queue and search so you can reopen the same work list later.
                    </p>
                  </div>
                  <form
                    className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto"
                    onSubmit={event => {
                      event.preventDefault();
                      void saveCurrentOrderView();
                    }}
                  >
                    <label className="sr-only" htmlFor="sales-saved-order-view-name">Saved order view name</label>
                    <input
                      id="sales-saved-order-view-name"
                      value={savedOrderViewName}
                      onChange={event => setSavedOrderViewName(event.target.value)}
                      maxLength={80}
                      placeholder="e.g. Orders to invoice"
                      className="h-10 w-full rounded-xl border border-[var(--sami-border)] bg-transparent px-3 text-xs sm:w-64"
                    />
                    <button
                      type="submit"
                      disabled={busy || !savedOrderViewName.trim()}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white disabled:opacity-60"
                    >
                      <BookmarkPlus className="h-4 w-4" />
                      Save order view
                    </button>
                  </form>
                </div>

                {savedOrderViewsError && (
                  <p role="alert" className="mt-3 rounded-xl border border-red-500/30 px-3 py-2 text-xs text-red-600">
                    {savedOrderViewsError}
                  </p>
                )}

                {savedOrderViewsLoading ? (
                  <p className="mt-3 text-xs text-slate-500">Loading your saved order views…</p>
                ) : savedOrderViews.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-[var(--sami-border)] px-3 py-3 text-xs text-slate-500">
                    No saved order views yet. Save this queue and search to create your first one.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {savedOrderViews.map(view => (
                      <div
                        key={view.id}
                        className="flex min-w-0 items-center gap-1 rounded-xl border border-[var(--sami-border)] p-1"
                      >
                        <button
                          type="button"
                          onClick={() => applySavedOrderView(view)}
                          className={[
                            'max-w-[280px] truncate rounded-lg px-2.5 py-1.5 text-left text-xs font-bold',
                            orderStatusView === view.statusView && search === view.searchQuery && orderSortBy === view.sortBy
                              ? 'bg-blue-600 text-white'
                              : 'hover:bg-slate-500/10',
                          ].join(' ')}
                          title={view.name}
                        >
                          {view.name}
                        </button>
                        <button
                          type="button"
                          aria-label={'Delete saved order view ' + view.name}
                          onClick={() => void removeSavedOrderView(view)}
                          className="rounded-lg p-1.5 text-slate-500 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className="space-y-3">
                <div className="flex justify-end">
                  <div
                    role="group"
                    aria-label="Sales order display mode"
                    className="inline-flex items-center gap-1 rounded-xl border border-[var(--sami-border)] p-1"
                  >
                    <button
                      type="button"
                      aria-pressed={orderDisplayMode === 'register'}
                      onClick={() => setOrderDisplayMode('register')}
                      className={[
                        'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold',
                        orderDisplayMode === 'register'
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-slate-500/10',
                      ].join(' ')}
                    >
                      <List className="h-4 w-4" />
                      Register
                    </button>
                    <button
                      type="button"
                      aria-pressed={orderDisplayMode === 'cards'}
                      onClick={() => {
                        setOrderDisplayMode('cards');
                        setSelectedOrderIds([]);
                      }}
                      className={[
                        'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold',
                        orderDisplayMode === 'cards'
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-slate-500/10',
                      ].join(' ')}
                    >
                      <LayoutGrid className="h-4 w-4" />
                      Cards
                    </button>
                  </div>
                </div>

                {selectedOrderIds.length > 0 && (
                  <div className="sami-surface rounded-[22px] p-3" aria-live="polite">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black">
                          {selectedOrderIds.length} sales order{selectedOrderIds.length === 1 ? '' : 's'} selected
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {invoiceableSelectedOrderIds.length} confirmed order(s) eligible for invoicing. Maximum 25 per batch.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {initialData.capabilities.canManageOrders &&
                          invoiceableSelectedOrderIds.length > 0 && (
                            <button
                              type="button"
                              disabled={busy || invoiceableSelectedOrderIds.length > 25}
                              onClick={() => void bulkInvoiceSelectedOrders()}
                              className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-black text-white disabled:opacity-60"
                            >
                              <Send className="h-4 w-4" />
                              Invoice eligible orders ({invoiceableSelectedOrderIds.length})
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => {
                            const selectedOrders = orderRecords.filter(
                              order => selectedOrderIds.includes(order.id),
                            );
                            if (selectedOrders.length > 0) {
                              exportSales(initialData, undefined, selectedOrders);
                            }
                          }}
                          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--sami-border)] px-3.5 text-xs font-black"
                        >
                          <Download className="h-4 w-4" />
                          Export selected CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedOrderIds([])}
                          className="inline-flex h-10 items-center rounded-xl border border-[var(--sami-border)] px-3 text-xs font-black"
                        >
                          Clear selection
                        </button>
                      </div>
                    </div>
                    {invoiceableSelectedOrderIds.length > 25 && (
                      <p role="alert" className="mt-2 text-xs text-amber-700">
                        Select no more than 25 eligible orders for a single invoice batch.
                      </p>
                    )}
                  </div>
                )}

                {visibleOrders.length === 0 ? (
                  <div className="sami-surface rounded-[22px] p-8 text-center text-sm text-slate-500">
                    No sales orders match this view.
                  </div>
                ) : orderDisplayMode === 'register' ? (
                  <div className="sami-surface overflow-hidden rounded-[24px]" aria-label="Sales order register">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1120px] text-left text-sm" aria-label="Sales order register">
                        <thead className="border-b border-[var(--sami-border)] bg-slate-500/[0.04] text-[10px] font-black uppercase tracking-[0.09em] text-slate-400">
                          <tr>
                            <th scope="col" className="w-12 px-4 py-3">
                              <input
                                type="checkbox"
                                aria-label="Select all visible sales orders"
                                checked={allVisibleOrdersSelected}
                                disabled={busy || visibleOrders.length === 0}
                                onChange={event => {
                                  if (event.target.checked) {
                                    setSelectedOrderIds(current => Array.from(new Set([
                                      ...current,
                                      ...visibleOrders.map(order => order.id),
                                    ])));
                                  } else {
                                    const visibleIds = new Set(visibleOrders.map(order => order.id));
                                    setSelectedOrderIds(current => current.filter(id => !visibleIds.has(id)));
                                  }
                                }}
                                className="h-4 w-4 rounded accent-blue-600"
                              />
                            </th>
                            <th scope="col" className="px-4 py-3">Order</th>
                            <th scope="col" className="px-4 py-3">Customer</th>
                            <th scope="col" className="px-4 py-3">Order date</th>
                            <th scope="col" className="px-4 py-3">Status</th>
                            <th scope="col" className="px-4 py-3">Fulfillment</th>
                            <th scope="col" className="px-4 py-3">Invoicing</th>
                            <th scope="col" className="px-4 py-3">Delivered</th>
                            <th scope="col" className="px-4 py-3">Invoiced</th>
                            <th scope="col" className="px-4 py-3 text-right">Order value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--sami-border)]">
                          {visibleOrders.map(order => (
                            <tr key={order.id} className="hover:bg-slate-500/[0.03]">
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  aria-label={'Select sales order ' + order.orderNumber}
                                  checked={selectedOrderIds.includes(order.id)}
                                  disabled={busy}
                                  onChange={event => {
                                    if (event.target.checked) {
                                      setSelectedOrderIds(current =>
                                        current.includes(order.id) ? current : [...current, order.id],
                                      );
                                    } else {
                                      setSelectedOrderIds(current =>
                                        current.filter(id => id !== order.id),
                                      );
                                    }
                                  }}
                                  className="h-4 w-4 rounded accent-blue-600"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <Link
                                  href={'/apps/sales/orders/' + order.id}
                                  className="font-black text-blue-600 hover:underline"
                                >
                                  {order.orderNumber}
                                </Link>
                                {order.quoteNumber && (
                                  <p className="mt-1 text-[10px] text-slate-500">
                                    From {order.quoteNumber}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 font-medium">{order.customerName}</td>
                              <td className="px-4 py-3 text-xs text-slate-500">{order.orderDate}</td>
                              <td className="px-4 py-3">
                                <Status value={order.status} />
                              </td>
                              <td className="px-4 py-3">
                                <span className="whitespace-nowrap text-xs font-semibold">
                                  {salesOrderFulfillmentLabel(order.fulfillmentStatus)}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="whitespace-nowrap text-xs font-semibold">
                                  {salesOrderInvoiceLabel(order.invoiceStatus)}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-bold tabular-nums">{Math.round(order.deliveredPercent)}%</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-bold tabular-nums">{Math.round(order.invoicedPercent)}%</span>
                              </td>
                              <td className="px-4 py-3 text-right font-black whitespace-nowrap">
                                {money(order.totalAmount, order.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {visibleOrders.map(order => (
                      <Link
                        key={order.id}
                        href={'/apps/sales/orders/' + order.id}
                        className="sami-surface rounded-[22px] p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-black">{order.orderNumber}</p>
                              <Status value={order.status} />
                            </div>
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                              {order.customerName}
                            </p>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[460px]">
                            <Progress
                              label="Delivered"
                              value={order.deliveredPercent}
                              state={order.fulfillmentStatus}
                            />
                            <Progress
                              label="Invoiced"
                              value={order.invoicedPercent}
                              state={order.invoiceStatus}
                            />
                            <div className="sm:text-right">
                              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                                Order value
                              </p>
                              <p className="mt-1 font-black">
                                {money(order.totalAmount, order.currency)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              {orderRegisterError && <p role="alert" className="mt-3 text-sm text-red-600">{orderRegisterError}</p>}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                <span>Showing {orderRecords.length.toLocaleString()} of {orderRegisterTotalCount.toLocaleString()} sales orders</span>
                {orderRegisterHasMore && (
                  <button type="button" disabled={orderRegisterLoading} onClick={() => void loadMoreOrderRecords()} className="rounded-xl border border-[var(--sami-border)] px-4 py-2 font-semibold disabled:opacity-50">
                    {orderRegisterLoading ? 'Loading sales orders…' : 'Load more sales orders'}
                  </button>
                )}
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
                  {linkedOpportunity ? 'New quotation · ' + linkedOpportunity.name : 'New quotation'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Build the commercial offer from the selected opportunity. The link remains attached through the quotation lifecycle.
                </p>
              </div>

              {!opportunityLaunchResolved ? (
                <p className="rounded-xl border border-[var(--sami-border)] p-4 text-sm text-slate-500">
                  Loading opportunity details…
                </p>
              ) : opportunityLaunchError ? (
                <div className="space-y-3 rounded-xl border border-amber-300/60 p-4 text-sm">
                  <p className="text-amber-700">{opportunityLaunchError}</p>
                  <Link href="/apps/sales/opportunities" className="font-black text-blue-600 hover:underline">
                    Return to Leads & Opportunities
                  </Link>
                </div>
              ) : (
                <SalesQuoteComposer
                  key={linkedOpportunity?.id || 'standalone-new-quote'}
                  data={initialData}
                  linkedOpportunity={linkedOpportunity}
                  busy={busy}
                  onSave={saveQuote}
                  onCancel={() => {
                    router.push(
                      linkedOpportunityId
                        ? '/apps/sales/opportunities'
                        : '/apps/sales/quotes',
                    );
                  }}
                />
              )}
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
            currencyTotalsLabel(
              data.metrics.quoteValueByCurrency,
              data.company.currency,
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
            currencyTotalsLabel(
              data.metrics.acceptedValueByCurrency,
              data.company.currency,
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
            currencyTotalsLabel(
              data.metrics.orderValueByCurrency,
              data.company.currency,
            )
          }
          note={
            data.metrics.orderCount +
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
                item.status.replaceAll('_', ' ') + ' · ' + item.currency,
              primary:
                String(
                  item.count,
                ),
              secondary:
                money(
                  item.amount,
                  item.currency,
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
                item.month + ' · ' + item.currency,
              primary:
                String(
                  item.quoteCount,
                ) +
                ' quotes',
              secondary:
                money(
                  item.amount,
                  item.currency,
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
                item.customerName + ' · ' + item.currency,
              primary:
                String(
                  item.quoteCount,
                ) +
                ' quotes',
              secondary:
                money(
                  item.amount,
                  item.currency,
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
            label="Approval threshold (base currency)"
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


function currencyTotalsLabel(
  rows: Array<{ currency: string; amount: number }>,
  fallbackCurrency: string,
) {
  if (rows.length === 0) return fallbackCurrency + ' 0.00';
  return rows.map(row =>
    row.currency + ' ' + row.amount.toLocaleString('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  ).join(' · ');
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
      <p className="mt-2 break-words text-base font-black leading-snug">
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