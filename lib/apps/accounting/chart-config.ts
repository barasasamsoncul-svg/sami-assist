export const ACCOUNT_TYPE_OPTIONS = [
  { key: 'asset_cash', label: 'Cash & bank', group: 'Assets', normalBalance: 'debit', reconcileDefault: true },
  { key: 'asset_receivable', label: 'Accounts receivable', group: 'Assets', normalBalance: 'debit', reconcileDefault: true },
  { key: 'asset_current', label: 'Current asset', group: 'Assets', normalBalance: 'debit', reconcileDefault: false },
  { key: 'asset_inventory', label: 'Inventory asset', group: 'Assets', normalBalance: 'debit', reconcileDefault: false },
  { key: 'asset_fixed', label: 'Fixed asset', group: 'Assets', normalBalance: 'debit', reconcileDefault: false },
  { key: 'asset_other', label: 'Other asset', group: 'Assets', normalBalance: 'debit', reconcileDefault: false },
  { key: 'liability_payable', label: 'Accounts payable', group: 'Liabilities', normalBalance: 'credit', reconcileDefault: true },
  { key: 'liability_current', label: 'Current liability', group: 'Liabilities', normalBalance: 'credit', reconcileDefault: false },
  { key: 'liability_long_term', label: 'Long-term liability', group: 'Liabilities', normalBalance: 'credit', reconcileDefault: false },
  { key: 'equity', label: 'Equity', group: 'Equity', normalBalance: 'credit', reconcileDefault: false },
  { key: 'equity_retained_earnings', label: 'Retained earnings', group: 'Equity', normalBalance: 'credit', reconcileDefault: false },
  { key: 'income', label: 'Operating income', group: 'Income', normalBalance: 'credit', reconcileDefault: false },
  { key: 'income_other', label: 'Other income', group: 'Income', normalBalance: 'credit', reconcileDefault: false },
  { key: 'income_contra', label: 'Contra income', group: 'Income', normalBalance: 'debit', reconcileDefault: false },
  { key: 'expense_cost_of_sales', label: 'Cost of sales', group: 'Expenses', normalBalance: 'debit', reconcileDefault: false },
  { key: 'expense', label: 'Operating expense', group: 'Expenses', normalBalance: 'debit', reconcileDefault: false },
  { key: 'expense_other', label: 'Other expense', group: 'Expenses', normalBalance: 'debit', reconcileDefault: false },
] as const;

export type AccountTypeKey =
  typeof ACCOUNT_TYPE_OPTIONS[number]['key'];

export type ChartTemplateEntry = {
  code: string;
  name: string;
  accountType: AccountTypeKey;
  parentCode?: string;
  systemRole?: string;
  description?: string;
  manualPosting?: boolean;
};

export type AccountingChartTemplate = {
  key: string;
  name: string;
  description: string;
  country: string;
  industry: string;
  accounts: ChartTemplateEntry[];
};

const CORE_TEMPLATE_ACCOUNTS:
  ChartTemplateEntry[] = [
    { code: '1000', name: 'Cash on Hand', accountType: 'asset_cash', systemRole: 'cash_default' },
    { code: '1010', name: 'Bank Accounts', accountType: 'asset_cash' },
    { code: '1100', name: 'Accounts Receivable', accountType: 'asset_receivable', systemRole: 'receivable_control', manualPosting: false },
    { code: '1200', name: 'Input VAT / Recoverable Tax', accountType: 'asset_current', systemRole: 'input_tax' },
    { code: '1500', name: 'Property, Plant & Equipment', accountType: 'asset_fixed' },
    { code: '2000', name: 'Accounts Payable', accountType: 'liability_payable', systemRole: 'payable_control', manualPosting: false },
    { code: '2100', name: 'Output VAT / Tax Payable', accountType: 'liability_current', systemRole: 'output_tax' },
    { code: '2200', name: 'Other Current Liabilities', accountType: 'liability_current' },
    { code: '2500', name: 'Long-term Liabilities', accountType: 'liability_long_term' },
    { code: '3000', name: 'Owners Equity', accountType: 'equity' },
    { code: '3100', name: 'Retained Earnings', accountType: 'equity_retained_earnings', systemRole: 'retained_earnings', manualPosting: false },
    { code: '4000', name: 'Sales / Service Revenue', accountType: 'income' },
    { code: '4100', name: 'Other Income', accountType: 'income_other' },
    { code: '4900', name: 'Sales Returns & Allowances', accountType: 'income_contra' },
    { code: '6000', name: 'Operating Expenses', accountType: 'expense' },
    { code: '6100', name: 'Bad Debt & Write-offs', accountType: 'expense', systemRole: 'write_off' },
    { code: '6200', name: 'Foreign Exchange Loss', accountType: 'expense_other', systemRole: 'fx_loss' },
    { code: '6300', name: 'Rounding Differences', accountType: 'expense_other', systemRole: 'rounding' },
    { code: '7100', name: 'Foreign Exchange Gain', accountType: 'income_other', systemRole: 'fx_gain' },
  ];

export const ACCOUNTING_CHART_TEMPLATES:
  AccountingChartTemplate[] = [
    {
      key: 'ke_general_business',
      name: 'Kenya · General business',
      description: 'Balanced starter chart for a Kenyan trading or service company, including VAT, receivables, payables and FX control accounts.',
      country: 'Kenya',
      industry: 'General business',
      accounts: [
        ...CORE_TEMPLATE_ACCOUNTS,
        { code: '1300', name: 'Inventory', accountType: 'asset_inventory' },
        { code: '5000', name: 'Cost of Goods Sold', accountType: 'expense_cost_of_sales' },
      ],
    },
    {
      key: 'ke_professional_services',
      name: 'Kenya · Professional services',
      description: 'Lean chart for consultancies, agencies and other service businesses without stock accounting.',
      country: 'Kenya',
      industry: 'Professional services',
      accounts: [
        ...CORE_TEMPLATE_ACCOUNTS,
        { code: '4010', name: 'Consulting Revenue', accountType: 'income', parentCode: '4000' },
        { code: '6010', name: 'Professional & Contractor Costs', accountType: 'expense', parentCode: '6000' },
        { code: '6020', name: 'Software & Subscriptions', accountType: 'expense', parentCode: '6000' },
      ],
    },
    {
      key: 'ke_retail_trade',
      name: 'Kenya · Retail & trade',
      description: 'Trading-focused chart with inventory, cost of sales and retail operating expense structure.',
      country: 'Kenya',
      industry: 'Retail & trade',
      accounts: [
        ...CORE_TEMPLATE_ACCOUNTS,
        { code: '1300', name: 'Inventory', accountType: 'asset_inventory' },
        { code: '5000', name: 'Cost of Goods Sold', accountType: 'expense_cost_of_sales' },
        { code: '5010', name: 'Freight & Landed Cost', accountType: 'expense_cost_of_sales', parentCode: '5000' },
        { code: '6010', name: 'Shop & Premises Expense', accountType: 'expense', parentCode: '6000' },
      ],
    },
  ];

export const ACCOUNT_TYPE_BY_KEY =
  new Map(
    ACCOUNT_TYPE_OPTIONS.map(
      option => [
        option.key,
        option,
      ],
    ),
  );
