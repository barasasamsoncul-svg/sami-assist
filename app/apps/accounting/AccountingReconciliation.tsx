"use client";

import Link from "next/link";
import {
  Ban,
  CheckCircle2,
  GitMerge,
  Lightbulb,
  Plus,
  RefreshCcw,
  RotateCcw,
  Scale,
  Sparkles,
} from "lucide-react";
import {
  useMemo,
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
  AccountingReconciliationCandidate,
  AccountingReconciliationWorkspace,
} from "@/lib/apps/accounting/reconciliation-types";
import {
  formatAccountingAmount,
} from "@/lib/apps/accounting/validation";

import styles from "./AccountingFoundation.module.css";


function today() {
  return new Date().toISOString().slice(0,10);
}


function defaultAllocation(
  statementAmount: string,
  remainingAmount: string,
) {
  const statement = Number(statementAmount);
  const remaining = Number(remainingAmount);

  if (!Number.isFinite(statement) || !Number.isFinite(remaining)) {
    return remainingAmount;
  }

  return Math.abs(remaining) >= Math.abs(statement)
    ? statementAmount
    : remainingAmount;
}


export default function AccountingReconciliation({
  data,
  canCreate,
  canEdit,
}: {
  data: AccountingReconciliationWorkspace;
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const {
    overlay,
    showSuccess,
    showError,
    closeOverlay,
  } = useSaMiOverlay();

  const [busy,setBusy] = useState("");
  const [ruleOpen,setRuleOpen] = useState(false);
  const [excludeOpen,setExcludeOpen] = useState(false);
  const [allocationAmounts,setAllocationAmounts] = useState<Record<string,string>>({});

  const selected = data.selectedStatementLine;

  const amount = (value: string | null | undefined) =>
    formatAccountingAmount(value || "0.00",data.currency);

  const chosenAllocations = useMemo(
    () =>
      Object.entries(allocationAmounts)
        .filter(([,value]) => value.trim())
        .map(([journalLineId,value]) => ({
          journalLineId,
          amount:value.trim(),
        })),
    [allocationAmounts],
  );

  async function postAction(
    body: Record<string,unknown>,
    title: string,
    message: string,
  ) {
    const key =
      String(body.action || "action") + ":" +
      String(
        body.statementLineId ||
        body.id ||
        body.ruleId ||
        "",
      );

    setBusy(key);

    try {
      const response = await fetch("/api/apps/accounting/reconciliation",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Reconciliation action failed.");
      }

      showSuccess(title,message);
      router.refresh();
      return payload.result;
    } catch (error) {
      showError(
        "Reconciliation action failed",
        error instanceof Error ? error.message : "Retry this action.",
      );
      return null;
    } finally {
      setBusy("");
    }
  }

  async function generateSuggestions() {
    if (!selected || !canEdit) return;

    await postAction(
      {
        action:"generate-suggestions",
        statementLineId:selected.id,
      },
      "Suggestions refreshed",
      "SaMi rescored posted bank-ledger candidates and active reconciliation rules.",
    );
  }

  async function acceptExistingSuggestion(
    suggestion: AccountingReconciliationWorkspace["suggestions"][number],
  ) {
    if (!selected || !suggestion.journal_line_id) return;

    const result = await postAction(
      {
        action:"reconcile",
        statementLineId:selected.id,
        suggestionId:suggestion.id,
        allocations:[
          {
            journalLineId:suggestion.journal_line_id,
            amount:suggestion.suggested_amount,
          },
        ],
      },
      "Statement reconciled",
      "The suggested posted ledger movement was accepted and preserved in reconciliation history.",
    );

    if (result) {
      setAllocationAmounts({});
      router.push("/apps/accounting/reconciliation");
    }
  }

  async function applyRuleSuggestion(
    suggestion: AccountingReconciliationWorkspace["suggestions"][number],
  ) {
    if (!selected || !suggestion.rule_id) return;

    const result = await postAction(
      {
        action:"apply-rule",
        statementLineId:selected.id,
        ruleId:suggestion.rule_id,
        suggestionId:suggestion.id,
      },
      "Rule adjustment reconciled",
      "A balanced adjustment journal was posted and linked to the statement reconciliation.",
    );

    if (result) {
      router.push("/apps/accounting/reconciliation");
    }
  }

  async function dismissSuggestion(id: string) {
    await postAction(
      {
        action:"dismiss-suggestion",
        id,
      },
      "Suggestion dismissed",
      "The suggestion remains in history but will no longer be offered as pending.",
    );
  }

  function toggleCandidate(candidate: AccountingReconciliationCandidate) {
    if (!selected) return;

    setAllocationAmounts(current => {
      const next = {...current};
      if (next[candidate.journal_line_id] !== undefined) {
        delete next[candidate.journal_line_id];
      } else {
        next[candidate.journal_line_id] = defaultAllocation(
          selected.amount,
          candidate.remaining_amount,
        );
      }
      return next;
    });
  }

  async function reconcileSelected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selected || !chosenAllocations.length) {
      showError(
        "Choose ledger movements",
        "Select at least one posted bank journal line and enter its signed allocation amount.",
      );
      return;
    }

    const form = new FormData(event.currentTarget);

    const result = await postAction(
      {
        action:"reconcile",
        statementLineId:selected.id,
        allocations:chosenAllocations,
        notes:form.get("notes"),
      },
      chosenAllocations.length > 1
        ? "Split reconciliation completed"
        : "Statement reconciled",
      "The full signed statement amount is now allocated to posted bank-ledger movement.",
    );

    if (result) {
      setAllocationAmounts({});
      router.push("/apps/accounting/reconciliation");
    }
  }

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const result = await postAction(
      {
        action:"create-rule",
        bankAccountId:form.get("bankAccountId") || undefined,
        name:form.get("name"),
        matchText:form.get("matchText"),
        matchField:form.get("matchField"),
        matchOperator:form.get("matchOperator"),
        direction:form.get("direction"),
        minAmount:form.get("minAmount"),
        maxAmount:form.get("maxAmount"),
        targetAccountId:form.get("targetAccountId"),
        daysTolerance:form.get("daysTolerance"),
        amountTolerance:form.get("amountTolerance"),
        priority:form.get("priority"),
        autoApply:form.get("autoApply") === "on",
        descriptionTemplate:form.get("descriptionTemplate"),
      },
      "Reconciliation rule created",
      "The rule is active and can now generate controlled adjustment suggestions.",
    );

    if (result) {
      formElement.reset();
      setRuleOpen(false);
    }
  }

  async function changeRuleStatus(
    id: string,
    status: "active" | "inactive",
  ) {
    await postAction(
      {
        action:"change-rule-status",
        id,
        status,
      },
      "Rule updated",
      "The reconciliation rule is now " + status + ".",
    );
  }

  async function excludeSelected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);

    const result = await postAction(
      {
        action:"exclude",
        statementLineId:selected.id,
        excluded:true,
        reason:form.get("reason"),
      },
      "Statement line excluded",
      "The transaction remains visible but is outside reconciliation until restored.",
    );

    if (result) {
      setExcludeOpen(false);
      router.push("/apps/accounting/reconciliation");
    }
  }

  async function restoreLine(id: string) {
    await postAction(
      {
        action:"exclude",
        statementLineId:id,
        excluded:false,
      },
      "Statement line restored",
      "The transaction is available for reconciliation again.",
    );
  }

  async function reverse(id: string) {
    await postAction(
      {
        action:"reverse",
        id,
        reversalDate:today(),
      },
      "Reconciliation reversed",
      "The statement line is unmatched again; any rule-created adjustment received a compensating journal.",
    );
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>
            Accounting · Bank Reconciliation · {data.currency}
          </div>
          <h2>Reconciliation control center</h2>
          <p>
            Match imported statement lines to posted bank-ledger movement, split allocations when needed, and use controlled rules for genuine adjustments such as charges or interest.
          </p>
        </div>

        <div className={styles.actions}>
          <Link href="/apps/accounting/statements" className={styles.button}>
            Statements & Feeds
          </Link>
          {canCreate ? (
            <button
              type="button"
              className={styles.primary}
              onClick={() => setRuleOpen(value => !value)}
            >
              <Plus size={16} />
              New rule
            </button>
          ) : null}
        </div>
      </div>

      <section className={styles.financeCards}>
        <div className={styles.financeCard}>
          <span>Unmatched</span>
          <strong>{data.metrics.unmatched}</strong>
          <small>Need review or suggestions</small>
        </div>
        <div className={styles.financeCard}>
          <span>Suggested</span>
          <strong>{data.metrics.suggested}</strong>
          <small>Have pending candidates</small>
        </div>
        <div className={styles.financeCard}>
          <span>Matched this month</span>
          <strong>{data.metrics.matchedThisMonth}</strong>
          <small>Active reconciliations</small>
        </div>
        <div className={styles.financeCard}>
          <span>Excluded</span>
          <strong>{data.metrics.excluded}</strong>
          <small>Outside reconciliation</small>
        </div>
      </section>

      {ruleOpen ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Controlled automation</span>
              <h3>New reconciliation rule</h3>
            </div>
            <Sparkles size={20} />
          </div>

          <form className={styles.filters} onSubmit={createRule}>
            <label>
              Rule name
              <input name="name" required maxLength={160} />
            </label>
            <label>
              Financial account
              <select name="bankAccountId" defaultValue="">
                <option value="">Any financial account</option>
                {data.accounts
                  .filter(account => account.status === "active")
                  .map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Match field
              <select name="matchField" defaultValue="any">
                <option value="any">Description, reference or counterparty</option>
                <option value="description">Description</option>
                <option value="reference">Reference</option>
                <option value="counterparty">Counterparty</option>
              </select>
            </label>
            <label>
              Operator
              <select name="matchOperator" defaultValue="contains">
                <option value="contains">Contains</option>
                <option value="equals">Equals</option>
                <option value="starts_with">Starts with</option>
              </select>
            </label>
            <label>
              Match text
              <input name="matchText" maxLength={255} placeholder="BANK CHARGE" />
            </label>
            <label>
              Direction
              <select name="direction" defaultValue="any">
                <option value="any">Any</option>
                <option value="inflow">Money in</option>
                <option value="outflow">Money out</option>
              </select>
            </label>
            <label>
              Minimum absolute amount
              <input name="minAmount" inputMode="decimal" />
            </label>
            <label>
              Maximum absolute amount
              <input name="maxAmount" inputMode="decimal" />
            </label>
            <label>
              Adjustment account
              <select name="targetAccountId" required defaultValue="">
                <option value="">Choose ledger account</option>
                {data.targetAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.code} · {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date tolerance · days
              <input name="daysTolerance" type="number" min={0} max={365} defaultValue={7} required />
            </label>
            <label>
              Amount tolerance
              <input name="amountTolerance" inputMode="decimal" defaultValue="0.00" required />
            </label>
            <label>
              Priority
              <input name="priority" type="number" min={0} max={999999} defaultValue={100} required />
            </label>
            <label>
              Adjustment description
              <input name="descriptionTemplate" maxLength={500} placeholder="Bank charge" />
            </label>
            <label>
              <input type="checkbox" name="autoApply" />
              Mark as auto-apply eligible
            </label>
            <button className={styles.primary} disabled={busy.startsWith("create-rule")}>
              Create rule
            </button>
          </form>

          <div className={styles.notice}>
            Auto-apply eligibility is stored for controlled future automation; this workspace still requires an explicit user acceptance before creating an adjustment journal.
          </div>
        </section>
      ) : null}

      <div className={styles.columns}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Statement queue</span>
              <h3>Unmatched and suggested lines</h3>
            </div>
            <Scale size={20} />
          </div>

          {data.statementLines.length ? (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Transaction</th>
                    <th className={styles.number}>Amount</th>
                    <th>Status</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {data.statementLines.map(line => (
                    <tr key={line.id}>
                      <td>{line.transaction_date}</td>
                      <td>
                        {line.description || "Bank transaction"}
                        <span className={styles.meta}>
                          {line.bank_account_name}
                          {line.external_reference ? " · " + line.external_reference : ""}
                        </span>
                      </td>
                      <td className={styles.number}>{amount(line.amount)}</td>
                      <td>
                        <span className={styles.badge}>{line.reconciliation_status}</span>
                        {line.top_confidence != null ? (
                          <span className={styles.meta}>
                            {line.suggestion_count} suggestion(s) · {line.top_confidence}% top
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {line.reconciliation_status === "excluded" ? (
                          canEdit ? (
                            <button
                              type="button"
                              className={styles.button}
                              onClick={() => restoreLine(line.id)}
                            >
                              Restore
                            </button>
                          ) : "Excluded"
                        ) : (
                          <Link
                            className={styles.button}
                            href={
                              "/apps/accounting/reconciliation?statementLineId=" +
                              encodeURIComponent(line.id)
                            }
                          >
                            Review
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.empty}>
              <CheckCircle2 size={28} />
              <p>No unmatched statement lines are waiting for reconciliation.</p>
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Rules</span>
              <h3>Adjustment rules</h3>
            </div>
            <Lightbulb size={20} />
          </div>

          {data.rules.length ? (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Target</th>
                    <th>Status</th>
                    <th>Control</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rules.map(rule => (
                    <tr key={rule.id}>
                      <td>
                        {rule.name}
                        <span className={styles.meta}>
                          {rule.match_field} · {rule.match_operator}
                          {rule.match_text ? " · " + rule.match_text : ""}
                        </span>
                      </td>
                      <td>
                        {rule.target_account_code
                          ? rule.target_account_code + " · " + rule.target_account_name
                          : "No target"}
                      </td>
                      <td>
                        <span className={styles.badge}>{rule.status}</span>
                      </td>
                      <td>
                        {canEdit ? (
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() =>
                              changeRuleStatus(
                                rule.id,
                                rule.status === "active" ? "inactive" : "active",
                              )
                            }
                          >
                            {rule.status === "active" ? "Pause" : "Activate"}
                          </button>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.notice}>
              No reconciliation rules yet. Manual matching works without rules.
            </div>
          )}
        </section>
      </div>

      {selected ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Selected statement line</span>
              <h3>{selected.description || "Bank transaction"}</h3>
              <p>
                {selected.transaction_date} · {selected.bank_account_name} · {amount(selected.amount)}
              </p>
            </div>
            <div className={styles.actions}>
              {canEdit ? (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={generateSuggestions}
                  disabled={busy.startsWith("generate-suggestions")}
                >
                  <RefreshCcw size={15} />
                  Generate suggestions
                </button>
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => setExcludeOpen(value => !value)}
                >
                  <Ban size={15} />
                  Exclude
                </button>
              ) : null}
            </div>
          </div>

          {excludeOpen ? (
            <form className={styles.filters} onSubmit={excludeSelected}>
              <label>
                Exclusion reason
                <input
                  name="reason"
                  required
                  maxLength={2000}
                  placeholder="Duplicate outside statement import, bank informational line…"
                />
              </label>
              <button className={styles.button}>Exclude line</button>
            </form>
          ) : null}

          {data.suggestions.length ? (
            <>
              <div className={styles.panelHeading}>
                <div>
                  <span className={styles.eyebrow}>Suggestions</span>
                  <h3>Scored matches & rules</h3>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Suggestion</th>
                      <th>Reason</th>
                      <th>Confidence</th>
                      <th className={styles.number}>Amount</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.suggestions.map(suggestion => (
                      <tr key={suggestion.id}>
                        <td>
                          {suggestion.suggestion_type === "existing"
                            ? suggestion.journal_number || "Posted journal"
                            : suggestion.target_account_code
                              ? suggestion.target_account_code + " · " + suggestion.target_account_name
                              : "Adjustment rule"}
                          <span className={styles.meta}>
                            {suggestion.journal_date || suggestion.suggestion_type}
                          </span>
                        </td>
                        <td>{suggestion.reason}</td>
                        <td>{suggestion.confidence}%</td>
                        <td className={styles.number}>{amount(suggestion.suggested_amount)}</td>
                        <td>
                          <div className={styles.actions}>
                            {canEdit ? (
                              <button
                                type="button"
                                className={styles.primary}
                                onClick={() =>
                                  suggestion.suggestion_type === "existing"
                                    ? acceptExistingSuggestion(suggestion)
                                    : applyRuleSuggestion(suggestion)
                                }
                              >
                                Accept
                              </button>
                            ) : null}
                            {canEdit ? (
                              <button
                                type="button"
                                className={styles.button}
                                onClick={() => dismissSuggestion(suggestion.id)}
                              >
                                Dismiss
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className={styles.notice}>
              Generate suggestions to score posted bank-ledger candidates and matching adjustment rules.
            </div>
          )}

          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Manual / split match</span>
              <h3>Posted bank-ledger candidates</h3>
            </div>
            <GitMerge size={20} />
          </div>

          {data.candidates.length ? (
            <form onSubmit={reconcileSelected}>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Use</th>
                      <th>Journal</th>
                      <th>Date</th>
                      <th>Description</th>
                      <th className={styles.number}>Remaining</th>
                      <th>Allocation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.candidates.map(candidate => {
                      const selectedAmount = allocationAmounts[candidate.journal_line_id];
                      return (
                        <tr key={candidate.journal_line_id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedAmount !== undefined}
                              onChange={() => toggleCandidate(candidate)}
                              disabled={!canEdit}
                            />
                          </td>
                          <td>
                            {candidate.journal_number}
                            <span className={styles.meta}>{candidate.reference || "No reference"}</span>
                          </td>
                          <td>{candidate.journal_date}</td>
                          <td>{candidate.line_description || candidate.journal_description || "Bank ledger movement"}</td>
                          <td className={styles.number}>{amount(candidate.remaining_amount)}</td>
                          <td>
                            {selectedAmount !== undefined ? (
                              <input
                                value={selectedAmount}
                                onChange={event =>
                                  setAllocationAmounts(current => ({
                                    ...current,
                                    [candidate.journal_line_id]:event.target.value,
                                  }))
                                }
                                inputMode="decimal"
                                aria-label={"Allocation for " + candidate.journal_number}
                              />
                            ) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {canEdit ? (
                <div className={styles.filters}>
                  <label>
                    Reconciliation notes
                    <input name="notes" maxLength={2000} />
                  </label>
                  <button
                    className={styles.primary}
                    disabled={!chosenAllocations.length || busy.startsWith("reconcile")}
                  >
                    <GitMerge size={15} />
                    Reconcile selected
                  </button>
                </div>
              ) : null}
            </form>
          ) : (
            <div className={styles.notice}>
              No posted bank-ledger movements with available amount were found within ±45 days.
            </div>
          )}
        </section>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Immutable history</span>
            <h3>Reconciliation register</h3>
          </div>
          <Scale size={20} />
        </div>

        {data.reconciliations.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Reconciliation</th>
                  <th>Account</th>
                  <th>Method</th>
                  <th className={styles.number}>Statement</th>
                  <th>Status</th>
                  <th>Control</th>
                </tr>
              </thead>
              <tbody>
                {data.reconciliations.map(record => (
                  <tr key={record.id}>
                    <td>
                      {record.reconciliation_number}
                      <span className={styles.meta}>{record.reconciliation_date}</span>
                    </td>
                    <td>{record.bank_account_name}</td>
                    <td>{record.method}</td>
                    <td className={styles.number}>{amount(record.statement_amount)}</td>
                    <td>
                      <span className={styles.badge}>{record.status}</span>
                      {record.adjustment_journal_id ? (
                        <span className={styles.meta}>Adjustment journal</span>
                      ) : null}
                    </td>
                    <td>
                      {canEdit && record.status === "matched" ? (
                        <button
                          type="button"
                          className={styles.button}
                          onClick={() => reverse(record.id)}
                        >
                          <RotateCcw size={14} />
                          Reverse
                        </button>
                      ) : record.reversal_journal_id
                        ? "Reversed"
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.notice}>
            No reconciliation history yet.
          </div>
        )}
      </section>

      <section className={styles.quickActions}>
        <div>
          <span className={styles.eyebrow}>Accounting invariant</span>
          <h3>Reconciliation never edits posted journals</h3>
          <p>
            Existing ledger movement is allocated by reference. Genuine bank-side items use balanced adjustment journals, and reversals create compensating entries instead of rewriting history.
          </p>
        </div>
      </section>

      <SaMiOverlay {...overlay} onClose={closeOverlay} />
    </div>
  );
}
