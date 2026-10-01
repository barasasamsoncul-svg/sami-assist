import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  FilePlus2,
  ReceiptText,
  RefreshCcw,
  Users,
} from "lucide-react";

import type {
  AccountingReceivablesWorkspace,
  ReceivablesAgingBucket,
} from "@/lib/apps/accounting/receivables-types";
import {
  formatAccountingAmount,
} from "@/lib/apps/accounting/validation";

import styles from "./AccountingFoundation.module.css";


const AGING_LABELS:
  Record<
    ReceivablesAgingBucket,
    string
  > = {
    current:
      "Current",
    "1-30":
      "1–30 days",
    "31-60":
      "31–60 days",
    "61-90":
      "61–90 days",
    "90+":
      "90+ days",
  };


function cents(
  value:
    string,
) {
  const negative =
    value.startsWith(
      "-",
    );

  const unsigned =
    negative
      ? value.slice(
          1,
        )
      : value;

  const [
    whole,
    fraction =
      "",
  ] =
    unsigned.split(
      ".",
    );

  const amount =
    BigInt(
      whole ||
      "0",
    ) *
      BigInt(
        100,
      ) +
    BigInt(
      fraction
        .padEnd(
          2,
          "0",
        )
        .slice(
          0,
          2,
        ) ||
      "0",
    );

  return negative
    ? -amount
    : amount;
}


export default function AccountingReceivables({
  data,
}: {
  data:
    AccountingReceivablesWorkspace;
}) {
  const amount = (
    value:
      string,
  ) =>
    formatAccountingAmount(
      value,
      data.currency,
    );

  if (
    !data.available
  ) {
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
              Accounting · Receivables
            </div>
            <h2>
              Accounts receivable
            </h2>
            <p>
              Accounting reads the customer subledger from Invoicing and reconciles it to the general ledger.
            </p>
          </div>
        </div>

        <div
          className={
            styles.notice
          }
        >
          <AlertTriangle
            size={
              16
            }
          />{" "}
          {
            data.unavailableReason ||
            "Receivables data is not available."
          }
        </div>

        <div
          className={
            styles.actions
          }
        >
          <Link
            href="/apps"
            className={
              styles.button
            }
          >
            Open Apps
          </Link>
          <Link
            href="/apps/accounting/setup"
            className={
              styles.button
            }
          >
            Accounting Setup
          </Link>
        </div>
      </div>
    );
  }

  const outstanding =
    cents(
      data.metrics
        .outstanding,
    );

  const overdue =
    cents(
      data.metrics
        .overdue,
    );

  const overdueRate =
    outstanding >
      BigInt(
        0,
      )
      ? Number(
          overdue *
            BigInt(
              10000,
            ) /
            outstanding,
        ) /
        100
      : 0;

  const maxAging =
    data.aging.reduce(
      (
        maximum,
        row,
      ) => {
        const value =
          cents(
            row.amount,
          );

        return value >
          maximum
          ? value
          : maximum;
      },
      BigInt(
        0,
      ),
    );

  const pageSize =
    50;

  const pageCount =
    Math.max(
      1,
      Math.ceil(
        data.openItemCount /
          pageSize,
      ),
    );

  const queryFor = (
    changes: {
      page?: number;
      bucket?: string;
      customerId?: string;
      search?: string;
    },
  ) => {
    const params =
      new URLSearchParams();

    const page =
      changes.page ??
      data.filters.page;

    const bucket =
      changes.bucket !==
        undefined
        ? changes.bucket
        : data.filters
            .bucket;

    const customerId =
      changes.customerId !==
        undefined
        ? changes.customerId
        : data.filters
            .customerId;

    const search =
      changes.search !==
        undefined
        ? changes.search
        : data.filters
            .search;

    if (
      page >
      1
    ) {
      params.set(
        "page",
        String(
          page,
        ),
      );
    }

    if (
      bucket
    ) {
      params.set(
        "bucket",
        bucket,
      );
    }

    if (
      customerId
    ) {
      params.set(
        "customerId",
        customerId,
      );
    }

    if (
      search
    ) {
      params.set(
        "search",
        search,
      );
    }

    const query =
      params.toString();

    return (
      "/apps/accounting/receivables" +
      (
        query
          ? "?" +
            query
          : ""
      )
    );
  };

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
            Accounting · Receivables · {
              data.currency
            }
          </div>
          <h2>
            Accounts receivable
          </h2>
          <p>
            Control customer balances, aging, credits and general-ledger reconciliation without duplicating the Invoicing subledger.
          </p>
        </div>

        <div
          className={
            styles.actions
          }
        >
          <Link
            href="/apps/invoicing/new"
            className={
              styles.primary
            }
          >
            <FilePlus2
              size={
                16
              }
            />
            New invoice
          </Link>
          <Link
            href="/apps/invoicing/payments/new"
            className={
              styles.button
            }
          >
            <CircleDollarSign
              size={
                16
              }
            />
            Record payment
          </Link>
        </div>
      </div>

      <section
        className={
          styles.dashboardHero
        }
      >
        <div>
          <span
            className={
              styles.heroLabel
            }
          >
            Open receivables
          </span>
          <strong
            className={
              styles.heroValue
            }
          >
            {
              amount(
                data.metrics
                  .outstanding,
              )
            }
          </strong>
          <p>
            {
              data.metrics
                .openInvoiceCount
            } open invoices across {
              data.metrics
                .customersWithBalance
            } customers
            {
              cents(
                data.metrics
                  .legacyOpeningReceivables,
              ) !==
                BigInt(
                  0,
                )
                ? " · plus " +
                  amount(
                    data.metrics
                      .legacyOpeningReceivables,
                  ) +
                  " legacy opening AR"
                : ""
            }.
          </p>
        </div>

        <div
          className={
            styles.heroHealth
          }
        >
          <span
            className={
              styles.heroLabel
            }
          >
            Collection health
          </span>
          <strong>
            {
              amount(
                data.metrics
                  .overdue,
              )
            } overdue
          </strong>
          <small>
            {
              overdueRate.toFixed(
                1,
              )
            }% of open AR · {
              data.metrics
                .overdueInvoiceCount
            } overdue invoices
          </small>
        </div>
      </section>

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
            Current
          </span>
          <strong>
            {
              amount(
                data.metrics
                  .current,
              )
            }
          </strong>
          <small>
            Not yet overdue
          </small>
        </div>

        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Customer credits
          </span>
          <strong>
            {
              amount(
                data.metrics
                  .customerCredits,
              )
            }
          </strong>
          <small>
            Unapplied receipts + unused credits
          </small>
        </div>

        <div
          className={
            styles.financeCard
          }
        >
          <span>
            Legacy opening AR
          </span>
          <strong>
            {
              amount(
                data.metrics
                  .legacyOpeningReceivables,
              )
            }
          </strong>
          <small>
            Posted migration AR without Invoicing documents
          </small>
        </div>

        <div
          className={
            styles.financeCard
          }
        >
          <span>
            90-day DSO estimate
          </span>
          <strong>
            {
              data.metrics
                .dsoDays ===
              null
                ? "—"
                : data.metrics
                    .dsoDays +
                  " days"
            }
          </strong>
          <small>
            Open AR ÷ trailing 90-day billings
          </small>
        </div>

      </section>

      <section
        className={
          styles.receivableControlGrid
        }
      >
        <div
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
                Control reconciliation
              </span>
              <h3>
                Accounts receivable
              </h3>
            </div>
            {
              data.receivableControl
                .reconciled
                ? (
                    <CheckCircle2
                      size={
                        20
                      }
                    />
                  )
                : (
                    <AlertTriangle
                      size={
                        20
                      }
                    />
                  )
            }
          </div>

          <div
            className={
              styles.receivableControlValues
            }
          >
            <div>
              <span>
                General ledger
              </span>
              <strong>
                {
                  amount(
                    data.receivableControl
                      .glBalance,
                  )
                }
              </strong>
            </div>
            <div>
              <span>
                Subledger + opening AR
              </span>
              <strong>
                {
                  amount(
                    data.receivableControl
                      .subledgerBalance,
                  )
                }
              </strong>
            </div>
            <div>
              <span>
                Difference
              </span>
              <strong>
                {
                  amount(
                    data.receivableControl
                      .difference,
                  )
                }
              </strong>
            </div>
          </div>

          <p
            className={
              styles.meta
            }
          >
            {
              data.receivableControl
                .accountCode
                ? data.receivableControl
                    .accountCode +
                  " · " +
                  data.receivableControl
                    .accountName
                : "No receivable control account is mapped yet."
            }
          </p>
        </div>

        <div
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
                Liability reconciliation
              </span>
              <h3>
                Customer credits
              </h3>
            </div>
            {
              data.customerCreditControl
                .reconciled
                ? (
                    <CheckCircle2
                      size={
                        20
                      }
                    />
                  )
                : (
                    <AlertTriangle
                      size={
                        20
                      }
                    />
                  )
            }
          </div>

          <div
            className={
              styles.receivableControlValues
            }
          >
            <div>
              <span>
                General ledger
              </span>
              <strong>
                {
                  amount(
                    data.customerCreditControl
                      .glBalance,
                  )
                }
              </strong>
            </div>
            <div>
              <span>
                Customer credits
              </span>
              <strong>
                {
                  amount(
                    data.customerCreditControl
                      .subledgerBalance,
                  )
                }
              </strong>
            </div>
            <div>
              <span>
                Difference
              </span>
              <strong>
                {
                  amount(
                    data.customerCreditControl
                      .difference,
                  )
                }
              </strong>
            </div>
          </div>

          <p
            className={
              styles.meta
            }
          >
            {
              data.customerCreditControl
                .accountCode
                ? data.customerCreditControl
                    .accountCode +
                  " · " +
                  data.customerCreditControl
                    .accountName
                : "Customer-credit control account will be provisioned by the Invoicing accounting integration."
            }
          </p>
        </div>
      </section>

      {
        !data.receivableControl
            .reconciled ||
        !data.customerCreditControl
            .reconciled
          ? (
              <div
                className={
                  styles.notice
                }
              >
                <AlertTriangle
                  size={
                    16
                  }
                />{" "}
                A non-zero control difference means the operational customer subledger and posted Accounting ledger disagree. Review older invoice/payment accounting links before making manual adjustments.
              </div>
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
              Aging
            </span>
            <h3>
              Receivables aging
            </h3>
            <p>
              Open invoice balances in company base currency.
            </p>
          </div>
          <Link
            href="/apps/invoicing/reminders"
            className={
              styles.button
            }
          >
            <RefreshCcw
              size={
                15
              }
            />
            Collection reminders
          </Link>
        </div>

        <div
          className={
            styles.receivableAgingGrid
          }
        >
          {
            data.aging.map(
              row => {
                const value =
                  cents(
                    row.amount,
                  );

                const width =
                  maxAging >
                    BigInt(
                      0,
                    )
                    ? Math.max(
                        4,
                        Number(
                          value *
                            BigInt(
                              10000,
                            ) /
                            maxAging,
                        ) /
                          100,
                      )
                    : 0;

                const active =
                  data.filters
                    .bucket ===
                  row.bucket;

                return (
                  <Link
                    href={
                      queryFor({
                        page:
                          1,
                        bucket:
                          active
                            ? ""
                            : row.bucket,
                      })
                    }
                    className={
                      styles.receivableAgingCard
                    }
                    aria-current={
                      active
                        ? "page"
                        : undefined
                    }
                    key={
                      row.bucket
                    }
                  >
                    <span>
                      {
                        AGING_LABELS[
                          row.bucket
                        ]
                      }
                    </span>
                    <strong>
                      {
                        amount(
                          row.amount,
                        )
                      }
                    </strong>
                    <small>
                      {
                        row.count
                      } invoices
                    </small>
                    <i
                      aria-hidden="true"
                      style={{
                        width:
                          width +
                          "%",
                      }}
                    />
                  </Link>
                );
              },
            )
          }
        </div>
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
              Exposure
            </span>
            <h3>
              Customer balances
            </h3>
            <p>
              Customers ranked by overdue and open exposure.
            </p>
          </div>

          <Link
            href="/apps/invoicing/customers"
            className={
              styles.button
            }
          >
            <Users
              size={
                15
              }
            />
            Manage customers
          </Link>
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
                  Customer
                </th>
                <th>
                  Status
                </th>
                <th>
                  Open invoices
                </th>
                <th
                  className={
                    styles.number
                  }
                >
                  Outstanding
                </th>
                <th
                  className={
                    styles.number
                  }
                >
                  Overdue
                </th>
                <th
                  className={
                    styles.number
                  }
                >
                  Credits
                </th>
                <th>
                  Oldest overdue
                </th>
              </tr>
            </thead>
            <tbody>
              {
                data.customers.length
                  ? data.customers.map(
                      customer => (
                        <tr
                          key={
                            customer.customerId
                          }
                        >
                          <td>
                            <Link
                              href={
                                queryFor({
                                  page:
                                    1,
                                  customerId:
                                    customer.customerId,
                                })
                              }
                            >
                              {
                                customer.customerName
                              }
                            </Link>
                            {
                              customer.creditLimit
                                ? (
                                    <span
                                      className={
                                        styles.meta
                                      }
                                    >
                                      Credit limit: {
                                        customer.customerCurrency
                                      } {
                                        customer.creditLimit
                                      }
                                    </span>
                                  )
                                : null
                            }
                          </td>
                          <td>
                            <span
                              className={
                                styles.badge
                              }
                            >
                              {
                                customer.customerStatus
                              }
                            </span>
                          </td>
                          <td>
                            {
                              customer.invoiceCount
                            }
                          </td>
                          <td
                            className={
                              styles.number
                            }
                          >
                            {
                              amount(
                                customer.outstanding,
                              )
                            }
                          </td>
                          <td
                            className={
                              styles.number
                            }
                          >
                            {
                              amount(
                                customer.overdue,
                              )
                            }
                          </td>
                          <td
                            className={
                              styles.number
                            }
                          >
                            {
                              amount(
                                customer.creditAvailable,
                              )
                            }
                          </td>
                          <td>
                            {
                              customer.maxDaysOverdue >
                                0
                                ? customer.maxDaysOverdue +
                                  " days"
                                : "Current"
                            }
                          </td>
                        </tr>
                      ),
                    )
                  : (
                      <tr>
                        <td
                          colSpan={
                            7
                          }
                          className={
                            styles.empty
                          }
                        >
                          No customer has an open receivable balance.
                        </td>
                      </tr>
                    )
              }
            </tbody>
          </table>
        </div>
      </section>

      {
        data.customerCredits.length
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
                      Customer liabilities
                    </span>
                    <h3>
                      Unapplied customer credits
                    </h3>
                    <p>
                      Receipts and credit notes still available to apply or refund.
                    </p>
                  </div>
                  <Link
                    href="/apps/invoicing/payments"
                    className={
                      styles.button
                    }
                  >
                    <CreditCard
                      size={
                        15
                      }
                    />
                    Payments
                  </Link>
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
                          Customer
                        </th>
                        <th
                          className={
                            styles.number
                          }
                        >
                          Unapplied receipts
                        </th>
                        <th
                          className={
                            styles.number
                          }
                        >
                          Unused credit notes
                        </th>
                        <th
                          className={
                            styles.number
                          }
                        >
                          Total credit
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {
                        data.customerCredits.map(
                          credit => (
                            <tr
                              key={
                                credit.customerId
                              }
                            >
                              <td>
                                {
                                  credit.customerName
                                }
                              </td>
                              <td
                                className={
                                  styles.number
                                }
                              >
                                {
                                  amount(
                                    credit.unappliedReceipts,
                                  )
                                }
                              </td>
                              <td
                                className={
                                  styles.number
                                }
                              >
                                {
                                  amount(
                                    credit.unusedCreditNotes,
                                  )
                                }
                              </td>
                              <td
                                className={
                                  styles.number
                                }
                              >
                                {
                                  amount(
                                    credit.totalCredit,
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
              Open items
            </span>
            <h3>
              Invoice receivables
            </h3>
            <p>
              {
                data.openItemCount
              } open items match the current filters.
            </p>
          </div>

          <Link
            href="/apps/invoicing/invoices"
            className={
              styles.button
            }
          >
            <ReceiptText
              size={
                15
              }
            />
            Invoicing register
          </Link>
        </div>

        <form
          method="get"
          className={
            styles.filters
          }
        >
          <label>
            Search
            <input
              name="search"
              defaultValue={
                data.filters
                  .search
              }
              placeholder="Invoice or customer"
            />
          </label>

          <label>
            Aging bucket
            <select
              name="bucket"
              defaultValue={
                data.filters
                  .bucket
              }
            >
              <option value="">
                All open items
              </option>
              {
                data.aging.map(
                  row => (
                    <option
                      value={
                        row.bucket
                      }
                      key={
                        row.bucket
                      }
                    >
                      {
                        AGING_LABELS[
                          row.bucket
                        ]
                      }
                    </option>
                  ),
                )
              }
            </select>
          </label>

          <label>
            Customer
            <select
              name="customerId"
              defaultValue={
                data.filters
                  .customerId
              }
            >
              <option value="">
                All customers
              </option>
              {
                data.customers.map(
                  customer => (
                    <option
                      value={
                        customer.customerId
                      }
                      key={
                        customer.customerId
                      }
                    >
                      {
                        customer.customerName
                      }
                    </option>
                  ),
                )
              }
            </select>
          </label>

          <button
            className={
              styles.button
            }
          >
            Apply
          </button>

          {
            data.filters
                .bucket ||
            data.filters
                .customerId ||
            data.filters
                .search
              ? (
                  <Link
                    href="/apps/accounting/receivables"
                    className={
                      styles.button
                    }
                  >
                    Clear
                  </Link>
                )
              : null
          }
        </form>

        <div
          className={
            styles.tableWrap
          }
        >
          <table>
            <thead>
              <tr>
                <th>
                  Invoice
                </th>
                <th>
                  Customer
                </th>
                <th>
                  Due
                </th>
                <th>
                  Status
                </th>
                <th>
                  Aging
                </th>
                <th
                  className={
                    styles.number
                  }
                >
                  Original
                </th>
                <th
                  className={
                    styles.number
                  }
                >
                  Balance
                </th>
                <th>
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {
                data.openItems.length
                  ? data.openItems.map(
                      item => (
                        <tr
                          key={
                            item.invoiceId
                          }
                        >
                          <td>
                            <Link
                              href={
                                "/apps/invoicing/" +
                                encodeURIComponent(
                                  item.invoiceId,
                                )
                              }
                            >
                              {
                                item.invoiceNumber
                              }
                            </Link>
                            <span
                              className={
                                styles.meta
                              }
                            >
                              {
                                item.invoiceDate
                              }
                            </span>
                          </td>
                          <td>
                            {
                              item.customerName
                            }
                          </td>
                          <td>
                            {
                              item.dueDate
                            }
                            <span
                              className={
                                styles.meta
                              }
                            >
                              {
                                item.daysOverdue >
                                  0
                                  ? item.daysOverdue +
                                    " days overdue"
                                  : "Not overdue"
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
                                item.effectiveStatus
                              }
                            </span>
                          </td>
                          <td>
                            {
                              item.agingBucket
                            }
                          </td>
                          <td
                            className={
                              styles.number
                            }
                          >
                            {
                              item.currency
                            } {
                              item.totalAmount
                            }
                          </td>
                          <td
                            className={
                              styles.number
                            }
                          >
                            {
                              amount(
                                item.baseBalanceDue,
                              )
                            }
                            {
                              item.currency !==
                                item.baseCurrency
                                ? (
                                    <span
                                      className={
                                        styles.meta
                                      }
                                    >
                                      {
                                        item.currency
                                      } {
                                        item.balanceDue
                                      } open
                                    </span>
                                  )
                                : null
                            }
                          </td>
                          <td>
                            <Link
                              href={
                                "/apps/invoicing/" +
                                encodeURIComponent(
                                  item.invoiceId,
                                )
                              }
                              className={
                                styles.button
                              }
                            >
                              Open
                              <ArrowUpRight
                                size={
                                  14
                                }
                              />
                            </Link>
                          </td>
                        </tr>
                      ),
                    )
                  : (
                      <tr>
                        <td
                          colSpan={
                            8
                          }
                          className={
                            styles.empty
                          }
                        >
                          No open receivables match these filters.
                        </td>
                      </tr>
                    )
              }
            </tbody>
          </table>
        </div>

        {
          pageCount >
            1
            ? (
                <div
                  className={
                    styles.openingPagination
                  }
                >
                  <Link
                    href={
                      queryFor({
                        page:
                          Math.max(
                            1,
                            data.filters
                              .page -
                              1,
                          ),
                      })
                    }
                    className={
                      styles.button
                    }
                    aria-disabled={
                      data.filters
                        .page <=
                      1
                    }
                  >
                    Previous
                  </Link>
                  <span>
                    Page {
                      data.filters
                        .page
                    } / {
                      pageCount
                    }
                  </span>
                  <Link
                    href={
                      queryFor({
                        page:
                          Math.min(
                            pageCount,
                            data.filters
                              .page +
                              1,
                          ),
                      })
                    }
                    className={
                      styles.button
                    }
                    aria-disabled={
                      data.filters
                        .page >=
                      pageCount
                    }
                  >
                    Next
                  </Link>
                </div>
              )
            : null
        }
      </section>
    </div>
  );
}
