export type AccountingJournalStatus =
  | "draft"
  | "approved"
  | "posted";

export type AccountingJournalSummary = {
  id: string;
  journal_number: string;
  journal_date: string;
  reference: string | null;
  description: string;
  status: string;
  posting_kind: string;
  source_module: string | null;
  source_type: string | null;
  source_id: string | null;
  posted_at: string | null;
  approved_at: string | null;
  reversed_by_journal_id: string | null;
  reversal_of_journal_id: string | null;
  debit_total: string;
  credit_total: string;
  line_count: number;
};

export type AccountingJournalLine = {
  id: string;
  account_id: string;
  code: string;
  name: string;
  description: string;
  debit: string;
  credit: string;
};

export type AccountingJournalDetail =
  AccountingJournalSummary & {
    approval_note: string | null;
    approved_by: string | null;
    posted_by: string | null;
    created_by: string | null;
    created_at: string;
    lines: AccountingJournalLine[];
  };

export type AccountingRecurringJournal = {
  id: string;
  name: string;
  frequency: "weekly" | "monthly" | "quarterly" | "yearly";
  starts_on: string;
  next_run_on: string;
  ends_on: string | null;
  reference_prefix: string | null;
  description: string;
  status: "active" | "paused" | "ended";
  line_count: number;
  debit_total: string;
  credit_total: string;
  last_generated_at: string | null;
  last_generated_journal_id: string | null;
};

export type AccountingJournalAccount = {
  id: string;
  code: string;
  name: string;
  allow_manual_posting: boolean;
};

export type AccountingJournalWorkspace = {
  companyId: string;
  currency: string;
  journals: AccountingJournalSummary[];
  selected: AccountingJournalDetail | null;
  recurring: AccountingRecurringJournal[];
  accounts: AccountingJournalAccount[];
  counts: {
    draft: number;
    approved: number;
    posted: number;
    reversed: number;
    recurringActive: number;
  };
};
