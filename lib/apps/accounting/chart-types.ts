import type {
  AccountingChartTemplate,
} from './chart-config';

export type ChartAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  normalBalance: 'debit' | 'credit';
  parentAccountId: string | null;
  parentCode: string | null;
  parentName: string | null;
  isActive: boolean;
  reconcile: boolean;
  allowManualPosting: boolean;
  isControlAccount: boolean;
  systemRole: string | null;
  description: string;
  sequence: number;
  templateKey: string | null;
  childCount: number;
  journalLineCount: number;
  postedBalance: string;
  usedBySetup: boolean;
};

export type ChartOfAccountsData = {
  companyId: string;
  currency: string;
  accounts: ChartAccount[];
  templates: Array<
    Pick<
      AccountingChartTemplate,
      'key' |
      'name' |
      'description' |
      'country' |
      'industry'
    >
  >;
};
