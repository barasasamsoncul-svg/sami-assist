"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Pencil,
  Plus,
  RefreshCcw,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
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
  OpeningBalanceLine,
  OpeningBalanceWorkspace,
} from "@/lib/apps/accounting/opening-balance-types";
import {
  formatAccountingAmount,
} from "@/lib/apps/accounting/validation";

import styles from "./AccountingFoundation.module.css";


type ManualRow = {
  id: number;
  accountCode: string;
  description: string;
  debit: string;
  credit: string;
  subledgerType: string;
  subledgerReference: string;
  subledgerName: string;
};


function blankRow(
  id: number,
): ManualRow {
  return {
    id,
    accountCode:
      "",
    description:
      "",
    debit:
      "",
    credit:
      "",
    subledgerType:
      "none",
    subledgerReference:
      "",
    subledgerName:
      "",
  };
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


export default function AccountingOpeningBalances({
  data,
  canCreate,
  canEdit,
}: {
  data:
    OpeningBalanceWorkspace;
  canCreate:
    boolean;
  canEdit:
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
    busyKey,
    setBusyKey,
  ] =
    useState(
      "",
    );

  const [
    importMode,
    setImportMode,
  ] =
    useState<
      "csv" |
      "manual"
    >(
      "csv",
    );

  const [
    batchName,
    setBatchName,
  ] =
    useState(
      "",
    );

  const [
    asOfDate,
    setAsOfDate,
  ] =
    useState(
      new Date()
        .toISOString()
        .slice(
          0,
          10,
        ),
    );

  const [
    csvText,
    setCsvText,
  ] =
    useState(
      "",
    );

  const [
    csvName,
    setCsvName,
  ] =
    useState(
      "",
    );

  const [
    manualRows,
    setManualRows,
  ] =
    useState<
      ManualRow[]
    >([
      blankRow(
        1,
      ),
      blankRow(
        2,
      ),
    ]);

  const nextManualId =
    useRef(
      3,
    );

  const importKey =
    useRef<
      string | null
    >(
      null,
    );

  const [
    editingLine,
    setEditingLine,
  ] =
    useState<
      OpeningBalanceLine |
      null
    >(
      null,
    );

  const [
    editDraft,
    setEditDraft,
  ] =
    useState<{
      accountCode: string;
      description: string;
      debit: string;
      credit: string;
      subledgerType: string;
      subledgerReference: string;
      subledgerName: string;
    } | null>(
      null,
    );

  const amount = (
    value:
      string | null,
  ) =>
    formatAccountingAmount(
      value ||
        "0.00",
      data.currency,
    );

  const selected =
    data.selected;

  const accounts =
    data.accounts.filter(
      account =>
        account.is_active,
    );

  async function readCsvFile(
    file:
      File | null,
  ) {
    if (!file) {
      setCsvName(
        "",
      );
      setCsvText(
        "",
      );
      return;
    }

    if (
      file.size >
      5 *
        1024 *
        1024
    ) {
      showError(
        "CSV too large",
        "Keep one opening-balance import file below 5 MB.",
      );
      return;
    }

    try {
      const text =
        await file.text();

      setCsvName(
        file.name,
      );
      setCsvText(
        text,
      );
      importKey.current =
        null;
    } catch {
      showError(
        "CSV could not be read",
        "Choose the file again and retry.",
      );
    }
  }

  function updateManualRow(
    id:
      number,
    field:
      keyof Omit<
        ManualRow,
        "id"
      >,
    value:
      string,
  ) {
    setManualRows(
      current =>
        current.map(
          row =>
            row.id ===
              id
              ? {
                  ...row,
                  [field]:
                    value,
                }
              : row,
        ),
    );

    importKey.current =
      null;
  }

  async function createBatch(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    if (!canCreate) {
      showError(
        "Action unavailable",
        "You need Accounting create permission to import opening balances.",
      );
      return;
    }

    if (
      importMode ===
        "csv" &&
      !csvText
    ) {
      showError(
        "Choose a CSV",
        "Select an opening-balance CSV file before importing.",
      );
      return;
    }

    importKey.current =
      importKey.current ||
      browserUuid();

    setBusyKey(
      "create",
    );

    try {
      const body =
        importMode ===
          "csv"
          ? {
              expectedCompanyId:
                data.companyId,
              importKey:
                importKey.current,
              name:
                batchName,
              asOfDate,
              sourceType:
                "csv",
              csvText,
            }
          : {
              expectedCompanyId:
                data.companyId,
              importKey:
                importKey.current,
              name:
                batchName,
              asOfDate,
              sourceType:
                "manual",
              rows:
                manualRows.map(
                  row => ({
                    sourceRowKey:
                      "manual-" +
                      row.id,
                    accountCode:
                      row.accountCode,
                    description:
                      row.description,
                    debit:
                      row.debit,
                    credit:
                      row.credit,
                    subledgerType:
                      row.subledgerType,
                    subledgerReference:
                      row.subledgerReference,
                    subledgerName:
                      row.subledgerName,
                  }),
                ),
            };

      const response =
        await fetch(
          "/api/apps/accounting/opening-balances",
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
            "Opening balances could not be imported.",
        );
      }

      const id =
        String(
          payload.result
            ?.id ||
            "",
        );

      if (!id) {
        throw new Error(
          "SaMi did not return the opening-balance batch identifier.",
        );
      }

      importKey.current =
        null;

      showSuccess(
        "Opening balances imported",
        payload.result
          ?.status ===
          "validated"
          ? "The batch is balanced and validated. Review the reconciliation before posting."
          : "The batch was saved. Open it to correct validation errors before posting.",
      );

      router.push(
        "/apps/accounting/opening-balances/" +
          encodeURIComponent(
            id,
          ),
      );
      router.refresh();
    } catch (
      error
    ) {
      showError(
        "Opening-balance import failed",
        error instanceof
          Error
          ? error.message
          : "Retry this import.",
      );
    } finally {
      setBusyKey(
        "",
      );
    }
  }

  async function batchAction(
    action:
      | "validate"
      | "post"
      | "cancel",
  ) {
    if (
      !selected ||
      !canEdit
    ) {
      showError(
        "Action unavailable",
        "You need Accounting edit permission for this opening-balance workflow.",
      );
      return;
    }

    setBusyKey(
      action,
    );

    try {
      const response =
        await fetch(
          "/api/apps/accounting/opening-balances/" +
            encodeURIComponent(
              selected.id,
            ),
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                action,
                expectedCompanyId:
                  data.companyId,
              }),
          },
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ||
            "The opening-balance action failed.",
        );
      }

      if (
        action ===
        "cancel"
      ) {
        showSuccess(
          "Batch cancelled",
          "This migration batch will not post to the ledger.",
        );
        router.push(
          "/apps/accounting/opening-balances",
        );
      } else if (
        action ===
        "post"
      ) {
        showSuccess(
          "Opening balances posted",
          "SaMi posted one immutable opening journal through the authoritative double-entry ledger.",
        );
      } else {
        showSuccess(
          "Validation refreshed",
          payload.result
            ?.ready
            ? "The batch is balanced, reconciled and ready to post."
            : "Review the remaining row or reconciliation errors.",
        );
      }

      router.refresh();
    } catch (
      error
    ) {
      showError(
        "Opening-balance action failed",
        error instanceof
          Error
          ? error.message
          : "Retry this action.",
      );
    } finally {
      setBusyKey(
        "",
      );
    }
  }

  function beginEdit(
    line:
      OpeningBalanceLine,
  ) {
    setEditingLine(
      line,
    );

    setEditDraft({
      accountCode:
        line.account_code_input,
      description:
        line.description,
      debit:
        line.raw_debit,
      credit:
        line.raw_credit,
      subledgerType:
        line.subledger_type,
      subledgerReference:
        line.subledger_reference ||
        "",
      subledgerName:
        line.subledger_name ||
        "",
    });
  }

  async function saveLine() {
    if (
      !selected ||
      !editingLine ||
      !editDraft ||
      !canEdit
    ) {
      return;
    }

    setBusyKey(
      "line:" +
        editingLine.id,
    );

    try {
      const endpoint =
        "/api/apps/accounting/opening-balances/" +
        encodeURIComponent(
          selected.id,
        );

      const response =
        await fetch(
          endpoint,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                action:
                  "update-line",
                expectedCompanyId:
                  data.companyId,
                lineId:
                  editingLine.id,
                ...editDraft,
              }),
          },
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ||
            "This row could not be corrected.",
        );
      }

      const validation =
        await fetch(
          endpoint,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                action:
                  "validate",
                expectedCompanyId:
                  data.companyId,
              }),
          },
        );

      const validationPayload =
        await validation.json();

      if (!validation.ok) {
        throw new Error(
          validationPayload.error ||
            "The row was saved but the batch could not be revalidated.",
        );
      }

      setEditingLine(
        null,
      );
      setEditDraft(
        null,
      );

      showSuccess(
        "Row corrected",
        validationPayload.result
          ?.ready
          ? "The batch is now balanced and ready to post."
          : "The row was saved and the batch was revalidated. Review any remaining issues.",
      );

      router.refresh();
    } catch (
      error
    ) {
      showError(
        "Row correction failed",
        error instanceof
          Error
          ? error.message
          : "Retry this correction.",
      );
    } finally {
      setBusyKey(
        "",
      );
    }
  }

  const validationSummary =
    selected
      ?.validation_summary &&
    typeof selected
      .validation_summary ===
      "object"
      ? selected.validation_summary
      : {};

  const batchErrors =
    Array.isArray(
      validationSummary.batchErrors,
    )
      ? validationSummary.batchErrors.map(
          String,
        )
      : [];

  const linePages =
    selected
      ? Math.max(
          1,
          Math.ceil(
            selected.line_total_count /
              selected.line_page_size,
          ),
        )
      : 1;

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
            Accounting · Opening Balances · {
              data.currency
            }
          </div>
          <h2>
            {
              selected
                ? selected.name
                : "Opening balance migration"
            }
          </h2>
          <p>
            {
              selected
                ? "Review imported balances, correct migration rows, reconcile receivable/payable detail and post one traceable opening journal."
                : "Move existing books into SaMi through validated manual or CSV opening-balance batches. Draft imports never change the ledger."
            }
          </p>
        </div>

        <div
          className={
            styles.actions
          }
        >
          {
            selected
              ? (
                  <Link
                    href="/apps/accounting/opening-balances"
                    className={
                      styles.button
                    }
                  >
                    <ArrowLeft
                      size={
                        16
                      }
                    />
                    All batches
                  </Link>
                )
              : null
          }

          <Link
            href="/apps/accounting/journals"
            className={
              styles.button
            }
          >
            Journal register
          </Link>
        </div>
      </div>

      <section
        className={
          styles.healthGrid
        }
      >
        <div>
          <span>
            Draft
          </span>
          <strong>
            {
              data.counts
                .draft
            }
          </strong>
          <small>
            Needs correction or validation
          </small>
        </div>
        <div>
          <span>
            Validated
          </span>
          <strong>
            {
              data.counts
                .validated
            }
          </strong>
          <small>
            Balanced and ready to post
          </small>
        </div>
        <div>
          <span>
            Posted
          </span>
          <strong>
            {
              data.counts
                .posted
            }
          </strong>
          <small>
            Included in the ledger
          </small>
        </div>
        <div>
          <span>
            Cancelled
          </span>
          <strong>
            {
              data.counts
                .cancelled
            }
          </strong>
          <small>
            Preserved for audit only
          </small>
        </div>
      </section>

      {
        selected
          ? (
              <>
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
                      Debit
                    </span>
                    <strong>
                      {
                        amount(
                          selected.debit_total,
                        )
                      }
                    </strong>
                    <small>
                      {
                        selected.line_count
                      } imported rows
                    </small>
                  </div>
                  <div
                    className={
                      styles.financeCard
                    }
                  >
                    <span>
                      Credit
                    </span>
                    <strong>
                      {
                        amount(
                          selected.credit_total,
                        )
                      }
                    </strong>
                    <small>
                      As of {
                        selected.as_of_date
                      }
                    </small>
                  </div>
                  <div
                    className={
                      styles.financeCard
                    }
                  >
                    <span>
                      Difference
                    </span>
                    <strong>
                      {
                        amount(
                          selected.difference,
                        )
                      }
                    </strong>
                    <small>
                      Must be zero before posting
                    </small>
                  </div>
                  <div
                    className={
                      styles.financeCard
                    }
                  >
                    <span>
                      Status
                    </span>
                    <strong>
                      {
                        selected.status
                      }
                    </strong>
                    <small>
                      {
                        selected.error_count
                      } row errors · {
                        selected.warning_count
                      } warnings
                    </small>
                  </div>
                </section>

                {
                  batchErrors.length
                    ? (
                        <section
                          className={
                            styles.notice
                          }
                        >
                          <strong>
                            Batch validation needs attention
                          </strong>
                          {
                            batchErrors.map(
                              error => (
                                <p
                                  key={
                                    error
                                  }
                                >
                                  <AlertTriangle
                                    size={
                                      14
                                    }
                                  />{" "}
                                  {
                                    error
                                  }
                                </p>
                              ),
                            )
                          }
                        </section>
                      )
                    : selected.status ===
                        "validated"
                      ? (
                          <div
                            className={
                              styles.notice
                            }
                          >
                            <CheckCircle2
                              size={
                                16
                              }
                            />{" "}
                            This batch is balanced and its receivable/payable control detail reconciles. It is ready for posting.
                          </div>
                        )
                      : null
                }

                {
                  selected.reconciliation.length
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
                                Subledger control
                              </span>
                              <h3>
                                Receivables & payables reconciliation
                              </h3>
                              <p>
                                Customer/vendor detail must equal the opening balance of each AR/AP control account.
                              </p>
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
                                    Account
                                  </th>
                                  <th>
                                    Required detail
                                  </th>
                                  <th>
                                    Parties
                                  </th>
                                  <th
                                    className={
                                      styles.number
                                    }
                                  >
                                    Control
                                  </th>
                                  <th
                                    className={
                                      styles.number
                                    }
                                  >
                                    Subledger
                                  </th>
                                  <th
                                    className={
                                      styles.number
                                    }
                                  >
                                    Difference
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {
                                  selected.reconciliation.map(
                                    row => (
                                      <tr
                                        key={
                                          row.accountId
                                        }
                                      >
                                        <td>
                                          {
                                            row.code
                                          } · {
                                            row.name
                                          }
                                        </td>
                                        <td>
                                          {
                                            row.requiredSubledger
                                          }
                                        </td>
                                        <td>
                                          {
                                            row.counterparties
                                          }
                                        </td>
                                        <td
                                          className={
                                            styles.number
                                          }
                                        >
                                          {
                                            amount(
                                              row.controlBalance,
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
                                              row.subledgerBalance,
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
                                              row.difference,
                                            )
                                          }
                                          <span
                                            className={
                                              styles.meta
                                            }
                                          >
                                            {
                                              row.complete
                                                ? "Reconciled"
                                                : "Needs correction"
                                            }
                                          </span>
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
                        Migration rows
                      </span>
                      <h3>
                        Opening-balance detail
                      </h3>
                      <p>
                        Showing page {
                          selected.line_page
                        } of {
                          linePages
                        }. Posted batches are immutable.
                      </p>
                    </div>

                    {
                      selected.status !==
                        "posted" &&
                      selected.status !==
                        "cancelled" &&
                      canEdit
                        ? (
                            <button
                              type="button"
                              className={
                                styles.button
                              }
                              disabled={
                                Boolean(
                                  busyKey,
                                )
                              }
                              onClick={
                                () =>
                                  batchAction(
                                    "validate",
                                  )
                              }
                            >
                              <RefreshCcw
                                size={
                                  15
                                }
                              />
                              Revalidate
                            </button>
                          )
                        : null
                    }
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
                            Row
                          </th>
                          <th>
                            Account
                          </th>
                          <th>
                            Description
                          </th>
                          <th>
                            Subledger
                          </th>
                          <th
                            className={
                              styles.number
                            }
                          >
                            Debit
                          </th>
                          <th
                            className={
                              styles.number
                            }
                          >
                            Credit
                          </th>
                          <th>
                            Validation
                          </th>
                          <th>
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {
                          selected.lines.map(
                            line => (
                              <tr
                                key={
                                  line.id
                                }
                              >
                                <td>
                                  {
                                    line.row_number
                                  }
                                  <span
                                    className={
                                      styles.meta
                                    }
                                  >
                                    {
                                      line.source_row_key ||
                                      "—"
                                    }
                                  </span>
                                </td>
                                <td>
                                  {
                                    line.account_code ||
                                    line.account_code_input
                                  }
                                  {
                                    line.account_name
                                      ? " · " +
                                        line.account_name
                                      : ""
                                  }
                                </td>
                                <td>
                                  {
                                    line.description ||
                                    "—"
                                  }
                                </td>
                                <td>
                                  {
                                    line.subledger_type
                                  }
                                  <span
                                    className={
                                      styles.meta
                                    }
                                  >
                                    {
                                      line.subledger_reference ||
                                      "—"
                                    }
                                    {
                                      line.subledger_name
                                        ? " · " +
                                          line.subledger_name
                                        : ""
                                    }
                                  </span>
                                </td>
                                <td
                                  className={
                                    styles.number
                                  }
                                >
                                  {
                                    amount(
                                      line.debit,
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
                                      line.credit,
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
                                      line.validation_status
                                    }
                                  </span>
                                  {
                                    line.validation_messages.length
                                      ? (
                                          <span
                                            className={
                                              styles.meta
                                            }
                                          >
                                            {
                                              line.validation_messages.join(
                                                " · ",
                                              )
                                            }
                                          </span>
                                        )
                                      : null
                                  }
                                </td>
                                <td>
                                  {
                                    selected.status !==
                                      "posted" &&
                                    selected.status !==
                                      "cancelled" &&
                                    canEdit
                                      ? (
                                          <button
                                            type="button"
                                            className={
                                              styles.button
                                            }
                                            onClick={
                                              () =>
                                                beginEdit(
                                                  line,
                                                )
                                            }
                                          >
                                            <Pencil
                                              size={
                                                14
                                              }
                                            />
                                            Correct
                                          </button>
                                        )
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

                  {
                    linePages >
                      1
                      ? (
                          <div
                            className={
                              styles.openingPagination
                            }
                          >
                            <Link
                              className={
                                styles.button
                              }
                              aria-disabled={
                                selected.line_page <=
                                1
                              }
                              href={
                                selected.line_page <=
                                  1
                                  ? "#"
                                  : "/apps/accounting/opening-balances/" +
                                    encodeURIComponent(
                                      selected.id,
                                    ) +
                                    "?page=" +
                                    (
                                      selected.line_page -
                                      1
                                    )
                              }
                            >
                              <ChevronLeft
                                size={
                                  15
                                }
                              />
                              Previous
                            </Link>

                            <span>
                              Page {
                                selected.line_page
                              } / {
                                linePages
                              }
                            </span>

                            <Link
                              className={
                                styles.button
                              }
                              aria-disabled={
                                selected.line_page >=
                                linePages
                              }
                              href={
                                selected.line_page >=
                                  linePages
                                  ? "#"
                                  : "/apps/accounting/opening-balances/" +
                                    encodeURIComponent(
                                      selected.id,
                                    ) +
                                    "?page=" +
                                    (
                                      selected.line_page +
                                      1
                                    )
                              }
                            >
                              Next
                              <ChevronRight
                                size={
                                  15
                                }
                              />
                            </Link>
                          </div>
                        )
                      : null
                  }
                </section>

                <section
                  className={
                    styles.setupSaveBar
                  }
                >
                  <div>
                    <strong>
                      {
                        selected.status ===
                          "posted"
                          ? "Opening balances are locked"
                          : selected.status ===
                              "validated"
                            ? "Validated and ready to post"
                            : selected.status ===
                                "cancelled"
                              ? "Batch cancelled"
                              : "Draft migration batch"
                      }
                    </strong>
                    <p>
                      {
                        selected.status ===
                          "posted"
                          ? "Corrections now require a controlled accounting adjustment; the posted migration batch itself remains immutable."
                          : "Nothing reaches the ledger until this batch passes validation and you explicitly post it."
                      }
                    </p>
                  </div>

                  <div
                    className={
                      styles.actions
                    }
                  >
                    {
                      selected.posted_journal_id
                        ? (
                            <Link
                              href={
                                "/apps/accounting/journals/" +
                                encodeURIComponent(
                                  selected.posted_journal_id,
                                )
                              }
                              className={
                                styles.button
                              }
                            >
                              View opening journal
                            </Link>
                          )
                        : null
                    }

                    {
                      (
                        selected.status ===
                          "draft" ||
                        selected.status ===
                          "validated"
                      ) &&
                      canEdit
                        ? (
                            <button
                              type="button"
                              className={
                                styles.button
                              }
                              disabled={
                                Boolean(
                                  busyKey,
                                )
                              }
                              onClick={
                                () =>
                                  batchAction(
                                    "cancel",
                                  )
                              }
                            >
                              <Trash2
                                size={
                                  15
                                }
                              />
                              Cancel batch
                            </button>
                          )
                        : null
                    }

                    {
                      selected.status ===
                        "validated" &&
                      canEdit
                        ? (
                            <button
                              type="button"
                              className={
                                styles.primary
                              }
                              disabled={
                                Boolean(
                                  busyKey,
                                )
                              }
                              onClick={
                                () =>
                                  batchAction(
                                    "post",
                                  )
                              }
                            >
                              <Send
                                size={
                                  15
                                }
                              />
                              Post opening balances
                            </button>
                          )
                        : null
                    }
                  </div>
                </section>
              </>
            )
          : (
              <>
                {
                  canCreate
                    ? (
                        <form
                          onSubmit={
                            createBatch
                          }
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
                                Migration wizard
                              </span>
                              <h3>
                                Import opening balances
                              </h3>
                              <p>
                                Start with a balanced trial balance. Receivable and payable rows also require customer/vendor detail.
                              </p>
                            </div>
                            <FileSpreadsheet
                              size={
                                22
                              }
                            />
                          </div>

                          <div
                            className={
                              styles.openingModeTabs
                            }
                          >
                            <button
                              type="button"
                              className={
                                importMode ===
                                  "csv"
                                  ? styles.primary
                                  : styles.button
                              }
                              onClick={
                                () =>
                                  setImportMode(
                                    "csv",
                                  )
                              }
                            >
                              <Upload
                                size={
                                  15
                                }
                              />
                              CSV import
                            </button>
                            <button
                              type="button"
                              className={
                                importMode ===
                                  "manual"
                                  ? styles.primary
                                  : styles.button
                              }
                              onClick={
                                () =>
                                  setImportMode(
                                    "manual",
                                  )
                              }
                            >
                              <Plus
                                size={
                                  15
                                }
                              />
                              Manual entry
                            </button>
                          </div>

                          <div
                            className={
                              styles.formGrid
                            }
                          >
                            <label>
                              Batch name
                              <input
                                required
                                maxLength={
                                  160
                                }
                                value={
                                  batchName
                                }
                                onChange={
                                  event => {
                                    setBatchName(
                                      event.target
                                        .value,
                                    );
                                    importKey.current =
                                      null;
                                  }
                                }
                                placeholder="e.g. Migration from previous system"
                              />
                            </label>

                            <label>
                              Opening date
                              <input
                                required
                                type="date"
                                value={
                                  asOfDate
                                }
                                onChange={
                                  event => {
                                    setAsOfDate(
                                      event.target
                                        .value,
                                    );
                                    importKey.current =
                                      null;
                                  }
                                }
                              />
                            </label>
                          </div>

                          {
                            importMode ===
                              "csv"
                              ? (
                                  <div
                                    className={
                                      styles.openingImportBox
                                    }
                                  >
                                    <label>
                                      CSV file
                                      <input
                                        type="file"
                                        accept=".csv,text/csv"
                                        required
                                        onChange={
                                          event =>
                                            readCsvFile(
                                              event.target
                                                .files?.[
                                                0
                                              ] ||
                                                null,
                                            )
                                        }
                                      />
                                    </label>

                                    <p>
                                      Required headers: <strong>account_code, debit, credit</strong>. Optional: description, subledger_type, subledger_reference, subledger_name, source_row_key.
                                    </p>

                                    {
                                      csvName
                                        ? (
                                            <span
                                              className={
                                                styles.badge
                                              }
                                            >
                                              {
                                                csvName
                                              }
                                            </span>
                                          )
                                        : null
                                    }
                                  </div>
                                )
                              : (
                                  <>
                                    <div
                                      className={
                                        styles.openingManualRows
                                      }
                                    >
                                      {
                                        manualRows.map(
                                          (
                                            row,
                                            index,
                                          ) => (
                                            <section
                                              className={
                                                styles.openingManualRow
                                              }
                                              key={
                                                row.id
                                              }
                                            >
                                              <div
                                                className={
                                                  styles.panelHeading
                                                }
                                              >
                                                <strong>
                                                  Line {
                                                    index +
                                                    1
                                                  }
                                                </strong>
                                                <button
                                                  type="button"
                                                  className={
                                                    styles.button
                                                  }
                                                  disabled={
                                                    manualRows.length <=
                                                    2
                                                  }
                                                  onClick={
                                                    () =>
                                                      setManualRows(
                                                        current =>
                                                          current.filter(
                                                            item =>
                                                              item.id !==
                                                              row.id,
                                                          ),
                                                      )
                                                  }
                                                >
                                                  <X
                                                    size={
                                                      14
                                                    }
                                                  />
                                                  Remove
                                                </button>
                                              </div>

                                              <div
                                                className={
                                                  styles.setupGrid
                                                }
                                              >
                                                <label>
                                                  Account
                                                  <select
                                                    required
                                                    value={
                                                      row.accountCode
                                                    }
                                                    onChange={
                                                      event =>
                                                        updateManualRow(
                                                          row.id,
                                                          "accountCode",
                                                          event.target
                                                            .value,
                                                        )
                                                    }
                                                  >
                                                    <option value="">
                                                      Choose account
                                                    </option>
                                                    {
                                                      accounts.map(
                                                        account => (
                                                          <option
                                                            key={
                                                              account.id
                                                            }
                                                            value={
                                                              account.code
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
                                                  Description
                                                  <input
                                                    maxLength={
                                                      500
                                                    }
                                                    value={
                                                      row.description
                                                    }
                                                    onChange={
                                                      event =>
                                                        updateManualRow(
                                                          row.id,
                                                          "description",
                                                          event.target
                                                            .value,
                                                        )
                                                    }
                                                  />
                                                </label>

                                                <label>
                                                  Subledger type
                                                  <select
                                                    value={
                                                      row.subledgerType
                                                    }
                                                    onChange={
                                                      event =>
                                                        updateManualRow(
                                                          row.id,
                                                          "subledgerType",
                                                          event.target
                                                            .value,
                                                        )
                                                    }
                                                  >
                                                    <option value="none">
                                                      None
                                                    </option>
                                                    <option value="customer">
                                                      Customer
                                                    </option>
                                                    <option value="vendor">
                                                      Vendor
                                                    </option>
                                                    <option value="bank">
                                                      Bank
                                                    </option>
                                                    <option value="tax">
                                                      Tax
                                                    </option>
                                                    <option value="employee">
                                                      Employee
                                                    </option>
                                                    <option value="other">
                                                      Other
                                                    </option>
                                                  </select>
                                                </label>

                                                <label>
                                                  Debit
                                                  <input
                                                    inputMode="decimal"
                                                    value={
                                                      row.debit
                                                    }
                                                    onChange={
                                                      event =>
                                                        updateManualRow(
                                                          row.id,
                                                          "debit",
                                                          event.target
                                                            .value,
                                                        )
                                                    }
                                                    placeholder="0.00"
                                                  />
                                                </label>

                                                <label>
                                                  Credit
                                                  <input
                                                    inputMode="decimal"
                                                    value={
                                                      row.credit
                                                    }
                                                    onChange={
                                                      event =>
                                                        updateManualRow(
                                                          row.id,
                                                          "credit",
                                                          event.target
                                                            .value,
                                                        )
                                                    }
                                                    placeholder="0.00"
                                                  />
                                                </label>

                                                <label>
                                                  Party/reference
                                                  <input
                                                    maxLength={
                                                      160
                                                    }
                                                    value={
                                                      row.subledgerReference
                                                    }
                                                    onChange={
                                                      event =>
                                                        updateManualRow(
                                                          row.id,
                                                          "subledgerReference",
                                                          event.target
                                                            .value,
                                                        )
                                                    }
                                                    placeholder="Customer/vendor reference"
                                                  />
                                                </label>

                                                <label>
                                                  Party name
                                                  <input
                                                    maxLength={
                                                      255
                                                    }
                                                    value={
                                                      row.subledgerName
                                                    }
                                                    onChange={
                                                      event =>
                                                        updateManualRow(
                                                          row.id,
                                                          "subledgerName",
                                                          event.target
                                                            .value,
                                                        )
                                                    }
                                                  />
                                                </label>
                                              </div>
                                            </section>
                                          ),
                                        )
                                      }
                                    </div>

                                    <button
                                      type="button"
                                      className={
                                        styles.button
                                      }
                                      disabled={
                                        manualRows.length >=
                                        200
                                      }
                                      onClick={
                                        () =>
                                          setManualRows(
                                            current => [
                                              ...current,
                                              blankRow(
                                                nextManualId
                                                  .current++,
                                              ),
                                            ],
                                          )
                                      }
                                    >
                                      <Plus
                                        size={
                                          15
                                        }
                                      />
                                      Add line
                                    </button>
                                  </>
                                )
                          }

                          <div
                            className={
                              styles.openingWizardFooter
                            }
                          >
                            <div>
                              <strong>
                                Import is safe to retry
                              </strong>
                              <p>
                                SaMi uses an idempotency key so a repeated request cannot create a duplicate opening batch.
                              </p>
                            </div>
                            <button
                              className={
                                styles.primary
                              }
                              disabled={
                                busyKey ===
                                "create"
                              }
                            >
                              <Upload
                                size={
                                  15
                                }
                              />
                              {
                                busyKey ===
                                  "create"
                                  ? "Importing…"
                                  : "Import & validate"
                              }
                            </button>
                          </div>
                        </form>
                      )
                    : (
                        <div
                          className={
                            styles.notice
                          }
                        >
                          You need Accounting create permission to import opening balances.
                        </div>
                      )
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
                        Migration history
                      </span>
                      <h3>
                        Opening-balance batches
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
                            Batch
                          </th>
                          <th>
                            Date
                          </th>
                          <th>
                            Source
                          </th>
                          <th>
                            Status
                          </th>
                          <th>
                            Errors
                          </th>
                          <th
                            className={
                              styles.number
                            }
                          >
                            Debit
                          </th>
                          <th
                            className={
                              styles.number
                            }
                          >
                            Difference
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {
                          data.batches.length
                            ? data.batches.map(
                                row => (
                                  <tr
                                    key={
                                      row.id
                                    }
                                  >
                                    <td>
                                      <Link
                                        href={
                                          "/apps/accounting/opening-balances/" +
                                          encodeURIComponent(
                                            row.id,
                                          )
                                        }
                                      >
                                        {
                                          row.name
                                        }
                                      </Link>
                                      <span
                                        className={
                                          styles.meta
                                        }
                                      >
                                        {
                                          row.line_count
                                        } rows
                                      </span>
                                    </td>
                                    <td>
                                      {
                                        row.as_of_date
                                      }
                                    </td>
                                    <td>
                                      {
                                        row.source_type
                                      }
                                    </td>
                                    <td>
                                      <span
                                        className={
                                          styles.badge
                                        }
                                      >
                                        {
                                          row.status
                                        }
                                      </span>
                                    </td>
                                    <td>
                                      {
                                        row.error_count
                                      }
                                      <span
                                        className={
                                          styles.meta
                                        }
                                      >
                                        {
                                          row.warning_count
                                        } warnings
                                      </span>
                                    </td>
                                    <td
                                      className={
                                        styles.number
                                      }
                                    >
                                      {
                                        amount(
                                          row.debit_total,
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
                                          row.difference,
                                        )
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
                                    No opening-balance migration batches yet.
                                  </td>
                                </tr>
                              )
                        }
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )
      }

      {
        editingLine &&
        editDraft
          ? (
              <div
                className={
                  styles.chartEditorBackdrop
                }
                role="dialog"
                aria-modal="true"
                aria-label="Correct opening-balance row"
              >
                <div
                  className={
                    styles.chartEditor
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
                        Row {
                          editingLine.row_number
                        }
                      </span>
                      <h3>
                        Correct migration row
                      </h3>
                      <p>
                        Saving resets validation for the batch and immediately runs validation again.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={
                        styles.button
                      }
                      onClick={
                        () => {
                          setEditingLine(
                            null,
                          );
                          setEditDraft(
                            null,
                          );
                        }
                      }
                    >
                      <X
                        size={
                          15
                        }
                      />
                      Close
                    </button>
                  </div>

                  <div
                    className={
                      styles.setupGrid
                    }
                  >
                    <label>
                      Account
                      <select
                        value={
                          editDraft.accountCode
                        }
                        onChange={
                          event =>
                            setEditDraft({
                              ...editDraft,
                              accountCode:
                                event.target
                                  .value,
                            })
                        }
                      >
                        <option value="">
                          Choose account
                        </option>
                        {
                          accounts.map(
                            account => (
                              <option
                                key={
                                  account.id
                                }
                                value={
                                  account.code
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
                      Description
                      <input
                        maxLength={
                          500
                        }
                        value={
                          editDraft.description
                        }
                        onChange={
                          event =>
                            setEditDraft({
                              ...editDraft,
                              description:
                                event.target
                                  .value,
                            })
                        }
                      />
                    </label>

                    <label>
                      Subledger type
                      <select
                        value={
                          editDraft.subledgerType
                        }
                        onChange={
                          event =>
                            setEditDraft({
                              ...editDraft,
                              subledgerType:
                                event.target
                                  .value,
                            })
                        }
                      >
                        <option value="none">
                          None
                        </option>
                        <option value="customer">
                          Customer
                        </option>
                        <option value="vendor">
                          Vendor
                        </option>
                        <option value="bank">
                          Bank
                        </option>
                        <option value="tax">
                          Tax
                        </option>
                        <option value="employee">
                          Employee
                        </option>
                        <option value="other">
                          Other
                        </option>
                      </select>
                    </label>

                    <label>
                      Debit
                      <input
                        inputMode="decimal"
                        value={
                          editDraft.debit
                        }
                        onChange={
                          event =>
                            setEditDraft({
                              ...editDraft,
                              debit:
                                event.target
                                  .value,
                            })
                        }
                      />
                    </label>

                    <label>
                      Credit
                      <input
                        inputMode="decimal"
                        value={
                          editDraft.credit
                        }
                        onChange={
                          event =>
                            setEditDraft({
                              ...editDraft,
                              credit:
                                event.target
                                  .value,
                            })
                        }
                      />
                    </label>

                    <label>
                      Party/reference
                      <input
                        maxLength={
                          160
                        }
                        value={
                          editDraft.subledgerReference
                        }
                        onChange={
                          event =>
                            setEditDraft({
                              ...editDraft,
                              subledgerReference:
                                event.target
                                  .value,
                            })
                        }
                      />
                    </label>

                    <label>
                      Party name
                      <input
                        maxLength={
                          255
                        }
                        value={
                          editDraft.subledgerName
                        }
                        onChange={
                          event =>
                            setEditDraft({
                              ...editDraft,
                              subledgerName:
                                event.target
                                  .value,
                            })
                        }
                      />
                    </label>
                  </div>

                  <div
                    className={
                      styles.chartEditorFooter
                    }
                  >
                    <button
                      type="button"
                      className={
                        styles.button
                      }
                      onClick={
                        () => {
                          setEditingLine(
                            null,
                          );
                          setEditDraft(
                            null,
                          );
                        }
                      }
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={
                        styles.primary
                      }
                      disabled={
                        busyKey ===
                        "line:" +
                          editingLine.id
                      }
                      onClick={
                        saveLine
                      }
                    >
                      <CheckCircle2
                        size={
                          15
                        }
                      />
                      Save & revalidate
                    </button>
                  </div>
                </div>
              </div>
            )
          : null
      }

      <SaMiOverlay
        {
          ...overlay
        }
        onClose={
          closeOverlay
        }
      />
    </div>
  );
}
