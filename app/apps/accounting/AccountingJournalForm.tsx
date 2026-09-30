"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import SaMiOverlay from "@/app/components/SaMiOverlay";
import { useSaMiOverlay } from "@/app/components/useSaMiOverlay";
import {
  decimalAmount,
  formatAccountingAmount,
  minorUnits,
  validateJournal,
} from "@/lib/apps/accounting/validation";
import type { AccountBalance } from "@/lib/apps/accounting/foundation";
import styles from "./AccountingFoundation.module.css";
const blank = (id: number) => ({
  id,
  accountId: "",
  description: "",
  debit: "",
  credit: "",
});
export default function AccountingJournalForm({
  accounts,
  currency,
  companyId,
  today,
}: {
  accounts: AccountBalance[];
  currency: string;
  companyId: string;
  today: string;
}) {
  const [lines, setLines] = useState([blank(1), blank(2)]);
  const [journalDate, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const nextId = useRef(3),
    requestKey = useRef(""),
    inFlight = useRef(false);
  const { overlay, closeOverlay, showError, showSuccess } = useSaMiOverlay();
  let debit = BigInt(0),
    credit = BigInt(0),
    validAmounts = true;
  try {
    for (const line of lines) {
      debit += minorUnits(line.debit);
      credit += minorUnits(line.credit);
    }
  } catch {
    validAmounts = false;
  }
  function update(id: number, field: string, value: string) {
    setLines((current) =>
      current.map((line) =>
        line.id === id ? { ...line, [field]: value } : line,
      ),
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || saved) return;
    try {
      if (!requestKey.current) requestKey.current = crypto.randomUUID();
      const payload = validateJournal({
        journalDate,
        description,
        reference,
        lines,
        idempotencyKey: requestKey.current,
      });
      inFlight.current = true;
      setBusy(true);
      const response = await fetch("/api/apps/accounting/foundation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, expectedCompanyId: companyId }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "The journal could not be saved.");
      setSaved(true);
      showSuccess(
        "Journal draft saved",
        "Your balanced journal and all its lines were saved together. Review the draft in Journals before posting.",
      );
    } catch (error) {
      showError(
        "Journal not saved",
        error instanceof Error ? error.message : "Retry the same request.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {saved ? (
        <div className={styles.notice}>
          Draft saved.{" "}
          <Link href="/apps/accounting/journals">
            Open Journals to review it
          </Link>
          .
        </div>
      ) : (
        <form onSubmit={save}>
          <fieldset disabled={busy} className={styles.panel}>
            <div className={styles.formGrid}>
              <label>
                Journal date
                <input
                  type="date"
                  required
                  value={journalDate}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label>
                Reference
                <input
                  maxLength={255}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Optional document reference"
                />
              </label>
              <label>
                Description
                <input
                  required
                  maxLength={1000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What is this adjustment for?"
                />
              </label>
            </div>
            {lines.map((line, index) => (
              <div className={styles.line} key={line.id}>
                <label>
                  Account · line {index + 1}
                  <select
                    required
                    value={line.accountId}
                    onChange={(event) =>
                      update(line.id, "accountId", event.target.value)
                    }
                  >
                    <option value="">Choose an account</option>
                    {accounts
                      .filter((account) => account.is_active)
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} · {account.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Line description
                  <input
                    maxLength={500}
                    value={line.description}
                    onChange={(event) =>
                      update(line.id, "description", event.target.value)
                    }
                  />
                </label>
                <label>
                  Debit
                  <input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={line.debit}
                    onChange={(event) =>
                      update(line.id, "debit", event.target.value)
                    }
                  />
                </label>
                <label>
                  Credit
                  <input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={line.credit}
                    onChange={(event) =>
                      update(line.id, "credit", event.target.value)
                    }
                  />
                </label>
                <button
                  type="button"
                  className={styles.button}
                  aria-label={`Remove line ${index + 1}`}
                  disabled={lines.length <= 2}
                  onClick={() =>
                    setLines((current) =>
                      current.filter((item) => item.id !== line.id),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div className={styles.totals}>
              <span>
                Debit{" "}
                <strong>
                  {formatAccountingAmount(decimalAmount(debit), currency)}
                </strong>
              </span>
              <span>
                Credit{" "}
                <strong>
                  {formatAccountingAmount(decimalAmount(credit), currency)}
                </strong>
              </span>
              <span>
                {validAmounts
                  ? `Difference ${formatAccountingAmount(decimalAmount(debit - credit), currency)}`
                  : "Check your amounts"}
              </span>
            </div>
            <div className={styles.actions}>
              <button
                className={styles.button}
                type="button"
                disabled={lines.length >= 100}
                onClick={() =>
                  setLines((current) => [...current, blank(nextId.current++)])
                }
              >
                <Plus size={16} /> Add line
              </button>
              <button
                className={styles.primary}
                disabled={
                  busy ||
                  !validAmounts ||
                  debit !== credit ||
                  debit === BigInt(0)
                }
              >
                {busy ? "Saving…" : "Save balanced draft"}
              </button>
              <Link className={styles.button} href="/apps/accounting/journals">
                Cancel
              </Link>
            </div>
          </fieldset>
        </form>
      )}
      <SaMiOverlay {...overlay} onClose={closeOverlay} />
    </>
  );
}
