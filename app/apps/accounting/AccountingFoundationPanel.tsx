import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Circle,
  Plus,
} from "lucide-react";
import type { AccountingFoundation } from "@/lib/apps/accounting/foundation";
import {
  decimalAmount,
  formatAccountingAmount,
} from "@/lib/apps/accounting/validation";
import AccountingJournalForm from "./AccountingJournalForm";
import AccountingSetupForm from "./AccountingSetupForm";
import type { AccountingSetup } from "@/lib/apps/accounting/setup";
import styles from "./AccountingFoundation.module.css";
export const ACCOUNTING_SECTIONS = [
  "overview",
  "accounts",
  "trial-balance",
  "general-ledger",
  "new-journal",
  "journals",
  "recurring-journals",
  "opening-balances",
  "receivables",
  "payables",
  "purchasing",
  "setup",
] as const;
export type AccountingSection = (typeof ACCOUNTING_SECTIONS)[number];
const cents = (value: string) => {
  const negative = value.startsWith("-");
  const [whole, fraction = "00"] = (negative ? value.slice(1) : value).split(
    ".",
  );
  const amount = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return negative ? -amount : amount;
};
export default function AccountingFoundationPanel({
  data,
  section,
  canCreate,
  canManageSettings,
  setup,
}: {
  data: AccountingFoundation;
  section: AccountingSection;
  canCreate: boolean;
  canManageSettings: boolean;
  setup: AccountingSetup | null;
}) {
  const { filters, currency } = data;
  const amount = (value: string) => formatAccountingAmount(value, currency);
  const sum = (field: "debit" | "credit" | "balance") =>
    data.accounts.reduce((total, row) => total + cents(row[field]), BigInt(0));
  const balanceByType = (predicate: (type: string) => boolean) =>
    data.accounts.reduce(
      (total, row) =>
        predicate(row.account_type)
          ? total + cents(row.balance)
          : total,
      BigInt(0),
    );
  const cashBalance = balanceByType(
    (type) => type === "asset_cash" || type.startsWith("asset_bank"),
  );
  const receivableBalance = balanceByType(
    (type) => type === "asset_receivable",
  );
  const incomeBalance = -balanceByType(
    (type) => type === "income" || type.startsWith("income_"),
  );
  const expenseBalance = balanceByType(
    (type) => type === "expense" || type.startsWith("expense_"),
  );
  const netProfit = incomeBalance - expenseBalance;
  const trialDifference = sum("balance");
  const booksBalanced = trialDifference === BigInt(0);
  const selected = data.accounts.find((row) => row.id === filters.accountId);
  const qs = (extra: Record<string, string>) =>
    new URLSearchParams({
      from: filters.from,
      to: filters.to,
      ...(filters.accountId ? { accountId: filters.accountId } : {}),
      ...extra,
    }).toString();
  const names = {
    overview: "Financial command center",
    accounts: "Chart of accounts",
    "trial-balance": "Trial balance",
    "general-ledger": "General ledger",
    "new-journal": "New manual journal",
    journals: "Journal register",
    "recurring-journals": "Recurring journals",
    "opening-balances": "Opening balances",
    receivables: "Accounts receivable",
    payables: "Accounts payable",
    purchasing: "Purchasing controls",
    setup: "Accounting setup",
  };
  const descriptions = {
    overview:
      "Monitor financial position, book health and the accounting work that needs attention.",
    accounts:
      "Manage the company ledger hierarchy, classification and posting controls.",
    "trial-balance":
      "Opening balances, period movements and closing balances from posted journals.",
    "general-ledger":
      "Follow an account from its opening balance through every posted movement.",
    "new-journal":
      "Enter a balanced adjustment in company currency. Save it as a draft for review.",
    journals:
      "Review, approve, post and reverse controlled accounting journals.",
    "recurring-journals":
      "Create repeatable balanced journals and generate reviewable draft occurrences.",
    "opening-balances":
      "Import, validate, reconcile and post migration balances without bypassing the authoritative ledger.",
    receivables:
      "Reconcile customer aging and credits from Invoicing to the Accounting control accounts.",
    payables:
      "Control vendor bills, credits, aging and the Accounts Payable reconciliation to the ledger.",
    purchasing:
      "Control requisitions, purchase orders, goods receipts and vendor-bill matching before Accounts Payable posting.",
    setup:
      "Configure fiscal policy, control accounts, tax mappings, FX accounts, write-offs and period locks for this company.",
  };
  const tasks = [
    {
      title: "Chart of accounts",
      detail: "Review account codes and classifications for your business.",
      href: "/apps/accounting/accounts",
      done: data.accounts.length > 0,
    },
    {
      title: "Fiscal periods",
      detail: "Create an open period covering the dates you will use.",
      href: "/apps/accounting/accounting_fiscal_periods",
      done: data.openPeriods > 0,
    },
    {
      title: "Bank and cash accounts",
      detail: "Connect your bank and cash records to ledger accounts.",
      href: "/apps/accounting/accounting_bank_accounts",
      done: data.bankAccounts > 0,
    },
    {
      title: "Opening balances",
      detail: "Prepare and review a balanced opening journal.",
      href: "/apps/accounting/opening-balances",
      done: data.openingBalancePostedCount > 0,
    },
  ];
  const taskList = (
    <>
      {tasks.map((task) => (
        <div className={styles.task} key={task.title}>
          {task.done ? (
            <CheckCircle2 size={18} aria-label="Available" />
          ) : (
            <Circle size={18} aria-label="Review" />
          )}
          <div>
            <Link href={task.href}>{task.title}</Link>
            <p>{task.detail}</p>
          </div>
        </div>
      ))}
    </>
  );
  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>Accounting · {currency}</div>
          <h2>{names[section]}</h2>
          <p>{descriptions[section]}</p>
        </div>
        <div className={styles.actions}>
          {canCreate && section !== "new-journal" && (
            <Link
              className={styles.primary}
              href="/apps/accounting/new-journal"
            >
              <Plus size={16} /> New journal
            </Link>
          )}
          <Link className={styles.button} href="/apps/accounting/accounts">
            <BookOpen size={16} /> Chart of accounts
          </Link>
        </div>
      </div>
      {section === "new-journal" ? (
        <>
          <div className={styles.notice}>
            Use active accounts and an open fiscal period. Drafts do not change
            your posted balances.
          </div>
          {canCreate ? (
            <AccountingJournalForm
              key={data.companyId}
              accounts={data.accounts}
              currency={currency}
              companyId={data.companyId}
              today={filters.to}
            />
          ) : (
            <div className={styles.notice}>
              You need Accounting create permission to add a journal.
            </div>
          )}
        </>
      ) : section === "setup" ? (
        <>
          {setup ? (
            <AccountingSetupForm
              key={data.companyId}
              companyId={data.companyId}
              currency={currency}
              accounts={data.accounts}
              initialSetup={setup}
              canManage={canManageSettings}
            />
          ) : (
            <div className={styles.notice}>
              Accounting Setup could not be loaded. Reload this page before
              changing company accounting policy.
            </div>
          )}

          <div className={styles.panel}>
            <h3>Operational readiness</h3>
            {taskList}
            <p>
              Setup mappings define accounting policy. Readiness checks also
              confirm that the chart, periods, bank records and opening work
              exist before later posting workflows are enabled.
            </p>
          </div>
        </>
      ) : (
        <>
          <form method="get" className={styles.filters}>
            <label>
              From
              <input
                type="date"
                name="from"
                required
                defaultValue={filters.from}
              />
            </label>
            <label>
              To
              <input type="date" name="to" required defaultValue={filters.to} />
            </label>
            {section === "general-ledger" && (
              <label>
                Ledger account
                <select name="accountId" defaultValue={filters.accountId || ""}>
                  <option value="">Choose an account</option>
                  {data.accounts.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.code} · {row.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className={styles.button}>Apply dates</button>
          </form>
          {section === "overview" ? (
            <>
              <section className={styles.dashboardHero}>
                <div>
                  <span className={styles.heroLabel}>Net result · selected period</span>
                  <strong className={styles.heroValue}>
                    {amount(decimalAmount(netProfit))}
                  </strong>
                  <p>
                    Posted ledger activity from {filters.from} to {filters.to}.
                    Draft journals are excluded until they are posted.
                  </p>
                </div>

                <div className={styles.heroHealth}>
                  <span className={styles.heroLabel}>Book health</span>
                  <strong>{booksBalanced ? "Balanced" : "Needs review"}</strong>
                  <small>
                    Trial balance difference:{" "}
                    {amount(decimalAmount(trialDifference))}
                  </small>
                </div>
              </section>

              <div className={styles.financeCards}>
                <div className={styles.financeCard}>
                  <span>Cash & bank</span>
                  <strong>{amount(decimalAmount(cashBalance))}</strong>
                  <small>Posted cash-type ledger balance</small>
                </div>
                <div className={styles.financeCard}>
                  <span>Receivables</span>
                  <strong>{amount(decimalAmount(receivableBalance))}</strong>
                  <small>Customer receivable control accounts</small>
                </div>
                <div className={styles.financeCard}>
                  <span>Income</span>
                  <strong>{amount(decimalAmount(incomeBalance))}</strong>
                  <small>Net posted income, including contra income</small>
                </div>
                <div className={styles.financeCard}>
                  <span>Expenses</span>
                  <strong>{amount(decimalAmount(expenseBalance))}</strong>
                  <small>Posted expense accounts</small>
                </div>
              </div>

              <section className={styles.healthGrid}>
                <div>
                  <span>Posted journals</span>
                  <strong>{data.postedCount}</strong>
                  <small>Selected period</small>
                </div>
                <div>
                  <span>Drafts to review</span>
                  <strong>{data.draftCount}</strong>
                  <small>Across all dates</small>
                </div>
                <div>
                  <span>Active bank accounts</span>
                  <strong>{data.bankAccounts}</strong>
                  <small>Bank, cash or mobile money</small>
                </div>
                <div>
                  <span>Unreconciled bank lines</span>
                  <strong>{data.unreconciledBankLines}</strong>
                  <small>Unmatched or suggested</small>
                </div>
              </section>

              <div className={styles.columns}>
                <section className={styles.panel}>
                  <div className={styles.panelHeading}>
                    <div>
                      <span className={styles.eyebrow}>Ledger activity</span>
                      <h3>Recent journal entries</h3>
                    </div>
                    <Link
                      href="/apps/accounting/journals"
                      className={styles.button}
                    >
                      Journal register <ArrowUpRight size={14} />
                    </Link>
                  </div>

                  {data.recent.length ? (
                    <div className={styles.tableWrap}>
                      <table>
                        <thead>
                          <tr>
                            <th>Journal</th>
                            <th>Date</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.recent.map((row) => (
                            <tr key={row.id}>
                              <td>
                                {row.description || "Journal entry"}
                                <span className={styles.meta}>
                                  {row.journal_number}
                                </span>
                              </td>
                              <td>{row.journal_date}</td>
                              <td>
                                <span className={styles.badge}>
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={styles.empty}>
                      <BookOpen size={26} />
                      <p>
                        No journals yet. Complete Accounting setup and create
                        the first balanced entry.
                      </p>
                    </div>
                  )}
                </section>

                <section className={styles.panel}>
                  <div className={styles.panelHeading}>
                    <div>
                      <span className={styles.eyebrow}>Readiness</span>
                      <h3>Book setup</h3>
                    </div>
                    <Link
                      href="/apps/accounting/setup"
                      className={styles.button}
                    >
                      Open setup
                    </Link>
                  </div>
                  {taskList}
                </section>
              </div>

              <section className={styles.quickActions}>
                <div>
                  <span className={styles.eyebrow}>Financial controls</span>
                  <h3>Work directly from the books</h3>
                  <p>
                    Use dedicated Accounting pages instead of stacking
                    unrelated workflows into one long screen.
                  </p>
                </div>
                <div className={styles.actions}>
                  {canCreate ? (
                    <Link
                      className={styles.primary}
                      href="/apps/accounting/new-journal"
                    >
                      <Plus size={15} /> New journal
                    </Link>
                  ) : null}
                  <Link
                    className={styles.button}
                    href={"/apps/accounting/trial-balance?" + qs({})}
                  >
                    Trial balance <ArrowUpRight size={15} />
                  </Link>
                  <Link
                    className={styles.button}
                    href="/apps/accounting/general-ledger"
                  >
                    General ledger <ArrowUpRight size={15} />
                  </Link>
                  <Link
                    className={styles.button}
                    href="/apps/accounting/accounting_bank_accounts"
                  >
                    Bank & cash <ArrowUpRight size={15} />
                  </Link>
                </div>
              </section>
            </>
          ) : section === "trial-balance" ? (
            <>
              <div className={styles.tableWrap}>
                <table>
                  <caption className={styles.meta}>
                    Company currency: {currency}. Posted entries only.
                  </caption>
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th className={styles.number}>Opening net</th>
                      <th className={styles.number}>Period debit</th>
                      <th className={styles.number}>Period credit</th>
                      <th className={styles.number}>Closing debit</th>
                      <th className={styles.number}>Closing credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.accounts.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link
                            href={
                              "/apps/accounting/general-ledger?" +
                              qs({ accountId: row.id, page: "1" })
                            }
                          >
                            {row.code} · {row.name}
                          </Link>
                          <span className={styles.meta}>
                            {row.account_type.replaceAll("_", " ")}
                            {!row.is_active ? " · Archived" : ""}
                          </span>
                        </td>
                        <td className={styles.number}>
                          {formatAccountingAmount(row.opening)}
                        </td>
                        <td className={styles.number}>
                          {formatAccountingAmount(row.debit)}
                        </td>
                        <td className={styles.number}>
                          {formatAccountingAmount(row.credit)}
                        </td>
                        <td className={styles.number}>
                          {formatAccountingAmount(
                            cents(row.balance) > BigInt(0)
                              ? row.balance
                              : "0.00",
                          )}
                        </td>
                        <td className={styles.number}>
                          {formatAccountingAmount(
                            cents(row.balance) < BigInt(0)
                              ? decimalAmount(-cents(row.balance))
                              : "0.00",
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Totals</td>
                      <td className={styles.number}>
                        {formatAccountingAmount(
                          decimalAmount(
                            data.accounts.reduce(
                              (n, row) => n + cents(row.opening),
                              BigInt(0),
                            ),
                          ),
                        )}
                      </td>
                      <td className={styles.number}>
                        {formatAccountingAmount(decimalAmount(sum("debit")))}
                      </td>
                      <td className={styles.number}>
                        {formatAccountingAmount(decimalAmount(sum("credit")))}
                      </td>
                      <td className={styles.number}>
                        {formatAccountingAmount(
                          decimalAmount(
                            data.accounts.reduce(
                              (n, row) =>
                                n +
                                (cents(row.balance) > BigInt(0)
                                  ? cents(row.balance)
                                  : BigInt(0)),
                              BigInt(0),
                            ),
                          ),
                        )}
                      </td>
                      <td className={styles.number}>
                        {formatAccountingAmount(
                          decimalAmount(
                            data.accounts.reduce(
                              (n, row) =>
                                n +
                                (cents(row.balance) < BigInt(0)
                                  ? -cents(row.balance)
                                  : BigInt(0)),
                              BigInt(0),
                            ),
                          ),
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className={styles.notice}>
                Closing difference:{" "}
                <strong>{amount(decimalAmount(sum("balance")))}</strong>. A zero
                difference checks arithmetic balance; review account
                classification and completeness separately. Opening net is debit
                less credit.
              </div>
            </>
          ) : !selected ? (
            <div className={styles.panel}>
              Choose an account to view its ledger.
            </div>
          ) : (
            <>
              <div className={styles.notice}>
                <strong>
                  {selected.code} · {selected.name}
                </strong>
                <p>
                  Opening net: {amount(selected.opening)} · Closing net:{" "}
                  {amount(selected.balance)}. Positive balances are debit;
                  negative balances are credit.
                </p>
              </div>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Journal / reference</th>
                      <th>Description</th>
                      <th className={styles.number}>Debit</th>
                      <th className={styles.number}>Credit</th>
                      <th className={styles.number}>Running net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ledger.map((row) => (
                      <tr key={row.id}>
                        <td>{row.journal_date}</td>
                        <td>
                          {row.journal_number}
                          <span className={styles.meta}>{row.reference}</span>
                        </td>
                        <td>{row.description}</td>
                        <td className={styles.number}>
                          {formatAccountingAmount(row.debit)}
                        </td>
                        <td className={styles.number}>
                          {formatAccountingAmount(row.credit)}
                        </td>
                        <td className={styles.number}>
                          {formatAccountingAmount(row.running_balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.ledger.length && (
                  <div className={styles.empty}>
                    No posted movements on this page for the selected dates.
                  </div>
                )}
              </div>
              <div className={styles.actions}>
                <span>
                  {data.ledgerCount} movements · Page {filters.page} of{" "}
                  {Math.max(1, Math.ceil(data.ledgerCount / 50))}
                </span>
                {filters.page > 1 && (
                  <Link
                    className={styles.button}
                    href={"?" + qs({ page: String(filters.page - 1) })}
                  >
                    Previous
                  </Link>
                )}
                {filters.page * 50 < data.ledgerCount && (
                  <Link
                    className={styles.button}
                    href={"?" + qs({ page: String(filters.page + 1) })}
                  >
                    Next
                  </Link>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
