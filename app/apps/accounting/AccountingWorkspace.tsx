import AccountingInventoryValuation from './AccountingInventoryValuation';
import { getAccountingInventoryValuation } from '@/lib/apps/accounting/inventory-valuation';
import AccountingAccruals from './AccountingAccruals';
import { getAccountingAccruals } from '@/lib/apps/accounting/accruals';
import AccountingFinancing from './AccountingFinancing';
import { getAccountingFinancing } from '@/lib/apps/accounting/financing-loader';
import AccountingBudgets from './AccountingBudgets';
import { getAccountingBudgets } from '@/lib/apps/accounting/budgets';
import AccountingDimensions from './AccountingDimensions';
import { getAccountingDimensions } from '@/lib/apps/accounting/dimensions';
import AccountingPayroll from './AccountingPayroll';
import { getAccountingPayroll } from '@/lib/apps/accounting/payroll';
import AccountingConsolidation from './AccountingConsolidation';
import { getAccountingConsolidation } from '@/lib/apps/accounting/consolidation';
import AccountingFinancialStatements from './AccountingFinancialStatements';
import { getAccountingFinancialStatements } from '@/lib/apps/accounting/financial-statements';
import AccountingManagementReports from './AccountingManagementReports';
import { getAccountingManagementReports } from '@/lib/apps/accounting/management-reporting';
import AccountingPeriodClosing from './AccountingPeriodClosing';
import { getAccountingPeriodClosing } from '@/lib/apps/accounting/period-closing';
import AccountingApprovalControls from './AccountingApprovalControls';
import { getAccountingApprovalControls } from '@/lib/apps/accounting/approval-controls';
import AccountingCollaboration from './AccountingCollaboration';
import { getAccountingCollaboration } from '@/lib/apps/accounting/collaboration';
import AccountingFx from './AccountingFx';
import { getAccountingFx } from '@/lib/apps/accounting/fx';
import AccountingInternational from './AccountingInternational';
import { getAccountingInternational } from '@/lib/apps/accounting/international';
import AccountingKenya from './AccountingKenya';
import { getAccountingKenya } from '@/lib/apps/accounting/kenya';
import AccountingTaxes from './AccountingTaxes';
import { getAccountingTaxes } from '@/lib/apps/accounting/taxes';
import AccountingPayments from './AccountingPayments';
import { getAccountingPayments } from '@/lib/apps/accounting/payments';
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
import AccountingExpenses from '@/app/apps/accounting/AccountingExpenses';
import AccountingBankCash from '@/app/apps/accounting/AccountingBankCash';
import AccountingStatements from '@/app/apps/accounting/AccountingStatements';
import AccountingReconciliation from '@/app/apps/accounting/AccountingReconciliation';

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
import {
  getAccountingExpenses,
} from '@/lib/apps/accounting/expenses';
import {
  getAccountingBankCash,
} from '@/lib/apps/accounting/bank-cash';
import {
  getAccountingStatements,
} from '@/lib/apps/accounting/statements';
import {
  getAccountingReconciliation,
} from '@/lib/apps/accounting/reconciliation';

const MODULE_KEY = 'accounting';

export default async function AccountingWorkspace({
  section,
  filters = {},
}: {
  section?: string | null;
  filters?: {
    from?: string;
    to?: string;
    compareFrom?: string;
    compareTo?: string;
    accountId?: string;
    page?: string;
    journalId?: string;
    batchId?: string;
    bucket?: string;
    customerId?: string;
    vendorId?: string;
    documentId?: string;
    search?: string;
    statementLineId?: string;
    periodId?: string;
    model?: string;
    recordId?: string;
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
      {
        lightweight:
          Boolean(
            dedicatedSection,
          ),
      },
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

  let expensesWorkspace:
    Awaited<
      ReturnType<
        typeof getAccountingExpenses
      >
    > |
    null =
      null;

  let bankCashWorkspace:
    Awaited<
      ReturnType<
        typeof getAccountingBankCash
      >
    > |
    null =
      null;

  let statementsWorkspace:
    Awaited<
      ReturnType<
        typeof getAccountingStatements
      >
    > |
    null =
      null;

  let paymentsWorkspace: Awaited<ReturnType<typeof getAccountingPayments>> | null = null;
  let taxesWorkspace: Awaited<ReturnType<typeof getAccountingTaxes>> | null = null;
  let kenyaWorkspace: Awaited<ReturnType<typeof getAccountingKenya>> | null = null;
  let internationalWorkspace: Awaited<ReturnType<typeof getAccountingInternational>> | null = null;
  let fxWorkspace: Awaited<ReturnType<typeof getAccountingFx>> | null = null;
  let inventoryValuationWorkspace: Awaited<ReturnType<typeof getAccountingInventoryValuation>> | null = null;
  let accrualsWorkspace: Awaited<ReturnType<typeof getAccountingAccruals>> | null = null;
  let financingWorkspace: Awaited<ReturnType<typeof getAccountingFinancing>> | null = null;
  let budgetsWorkspace: Awaited<ReturnType<typeof getAccountingBudgets>> | null = null;
  let dimensionsWorkspace: Awaited<ReturnType<typeof getAccountingDimensions>> | null = null;
  let payrollWorkspace: Awaited<ReturnType<typeof getAccountingPayroll>> | null = null;
  let consolidationWorkspace: Awaited<ReturnType<typeof getAccountingConsolidation>> | null = null;
  let financialStatementsWorkspace: Awaited<ReturnType<typeof getAccountingFinancialStatements>> | null = null;
  let managementReportsWorkspace: Awaited<ReturnType<typeof getAccountingManagementReports>> | null = null;
  let periodClosingWorkspace: Awaited<ReturnType<typeof getAccountingPeriodClosing>> | null = null;
  let approvalControlsWorkspace: Awaited<ReturnType<typeof getAccountingApprovalControls>> | null = null;
  let collaborationWorkspace: Awaited<ReturnType<typeof getAccountingCollaboration>> | null = null;

  let reconciliationWorkspace:
    Awaited<
      ReturnType<
        typeof getAccountingReconciliation
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
      'purchasing' &&
    dedicatedSection !==
      'expenses' &&
    dedicatedSection !==
      'bank-cash' &&
    dedicatedSection !==
      'statements' &&
    dedicatedSection !== 'payments' &&
    dedicatedSection !== 'taxes' &&
    dedicatedSection !== 'kenya' &&
    dedicatedSection !== 'international' &&
    dedicatedSection !== 'fx' &&
    dedicatedSection !== 'inventory-valuation' &&
    dedicatedSection !== 'accruals-deferrals' &&
    dedicatedSection !== 'loans-financing' &&
    dedicatedSection !== 'budgets-forecasts' &&
    dedicatedSection !== 'project-departmental' &&
    dedicatedSection !== 'payroll-integration' &&
    dedicatedSection !== 'multi-company-consolidation' &&
    dedicatedSection !== 'financial-statements' &&
    dedicatedSection !== 'management-reporting' &&
    dedicatedSection !== 'period-closing' &&
    dedicatedSection !== 'approval-controls' &&
    dedicatedSection !== 'documents-collaboration' &&
    dedicatedSection !==
      'reconciliation'
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
      'expenses'
  ) {
    try {
      expensesWorkspace =
        await getAccountingExpenses({
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
          : 'Expenses and reimbursements could not be loaded.';
    }
  }

  if (
    dedicatedSection ===
      'bank-cash'
  ) {
    try {
      bankCashWorkspace =
        await getAccountingBankCash({
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
          : 'Bank, cash and mobile-money accounts could not be loaded.';
    }
  }

  if (
    dedicatedSection ===
      'statements'
  ) {
    try {
      statementsWorkspace =
        await getAccountingStatements({
          batchId:
            filters.batchId,
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
          : 'Statement imports and feeds could not be loaded.';
    }
  }

  if (dedicatedSection === 'payments') {
    try { paymentsWorkspace = await getAccountingPayments(filters.page); }
    catch (error) { foundationError = error instanceof AccountingInputError ? error.message : 'Payments could not be loaded. Retry this page.'; }
  }

  if (dedicatedSection === 'taxes') {
    try { taxesWorkspace = await getAccountingTaxes(); }
    catch (error) { foundationError = error instanceof AccountingInputError ? error.message : 'Taxes could not be loaded. Retry this page.'; }
  }

  if (dedicatedSection === 'kenya') {
    try { kenyaWorkspace = await getAccountingKenya({from:filters.from,to:filters.to}); }
    catch (error) { foundationError = error instanceof AccountingInputError ? error.message : 'Kenya accounting could not be loaded. Retry this page.'; }
  }

  if (dedicatedSection === 'international') {
    try { internationalWorkspace = await getAccountingInternational({from:filters.from,to:filters.to}); }
    catch (error) { foundationError = error instanceof AccountingInputError ? error.message : 'International localization could not be loaded. Retry this page.'; }
  }

  if (dedicatedSection === 'fx') {
    try { fxWorkspace = await getAccountingFx({asOf:filters.to || filters.from}); }
    catch (error) { foundationError = error instanceof AccountingInputError ? error.message : 'Foreign currency could not be loaded. Retry this page.'; }
  }

  if (dedicatedSection === 'inventory-valuation') {
    try { inventoryValuationWorkspace = await getAccountingInventoryValuation(); }
    catch (error) { foundationError = error instanceof AccountingInputError ? error.message : 'Inventory valuation could not be loaded. Retry this page.'; }
  }

  if (
    dedicatedSection ===
      'accruals-deferrals'
  ) {
    try {
      accrualsWorkspace =
        await getAccountingAccruals();
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          AccountingInputError
          ? error.message
          : 'Accruals and deferrals could not be loaded. Retry this page.';
    }
  }

  if (
    dedicatedSection ===
      'loans-financing'
  ) {
    try {
      financingWorkspace =
        await getAccountingFinancing();
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          AccountingInputError
          ? error.message
          : 'Loans and financing could not be loaded. Retry this page.';
    }
  }

  if (
    dedicatedSection ===
      'budgets-forecasts'
  ) {
    try {
      budgetsWorkspace =
        await getAccountingBudgets();
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          AccountingInputError
          ? error.message
          : 'Budgets and forecasts could not be loaded. Retry this page.';
    }
  }

  if (
    dedicatedSection ===
      'project-departmental'
  ) {
    try {
      dimensionsWorkspace =
        await getAccountingDimensions({
          from: filters.from,
          to: filters.to,
        });
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          AccountingInputError
          ? error.message
          : 'Project and departmental accounting could not be loaded. Retry this page.';
    }
  }

  if (
    dedicatedSection ===
      'payroll-integration'
  ) {
    try {
      payrollWorkspace =
        await getAccountingPayroll();
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          AccountingInputError
          ? error.message
          : 'Payroll accounting integration could not be loaded. Retry this page.';
    }
  }

  if (
    dedicatedSection ===
      'multi-company-consolidation'
  ) {
    try {
      consolidationWorkspace =
        await getAccountingConsolidation();
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          AccountingInputError
          ? error.message
          : 'Multi-company consolidation could not be loaded. Retry this page.';
    }
  }

  if (
    dedicatedSection ===
      'financial-statements'
  ) {
    try {
      financialStatementsWorkspace =
        await getAccountingFinancialStatements({
          from: filters.from,
          to: filters.to,
          compareFrom: filters.compareFrom,
          compareTo: filters.compareTo,
        });
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          AccountingInputError
          ? error.message
          : 'Financial statements could not be loaded. Retry this page.';
    }
  }

  if (
    dedicatedSection ===
      'management-reporting'
  ) {
    try {
      managementReportsWorkspace =
        await getAccountingManagementReports({
          from: filters.from,
          to: filters.to,
          compareFrom: filters.compareFrom,
          compareTo: filters.compareTo,
        });
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          AccountingInputError
          ? error.message
          : 'Management and exception reporting could not be loaded. Retry this page.';
    }
  }

  if (
    dedicatedSection ===
      'period-closing'
  ) {
    try {
      periodClosingWorkspace =
        await getAccountingPeriodClosing({
          periodId: filters.periodId,
        });
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          Error
          ? error.message
          : 'Period closing could not be loaded.';
    }
  }

  if (
    dedicatedSection ===
      'approval-controls'
  ) {
    try {
      approvalControlsWorkspace =
        await getAccountingApprovalControls();
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          Error
          ? error.message
          : 'Accounting approval controls could not be loaded.';
    }
  }

  if (
    dedicatedSection ===
      'documents-collaboration'
  ) {
    try {
      collaborationWorkspace =
        await getAccountingCollaboration({
          model: filters.model,
          recordId: filters.recordId,
        });
    } catch (
      error
    ) {
      foundationError =
        error instanceof
          Error
          ? error.message
          : 'Accounting documents and collaboration could not be loaded.';
    }
  }

  if (
    dedicatedSection ===
      'reconciliation'
  ) {
    try {
      reconciliationWorkspace =
        await getAccountingReconciliation({
          statementLineId:
            filters.statementLineId,
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
          : 'Bank reconciliation could not be loaded.';
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

    {
      key:
        'expenses',
      label:
        'Expenses & Reimbursements',
      href:
        appBaseHref +
        '/expenses',
      description:
        'Approved expense posting, employee payable and reimbursements.',
      sectionLabel:
        'Expenses',
      badge:
        expensesWorkspace
          ?.metrics
          .approvedUnposted,
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

    {
      key:
        'bank-cash',
      label:
        'Bank, Cash & Mobile Money',
      href:
        appBaseHref +
        '/bank-cash',
      description:
        'Financial accounts, posted balances and internal transfers.',
      sectionLabel:
        'Banking',
      badge:
        bankCashWorkspace
          ?.metrics
          .activeAccounts,
    },

    {
      key:
        'statements',
      label:
        'Statements & Feeds',
      href:
        appBaseHref +
        '/statements',
      description:
        'CSV, OFX, QIF and normalized feed intake with duplicate diagnostics.',
      sectionLabel:
        'Banking',
      badge:
        statementsWorkspace
          ?.metrics
          .errorsThisMonth,
    },

    {key: 'payments',label: 'Payments & settlements',href: appBaseHref + '/payments',description: 'Vendor payment batches and provider settlements.',sectionLabel: 'Banking'},

    {key:'taxes',label:'Taxes',href:appBaseHref+'/taxes',description:'Tax codes, groups, calculations and tax register.',sectionLabel:'Configuration'},

    {key:'kenya',label:'Kenya accounting & eTIMS',href:appBaseHref+'/kenya',description:'Kenya VAT controls and shared KRA eTIMS fiscal evidence.',sectionLabel:'Configuration'},

    {key:'international',label:'International localization',href:appBaseHref+'/international',description:'Country packs, tax report boxes and shared UBL/Peppol evidence.',sectionLabel:'Configuration'},

    {key:'fx',label:'Foreign currency',href:appBaseHref+'/fx',description:'Exchange rates, foreign positions, FX settlements and revaluation.',sectionLabel:'Banking'},

    {key:'inventory-valuation',label:'Inventory valuation',href:appBaseHref+'/inventory-valuation',description:'Standard-cost COGS, inventory journals and stock-to-GL reconciliation.',sectionLabel:'Operations'},

    {
      key:
        'accruals-deferrals',
      label:
        'Accruals & Deferrals',
      href:
        appBaseHref +
        '/accruals-deferrals',
      description:
        'Prepayments, deferred revenue, accrual recognition and controlled reversals.',
      sectionLabel:
        'Operations',
      badge:
        accrualsWorkspace
          ?.metrics
          .due_count,
    },

    {
      key:
        'loans-financing',
      label:
        'Loans & Financing',
      href:
        appBaseHref +
        '/loans-financing',
      description:
        'Borrowings, loan receivables, interest, repayments and balance-sheet classification.',
      sectionLabel:
        'Operations',
      badge:
        financingWorkspace
          ?.metrics
          .active_facilities,
    },

    {
      key:
        'budgets-forecasts',
      label:
        'Budgets & Forecasts',
      href:
        appBaseHref +
        '/budgets-forecasts',
      description:
        'Versioned budgets, rolling forecasts, scenarios and actual-versus-plan variance.',
      sectionLabel:
        'Insights',
      badge:
        budgetsWorkspace
          ?.metrics
          .variance_alerts,
    },

    {
      key:
        'project-departmental',
      label:
        'Projects & Departments',
      href:
        appBaseHref +
        '/project-departmental',
      description:
        'Analytic allocations, departmental performance, project profitability and dimensional budgets.',
      sectionLabel:
        'Insights',
      badge:
        dimensionsWorkspace
          ?.unassigned
          .line_count,
    },

    {
      key:
        'payroll-integration',
      label:
        'Payroll Integration',
      href:
        appBaseHref +
        '/payroll-integration',
      description:
        'Approved payroll posting, liability controls and employee department/project attribution.',
      sectionLabel:
        'Operations',
      badge:
        payrollWorkspace
          ?.metrics
          .unpostedApproved,
    },

    {
      key:
        'multi-company-consolidation',
      label:
        'Multi-company & Consolidation',
      href:
        appBaseHref +
        '/multi-company-consolidation',
      description:
        'Authorized multi-company ledgers, ownership, FX translation, eliminations and consolidated snapshots.',
      sectionLabel:
        'Insights',
      badge:
        consolidationWorkspace
          ?.metrics
          .activeGroups,
    },

    {
      key:
        'financial-statements',
      label:
        'Financial Statements',
      href:
        appBaseHref +
        '/financial-statements',
      description:
        'Profit & Loss, Balance Sheet, Cash Flow, Changes in Equity and comparative snapshots.',
      sectionLabel:
        'Insights',
      badge:
        financialStatementsWorkspace
          ?.snapshots
          .filter(row => row.status === 'generated')
          .length,
    },

    {
      key:
        'management-reporting',
      label:
        'Management Reports',
      href:
        appBaseHref +
        '/management-reporting',
      description:
        'Executive KPIs, 12-month performance trends and prioritized accounting exceptions.',
      sectionLabel:
        'Insights',
      badge:
        managementReportsWorkspace
          ?.exceptionSummary
          .total,
    },

    {
      key:
        'period-closing',
      label:
        'Period Closing',
      href:
        appBaseHref +
        '/period-closing',
      description:
        'Month-end and year-end controls, posting locks, retained earnings close and reopen audit trail.',
      sectionLabel:
        'Control',
      badge:
        periodClosingWorkspace
          ?.periods
          .filter(row => row.status === 'open')
          .length,
    },

    {
      key:
        'approval-controls',
      label:
        'Approvals & Audit',
      href:
        appBaseHref +
        '/approval-controls',
      description:
        'Maker-checker, amount bands, approval routing, posting separation and audit exceptions.',
      sectionLabel:
        'Control',
      badge:
        approvalControlsWorkspace
          ?.pending
          .length,
    },

    {
      key:
        'documents-collaboration',
      label:
        'Documents & Collaboration',
      href:
        appBaseHref +
        '/documents-collaboration',
      description:
        'Secure Accounting attachments, comments, mentions, followers and revision evidence.',
      sectionLabel:
        'Control',
      badge:
        collaborationWorkspace
          ?.recentFiles
          .length,
    },

    {
      key:
        'reconciliation',
      label:
        'Reconciliation',
      href:
        appBaseHref +
        '/reconciliation',
      description:
        'Match statement lines to posted ledger movement, split allocations and controlled adjustments.',
      sectionLabel:
        'Banking',
      badge:
        reconciliationWorkspace
          ?.metrics
          .unmatched,
    },

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
                : dedicatedSection === 'payments'
                  ? (paymentsWorkspace ? <AccountingPayments data={paymentsWorkspace} canCreate={data.capabilities.canCreate} canTransition={data.capabilities.canTransition}/> : <div role="alert">{foundationError || 'Payments could not be loaded.'}</div>)
                : dedicatedSection === 'taxes'
                  ? (taxesWorkspace ? <AccountingTaxes data={taxesWorkspace} canCreate={data.capabilities.canCreate} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'Taxes could not be loaded.'}</div>)
                : dedicatedSection === 'kenya'
                  ? (kenyaWorkspace ? <AccountingKenya data={kenyaWorkspace} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'Kenya accounting could not be loaded.'}</div>)
                : dedicatedSection === 'international'
                  ? (internationalWorkspace ? <AccountingInternational data={internationalWorkspace} canCreate={data.capabilities.canCreate} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'International localization could not be loaded.'}</div>)
                : dedicatedSection === 'fx'
                  ? (fxWorkspace ? <AccountingFx data={fxWorkspace} canCreate={data.capabilities.canCreate} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'Foreign currency could not be loaded.'}</div>)
                : dedicatedSection === 'inventory-valuation'
                  ? (inventoryValuationWorkspace ? <AccountingInventoryValuation data={inventoryValuationWorkspace} canCreate={data.capabilities.canCreate} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'Inventory valuation could not be loaded.'}</div>)
                : dedicatedSection === 'accruals-deferrals'
                  ? (accrualsWorkspace ? <AccountingAccruals data={accrualsWorkspace} canCreate={data.capabilities.canCreate} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'Accruals and deferrals could not be loaded.'}</div>)
                : dedicatedSection === 'loans-financing'
                  ? (financingWorkspace ? <AccountingFinancing data={financingWorkspace} canCreate={data.capabilities.canCreate} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'Loans and financing could not be loaded.'}</div>)
                : dedicatedSection === 'budgets-forecasts'
                  ? (budgetsWorkspace ? <AccountingBudgets data={budgetsWorkspace} canCreate={data.capabilities.canCreate} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'Budgets and forecasts could not be loaded.'}</div>)
                : dedicatedSection === 'project-departmental'
                  ? (dimensionsWorkspace ? <AccountingDimensions data={dimensionsWorkspace} canCreate={data.capabilities.canCreate} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'Project and departmental accounting could not be loaded.'}</div>)
                : dedicatedSection === 'payroll-integration'
                  ? (payrollWorkspace ? <AccountingPayroll data={payrollWorkspace} canCreate={data.capabilities.canCreate} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'Payroll accounting integration could not be loaded.'}</div>)
                : dedicatedSection === 'multi-company-consolidation'
                  ? (consolidationWorkspace ? <AccountingConsolidation data={consolidationWorkspace} canCreate={data.capabilities.canCreate} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'Multi-company consolidation could not be loaded.'}</div>)
                : dedicatedSection === 'financial-statements'
                  ? (financialStatementsWorkspace ? <AccountingFinancialStatements data={financialStatementsWorkspace} canCreate={data.capabilities.canCreate} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'Financial statements could not be loaded.'}</div>)
                : dedicatedSection === 'management-reporting'
                  ? (managementReportsWorkspace ? <AccountingManagementReports data={managementReportsWorkspace} canCreate={data.capabilities.canCreate} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'Management and exception reporting could not be loaded.'}</div>)
                : dedicatedSection === 'period-closing'
                  ? (periodClosingWorkspace ? <AccountingPeriodClosing data={periodClosingWorkspace} canCreate={data.capabilities.canCreate} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'Period closing could not be loaded.'}</div>)
                : dedicatedSection === 'approval-controls'
                  ? (approvalControlsWorkspace ? <AccountingApprovalControls data={approvalControlsWorkspace} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'Accounting approval controls could not be loaded.'}</div>)
                : dedicatedSection === 'documents-collaboration'
                  ? (collaborationWorkspace ? <AccountingCollaboration data={collaborationWorkspace} canEdit={data.capabilities.canEdit}/> : <div role="alert">{foundationError || 'Accounting documents and collaboration could not be loaded.'}</div>)
                : dedicatedSection ===
                    'reconciliation'
                  ? (
                    reconciliationWorkspace
                      ? (
                          <AccountingReconciliation
                            data={
                              reconciliationWorkspace
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
                              'Bank reconciliation could not be loaded.'
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
                    'statements'
                  ? (
                    statementsWorkspace
                      ? (
                          <AccountingStatements
                            data={
                              statementsWorkspace
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
                              'Statement imports and feeds could not be loaded.'
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
                    'bank-cash'
                  ? (
                    bankCashWorkspace
                      ? (
                          <AccountingBankCash
                            data={
                              bankCashWorkspace
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
                              'Bank, cash and mobile-money accounts could not be loaded.'
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
                    'expenses'
                  ? (
                    expensesWorkspace
                      ? (
                          <AccountingExpenses
                            data={
                              expensesWorkspace
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
                              'Expenses and reimbursements could not be loaded.'
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
