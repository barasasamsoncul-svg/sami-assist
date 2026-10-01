import Link from 'next/link';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  loadStandaloneEnterpriseApp,
} from '@/app/apps/_shared/loadStandaloneEnterpriseApp';

import AccountingFoundationPanel, {
  ACCOUNTING_SECTIONS,
  type AccountingSection,
} from '@/app/apps/accounting/AccountingFoundationPanel';
import AccountingModuleShell, {
  type AccountingSidebarItem,
} from '@/app/apps/accounting/AccountingModuleShell';
import AccountingWorkspaceClient from '@/app/apps/accounting/AccountingWorkspaceClient';
import AccountingChartOfAccounts from '@/app/apps/accounting/AccountingChartOfAccounts';
import AccountingJournals from '@/app/apps/accounting/AccountingJournals';
import AccountingOpeningBalances from '@/app/apps/accounting/AccountingOpeningBalances';
import AccountingReceivables from '@/app/apps/accounting/AccountingReceivables';
import AccountingPayables from '@/app/apps/accounting/AccountingPayables';
import AccountingPurchasing from '@/app/apps/accounting/AccountingPurchasing';

import {
  getAccountingFoundation,
} from '@/lib/apps/accounting/foundation';
import {
  AccountingInputError,
} from '@/lib/apps/accounting/validation';
import {
  getAccountingSetup,
} from '@/lib/apps/accounting/setup';
import {
  getChartOfAccounts,
} from '@/lib/apps/accounting/chart-of-accounts';
import {
  getAccountingJournals,
} from '@/lib/apps/accounting/journals';
import {
  getOpeningBalanceWorkspace,
} from '@/lib/apps/accounting/opening-balances';
import {
  getAccountingReceivables,
} from '@/lib/apps/accounting/receivables';
import {
  getAccountingPayables,
} from '@/lib/apps/accounting/payables';
import {
  getAccountingPurchasing,
} from '@/lib/apps/accounting/purchasing';

const MODULE_KEY = 'accounting';

export default async function AccountingWorkspace({
  section,
  filters = {},
}: {
  section?: string | null;
  filters?: {
    from?: string;
    to?: string;
    accountId?: string;
    page?: string;
    journalId?: string;
    batchId?: string;
    bucket?: string;
    customerId?: string;
    vendorId?: string;
    documentId?: string;
    search?: string;
  };
}) {
  const requestedSection =
    section ||
    'overview';

  const dedicatedSection =
    ACCOUNTING_SECTIONS.includes(
      requestedSection as AccountingSection,
    )
      ? requestedSection as AccountingSection
      : null;

  const {
    session,
    account,
    shell,
    data,
    notifications,
    resolved,
    can,
  } =
    await loadStandaloneEnterpriseApp(
      MODULE_KEY,
      dedicatedSection
        ? undefined
        : section,
    );

  let foundation:
    Awaited<
      ReturnType<
        typeof getAccountingFoundation
      >
    > |
    null =
      null;

  let foundationError =
    '';

  let accountingSetup:
    Awaited<
      ReturnType<
        typeof getAccountingSetup
      >
    > |
    null =
      null;

  let chartOfAccounts:
    Awaited<
      ReturnType<
        typeof getChartOfAccounts
      >
    > |
    null =
      null;

  let journalWorkspace:
    Awaited<
      ReturnType<
        typeof getAccountingJournals
      >
    > |
    null =
      null;

  let openingBalanceWorkspace:
    Awaited<
      ReturnType<
        typeof getOpeningBalanceWorkspace
      >
    > |
    null =
      null;

  let receivablesWorkspace:
    Awaited<
      ReturnType<
        typeof getAccountingReceivables
      >
    > |
    null =
      null;

  let payablesWorkspace:
    Awaited<
      ReturnType<
        typeof getAccountingPayables
      >
    > |
    null =
      null;

  let purchasingWorkspace:
    Awaited<
      ReturnType<
        typeof getAccountingPurchasing
      >
    > |
    null =
      null;

  if (
    dedicatedSection &&
    dedicatedSection !==
      'accounts' &&
    dedicatedSection !==
      'journals' &&
    dedicatedSection !==
      'recurring-journals' &&
    dedicatedSection !==
      'opening-balances' &&
    dedicatedSection !==
      'receivables' &&
    dedicatedSection !==
      'payables' &&
    dedicatedSection !==
      'purchasing'
  ) {
    try {
      foundation =
        await getAccountingFoundation(
          filters,
        );
    } catch (error) {
      foundationError =
        error instanceof
          AccountingInputError
          ? error.message
          : 'Accounting data could not be loaded. Retry this page.';

      if (
        !(
          error instanceof
            AccountingInputError
        )
      ) {
        console.error(
          '[Accounting] Foundation load failed',
          error,
        );
      }
    }
  }

  if (
    dedicatedSection ===
      'accounts'
  ) {
    try {
      chartOfAccounts =
        await getChartOfAccounts();
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          Error
          ? error.message
          : 'Chart of Accounts could not be loaded.';
    }
  }

  if (
    dedicatedSection ===
      'journals' ||
    dedicatedSection ===
      'recurring-journals'
  ) {
    try {
      journalWorkspace =
        await getAccountingJournals(
          filters.journalId,
        );
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          Error
          ? error.message
          : 'Accounting journals could not be loaded.';
    }
  }

  if (
    dedicatedSection ===
      'opening-balances'
  ) {
    try {
      openingBalanceWorkspace =
        await getOpeningBalanceWorkspace(
          filters.batchId,
          filters.page,
        );
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          Error
          ? error.message
          : 'Opening balances could not be loaded.';
    }
  }

  if (
    dedicatedSection ===
      'receivables'
  ) {
    try {
      receivablesWorkspace =
        await getAccountingReceivables({
          page:
            filters.page,
          bucket:
            filters.bucket,
          customerId:
            filters.customerId,
          search:
            filters.search,
        });
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          Error
          ? error.message
          : 'Accounts receivable could not be loaded.';
    }
  }

  if (
    dedicatedSection ===
      'payables'
  ) {
    try {
      payablesWorkspace =
        await getAccountingPayables({
          page:
            filters.page,
          bucket:
            filters.bucket,
          vendorId:
            filters.vendorId,
          search:
            filters.search,
          documentId:
            filters.documentId,
        });
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          Error
          ? error.message
          : 'Accounts payable could not be loaded.';
    }
  }

  if (
    dedicatedSection ===
      'purchasing'
  ) {
    try {
      purchasingWorkspace =
        await getAccountingPurchasing({
          page:
            filters.page,
        });
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          Error
          ? error.message
          : 'Purchasing controls could not be loaded.';
    }
  }

  if (
    dedicatedSection ===
      'setup' &&
    foundation
  ) {
    try {
      accountingSetup =
        await getAccountingSetup();
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          Error
          ? error.message
          : 'Accounting Setup could not be loaded.';
    }
  }

  const appBaseHref =
    '/apps/accounting';

  const tableByKey =
    new Map(
      data.tables.map(
        table => [
          table.key,
          table,
        ],
      ),
    );

  const tableItem = (
    key:
      string,
    label:
      string,
    sectionLabel:
      string,
    description:
      string,
  ):
    AccountingSidebarItem |
    null => {
    const table =
      tableByKey.get(
        key,
      );

    if (!table) {
      return null;
    }

    return {
      key,
      label,
      href:
        appBaseHref +
        '/' +
        encodeURIComponent(
          key,
        ),
      description,
      sectionLabel,
      badge:
        table.count,
    };
  };

  const sidebarCandidates:
    Array<
      AccountingSidebarItem |
      null |
      false
    > = [
    {
      key:
        'overview',
      label:
        'Dashboard',
      href:
        appBaseHref,
      description:
        'Financial command center and book health.',
      sectionLabel:
        'Overview',
    },

    data.capabilities
      .canCreate
      ? {
          key:
            'new-journal',
          label:
            'New Journal',
          href:
            appBaseHref +
            '/new-journal',
          description:
            'Create a balanced manual journal draft.',
          sectionLabel:
            'Transactions',
        }
      : null,

    {
      key:
        'journals',
      label:
        'Journal Entries',
      href:
        appBaseHref +
        '/journals',
      description:
        'Review, approve, post and reverse journal entries.',
      sectionLabel:
        'Transactions',
      badge:
        journalWorkspace
          ?.journals
          .length ??
        tableByKey
          .get(
            'journals',
          )
          ?.count,
    },

    {
      key:
        'recurring-journals',
      label:
        'Recurring Journals',
      href:
        appBaseHref +
        '/recurring-journals',
      description:
        'Generate controlled repeatable journal drafts.',
      sectionLabel:
        'Transactions',
      badge:
        journalWorkspace
          ?.counts
          .recurringActive,
    },

    tableItem(
      'accounts',
      'Chart of Accounts',
      'Ledger',
      'Open the company chart of accounts.',
    ),

    {
      key:
        'opening-balances',
      label:
        'Opening Balances',
      href:
        appBaseHref +
        '/opening-balances',
      description:
        'Import, validate and post migration balances.',
      sectionLabel:
        'Ledger',
      badge:
        openingBalanceWorkspace
          ?.counts
          .validated,
    },


    {
      key:
        'receivables',
      label:
        'Accounts Receivable',
      href:
        appBaseHref +
        '/receivables',
      description:
        'Customer aging, credits and control reconciliation.',
      sectionLabel:
        'Receivables',
      badge:
        receivablesWorkspace
          ?.metrics
          .overdueInvoiceCount,
    },

    {
      key:
        'payables',
      label:
        'Accounts Payable',
      href:
        appBaseHref +
        '/payables',
      description:
        'Vendor bills, credits, aging and AP control reconciliation.',
      sectionLabel:
        'Payables',
      badge:
        payablesWorkspace
          ?.metrics
          .overdueBillCount,
    },

    {
      key:
        'purchasing',
      label:
        'Purchasing Controls',
      href:
        appBaseHref +
        '/purchasing',
      description:
        'Requisitions, purchase orders, receipts and three-way matching.',
      sectionLabel:
        'Payables',
      badge:
        purchasingWorkspace
          ?.counts
          .matchExceptions,
    },

    data.capabilities
      .canReport
      ? {
          key:
            'general-ledger',
          label:
            'General Ledger',
          href:
            appBaseHref +
            '/general-ledger',
          description:
            'Drill into posted account movements.',
          sectionLabel:
            'Ledger',
        }
      : null,

    data.capabilities
      .canReport
      ? {
          key:
            'trial-balance',
          label:
            'Trial Balance',
          href:
            appBaseHref +
            '/trial-balance',
          description:
            'Review opening, movement and closing balances.',
          sectionLabel:
            'Ledger',
        }
      : null,

    tableItem(
      'accounting_bank_accounts',
      'Bank & Cash',
      'Banking',
      'Bank, cash and mobile-money ledger accounts.',
    ),

    tableItem(
      'accounting_bank_statement_lines',
      'Bank Statements',
      'Banking',
      'Imported statement transactions and matching state.',
    ),

    tableItem(
      'accounting_reconciliation_rules',
      'Reconciliation Rules',
      'Banking',
      'Rules used to classify and match bank transactions.',
    ),

    data.capabilities
      .canReport
      ? {
          key:
            'reports',
          label:
            'Reports',
          href:
            appBaseHref +
            '/reports',
          description:
            'Accounting reports and operational analysis.',
          sectionLabel:
            'Insights',
        }
      : null,

    {
      key:
        'activity',
      label:
        'Activity & Audit',
      href:
        appBaseHref +
        '/activity',
      description:
        'Recent Accounting changes and user actions.',
      sectionLabel:
        'Insights',
    },

    data.capabilities
      .canManageSettings
      ? {
          key:
            'setup',
          label:
            'Accounting Setup',
          href:
            appBaseHref +
            '/setup',
          description:
            'Prepare the books and required accounting controls.',
          sectionLabel:
            'Configuration',
        }
      : null,

    tableItem(
      'accounting_fiscal_periods',
      'Fiscal Periods',
      'Configuration',
      'Open, close and review accounting periods.',
    ),
  ];

  const appSidebarItems =
    sidebarCandidates.filter(
      (
        item,
      ): item is AccountingSidebarItem =>
        Boolean(
          item,
        ),
    );

  const activeSidebarKey =
    dedicatedSection ||
    (
      resolved.view ===
        'records'
        ? resolved.tableKey
        : resolved.view
    );

  return (
    <AccountingModuleShell
      user={
        session.user
      }
      tenant={
        account.tenant
      }
      modules={
        shell.accessibleModules
      }
      appSidebarItems={
        appSidebarItems
      }
      activeSidebarKey={
        activeSidebarKey ||
        'overview'
      }
      sidebarCapabilities={{
        aiEnabled:
          shell.aiAvailable,
        notificationsEnabled:
          can(
            SAMI_PERMISSIONS
              .NOTIFICATIONS_VIEW,
          ),
      }}
      unreadNotifications={
        notifications
          ?.unreadCount ||
        0
      }
      companyName={
        data.company.name
      }
    >
      {
        dedicatedSection
          ? (
              dedicatedSection ===
                'payables'
                ? (
                    payablesWorkspace
                      ? (
                          <AccountingPayables
                            data={
                              payablesWorkspace
                            }
                            canCreate={
                              data.capabilities
                                .canCreate
                            }
                            canEdit={
                              data.capabilities
                                .canEdit
                            }
                          />
                        )
                      : (
                          <div
                            role="alert"
                            className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-6 text-[var(--foreground)]"
                          >
                            {
                              foundationError ||
                              'Accounts payable could not be loaded.'
                            }{' '}
                            <Link
                              href="/apps/accounting"
                              className="font-bold underline underline-offset-4"
                            >
                              Return to Accounting
                            </Link>
                          </div>
                        )
                  )
                :               dedicatedSection ===
                'receivables'
                ? (
                    receivablesWorkspace
                      ? (
                          <AccountingReceivables
                            data={
                              receivablesWorkspace
                            }
                          />
                        )
                      : (
                          <div
                            role="alert"
                            className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-6 text-[var(--foreground)]"
                          >
                            {
                              foundationError ||
                              'Accounts receivable could not be loaded.'
                            }{' '}
                            <Link
                              href="/apps/accounting"
                              className="font-bold underline underline-offset-4"
                            >
                              Return to Accounting
                            </Link>
                          </div>
                        )
                  )
                : dedicatedSection ===
                    'purchasing'
                  ? (
                    purchasingWorkspace
                      ? (
                          <AccountingPurchasing
                            data={
                              purchasingWorkspace
                            }
                            canCreate={
                              data.capabilities
                                .canCreate
                            }
                            canEdit={
                              data.capabilities
                                .canEdit
                            }
                          />
                        )
                      : (
                          <div
                            role="alert"
                            className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-6 text-[var(--foreground)]"
                          >
                            {
                              foundationError ||
                              'Purchasing controls could not be loaded.'
                            }{' '}
                            <Link
                              href="/apps/accounting"
                              className="font-bold underline underline-offset-4"
                            >
                              Return to Accounting
                            </Link>
                          </div>
                        )
                  )
                : dedicatedSection ===
                    'opening-balances'
                  ? (
                    openingBalanceWorkspace
                      ? (
                          <AccountingOpeningBalances
                            data={
                              openingBalanceWorkspace
                            }
                            canCreate={
                              data.capabilities
                                .canCreate
                            }
                            canEdit={
                              data.capabilities
                                .canEdit
                            }
                          />
                        )
                      : (
                          <div
                            role="alert"
                            className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-6 text-[var(--foreground)]"
                          >
                            {
                              foundationError ||
                              'Opening balances could not be loaded.'
                            }{' '}
                            <Link
                              href="/apps/accounting"
                              className="font-bold underline underline-offset-4"
                            >
                              Return to Accounting
                            </Link>
                          </div>
                        )
                  )
                : (
                dedicatedSection ===
                  'journals' ||
                dedicatedSection ===
                  'recurring-journals'
              )
                ? (
                    journalWorkspace
                      ? (
                          <AccountingJournals
                            data={
                              journalWorkspace
                            }
                            section={
                              dedicatedSection
                            }
                            canCreate={
                              data.capabilities
                                .canCreate
                            }
                            canEdit={
                              data.capabilities
                                .canEdit
                            }
                          />
                        )
                      : (
                          <div
                            role="alert"
                            className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-6 text-[var(--foreground)]"
                          >
                            {
                              foundationError ||
                              'Accounting journals could not be loaded.'
                            }{' '}
                            <Link
                              href="/apps/accounting"
                              className="font-bold underline underline-offset-4"
                            >
                              Return to Accounting
                            </Link>
                          </div>
                        )
                  )
                : dedicatedSection ===
                    'accounts'
                  ? (
                    chartOfAccounts
                      ? (
                          <AccountingChartOfAccounts
                            initialChart={
                              chartOfAccounts
                            }
                            canCreate={
                              data.capabilities
                                .canCreate
                            }
                            canEdit={
                              data.capabilities
                                .canEdit
                            }
                            canManageSettings={
                              data.capabilities
                                .canManageSettings
                            }
                          />
                        )
                      : (
                          <div
                            role="alert"
                            className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-6 text-[var(--foreground)]"
                          >
                            {
                              foundationError ||
                              'Chart of Accounts could not be loaded.'
                            }{' '}
                            <Link
                              href="/apps/accounting"
                              className="font-bold underline underline-offset-4"
                            >
                              Return to Accounting
                            </Link>
                          </div>
                        )
                  )
                : foundation
                  ? (
                    <AccountingFoundationPanel
                      data={
                        foundation
                      }
                      section={
                        dedicatedSection
                      }
                      canCreate={
                        data.capabilities
                          .canCreate
                      }
                      canManageSettings={
                        data.capabilities
                          .canManageSettings
                      }
                      setup={
                        accountingSetup
                      }
                    />
                  )
                : (
                    <div
                      role="alert"
                      className="rounded-2xl border border-[var(--sami-border)] bg-[var(--sami-surface)] p-6 text-[var(--foreground)]"
                    >
                      {
                        foundationError
                      }{' '}
                      <Link
                        href="/apps/accounting"
                        className="font-bold underline underline-offset-4"
                      >
                        Return to Accounting
                      </Link>
                    </div>
                  )
            )
          : (
              <AccountingWorkspaceClient
                initialData={
                  data
                }
                userId={
                  session.user.id
                }
                initialView={
                  resolved.view
                }
                initialTableKey={
                  resolved.tableKey
                }
                accessibleModuleKeys={
                  shell
                    .accessibleModules
                    .map(
                      module =>
                        module.registryKey,
                    )
                }
              />
            )
      }
    </AccountingModuleShell>
  );
}
