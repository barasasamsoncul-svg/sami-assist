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
import styles from "./AccountingFoundation.module.css";
export const ACCOUNTING_SECTIONS = [
  "overview",
  "trial-balance",
  "general-ledger",
  "new-journal",
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
}: {
  data: AccountingFoundation;
  section: AccountingSection;
  canCreate: boolean;
}) {
  const { filters, currency } = data;
  const amount = (value: string) => formatAccountingAmount(value, currency);
  const sum = (field: "debit" | "credit" | "balance") =>
    data.accounts.reduce((total, row) => total + cents(row[field]), BigInt(0));
  const selected = data.accounts.find((row) => row.id === filters.accountId);
  const qs = (extra: Record<string, string>) =>
    new URLSearchParams({
      from: filters.from,
      to: filters.to,
      ...(filters.accountId ? { accountId: filters.accountId } : {}),
      ...extra,
    }).toString();
  const names = {
    overview: "Your accounting overview",
    "trial-balance": "Trial balance",
    "general-ledger": "General ledger",
    "new-journal": "New manual journal",
    setup: "Accounting setup",
  };
  const descriptions = {
    overview:
      "A clear view of your books, draft entries and next accounting tasks.",
    "trial-balance":
      "Opening balances, period movements and closing balances from posted journals.",
    "general-ledger":
      "Follow an account from its opening balance through every posted movement.",
    "new-journal":
      "Enter a balanced adjustment in company currency. Save it as a draft for review.",
    setup:
      "Prepare your company books using the existing accounts and fiscal periods.",
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
      done: false,
    },
    {
      title: "Opening balances",
      detail: "Prepare and review a balanced opening journal.",
      href: canCreate
        ? "/apps/accounting/new-journal"
        : "/apps/accounting/journals",
      done: false,
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
        <div className={styles.panel}>
          <h3>Prepare your books</h3>
          {taskList}
          <p>
            Checkmarks show existing records; they do not certify that your
            setup or balances have been reviewed.
          </p>
        </div>
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
              <div className={styles.cards}>
                {[
                  [
                    "Chart of accounts",
                    String(data.accounts.length),
                    "Company ledger accounts",
                  ],
                  [
                    "Posted journals",
                    String(data.postedCount),
                    "In the selected period",
                  ],
                  [
                    "Drafts to review",
                    String(data.draftCount),
                    "Across all dates",
                  ],
                  [
                    "Trial balance difference",
                    amount(decimalAmount(sum("balance"))),
                    "Closing debit less credit",
                  ],
                ].map(([label, value, hint]) => (
                  <div className={styles.card} key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>{hint}</small>
                  </div>
                ))}
              </div>
              <div className={styles.columns}>
                <section className={styles.panel}>
                  <div className={styles.heading}>
                    <h3>Recent journals</h3>
                    <Link
                      href="/apps/accounting/journals"
                      className={styles.button}
                    >
                      View register <ArrowUpRight size={14} />
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
                        No journals yet. Prepare your accounts and fiscal
                        period, then add your first balanced entry.
                      </p>
                    </div>
                  )}
                </section>
                <section className={styles.panel}>
                  <h3>Get your books ready</h3>
                  {taskList}
                </section>
              </div>
              <div className={styles.actions}>
                <Link
                  className={styles.button}
                  href={"/apps/accounting/trial-balance?" + qs({})}
                >
                  Open trial balance <ArrowUpRight size={15} />
                </Link>
                <Link
                  className={styles.button}
                  href="/apps/accounting/general-ledger"
                >
                  Explore general ledger <ArrowUpRight size={15} />
                </Link>
              </div>
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
