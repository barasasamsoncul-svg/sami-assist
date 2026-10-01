"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  FileWarning,
  Landmark,
  Receipt,
  RefreshCcw,
  RotateCcw,
  Settings2,
  WalletCards,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  useRouter,
} from "next/navigation";

import SaMiOverlay from "@/app/components/SaMiOverlay";
import {
  useSaMiOverlay,
} from "@/app/components/useSaMiOverlay";
import type {
  AccountingExpenseSettlementMode,
  AccountingExpensesWorkspace,
} from "@/lib/apps/accounting/expenses-types";
import {
  formatAccountingAmount,
} from "@/lib/apps/accounting/validation";

import styles from "./AccountingFoundation.module.css";


function today() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    );
}


function browserUuid() {
  if (
    typeof crypto !==
      "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }

  return (
    "00000000-0000-4000-8000-" +
    String(
      Date.now(),
    )
      .padStart(
        12,
        "0",
      )
      .slice(
        -12,
      )
  );
}


export default function AccountingExpenses({
  data,
  canEdit,
  canManageSettings,
}: {
  data:
    AccountingExpensesWorkspace;
  canEdit:
    boolean;
  canManageSettings:
    boolean;
}) {
  const router =
    useRouter();

  const {
    overlay,
    showSuccess,
    showError,
    closeOverlay,
  } =
    useSaMiOverlay();

  const [
    busy,
    setBusy,
  ] =
    useState(
      "",
    );

  const [
    settingsOpen,
    setSettingsOpen,
  ] =
    useState(
      false,
    );

  const [
    mappingOpen,
    setMappingOpen,
  ] =
    useState(
      false,
    );

  const [
    postingReportId,
    setPostingReportId,
  ] =
    useState(
      "",
    );

  const [
    postingMode,
    setPostingMode,
  ] =
    useState<
      AccountingExpenseSettlementMode
    >(
      "employee_reimbursement",
    );

  const [
    reimbursementReportId,
    setReimbursementReportId,
  ] =
    useState(
      "",
    );

  const [
    detailReportId,
    setDetailReportId,
  ] =
    useState(
      "",
    );

  const reimbursementKey =
    useRef(
      "",
    );

  const amount = (
    value:
      string |
      null |
      undefined,
  ) =>
    formatAccountingAmount(
      value ||
        "0.00",
      data.currency,
    );

  const expenseAccounts =
    useMemo(
      () =>
        data.accounts.filter(
          account =>
            account.account_type ===
              "expense" ||
            account.account_type.startsWith(
              "expense_",
            ),
        ),
      [
        data.accounts,
      ],
    );

  const liabilityAccounts =
    useMemo(
      () =>
        data.accounts.filter(
          account =>
            account.account_type ===
              "liability" ||
            account.account_type.startsWith(
              "liability_",
            ),
        ),
      [
        data.accounts,
      ],
    );

  const cashAccounts =
    useMemo(
      () =>
        data.accounts.filter(
          account =>
            account.account_type ===
              "asset_cash" ||
            account.account_type.startsWith(
              "asset_cash",
            ) ||
            account.account_type.startsWith(
              "asset_bank",
            ),
        ),
      [
        data.accounts,
      ],
    );

  const selectedPostingReport =
    data.reports.find(
      report =>
        report.id ===
        postingReportId,
    ) ||
    null;

  const selectedReimbursementReport =
    data.reports.find(
      report =>
        report.id ===
        reimbursementReportId,
    ) ||
    null;

  const detailLines =
    detailReportId
      ? data.lines.filter(
          line =>
            line.expense_report_id ===
            detailReportId,
        )
      : [];

  async function postAction(
    body:
      Record<
        string,
        unknown
      >,
    successTitle:
      string,
    successMessage:
      string,
  ) {
    const key =
      String(
        body.action ||
        "action",
      ) +
      ":" +
      String(
        body.reportId ||
        body.reimbursementId ||
        body.categoryId ||
        "",
      );

    setBusy(
      key,
    );

    try {
      const response =
        await fetch(
          "/api/apps/accounting/expenses",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify(
                body,
              ),
          },
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ||
            "Expense-accounting action failed.",
        );
      }

      showSuccess(
        successTitle,
        successMessage,
      );

      router.refresh();

      return payload.result;
    } catch (
      error
    ) {
      showError(
        "Expense-accounting action failed",
        error instanceof
          Error
          ? error.message
          : "Retry this action.",
      );

      return null;
    } finally {
      setBusy(
        "",
      );
    }
  }

  async function saveSettings(
    event:
      FormEvent<
        HTMLFormElement
      >,
  ) {
    event.preventDefault();

    if (
      !canManageSettings
    ) {
      return;
    }

    const form =
      new FormData(
        event.currentTarget,
      );

    const result =
      await postAction(
        {
          action:
            "save-settings",
          defaultExpenseAccountId:
            form.get(
              "defaultExpenseAccountId",
            ),
          employeeExpensePayableAccountId:
            form.get(
              "employeeExpensePayableAccountId",
            ),
          corporateCardClearingAccountId:
            form.get(
              "corporateCardClearingAccountId",
            ),
        },
        "Expense controls saved",
        "Default expense, employee payable and corporate-card clearing accounts are configured.",
      );

    if (result) {
      setSettingsOpen(
        false,
      );
    }
  }

  async function saveMapping(
    event:
      FormEvent<
        HTMLFormElement
      >,
  ) {
    event.preventDefault();

    if (!canEdit) {
      return;
    }

    const form =
      new FormData(
        event.currentTarget,
      );

    const result =
      await postAction(
        {
          action:
            "save-category-mapping",
          categoryId:
            form.get(
              "categoryId",
            ),
          expenseAccountId:
            form.get(
              "expenseAccountId",
            ),
          inputTaxAccountId:
            form.get(
              "inputTaxAccountId",
            ),
          recoverableTaxPercent:
            form.get(
              "recoverableTaxPercent",
            ),
        },
        "Category mapping saved",
        "Future approved expense reports can use this category-to-ledger mapping.",
      );

    if (result) {
      event.currentTarget.reset();
      setMappingOpen(
        false,
      );
    }
  }

  async function postReport(
    event:
      FormEvent<
        HTMLFormElement
      >,
  ) {
    event.preventDefault();

    if (
      !canEdit ||
      !selectedPostingReport
    ) {
      return;
    }

    const form =
      new FormData(
        event.currentTarget,
      );

    const result =
      await postAction(
        {
          action:
            "post-report",
          reportId:
            selectedPostingReport.id,
          settlementMode:
            postingMode,
          paymentAccountId:
            postingMode ===
              "company_paid"
              ? form.get(
                  "paymentAccountId",
                )
              : undefined,
          postingDate:
            form.get(
              "postingDate",
            ),
        },
        "Expense report posted",
        postingMode ===
          "employee_reimbursement"
          ? "The approved report is now in the ledger and the employee reimbursement is tracked as a payable."
          : "The approved report is now in the ledger with its settlement account recorded.",
      );

    if (result) {
      setPostingReportId(
        "",
      );
      setPostingMode(
        "employee_reimbursement",
      );
    }
  }

  async function reimburse(
    event:
      FormEvent<
        HTMLFormElement
      >,
  ) {
    event.preventDefault();

    if (
      !canEdit ||
      !selectedReimbursementReport
    ) {
      return;
    }

    const formElement =
      event.currentTarget;

    const form =
      new FormData(
        formElement,
      );

    reimbursementKey.current =
      reimbursementKey.current ||
      browserUuid();

    const result =
      await postAction(
        {
          action:
            "reimburse",
          reportId:
            selectedReimbursementReport.id,
          requestKey:
            reimbursementKey.current,
          paymentDate:
            form.get(
              "paymentDate",
            ),
          paymentAccountId:
            form.get(
              "paymentAccountId",
            ),
          amount:
            form.get(
              "amount",
            ),
          notes:
            form.get(
              "notes",
            ),
        },
        "Reimbursement posted",
        "The employee payable was reduced and the cash or bank account credited through the authoritative ledger.",
      );

    if (result) {
      reimbursementKey.current =
        "";
      formElement.reset();
      setReimbursementReportId(
        "",
      );
    }
  }

  async function reverseReport(
    reportId:
      string,
  ) {
    if (!canEdit) {
      return;
    }

    await postAction(
      {
        action:
          "reverse-report",
        reportId,
        reversalDate:
          today(),
      },
      "Expense posting reversed",
      "A linked compensating journal was created. The original posted journal remains immutable.",
    );
  }

  async function reverseReimbursement(
    reimbursementId:
      string,
  ) {
    if (!canEdit) {
      return;
    }

    await postAction(
      {
        action:
          "reverse-reimbursement",
        reimbursementId,
        reversalDate:
          today(),
      },
      "Reimbursement reversed",
      "A compensating journal restored the employee payable and operational report state.",
    );
  }

  const controlsReady =
    Boolean(
      data.setup
        .defaultExpenseAccountId &&
      data.setup
        .employeeExpensePayableAccountId &&
      data.setup
        .corporateCardClearingAccountId,
    );

  return (
    <div
      className={
        styles.workspace
      }
    >
      <div
        className={
          styles.heading
        }
      >
        <div>
          <div
            className={
              styles.eyebrow
            }
          >
            Accounting · Expenses & Reimbursements · {
              data.currency
            }
          </div>
          <h2>
            Expense financial control
          </h2>
          <p>
            Expenses owns claims and approvals. Accounting maps approved reports to the ledger, tracks employee payables and controls reimbursement settlement.
          </p>
        </div>

        <div
          className={
            styles.actions
          }
        >
          <Link
            href="/apps/expenses"
            className={
              styles.primary
            }
          >
            <Receipt
              size={
                16
              }
            />
            Open Expenses
            <ArrowUpRight
              size={
                14
              }
            />
          </Link>

          {
            canEdit
              ? (
                  <button
                    type="button"
                    className={
                      styles.button
                    }
                    onClick={
                      () =>
                        setMappingOpen(
                          value =>
                            !value,
                        )
                    }
                  >
                    <WalletCards
                      size={
                        16
                      }
                    />
                    Category mapping
                  </button>
                )
              : null
          }

          {
            canManageSettings
              ? (
                  <button
                    type="button"
                    className={
                      styles.button
                    }
                    onClick={
                      () =>
                        setSettingsOpen(
                          value =>
                            !value,
                        )
                    }
                  >
                    <Settings2
                      size={
                        16
                      }
                    />
                    Controls
                  </button>
                )
              : null
          }
        </div>
      </div>

      <section
        className={
          styles.financeCards
        }
      >
        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Approved · unposted
          </span>
          <strong>
            {
              data.metrics
                .approvedUnposted
            }
          </strong>
          <small>
            Ready for Accounting review
          </small>
        </div>

        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Employee payable
          </span>
          <strong>
            {
              amount(
                data.metrics
                  .postedOutstanding,
              )
            }
          </strong>
          <small>
            Posted reimbursement balance
          </small>
        </div>

        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Reimbursed this month
          </span>
          <strong>
            {
              amount(
                data.metrics
                  .reimbursedThisMonth,
              )
            }
          </strong>
          <small>
            Posted employee payments
          </small>
        </div>

        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Policy / receipt issues
          </span>
          <strong>
            {
              data.metrics
                .policyExceptions +
              data.metrics
                .missingReceipts
            }
          </strong>
          <small>
            Review before ledger posting
          </small>
        </div>
      </section>

      {
        !controlsReady
          ? (
              <section
                className={
                  styles.notice
                }
              >
                <strong>
                  Expense posting controls need configuration.
                </strong>
                <p>
                  Choose the default expense account, employee reimbursement payable and corporate-card clearing account before posting approved reports.
                </p>
              </section>
            )
          : null
      }

      {
        settingsOpen
          ? (
              <section
                className={
                  styles.panel
                }
              >
                <div
                  className={
                    styles.panelHeading
                  }
                >
                  <div>
                    <span
                      className={
                        styles.eyebrow
                      }
                    >
                      Accounting policy
                    </span>
                    <h3>
                      Expense control accounts
                    </h3>
                  </div>
                </div>

                <form
                  className={
                    styles.filters
                  }
                  onSubmit={
                    saveSettings
                  }
                >
                  <label>
                    Default expense account
                    <select
                      name="defaultExpenseAccountId"
                      required
                      defaultValue={
                        data.setup
                          .defaultExpenseAccountId ||
                        ""
                      }
                    >
                      <option value="">
                        Choose expense account
                      </option>
                      {
                        expenseAccounts.map(
                          account => (
                            <option
                              key={
                                account.id
                              }
                              value={
                                account.id
                              }
                            >
                              {
                                account.code
                              } · {
                                account.name
                              }
                            </option>
                          ),
                        )
                      }
                    </select>
                  </label>

                  <label>
                    Employee reimbursement payable
                    <select
                      name="employeeExpensePayableAccountId"
                      required
                      defaultValue={
                        data.setup
                          .employeeExpensePayableAccountId ||
                        ""
                      }
                    >
                      <option value="">
                        Choose liability
                      </option>
                      {
                        liabilityAccounts.map(
                          account => (
                            <option
                              key={
                                account.id
                              }
                              value={
                                account.id
                              }
                            >
                              {
                                account.code
                              } · {
                                account.name
                              }
                            </option>
                          ),
                        )
                      }
                    </select>
                  </label>

                  <label>
                    Corporate-card clearing
                    <select
                      name="corporateCardClearingAccountId"
                      required
                      defaultValue={
                        data.setup
                          .corporateCardClearingAccountId ||
                        ""
                      }
                    >
                      <option value="">
                        Choose liability
                      </option>
                      {
                        liabilityAccounts.map(
                          account => (
                            <option
                              key={
                                account.id
                              }
                              value={
                                account.id
                              }
                            >
                              {
                                account.code
                              } · {
                                account.name
                              }
                            </option>
                          ),
                        )
                      }
                    </select>
                  </label>

                  <button
                    className={
                      styles.primary
                    }
                    disabled={
                      busy.startsWith(
                        "save-settings",
                      )
                    }
                  >
                    <Settings2
                      size={
                        16
                      }
                    />
                    Save controls
                  </button>
                </form>
              </section>
            )
          : null
      }

      {
        mappingOpen
          ? (
              <section
                className={
                  styles.panel
                }
              >
                <div
                  className={
                    styles.panelHeading
                  }
                >
                  <div>
                    <span
                      className={
                        styles.eyebrow
                      }
                    >
                      Ledger classification
                    </span>
                    <h3>
                      Map expense category
                    </h3>
                  </div>
                </div>

                <form
                  className={
                    styles.filters
                  }
                  onSubmit={
                    saveMapping
                  }
                >
                  <label>
                    Expense category
                    <select
                      name="categoryId"
                      required
                      defaultValue=""
                    >
                      <option value="">
                        Choose category
                      </option>
                      {
                        data.categories.map(
                          category => (
                            <option
                              key={
                                category.id
                              }
                              value={
                                category.id
                              }
                            >
                              {
                                category.name
                              }
                            </option>
                          ),
                        )
                      }
                    </select>
                  </label>

                  <label>
                    Expense account
                    <select
                      name="expenseAccountId"
                      required
                      defaultValue=""
                    >
                      <option value="">
                        Choose account
                      </option>
                      {
                        expenseAccounts.map(
                          account => (
                            <option
                              key={
                                account.id
                              }
                              value={
                                account.id
                              }
                            >
                              {
                                account.code
                              } · {
                                account.name
                              }
                            </option>
                          ),
                        )
                      }
                    </select>
                  </label>

                  <label>
                    Future input-tax account
                    <select
                      name="inputTaxAccountId"
                      defaultValue=""
                    >
                      <option value="">
                        None
                      </option>
                      {
                        data.accounts.map(
                          account => (
                            <option
                              key={
                                account.id
                              }
                              value={
                                account.id
                              }
                            >
                              {
                                account.code
                              } · {
                                account.name
                              }
                            </option>
                          ),
                        )
                      }
                    </select>
                  </label>

                  <label>
                    Recoverable tax %
                    <input
                      name="recoverableTaxPercent"
                      inputMode="decimal"
                      defaultValue="0"
                      required
                    />
                  </label>

                  <button
                    className={
                      styles.primary
                    }
                    disabled={
                      busy.startsWith(
                        "save-category-mapping",
                      )
                    }
                  >
                    Save mapping
                  </button>
                </form>

                <div
                  className={
                    styles.notice
                  }
                >
                  Input-tax metadata is retained now, but tax splitting remains zero until the shared Accounting Tax Engine supplies authoritative tax detail.
                </div>
              </section>
            )
          : null
      }

      {
        postingReportId &&
        selectedPostingReport
          ? (
              <section
                className={
                  styles.panel
                }
              >
                <div
                  className={
                    styles.panelHeading
                  }
                >
                  <div>
                    <span
                      className={
                        styles.eyebrow
                      }
                    >
                      Ledger posting
                    </span>
                    <h3>
                      {
                        selectedPostingReport
                          .report_number
                      }
                    </h3>
                  </div>
                </div>

                <form
                  className={
                    styles.filters
                  }
                  onSubmit={
                    postReport
                  }
                >
                  <label>
                    Settlement mode
                    <select
                      value={
                        postingMode
                      }
                      onChange={
                        event =>
                          setPostingMode(
                            event
                              .target
                              .value as AccountingExpenseSettlementMode,
                          )
                      }
                    >
                      <option value="employee_reimbursement">
                        Employee paid · reimburse later
                      </option>
                      <option value="company_paid">
                        Company paid directly
                      </option>
                      <option value="corporate_card">
                        Corporate card
                      </option>
                    </select>
                  </label>

                  <label>
                    Posting date
                    <input
                      type="date"
                      name="postingDate"
                      required
                      defaultValue={
                        selectedPostingReport
                          .period_end ||
                        today()
                      }
                    />
                  </label>

                  {
                    postingMode ===
                      "company_paid"
                      ? (
                          <label>
                            Paid from
                            <select
                              name="paymentAccountId"
                              required
                              defaultValue=""
                            >
                              <option value="">
                                Choose cash / bank
                              </option>
                              {
                                cashAccounts.map(
                                  account => (
                                    <option
                                      key={
                                        account.id
                                      }
                                      value={
                                        account.id
                                      }
                                    >
                                      {
                                        account.code
                                      } · {
                                        account.name
                                      }
                                    </option>
                                  ),
                                )
                              }
                            </select>
                          </label>
                        )
                      : null
                  }

                  <button
                    className={
                      styles.primary
                    }
                    disabled={
                      busy.startsWith(
                        "post-report",
                      )
                    }
                  >
                    <FileCheck2
                      size={
                        16
                      }
                    />
                    Post {
                      amount(
                        selectedPostingReport
                          .total_amount,
                      )
                    }
                  </button>

                  <button
                    type="button"
                    className={
                      styles.button
                    }
                    onClick={
                      () =>
                        setPostingReportId(
                          "",
                        )
                    }
                  >
                    Cancel
                  </button>
                </form>
              </section>
            )
          : null
      }

      {
        reimbursementReportId &&
        selectedReimbursementReport
          ? (
              <section
                className={
                  styles.panel
                }
              >
                <div
                  className={
                    styles.panelHeading
                  }
                >
                  <div>
                    <span
                      className={
                        styles.eyebrow
                      }
                    >
                      Employee reimbursement
                    </span>
                    <h3>
                      {
                        selectedReimbursementReport
                          .report_number
                      }
                    </h3>
                  </div>
                </div>

                <form
                  className={
                    styles.filters
                  }
                  onSubmit={
                    reimburse
                  }
                >
                  <label>
                    Payment date
                    <input
                      type="date"
                      name="paymentDate"
                      defaultValue={
                        today()
                      }
                      required
                    />
                  </label>

                  <label>
                    Pay from
                    <select
                      name="paymentAccountId"
                      required
                      defaultValue=""
                    >
                      <option value="">
                        Choose cash / bank
                      </option>
                      {
                        cashAccounts.map(
                          account => (
                            <option
                              key={
                                account.id
                              }
                              value={
                                account.id
                              }
                            >
                              {
                                account.code
                              } · {
                                account.name
                              }
                            </option>
                          ),
                        )
                      }
                    </select>
                  </label>

                  <label>
                    Amount
                    <input
                      name="amount"
                      inputMode="decimal"
                      defaultValue={
                        selectedReimbursementReport
                          .outstanding_amount
                      }
                      required
                    />
                  </label>

                  <label>
                    Notes
                    <input
                      name="notes"
                      maxLength={
                        2000
                      }
                    />
                  </label>

                  <button
                    className={
                      styles.primary
                    }
                    disabled={
                      busy.startsWith(
                        "reimburse",
                      )
                    }
                  >
                    <Banknote
                      size={
                        16
                      }
                    />
                    Post reimbursement
                  </button>

                  <button
                    type="button"
                    className={
                      styles.button
                    }
                    onClick={
                      () =>
                        setReimbursementReportId(
                          "",
                        )
                    }
                  >
                    Cancel
                  </button>
                </form>
              </section>
            )
          : null
      }

      <section
        className={
          styles.panel
        }
      >
        <div
          className={
            styles.panelHeading
          }
        >
          <div>
            <span
              className={
                styles.eyebrow
              }
            >
              Expense reports
            </span>
            <h3>
              Approval-to-ledger queue
            </h3>
          </div>

          <Link
            href="/apps/expenses"
            className={
              styles.button
            }
          >
            Manage claims
            <ArrowUpRight
              size={
                14
              }
            />
          </Link>
        </div>

        {
          data.reports.length
            ? (
                <div
                  className={
                    styles.tableWrap
                  }
                >
                  <table>
                    <thead>
                      <tr>
                        <th>
                          Report
                        </th>
                        <th>
                          Claim status
                        </th>
                        <th>
                          Accounting
                        </th>
                        <th>
                          Checks
                        </th>
                        <th
                          className={
                            styles.number
                          }
                        >
                          Total
                        </th>
                        <th>
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {
                        data.reports.map(
                          report => (
                            <tr
                              key={
                                report.id
                              }
                            >
                              <td>
                                {
                                  report.report_number
                                }
                                <span
                                  className={
                                    styles.meta
                                  }
                                >
                                  {
                                    report.period_start ||
                                    "—"
                                  } → {
                                    report.period_end ||
                                    "—"
                                  } · {
                                    report.line_count
                                  } lines
                                </span>
                              </td>

                              <td>
                                <span
                                  className={
                                    styles.badge
                                  }
                                >
                                  {
                                    report.status
                                  }
                                </span>
                              </td>

                              <td>
                                <span
                                  className={
                                    styles.badge
                                  }
                                >
                                  {
                                    report.reimbursement_status
                                  }
                                </span>
                                {
                                  report.outstanding_amount !==
                                    "0.00" &&
                                  report.reimbursement_status !==
                                    "unposted"
                                    ? (
                                        <span
                                          className={
                                            styles.meta
                                          }
                                        >
                                          Outstanding {
                                            amount(
                                              report.outstanding_amount,
                                            )
                                          }
                                        </span>
                                      )
                                    : null
                                }
                              </td>

                              <td>
                                {
                                  report.exception_count
                                    ? (
                                        <span
                                          className={
                                            styles.meta
                                          }
                                        >
                                          <FileWarning
                                            size={
                                              13
                                            }
                                          /> {
                                            report.exception_count
                                          } policy
                                        </span>
                                      )
                                    : (
                                        <span
                                          className={
                                            styles.meta
                                          }
                                        >
                                          <CheckCircle2
                                            size={
                                              13
                                            }
                                          /> Policy
                                        </span>
                                      )
                                }

                                {
                                  report.missing_receipt_count
                                    ? (
                                        <span
                                          className={
                                            styles.meta
                                          }
                                        >
                                          {
                                            report.missing_receipt_count
                                          } missing receipt
                                        </span>
                                      )
                                    : null
                                }
                              </td>

                              <td
                                className={
                                  styles.number
                                }
                              >
                                {
                                  amount(
                                    report.total_amount,
                                  )
                                }
                              </td>

                              <td>
                                <div
                                  className={
                                    styles.actions
                                  }
                                >
                                  <button
                                    type="button"
                                    className={
                                      styles.button
                                    }
                                    onClick={
                                      () =>
                                        setDetailReportId(
                                          current =>
                                            current ===
                                              report.id
                                              ? ""
                                              : report.id,
                                        )
                                    }
                                  >
                                    Details
                                  </button>

                                  {
                                    report.status ===
                                      "approved" &&
                                    report.reimbursement_status ===
                                      "unposted" &&
                                    canEdit
                                      ? (
                                          <button
                                            type="button"
                                            className={
                                              styles.primary
                                            }
                                            onClick={
                                              () =>
                                                setPostingReportId(
                                                  report.id,
                                                )
                                            }
                                          >
                                            Post
                                          </button>
                                        )
                                      : null
                                  }

                                  {
                                    (
                                      report.reimbursement_status ===
                                        "outstanding" ||
                                      report.reimbursement_status ===
                                        "partially_reimbursed"
                                    ) &&
                                    canEdit
                                      ? (
                                          <button
                                            type="button"
                                            className={
                                              styles.button
                                            }
                                            onClick={
                                              () => {
                                                reimbursementKey.current =
                                                  "";
                                                setReimbursementReportId(
                                                  report.id,
                                                );
                                              }
                                            }
                                          >
                                            Reimburse
                                          </button>
                                        )
                                      : null
                                  }

                                  {
                                    (
                                      report.reimbursement_status ===
                                        "outstanding" ||
                                      report.reimbursement_status ===
                                        "settled"
                                    ) &&
                                    report.reimbursed_amount ===
                                      "0.00" &&
                                    canEdit
                                      ? (
                                          <button
                                            type="button"
                                            className={
                                              styles.button
                                            }
                                            onClick={
                                              () =>
                                                reverseReport(
                                                  report.id,
                                                )
                                            }
                                          >
                                            <RotateCcw
                                              size={
                                                14
                                              }
                                            />
                                            Reverse
                                          </button>
                                        )
                                      : null
                                  }
                                </div>
                              </td>
                            </tr>
                          ),
                        )
                      }
                    </tbody>
                  </table>
                </div>
              )
            : (
                <div
                  className={
                    styles.empty
                  }
                >
                  <Receipt
                    size={
                      26
                    }
                  />
                  <p>
                    No expense reports are available yet. Create and approve claims in Expenses first.
                  </p>
                </div>
              )
        }
      </section>

      {
        detailReportId
          ? (
              <section
                className={
                  styles.panel
                }
              >
                <div
                  className={
                    styles.panelHeading
                  }
                >
                  <div>
                    <span
                      className={
                        styles.eyebrow
                      }
                    >
                      Report detail
                    </span>
                    <h3>
                      {
                        data.reports.find(
                          report =>
                            report.id ===
                            detailReportId,
                        )
                          ?.report_number ||
                        "Expense report"
                      }
                    </h3>
                  </div>
                </div>

                <div
                  className={
                    styles.tableWrap
                  }
                >
                  <table>
                    <thead>
                      <tr>
                        <th>
                          Date
                        </th>
                        <th>
                          Category
                        </th>
                        <th>
                          Description
                        </th>
                        <th>
                          Receipt
                        </th>
                        <th
                          className={
                            styles.number
                          }
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {
                        detailLines.map(
                          line => (
                            <tr
                              key={
                                line.id
                              }
                            >
                              <td>
                                {
                                  line.expense_date
                                }
                              </td>
                              <td>
                                {
                                  line.category_name ||
                                  "Uncategorized"
                                }
                                {
                                  line.policy_exception
                                    ? (
                                        <span
                                          className={
                                            styles.meta
                                          }
                                        >
                                          Policy exception
                                        </span>
                                      )
                                    : null
                                }
                              </td>
                              <td>
                                {
                                  line.description
                                }
                                <span
                                  className={
                                    styles.meta
                                  }
                                >
                                  {
                                    line.merchant ||
                                    "No merchant"
                                  }
                                </span>
                              </td>
                              <td>
                                {
                                  line.receipt_file_id
                                    ? "Attached"
                                    : "Missing"
                                }
                              </td>
                              <td
                                className={
                                  styles.number
                                }
                              >
                                {
                                  formatAccountingAmount(
                                    line.amount,
                                    line.currency,
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
              </section>
            )
          : null
      }

      <div
        className={
          styles.columns
        }
      >
        <section
          className={
            styles.panel
          }
        >
          <div
            className={
              styles.panelHeading
            }
          >
            <div>
              <span
                className={
                  styles.eyebrow
                }
              >
                Category classification
              </span>
              <h3>
                Ledger mappings
              </h3>
            </div>
          </div>

          {
            data.mappings.length
              ? (
                  <div
                    className={
                      styles.tableWrap
                    }
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>
                            Category
                          </th>
                          <th>
                            Expense account
                          </th>
                          <th>
                            Tax metadata
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {
                          data.mappings.map(
                            mapping => (
                              <tr
                                key={
                                  mapping.id
                                }
                              >
                                <td>
                                  {
                                    mapping.category_name
                                  }
                                </td>
                                <td>
                                  {
                                    mapping.expense_account_code
                                  } · {
                                    mapping.expense_account_name
                                  }
                                </td>
                                <td>
                                  {
                                    mapping.recoverable_tax_percent
                                  }%
                                </td>
                              </tr>
                            ),
                          )
                        }
                      </tbody>
                    </table>
                  </div>
                )
              : (
                  <div
                    className={
                      styles.notice
                    }
                  >
                    No category mappings yet. Unmapped categories use the configured default expense account.
                  </div>
                )
          }
        </section>

        <section
          className={
            styles.panel
          }
        >
          <div
            className={
              styles.panelHeading
            }
          >
            <div>
              <span
                className={
                  styles.eyebrow
                }
              >
                Reimbursement history
              </span>
              <h3>
                Posted payments
              </h3>
            </div>
          </div>

          {
            data.reimbursements.length
              ? (
                  <div
                    className={
                      styles.tableWrap
                    }
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>
                            Report
                          </th>
                          <th>
                            Payment
                          </th>
                          <th
                            className={
                              styles.number
                            }
                          >
                            Amount
                          </th>
                          <th>
                            Status
                          </th>
                          <th>
                            Control
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {
                          data.reimbursements.map(
                            reimbursement => (
                              <tr
                                key={
                                  reimbursement.id
                                }
                              >
                                <td>
                                  {
                                    reimbursement.report_number
                                  }
                                  <span
                                    className={
                                      styles.meta
                                    }
                                  >
                                    {
                                      reimbursement.payment_date
                                    }
                                  </span>
                                </td>
                                <td>
                                  <Landmark
                                    size={
                                      13
                                    }
                                  /> {
                                    reimbursement.payment_account_code
                                  } · {
                                    reimbursement.payment_account_name
                                  }
                                </td>
                                <td
                                  className={
                                    styles.number
                                  }
                                >
                                  {
                                    amount(
                                      reimbursement.amount,
                                    )
                                  }
                                </td>
                                <td>
                                  <span
                                    className={
                                      styles.badge
                                    }
                                  >
                                    {
                                      reimbursement.status
                                    }
                                  </span>
                                </td>
                                <td>
                                  {
                                    reimbursement.status ===
                                      "posted" &&
                                    canEdit
                                      ? (
                                          <button
                                            type="button"
                                            className={
                                              styles.button
                                            }
                                            onClick={
                                              () =>
                                                reverseReimbursement(
                                                  reimbursement.id,
                                                )
                                            }
                                          >
                                            <RefreshCcw
                                              size={
                                                14
                                              }
                                            />
                                            Reverse
                                          </button>
                                        )
                                      : reimbursement.reversal_journal_id
                                        ? "Reversed"
                                        : "—"
                                  }
                                </td>
                              </tr>
                            ),
                          )
                        }
                      </tbody>
                    </table>
                  </div>
                )
              : (
                  <div
                    className={
                      styles.notice
                    }
                  >
                    No employee reimbursements have been posted yet.
                  </div>
                )
          }
        </section>
      </div>

      <section
        className={
          styles.quickActions
        }
      >
        <div>
          <span
            className={
              styles.eyebrow
            }
          >
            Operational boundary
          </span>
          <h3>
            Claims stay in Expenses
          </h3>
          <p>
            Employees create expenses, attach receipts, submit mileage and obtain approval in the Expenses app. Accounting begins only after approval and never creates a duplicate claim.
          </p>
        </div>

        <div
          className={
            styles.actions
          }
        >
          <Link
            className={
              styles.button
            }
            href="/apps/expenses"
          >
            <CreditCard
              size={
                15
              }
            />
            Expenses workspace
          </Link>

          <Link
            className={
              styles.button
            }
            href="/apps/accounting/journals"
          >
            Journal register
          </Link>
        </div>
      </section>

      <SaMiOverlay
        {...overlay}
        onClose={
          closeOverlay
        }
      />
    </div>
  );
}
