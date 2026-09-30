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

import {
  getAccountingFoundation,
} from '@/lib/apps/accounting/foundation';
import {
  AccountingInputError,
} from '@/lib/apps/accounting/validation';
import {
  getAccountingSetup,
} from '@/lib/apps/accounting/setup';

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

  if (dedicatedSection) {
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

    tableItem(
      'journals',
      'Journal Entries',
      'Transactions',
      'Review draft and posted journal entries.',
    ),

    tableItem(
      'accounts',
      'Chart of Accounts',
      'Ledger',
      'Open the company chart of accounts.',
    ),

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
              foundation
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
