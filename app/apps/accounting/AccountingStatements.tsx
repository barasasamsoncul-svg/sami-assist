"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Link2,
  Pause,
  Play,
  RefreshCcw,
  Upload,
  XCircle,
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
  AccountingStatementSourceType,
  AccountingStatementsWorkspace,
} from "@/lib/apps/accounting/statements-types";

import styles from "./AccountingFoundation.module.css";


function browserUuid() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return (
    "00000000-0000-4000-8000-" +
    String(Date.now()).padStart(12,"0").slice(-12)
  );
}


export default function AccountingStatements({
  data,
  canCreate,
  canEdit,
}: {
  data: AccountingStatementsWorkspace;
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
  const [importOpen,setImportOpen] = useState(false);
  const [feedOpen,setFeedOpen] = useState(false);
  const [source,setSource] = useState<Exclude<AccountingStatementSourceType,"feed"|"manual">>("csv");
  const [file,setFile] = useState<File | null>(null);
  const importKey = useRef("");

  async function postAction(
    body: Record<string,unknown>,
    title: string,
    message: string,
  ) {
    const key =
      String(body.action || "action") + ":" +
      String(body.rowId || body.id || body.requestKey || "");

    setBusy(key);

    try {
      const response = await fetch("/api/apps/accounting/statements",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Statement action failed.");
      }

      showSuccess(title,message);
      router.refresh();
      return payload.result;
    } catch (error) {
      showError(
        "Statement action failed",
        error instanceof Error ? error.message : "Retry this action.",
      );
      return null;
    } finally {
      setBusy("");
    }
  }

  async function importFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      showError("Choose a statement file","Select a CSV, OFX or QIF file first.");
      return;
    }

    if (file.size > 5_000_000) {
      showError("Statement file is too large","One statement file cannot exceed 5 MB.");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    importKey.current = importKey.current || browserUuid();

    const content = await file.text();

    const result = await postAction(
      {
        action:"import-file",
        bankAccountId:form.get("bankAccountId"),
        requestKey:importKey.current,
        sourceType:source,
        filename:file.name,
        content,
        qifDateFormat:form.get("qifDateFormat"),
        csvMapping:source === "csv"
          ? {
              dateFormat:form.get("dateFormat"),
              dateColumn:form.get("dateColumn"),
              valueDateColumn:form.get("valueDateColumn"),
              descriptionColumn:form.get("descriptionColumn"),
              amountColumn:form.get("amountColumn"),
              debitColumn:form.get("debitColumn"),
              creditColumn:form.get("creditColumn"),
              referenceColumn:form.get("referenceColumn"),
              transactionIdColumn:form.get("transactionIdColumn"),
              counterpartyColumn:form.get("counterpartyColumn"),
            }
          : undefined,
      },
      "Statement imported",
      "Transactions were normalized, duplicate-checked and added as unmatched statement lines.",
    );

    if (result) {
      importKey.current = "";
      setFile(null);
      setImportOpen(false);
      router.push(
        "/apps/accounting/statements?batchId=" +
        encodeURIComponent(String(result.batchId)),
      );
    }
  }

  async function createFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const result = await postAction(
      {
        action:"create-feed",
        bankAccountId:form.get("bankAccountId"),
        providerKey:form.get("providerKey"),
        providerLabel:form.get("providerLabel"),
        externalAccountReference:form.get("externalAccountReference"),
      },
      "Feed adapter registered",
      "The financial account can now receive normalized transactions from this provider adapter.",
    );

    if (result) {
      formElement.reset();
      setFeedOpen(false);
    }
  }

  async function changeFeedStatus(
    id: string,
    status: "active" | "paused" | "disconnected",
  ) {
    await postAction(
      {
        action:"change-feed-status",
        id,
        status,
      },
      "Feed connection updated",
      "The feed adapter is now " + status + ".",
    );
  }

  async function acceptDuplicate(rowId: string) {
    await postAction(
      {
        action:"accept-duplicate",
        rowId,
      },
      "Possible duplicate imported",
      "The row was explicitly accepted and added as an unmatched statement line.",
    );
  }

  async function cancelBatch(batchId: string) {
    await postAction(
      {
        action:"cancel-batch",
        batchId,
      },
      "Statement import undone",
      "Unreconciled lines from the batch were removed so the statement can be corrected and imported again.",
    );
  }

  const activeAccounts =
    data.accounts.filter(account => account.status === "active");

  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>
            Accounting · Statement Imports & Feeds
          </div>
          <h2>Statement intake</h2>
          <p>
            Import CSV, OFX or QIF statements, review row-level duplicates/errors, and manage provider-neutral feed adapters before reconciliation.
          </p>
        </div>

        <div className={styles.actions}>
          {canCreate && activeAccounts.length ? (
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                importKey.current = "";
                setImportOpen(value => !value);
              }}
            >
              <Upload size={16} />
              Import statement
            </button>
          ) : null}
          {canCreate && activeAccounts.length ? (
            <button
              type="button"
              className={styles.button}
              onClick={() => setFeedOpen(value => !value)}
            >
              <Link2 size={16} />
              Feed adapter
            </button>
          ) : null}
        </div>
      </div>

      <section className={styles.financeCards}>
        <div className={styles.financeCard}>
          <span>Imported this month</span>
          <strong>{data.metrics.importedThisMonth}</strong>
          <small>Normalized statement transactions</small>
        </div>
        <div className={styles.financeCard}>
          <span>Possible duplicates</span>
          <strong>{data.metrics.duplicatesThisMonth}</strong>
          <small>Held for explicit review</small>
        </div>
        <div className={styles.financeCard}>
          <span>Import errors</span>
          <strong>{data.metrics.errorsThisMonth}</strong>
          <small>Rows requiring source correction</small>
        </div>
        <div className={styles.financeCard}>
          <span>Active feeds</span>
          <strong>{data.metrics.activeFeeds}</strong>
          <small>Normalized provider adapters</small>
        </div>
      </section>

      {!activeAccounts.length ? (
        <div className={styles.notice}>
          Create an active bank, cash or mobile-money account before importing statements.
          {" "}
          <Link href="/apps/accounting/bank-cash">Open financial accounts</Link>.
        </div>
      ) : null}

      {importOpen ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>File import</span>
              <h3>Import bank statement</h3>
            </div>
            <FileSpreadsheet size={20} />
          </div>

          <form className={styles.filters} onSubmit={importFile}>
            <label>
              Financial account
              <select name="bankAccountId" required defaultValue="">
                <option value="">Choose account</option>
                {activeAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.account_type}
                  </option>
                ))}
              </select>
            </label>

            <label>
              File format
              <select
                value={source}
                onChange={event =>
                  setSource(
                    event.target.value as Exclude<
                      AccountingStatementSourceType,
                      "feed" | "manual"
                    >,
                  )
                }
              >
                <option value="csv">CSV</option>
                <option value="ofx">OFX</option>
                <option value="qif">QIF</option>
              </select>
            </label>

            <label>
              Statement file
              <input
                type="file"
                required
                accept={
                  source === "csv"
                    ? ".csv,text/csv"
                    : source === "ofx"
                      ? ".ofx,application/x-ofx,text/plain"
                      : ".qif,text/plain"
                }
                onChange={event => {
                  setFile(event.target.files?.[0] || null);
                  importKey.current = "";
                }}
              />
            </label>

            {source === "qif" ? (
              <label>
                QIF date format
                <select name="qifDateFormat" defaultValue="mdy">
                  <option value="mdy">MDY</option>
                  <option value="dmy">DMY</option>
                  <option value="ymd">YMD</option>
                </select>
              </label>
            ) : null}

            {source === "csv" ? (
              <>
                <label>
                  Date format
                  <select name="dateFormat" defaultValue="auto">
                    <option value="auto">Auto · reject ambiguous dates</option>
                    <option value="dmy">DMY · 31/12/2026</option>
                    <option value="mdy">MDY · 12/31/2026</option>
                    <option value="ymd">YMD · 2026-12-31</option>
                  </select>
                </label>
                <label>
                  Date column
                  <input name="dateColumn" placeholder="Auto-detect" />
                </label>
                <label>
                  Value-date column
                  <input name="valueDateColumn" placeholder="Optional / auto" />
                </label>
                <label>
                  Description column
                  <input name="descriptionColumn" placeholder="Optional / auto" />
                </label>
                <label>
                  Signed amount column
                  <input name="amountColumn" placeholder="Use amount OR debit/credit" />
                </label>
                <label>
                  Debit column
                  <input name="debitColumn" placeholder="Optional" />
                </label>
                <label>
                  Credit column
                  <input name="creditColumn" placeholder="Optional" />
                </label>
                <label>
                  Reference column
                  <input name="referenceColumn" placeholder="Optional / auto" />
                </label>
                <label>
                  Transaction-ID column
                  <input name="transactionIdColumn" placeholder="Best duplicate protection" />
                </label>
                <label>
                  Counterparty column
                  <input name="counterpartyColumn" placeholder="Optional / auto" />
                </label>
              </>
            ) : null}

            <button
              className={styles.primary}
              disabled={busy.startsWith("import-file")}
            >
              <Upload size={16} />
              Import & validate
            </button>
          </form>

          <div className={styles.notice}>
            SaMi never stores bank credentials here. File imports are hashed for retry protection; same-account duplicate files are not imported twice.
          </div>
        </section>
      ) : null}

      {feedOpen ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Provider-neutral feeds</span>
              <h3>Register feed adapter</h3>
            </div>
            <Link2 size={20} />
          </div>

          <form className={styles.filters} onSubmit={createFeed}>
            <label>
              Financial account
              <select name="bankAccountId" required defaultValue="">
                <option value="">Choose account</option>
                {activeAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Provider key
              <input name="providerKey" required maxLength={100} placeholder="provider_adapter_key" />
            </label>
            <label>
              Provider name
              <input name="providerLabel" required maxLength={160} placeholder="Bank/Open Banking adapter" />
            </label>
            <label>
              External account reference
              <input name="externalAccountReference" maxLength={255} placeholder="Provider account reference" />
            </label>
            <button className={styles.primary}>
              <Link2 size={16} />
              Register adapter
            </button>
          </form>

          <div className={styles.notice}>
            This stores connection identity and sync state only—not passwords, API keys or bank secrets. Provider adapters push normalized transactions through the authenticated SaMi feed-ingestion contract.
          </div>
        </section>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Import history</span>
            <h3>Statement batches</h3>
          </div>
          <RefreshCcw size={20} />
        </div>

        {data.batches.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Import</th>
                  <th>Account</th>
                  <th>Period</th>
                  <th>Rows</th>
                  <th>Status</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {data.batches.map(batch => (
                  <tr key={batch.id}>
                    <td>
                      {batch.source_filename || batch.source_type.toUpperCase()}
                      <span className={styles.meta}>
                        {batch.source_type.toUpperCase()} · {batch.imported_at}
                      </span>
                    </td>
                    <td>{batch.bank_account_name}</td>
                    <td>
                      {batch.statement_from || "—"} → {batch.statement_to || "—"}
                    </td>
                    <td>
                      {batch.imported_rows} imported
                      <span className={styles.meta}>
                        {batch.duplicate_rows} duplicates · {batch.error_rows} errors
                      </span>
                    </td>
                    <td>
                      <span className={styles.badge}>{batch.status}</span>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <Link
                          className={styles.button}
                          href={
                            "/apps/accounting/statements?batchId=" +
                            encodeURIComponent(batch.id)
                          }
                        >
                          Rows
                        </Link>
                        {canEdit && batch.status !== "cancelled" ? (
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => cancelBatch(batch.id)}
                          >
                            Undo import
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.empty}>
            <FileSpreadsheet size={26} />
            <p>No statements have been imported yet.</p>
          </div>
        )}
      </section>

      {data.rows.length ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Selected batch</span>
              <h3>Row diagnostics</h3>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Import state</th>
                  <th>Control</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(row => (
                  <tr key={row.id}>
                    <td>{row.row_number}</td>
                    <td>{row.transaction_date || "—"}</td>
                    <td>
                      {row.description || "—"}
                      {row.counterparty ? (
                        <span className={styles.meta}>{row.counterparty}</span>
                      ) : null}
                    </td>
                    <td>
                      {row.external_transaction_id || row.external_reference || "—"}
                    </td>
                    <td>{row.amount || "—"}</td>
                    <td>
                      <span className={styles.badge}>
                        {row.import_status === "imported" ? (
                          <CheckCircle2 size={13} />
                        ) : row.import_status === "duplicate" ? (
                          <AlertTriangle size={13} />
                        ) : row.import_status === "error" ? (
                          <XCircle size={13} />
                        ) : null}
                        {row.import_status}
                      </span>
                      {row.error_message ? (
                        <span className={styles.meta}>{row.error_message}</span>
                      ) : null}
                    </td>
                    <td>
                      {row.import_status === "duplicate" &&
                      !row.external_transaction_id &&
                      canEdit ? (
                        <button
                          type="button"
                          className={styles.button}
                          onClick={() => acceptDuplicate(row.id)}
                        >
                          Import anyway
                        </button>
                      ) : row.import_status === "duplicate" &&
                        row.external_transaction_id ? (
                        "External ID duplicate"
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Feed adapters</span>
            <h3>Connection state</h3>
          </div>
          <Link2 size={20} />
        </div>

        {data.connections.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Account</th>
                  <th>External ref</th>
                  <th>Last sync</th>
                  <th>Status</th>
                  <th>Control</th>
                </tr>
              </thead>
              <tbody>
                {data.connections.map(connection => (
                  <tr key={connection.id}>
                    <td>
                      {connection.provider_label}
                      <span className={styles.meta}>{connection.provider_key}</span>
                    </td>
                    <td>{connection.bank_account_name}</td>
                    <td>{connection.external_account_reference || "—"}</td>
                    <td>{connection.last_synced_at || "Not synced"}</td>
                    <td>
                      <span className={styles.badge}>{connection.status}</span>
                      {connection.last_error ? (
                        <span className={styles.meta}>{connection.last_error}</span>
                      ) : null}
                    </td>
                    <td>
                      <div className={styles.actions}>
                        {canEdit && connection.status === "active" ? (
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => changeFeedStatus(connection.id,"paused")}
                          >
                            <Pause size={14} />
                            Pause
                          </button>
                        ) : null}
                        {canEdit &&
                        (connection.status === "paused" || connection.status === "error") ? (
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => changeFeedStatus(connection.id,"active")}
                          >
                            <Play size={14} />
                            Activate
                          </button>
                        ) : null}
                        {canEdit && connection.status !== "disconnected" ? (
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => changeFeedStatus(connection.id,"disconnected")}
                          >
                            Disconnect
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.notice}>
            No feed adapters are registered. File import remains fully available.
          </div>
        )}
      </section>

      <section className={styles.quickActions}>
        <div>
          <span className={styles.eyebrow}>Roadmap boundary</span>
          <h3>Import first, reconcile next</h3>
          <p>
            Part 11 normalizes statement transactions and protects against duplicates. Matching statement lines to ledger movements and rule-based reconciliation belongs to Part 12.
          </p>
        </div>
        <div className={styles.actions}>
          <span className={styles.badge}>CSV</span>
          <span className={styles.badge}>OFX</span>
          <span className={styles.badge}>QIF</span>
          <span className={styles.badge}>Normalized feed API</span>
        </div>
      </section>

      <SaMiOverlay {...overlay} onClose={closeOverlay} />
    </div>
  );
}
