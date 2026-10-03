import 'server-only';

import {
  getAccountingManagementReports,
} from '@/lib/apps/accounting/management-reporting';

import {
  getInvoicingWorkspaceData,
} from '@/lib/apps/invoicing/service';

import {
  getSalesWorkspaceData,
} from '@/lib/apps/sales/service';

import type {
  DashboardProvider,
} from '@/lib/dashboard/providers';

import type {
  DashboardPriority,
  DashboardTone,
} from '@/lib/dashboard/types';


function money(
  value:
    number | string,
  currency:
    string,
) {
  const amount =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      amount,
    )
  ) {
    return String(
      value,
    );
  }

  try {
    return new Intl.NumberFormat(
      'en',
      {
        style:
          'currency',
        currency:
          currency ||
          'KES',
        maximumFractionDigits:
          2,
      },
    ).format(
      amount,
    );
  } catch {
    return (
      (currency ||
        'KES') +
      ' ' +
      amount.toLocaleString()
    );
  }
}


function priorityFromSeverity(
  value:
    string,
): DashboardPriority {
  const severity =
    value
      .trim()
      .toLowerCase();

  if (
    severity ===
      'critical'
  ) {
    return 'critical';
  }

  if (
    severity ===
      'high'
  ) {
    return 'high';
  }

  if (
    severity ===
      'medium'
  ) {
    return 'normal';
  }

  return 'low';
}


function toneFromPriority(
  priority:
    DashboardPriority,
): DashboardTone {
  if (
    priority ===
      'critical'
  ) {
    return 'danger';
  }

  if (
    priority ===
      'high'
  ) {
    return 'warning';
  }

  return 'info';
}


export const accountingDashboardAnalysisProvider:
  DashboardProvider = {
  moduleKey:
    'accounting',

  supportedScopes: [
    'my',
    'business',
  ],

  async load() {
    const report =
      await getAccountingManagementReports();

    const unresolved =
      report.exceptions
        .filter(
          item =>
            !item.resolved,
        )
        .slice(
          0,
          6,
        );

    const attention =
      unresolved.map(
        item => {
          const priority =
            priorityFromSeverity(
              item.severity,
            );

          return {
            id:
              'accounting:exception:' +
              item.key,
            moduleKey:
              'accounting',
            title:
              item.title,
            description:
              item.description,
            priority,
            tone:
              toneFromPriority(
                priority,
              ),
            dueAt:
              null,
            href:
              item.href ||
              '/apps/accounting',
          };
        },
      );

    const work = [
      report.kpis.controls
        .draftJournals >
        0
        ? {
            id:
              'accounting:work:draft-journals',
            moduleKey:
              'accounting',
            title:
              report.kpis.controls
                .draftJournals +
              ' draft journal' +
              (
                report.kpis.controls
                  .draftJournals ===
                1
                  ? ''
                  : 's'
              ) +
              ' awaiting review',
            description:
              'Review draft postings before period close.',
            status:
              'open',
            priority:
              'normal' as const,
            dueAt:
              null,
            href:
              '/apps/accounting/journals',
          }
        : null,

      report.kpis.controls
        .unreconciledBankLines >
        0
        ? {
            id:
              'accounting:work:bank-reconciliation',
            moduleKey:
              'accounting',
            title:
              report.kpis.controls
                .unreconciledBankLines +
              ' bank line' +
              (
                report.kpis.controls
                  .unreconciledBankLines ===
                1
                  ? ''
                  : 's'
              ) +
              ' need reconciliation',
            description:
              'Unmatched bank activity can affect cash accuracy.',
            status:
              'open',
            priority:
              'high' as const,
            dueAt:
              null,
            href:
              '/apps/accounting/reconciliation',
          }
        : null,
    ].filter(
      (
        item,
      ): item is
        NonNullable<
          typeof item
        > =>
        Boolean(
          item,
        ),
    );

    return {
      moduleKey:
        'accounting',

      attention,

      work,

      metrics: [
        {
          id:
            'accounting:metric:revenue',
          moduleKey:
            'accounting',
          label:
            'Revenue',
          value:
            money(
              report.kpis
                .revenue.current,
              report.currency,
            ),
          description:
            'Current reporting period',
          tone:
            'neutral',
          scope:
            'my',
          weight:
            100,
        },
        {
          id:
            'accounting:metric:net-profit',
          moduleKey:
            'accounting',
          label:
            'Net profit',
          value:
            money(
              report.kpis
                .netProfit.current,
              report.currency,
            ),
          description:
            report.kpis.netProfit
              .marginPercent +
            '% margin',
          tone:
            Number(
              report.kpis
                .netProfit.current,
            ) <
            0
              ? 'danger'
              : 'success',
          scope:
            'my',
          weight:
            98,
        },
        {
          id:
            'accounting:metric:cash',
          moduleKey:
            'accounting',
          label:
            'Cash',
          value:
            money(
              report.kpis
                .cash.current,
              report.currency,
            ),
          description:
            'Current cash position',
          tone:
            'info',
          scope:
            'my',
          weight:
            96,
        },
        {
          id:
            'accounting:metric:overdue-receivables',
          moduleKey:
            'accounting',
          label:
            'Overdue receivables',
          value:
            money(
              report.kpis
                .receivables
                .overdue,
              report.currency,
            ),
          description:
            report.kpis
              .receivables
              .overdueInvoiceCount +
            ' overdue invoice' +
            (
              report.kpis
                .receivables
                .overdueInvoiceCount ===
              1
                ? ''
                : 's'
            ),
          tone:
            Number(
              report.kpis
                .receivables
                .overdue,
            ) >
            0
              ? 'warning'
              : 'success',
          scope:
            'my',
          weight:
            94,
        },
      ],

      actions: [
        {
          id:
            'accounting:action:open',
          moduleKey:
            'accounting',
          label:
            'Open Accounting',
          description:
            'Review financial performance and exceptions.',
          href:
            '/apps/accounting',
          priority:
            'normal',
        },
      ],

      aiContext: [
        {
          id:
            'accounting:analysis:kpis',
          moduleKey:
            'accounting',
          title:
            'Accounting performance',
          detail:
            'Revenue ' +
            money(
              report.kpis
                .revenue.current,
              report.currency,
            ) +
            '; net profit ' +
            money(
              report.kpis
                .netProfit.current,
              report.currency,
            ) +
            '; cash ' +
            money(
              report.kpis
                .cash.current,
              report.currency,
            ) +
            '.',
          priority:
            'high',
        },
        ...unresolved
          .slice(
            0,
            3,
          )
          .map(
            item => ({
              id:
                'accounting:analysis:' +
                item.key,
              moduleKey:
                'accounting',
              title:
                item.title,
              detail:
                item.description,
              priority:
                priorityFromSeverity(
                  item.severity,
                ),
            }),
          ),
      ],
    };
  },
};


export const invoicingDashboardAnalysisProvider:
  DashboardProvider = {
  moduleKey:
    'invoicing',

  supportedScopes: [
    'my',
    'business',
  ],

  async load() {
    const data =
      await getInvoicingWorkspaceData();

    const currency =
      data.company
        .currency;

    const attention =
      data.metrics
        .overdueCount >
      0
        ? [
            {
              id:
                'invoicing:attention:overdue',
              moduleKey:
                'invoicing',
              title:
                data.metrics
                  .overdueCount +
                ' overdue invoice' +
                (
                  data.metrics
                    .overdueCount ===
                  1
                    ? ''
                    : 's'
                ),
              description:
                money(
                  data.metrics
                    .overdueTotal,
                  currency,
                ) +
                ' is overdue and may need collection follow-up.',
              priority:
                'high' as const,
              tone:
                'warning' as const,
              dueAt:
                null,
              href:
                '/apps/invoicing/invoices',
            },
          ]
        : [];

    return {
      moduleKey:
        'invoicing',

      attention,

      metrics: [
        {
          id:
            'invoicing:metric:outstanding',
          moduleKey:
            'invoicing',
          label:
            'Outstanding',
          value:
            money(
              data.metrics
                .outstandingTotal,
              currency,
            ),
          description:
            'Open customer balances',
          tone:
            Number(
              data.metrics
                .outstandingTotal,
            ) >
            0
              ? 'info'
              : 'success',
          scope:
            'my',
          weight:
            92,
        },
        {
          id:
            'invoicing:metric:overdue',
          moduleKey:
            'invoicing',
          label:
            'Overdue',
          value:
            money(
              data.metrics
                .overdueTotal,
              currency,
            ),
          description:
            data.metrics
              .overdueCount +
            ' overdue',
          tone:
            data.metrics
              .overdueCount >
            0
              ? 'warning'
              : 'success',
          scope:
            'my',
          weight:
            90,
        },
        {
          id:
            'invoicing:metric:paid',
          moduleKey:
            'invoicing',
          label:
            'Collected',
          value:
            money(
              data.metrics
                .paidTotal,
              currency,
            ),
          description:
            'Payments allocated to invoices',
          tone:
            'success',
          scope:
            'my',
          weight:
            88,
        },
      ],

      actions: [
        {
          id:
            'invoicing:action:open',
          moduleKey:
            'invoicing',
          label:
            'Open Invoicing',
          description:
            'Review receivables and collections.',
          href:
            '/apps/invoicing',
          priority:
            'normal',
        },
      ],

      aiContext: [
        {
          id:
            'invoicing:analysis:receivables',
          moduleKey:
            'invoicing',
          title:
            'Receivables position',
          detail:
            money(
              data.metrics
                .outstandingTotal,
              currency,
            ) +
            ' outstanding; ' +
            money(
              data.metrics
                .overdueTotal,
              currency,
            ) +
            ' overdue across ' +
            data.metrics
              .overdueCount +
            ' invoice' +
            (
              data.metrics
                .overdueCount ===
              1
                ? ''
                : 's'
            ) +
            '.',
          priority:
            data.metrics
              .overdueCount >
            0
              ? 'high'
              : 'normal',
        },
      ],
    };
  },
};


export const salesDashboardAnalysisProvider:
  DashboardProvider = {
  moduleKey:
    'sales',

  supportedScopes: [
    'my',
    'business',
  ],

  async load() {
    const data =
      await getSalesWorkspaceData();

    const currency =
      data.company
        .currency;

    const quoteCount =
      data.metrics
        .quoteCount;

    const accepted =
      data.metrics
        .acceptedCount +
      data.metrics
        .convertedCount;

    const conversion =
      quoteCount >
      0
        ? Math.round(
            accepted /
            quoteCount *
            100,
          )
        : 0;

    const expiredQuotes =
      data.quotes
        .filter(
          quote =>
            quote.status ===
            'expired',
        )
        .slice(
          0,
          4,
        );

    return {
      moduleKey:
        'sales',

      attention:
        expiredQuotes.length >
        0
          ? [
              {
                id:
                  'sales:attention:expired-quotes',
                moduleKey:
                  'sales',
                title:
                  expiredQuotes
                    .length +
                  ' recent quotation' +
                  (
                    expiredQuotes
                      .length ===
                    1
                      ? ''
                      : 's'
                  ) +
                  ' expired',
                description:
                  'Review expired opportunities that may need follow-up or requoting.',
                priority:
                  'normal',
                tone:
                  'warning',
                dueAt:
                  null,
                href:
                  '/apps/sales',
              },
            ]
          : [],

      metrics: [
        {
          id:
            'sales:metric:quote-value',
          moduleKey:
            'sales',
          label:
            'Quoted value',
          value:
            money(
              data.metrics
                .quoteValue,
              currency,
            ),
          description:
            quoteCount +
            ' quotation' +
            (
              quoteCount ===
              1
                ? ''
                : 's'
            ),
          tone:
            'neutral',
          scope:
            'my',
          weight:
            86,
        },
        {
          id:
            'sales:metric:accepted-value',
          moduleKey:
            'sales',
          label:
            'Accepted value',
          value:
            money(
              data.metrics
                .acceptedValue,
              currency,
            ),
          description:
            conversion +
            '% quote conversion',
          tone:
            conversion >=
              50
              ? 'success'
              : 'info',
          scope:
            'my',
          weight:
            84,
        },
        {
          id:
            'sales:metric:order-value',
          moduleKey:
            'sales',
          label:
            'Sales orders',
          value:
            money(
              data.metrics
                .orderValue,
              currency,
            ),
          description:
            'Current order value',
          tone:
            'info',
          scope:
            'my',
          weight:
            82,
        },
      ],

      actions: [
        {
          id:
            'sales:action:open',
          moduleKey:
            'sales',
          label:
            'Open Sales',
          description:
            'Review quotes and sales orders.',
          href:
            '/apps/sales',
          priority:
            'normal',
        },
      ],

      aiContext: [
        {
          id:
            'sales:analysis:pipeline',
          moduleKey:
            'sales',
          title:
            'Sales pipeline',
          detail:
            money(
              data.metrics
                .quoteValue,
              currency,
            ) +
            ' quoted; ' +
            money(
              data.metrics
                .acceptedValue,
              currency,
            ) +
            ' accepted; ' +
            conversion +
            '% conversion.',
          priority:
            'normal',
        },
      ],
    };
  },
};
