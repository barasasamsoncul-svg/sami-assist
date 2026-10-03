"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  Plus,
  RefreshCcw,
  Repeat2,
  RotateCcw,
  Send,
  Trash2,
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
  AccountingJournalWorkspace,
} from "@/lib/apps/accounting/journal-types";
import {
  decimalAmount,
  formatAccountingAmount,
  minorUnits,
} from "@/lib/apps/accounting/validation";

import styles from "./AccountingFoundation.module.css";


const blankLine = (
  id: number,
) => ({
  id,
  accountId:
    "",
  description:
    "",
  debit:
    "",
  credit:
    "",
});


export default function AccountingJournals({
  data,
  section,
  canCreate,
  canEdit,
}: {
  data:
    AccountingJournalWorkspace;
  section:
    | "journals"
    | "recurring-journals";
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
    approvalNote,
    setApprovalNote,
  ] =
    useState(
      "",
    );

  const [
    reversalDate,
    setReversalDate,
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
    reversalReason,
    setReversalReason,
  ] =
    useState(
      "",
    );

  const [
    recurringName,
    setRecurringName,
  ] =
    useState(
      "",
    );

  const [
    frequency,
    setFrequency,
  ] =
    useState<
      | "weekly"
      | "monthly"
      | "quarterly"
      | "yearly"
    >(
      "monthly",
    );

  const [
    startsOn,
    setStartsOn,
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
    endsOn,
    setEndsOn,
  ] =
    useState(
      "",
    );

  const [
    referencePrefix,
    setReferencePrefix,
  ] =
    useState(
      "",
    );

  const [
    recurringDescription,
    setRecurringDescription,
  ] =
    useState(
      "",
    );

  const [
    recurringLines,
    setRecurringLines,
  ] =
    useState([
      blankLine(
        1,
      ),
      blankLine(
        2,
      ),
    ]);

  const nextLineId =
    useRef(
      3,
    );

  const amount = (
    value:
      string,
  ) =>
    formatAccountingAmount(
      value,
      data.currency,
    );

  async function journalAction(
    journalId:
      string,
    action:
      | "approve"
      | "post"
      | "reverse",
  ) {
    if (!canEdit) {
      showError(
        "Action unavailable",
        "You need Accounting edit permission for this journal workflow.",
      );
      return;
    }

    setBusyKey(
      action +
        ":" +
        journalId,
    );

    try {
      const response =
        await fetch(
          "/api/apps/accounting/journals/" +
            encodeURIComponent(
              journalId,
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
                note:
                  approvalNote,
                reversalDate,
                description:
                  reversalReason,
              }),
          },
        );

      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ||
            "The journal action failed.",
        );
      }

      const result =
        body.result || {};

      showSuccess(
        action ===
          "approve"
          ? result.status ===
              "approved"
            ? "Journal approved"
            : "Approval recorded"
          : action ===
              "post"
            ? "Journal posted"
            : "Reversal created",
        action ===
          "approve"
          ? result.status ===
              "approved"
            ? "All required approval decisions are complete and the journal is ready for posting."
            : "Your approval was recorded. This journal still needs " +
              Math.max(
                0,
                Number(
                  result.required || 1,
                ) -
                  Number(
                    result.approvals || 0,
                  ),
              ) +
              " more approval decision(s)."
          : action ===
              "post"
            ? "The journal is now part of the posted ledger."
            : "SaMi created a linked compensating journal instead of changing the posted entry.",
      );

      if (
        action ===
        "reverse"
      ) {
        setReversalReason(
          "",
        );
      }

      router.refresh();
    } catch (
      error
    ) {
      showError(
        "Accounting action failed",
        error instanceof
          Error
          ? error.message
          : "Retry this Accounting action.",
      );
    } finally {
      setBusyKey(
        "",
      );
    }
  }

  function updateRecurringLine(
    id:
      number,
    field:
      "accountId"
      | "description"
      | "debit"
      | "credit",
    value:
      string,
  ) {
    setRecurringLines(
      current =>
        current.map(
          line =>
            line.id ===
              id
              ? {
                  ...line,
                  [field]:
                    value,
                }
              : line,
        ),
    );
  }

  let debit =
    BigInt(
      0,
    );

  let credit =
    BigInt(
      0,
    );

  let recurringAmountsValid =
    true;

  try {
    for (
      const line
      of recurringLines
    ) {
      debit +=
        minorUnits(
          line.debit,
        );
      credit +=
        minorUnits(
          line.credit,
        );
    }
  } catch {
    recurringAmountsValid =
      false;
  }

  async function createRecurring(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    if (!canCreate) {
      showError(
        "Action unavailable",
        "You need Accounting create permission to add a recurring journal.",
      );
      return;
    }

    setBusyKey(
      "recurring:create",
    );

    try {
      const response =
        await fetch(
          "/api/apps/accounting/recurring-journals",
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
                  "create",
                expectedCompanyId:
                  data.companyId,
                name:
                  recurringName,
                frequency,
                startsOn,
                endsOn:
                  endsOn ||
                  null,
                referencePrefix,
                description:
                  recurringDescription,
                lines:
                  recurringLines,
              }),
          },
        );

      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ||
            "The recurring journal could not be created.",
        );
      }

      setRecurringName(
        "",
      );
      setReferencePrefix(
        "",
      );
      setRecurringDescription(
        "",
      );
      setEndsOn(
        "",
      );
      setRecurringLines([
        blankLine(
          1,
        ),
        blankLine(
          2,
        ),
      ]);
      nextLineId.current =
        3;

      showSuccess(
        "Recurring journal created",
        "The template is active. Generate each occurrence as a draft so it can be reviewed and approved before posting.",
      );

      router.refresh();
    } catch (
      error
    ) {
      showError(
        "Recurring journal not created",
        error instanceof
          Error
          ? error.message
          : "Retry the recurring journal.",
      );
    } finally {
      setBusyKey(
        "",
      );
    }
  }

  async function generateRecurring(
    recurringId:
      string,
  ) {
    setBusyKey(
      "recurring:" +
        recurringId,
    );

    try {
      const response =
        await fetch(
          "/api/apps/accounting/recurring-journals",
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
                  "generate",
                expectedCompanyId:
                  data.companyId,
                recurringId,
              }),
          },
        );

      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ||
            "The recurring draft could not be generated.",
        );
      }

      showSuccess(
        "Recurring draft generated",
        "The next occurrence is now a normal Accounting draft. Review and approve it before posting.",
      );

      router.refresh();
    } catch (
      error
    ) {
      showError(
        "Recurring journal failed",
        error instanceof
          Error
          ? error.message
          : "Retry generating this recurring journal.",
      );
    } finally {
      setBusyKey(
        "",
      );
    }
  }

  const selected =
    data.selected;

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
            Accounting · Journals · {
              data.currency
            }
          </div>
          <h2>
            {
              section ===
              "journals"
                ? selected
                  ? selected.journal_number
                  : "Journal register"
                : "Recurring journals"
            }
          </h2>
          <p>
            {
              section ===
              "journals"
                ? "Review drafts, approve controlled entries, post atomically, inspect source provenance and reverse posted entries without rewriting history."
                : "Define balanced repeatable journals and generate each occurrence as a reviewable draft."
            }
          </p>
        </div>

        <div
          className={
            styles.actions
          }
        >
          {
            section ===
              "journals" &&
            canCreate
              ? (
                  <Link
                    href="/apps/accounting/new-journal"
                    className={
                      styles.primary
                    }
                  >
                    <Plus
                      size={
                        16
                      }
                    />
                    New journal
                  </Link>
                )
              : null
          }

          <Link
            href={
              section ===
                "journals"
                ? "/apps/accounting/recurring-journals"
                : "/apps/accounting/journals"
            }
            className={
              styles.button
            }
          >
            <Repeat2
              size={
                16
              }
            />
            {
              section ===
                "journals"
                ? "Recurring"
                : "Journal register"
            }
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
            Drafts
          </span>
          <strong>
            {
              data.counts
                .draft
            }
          </strong>
          <small>
            Waiting for review
          </small>
        </div>
        <div>
          <span>
            Approved
          </span>
          <strong>
            {
              data.counts
                .approved
            }
          </strong>
          <small>
            Ready to post
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
            Included in ledger
          </small>
        </div>
        <div>
          <span>
            Active recurring
          </span>
          <strong>
            {
              data.counts
                .recurringActive
            }
          </strong>
          <small>
            Templates generating drafts
          </small>
        </div>
      </section>

      {
        section ===
        "journals"
          ? selected
            ? (
                <>
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
                        <Link
                          href="/apps/accounting/journals"
                          className={
                            styles.button
                          }
                        >
                          <ArrowLeft
                            size={
                              14
                            }
                          />
                          Journal register
                        </Link>
                        <h3>
                          {
                            selected.description ||
                            "Journal entry"
                          }
                        </h3>
                        <p
                          className={
                            styles.meta
                          }
                        >
                          {
                            selected.journal_date
                          }
                          {" · "}
                          {
                            selected.posting_kind
                          }
                          {" · "}
                          {
                            selected.source_module ||
                            "manual"
                          }
                          {
                            selected.source_type
                              ? " / " +
                                selected.source_type
                              : ""
                          }
                        </p>
                      </div>
                      <span
                        className={
                          styles.badge
                        }
                      >
                        {
                          selected.status
                        }
                      </span>
                    </div>

                    <div
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
                      </div>
                      <div
                        className={
                          styles.financeCard
                        }
                      >
                        <span>
                          Reference
                        </span>
                        <strong>
                          {
                            selected.reference ||
                            "—"
                          }
                        </strong>
                      </div>
                      <div
                        className={
                          styles.financeCard
                        }
                      >
                        <span>
                          Lines
                        </span>
                        <strong>
                          {
                            selected.line_count
                          }
                        </strong>
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
                              Description
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
                                      line.code
                                    }
                                    {" · "}
                                    {
                                      line.name
                                    }
                                  </td>
                                  <td>
                                    {
                                      line.description ||
                                      "—"
                                    }
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
                                </tr>
                              ),
                            )
                          }
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {
                    selected.status ===
                      "draft" &&
                    canEdit
                      ? (
                          <section
                            className={
                              styles.panel
                            }
                          >
                            <h3>
                              Approve journal
                            </h3>
                            <p>
                              Approval confirms the draft is ready for posting. Posting will recheck the open period, lock date, account controls and persisted balance.
                            </p>
                            <label>
                              Approval note
                              <textarea
                                value={
                                  approvalNote
                                }
                                onChange={
                                  event =>
                                    setApprovalNote(
                                      event.target
                                        .value,
                                    )
                                }
                                maxLength={
                                  1000
                                }
                              />
                            </label>
                            <div
                              className={
                                styles.actions
                              }
                            >
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
                                    journalAction(
                                      selected.id,
                                      "approve",
                                    )
                                }
                              >
                                <CheckCircle2
                                  size={
                                    16
                                  }
                                />
                                Approve
                              </button>
                            </div>
                          </section>
                        )
                      : null
                  }

                  {
                    selected.status ===
                      "approved" &&
                    canEdit
                      ? (
                          <section
                            className={
                              styles.panel
                            }
                          >
                            <h3>
                              Post to ledger
                            </h3>
                            <p>
                              Posting is atomic. The existing approved journal is promoted to posted status; SaMi does not duplicate the entry.
                            </p>
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
                                  journalAction(
                                    selected.id,
                                    "post",
                                  )
                              }
                            >
                              <Send
                                size={
                                  16
                                }
                              />
                              Post journal
                            </button>
                          </section>
                        )
                      : null
                  }

                  {
                    selected.status ===
                      "posted" &&
                    !selected.reversed_by_journal_id &&
                    selected.source_module ===
                      "accounting" &&
                    selected.posting_kind !==
                      "system" &&
                    selected.source_type !==
                      "opening_balance_batch" &&
                    canEdit
                      ? (
                          <section
                            className={
                              styles.panel
                            }
                          >
                            <h3>
                              Reverse posted journal
                            </h3>
                            <p>
                              Posted history is immutable. Reversal creates a linked compensating entry on the chosen open accounting date.
                            </p>
                            <div
                              className={
                                styles.formGrid
                              }
                            >
                              <label>
                                Reversal date
                                <input
                                  type="date"
                                  value={
                                    reversalDate
                                  }
                                  onChange={
                                    event =>
                                      setReversalDate(
                                        event.target
                                          .value,
                                      )
                                  }
                                />
                              </label>
                              <label>
                                Business reason
                                <textarea
                                  value={
                                    reversalReason
                                  }
                                  onChange={
                                    event =>
                                      setReversalReason(
                                        event.target
                                          .value,
                                      )
                                  }
                                  maxLength={
                                    1000
                                  }
                                  placeholder="Why is this posted journal being reversed?"
                                />
                              </label>
                            </div>
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
                                  journalAction(
                                    selected.id,
                                    "reverse",
                                  )
                              }
                            >
                              <RotateCcw
                                size={
                                  16
                                }
                              />
                              Create reversal
                            </button>
                          </section>
                        )
                      : null
                  }

                  {
                    selected.reversed_by_journal_id
                      ? (
                          <div
                            className={
                              styles.notice
                            }
                          >
                            This journal has already been reversed. The original posted entry remains unchanged for audit purposes.
                          </div>
                        )
                      : null
                  }
                </>
              )
            : (
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
                        Controlled workflow
                      </span>
                      <h3>
                        Journal entries
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
                            Journal
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
                          <th
                            className={
                              styles.number
                            }
                          >
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {
                          data.journals.map(
                            row => (
                              <tr
                                key={
                                  row.id
                                }
                              >
                                <td>
                                  <Link
                                    href={
                                      "/apps/accounting/journals/" +
                                      encodeURIComponent(
                                        row.id,
                                      )
                                    }
                                  >
                                    {
                                      row.description ||
                                      "Journal entry"
                                    }
                                  </Link>
                                  <span
                                    className={
                                      styles.meta
                                    }
                                  >
                                    {
                                      row.journal_number
                                    }
                                  </span>
                                </td>
                                <td>
                                  {
                                    row.journal_date
                                  }
                                </td>
                                <td>
                                  {
                                    row.source_module ||
                                    "manual"
                                  }
                                  {
                                    row.source_type
                                      ? " · " +
                                        row.source_type.replaceAll(
                                          "_",
                                          " ",
                                        )
                                      : ""
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
                              </tr>
                            ),
                          )
                        }
                      </tbody>
                    </table>
                  </div>
                </section>
              )
          : (
              <>
                {
                  canCreate
                    ? (
                        <form
                          onSubmit={
                            createRecurring
                          }
                        >
                          <fieldset
                            disabled={
                              busyKey ===
                              "recurring:create"
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
                                  Template
                                </span>
                                <h3>
                                  New recurring journal
                                </h3>
                              </div>
                              <Repeat2
                                size={
                                  20
                                }
                              />
                            </div>

                            <div
                              className={
                                styles.formGrid
                              }
                            >
                              <label>
                                Name
                                <input
                                  required
                                  maxLength={
                                    160
                                  }
                                  value={
                                    recurringName
                                  }
                                  onChange={
                                    event =>
                                      setRecurringName(
                                        event.target
                                          .value,
                                      )
                                  }
                                />
                              </label>
                              <label>
                                Frequency
                                <select
                                  value={
                                    frequency
                                  }
                                  onChange={
                                    event =>
                                      setFrequency(
                                        event.target
                                          .value as typeof frequency,
                                      )
                                  }
                                >
                                  <option value="weekly">
                                    Weekly
                                  </option>
                                  <option value="monthly">
                                    Monthly
                                  </option>
                                  <option value="quarterly">
                                    Quarterly
                                  </option>
                                  <option value="yearly">
                                    Yearly
                                  </option>
                                </select>
                              </label>
                              <label>
                                Starts
                                <input
                                  required
                                  type="date"
                                  value={
                                    startsOn
                                  }
                                  onChange={
                                    event =>
                                      setStartsOn(
                                        event.target
                                          .value,
                                      )
                                  }
                                />
                              </label>
                              <label>
                                Ends
                                <input
                                  type="date"
                                  min={
                                    startsOn
                                  }
                                  value={
                                    endsOn
                                  }
                                  onChange={
                                    event =>
                                      setEndsOn(
                                        event.target
                                          .value,
                                      )
                                  }
                                />
                              </label>
                              <label>
                                Reference prefix
                                <input
                                  maxLength={
                                    80
                                  }
                                  value={
                                    referencePrefix
                                  }
                                  onChange={
                                    event =>
                                      setReferencePrefix(
                                        event.target
                                          .value,
                                      )
                                  }
                                  placeholder="e.g. RENT"
                                />
                              </label>
                              <label>
                                Description
                                <input
                                  required
                                  maxLength={
                                    1000
                                  }
                                  value={
                                    recurringDescription
                                  }
                                  onChange={
                                    event =>
                                      setRecurringDescription(
                                        event.target
                                          .value,
                                      )
                                  }
                                />
                              </label>
                            </div>

                            {
                              recurringLines.map(
                                (
                                  line,
                                  index,
                                ) => (
                                  <div
                                    className={
                                      styles.line
                                    }
                                    key={
                                      line.id
                                    }
                                  >
                                    <label>
                                      Account · line {
                                        index +
                                        1
                                      }
                                      <select
                                        required
                                        value={
                                          line.accountId
                                        }
                                        onChange={
                                          event =>
                                            updateRecurringLine(
                                              line.id,
                                              "accountId",
                                              event.target
                                                .value,
                                            )
                                        }
                                      >
                                        <option value="">
                                          Choose an account
                                        </option>
                                        {
                                          data.accounts
                                            .filter(
                                              account =>
                                                account.allow_manual_posting,
                                            )
                                            .map(
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
                                                  }
                                                  {" · "}
                                                  {
                                                    account.name
                                                  }
                                                </option>
                                              ),
                                            )
                                        }
                                      </select>
                                    </label>
                                    <label>
                                      Line description
                                      <input
                                        maxLength={
                                          500
                                        }
                                        value={
                                          line.description
                                        }
                                        onChange={
                                          event =>
                                            updateRecurringLine(
                                              line.id,
                                              "description",
                                              event.target
                                                .value,
                                            )
                                        }
                                      />
                                    </label>
                                    <label>
                                      Debit
                                      <input
                                        inputMode="decimal"
                                        value={
                                          line.debit
                                        }
                                        onChange={
                                          event =>
                                            updateRecurringLine(
                                              line.id,
                                              "debit",
                                              event.target
                                                .value,
                                            )
                                        }
                                      />
                                    </label>
                                    <label>
                                      Credit
                                      <input
                                        inputMode="decimal"
                                        value={
                                          line.credit
                                        }
                                        onChange={
                                          event =>
                                            updateRecurringLine(
                                              line.id,
                                              "credit",
                                              event.target
                                                .value,
                                            )
                                        }
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      className={
                                        styles.button
                                      }
                                      disabled={
                                        recurringLines.length <=
                                        2
                                      }
                                      onClick={
                                        () =>
                                          setRecurringLines(
                                            current =>
                                              current.filter(
                                                item =>
                                                  item.id !==
                                                  line.id,
                                              ),
                                          )
                                      }
                                    >
                                      <Trash2
                                        size={
                                          16
                                        }
                                      />
                                    </button>
                                  </div>
                                ),
                              )
                            }

                            <div
                              className={
                                styles.totals
                              }
                            >
                              <span>
                                Debit{" "}
                                <strong>
                                  {
                                    recurringAmountsValid
                                      ? formatAccountingAmount(
                                          decimalAmount(
                                            debit,
                                          ),
                                          data.currency,
                                        )
                                      : "Check amounts"
                                  }
                                </strong>
                              </span>
                              <span>
                                Credit{" "}
                                <strong>
                                  {
                                    recurringAmountsValid
                                      ? formatAccountingAmount(
                                          decimalAmount(
                                            credit,
                                          ),
                                          data.currency,
                                        )
                                      : "Check amounts"
                                  }
                                </strong>
                              </span>
                            </div>

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
                                disabled={
                                  recurringLines.length >=
                                  100
                                }
                                onClick={
                                  () =>
                                    setRecurringLines(
                                      current => [
                                        ...current,
                                        blankLine(
                                          nextLineId
                                            .current++,
                                        ),
                                      ],
                                    )
                                }
                              >
                                <Plus
                                  size={
                                    16
                                  }
                                />
                                Add line
                              </button>
                              <button
                                className={
                                  styles.primary
                                }
                                disabled={
                                  !recurringAmountsValid ||
                                  debit ===
                                    BigInt(
                                      0,
                                    ) ||
                                  debit !==
                                    credit
                                }
                              >
                                <FileCheck2
                                  size={
                                    16
                                  }
                                />
                                Save recurring journal
                              </button>
                            </div>
                          </fieldset>
                        </form>
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
                        Schedule
                      </span>
                      <h3>
                        Recurring templates
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
                            Template
                          </th>
                          <th>
                            Frequency
                          </th>
                          <th>
                            Next run
                          </th>
                          <th>
                            Status
                          </th>
                          <th
                            className={
                              styles.number
                            }
                          >
                            Total
                          </th>
                          <th>
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {
                          data.recurring.length
                            ? data.recurring.map(
                                row => (
                                  <tr
                                    key={
                                      row.id
                                    }
                                  >
                                    <td>
                                      {
                                        row.name
                                      }
                                      <span
                                        className={
                                          styles.meta
                                        }
                                      >
                                        {
                                          row.description
                                        }
                                      </span>
                                    </td>
                                    <td>
                                      {
                                        row.frequency
                                      }
                                    </td>
                                    <td>
                                      {
                                        row.next_run_on
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
                                    <td>
                                      <button
                                        type="button"
                                        className={
                                          styles.button
                                        }
                                        disabled={
                                          row.status !==
                                            "active" ||
                                          Boolean(
                                            busyKey,
                                          )
                                        }
                                        onClick={
                                          () =>
                                            generateRecurring(
                                              row.id,
                                            )
                                        }
                                      >
                                        <RefreshCcw
                                          size={
                                            14
                                          }
                                        />
                                        Generate next draft
                                      </button>
                                    </td>
                                  </tr>
                                ),
                              )
                            : (
                                <tr>
                                  <td
                                    colSpan={
                                      6
                                    }
                                  >
                                    No recurring journal templates yet.
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
