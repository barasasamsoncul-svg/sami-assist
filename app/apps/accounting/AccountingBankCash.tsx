"use client";

import {
  ArrowRightLeft,
  Banknote,
  Building2,
  Landmark,
  Pencil,
  Plus,
  RefreshCcw,
  Smartphone,
  Wallet,
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
  AccountingBankCashWorkspace,
  AccountingFinancialAccount,
  AccountingFinancialAccountType,
} from "@/lib/apps/accounting/bank-cash-types";
import {
  formatAccountingAmount,
} from "@/lib/apps/accounting/validation";

import styles from "./AccountingFoundation.module.css";


function today() {
  return new Date().toISOString().slice(0,10);
}


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


function typeLabel(
  type: AccountingFinancialAccountType,
) {
  return type === "mobile_money"
    ? "Mobile money"
    : type === "cash"
      ? "Cash"
      : "Bank";
}


function TypeIcon({
  type,
}: {
  type: AccountingFinancialAccountType;
}) {
  if (type === "mobile_money") return <Smartphone size={16} />;
  if (type === "cash") return <Wallet size={16} />;
  return <Landmark size={16} />;
}


export default function AccountingBankCash({
  data,
  canCreate,
  canEdit,
}: {
  data: AccountingBankCashWorkspace;
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
  const [accountFormOpen,setAccountFormOpen] = useState(false);
  const [transferFormOpen,setTransferFormOpen] = useState(false);
  const [editAccount,setEditAccount] = useState<AccountingFinancialAccount | null>(null);
  const [accountType,setAccountType] = useState<AccountingFinancialAccountType>("bank");
  const transferKey = useRef("");

  const amount = (value: string) =>
    formatAccountingAmount(value || "0.00",data.currency);

  const activeAccounts = useMemo(
    () => data.accounts.filter(row => row.status === "active"),
    [data.accounts],
  );

  const bankLedgerAccounts = useMemo(
    () => data.ledgerAccounts.filter(row =>
      row.account_type === "asset_bank" ||
      row.account_type.startsWith("asset_bank")
    ),
    [data.ledgerAccounts],
  );

  const cashLedgerAccounts = useMemo(
    () => data.ledgerAccounts.filter(row =>
      row.account_type === "asset_cash" ||
      row.account_type.startsWith("asset_cash")
    ),
    [data.ledgerAccounts],
  );

  const allowedLedgerAccounts =
    accountType === "bank"
      ? bankLedgerAccounts
      : accountType === "cash"
        ? cashLedgerAccounts
        : data.ledgerAccounts;

  async function postAction(
    body: Record<string,unknown>,
    title: string,
    message: string,
  ) {
    const key =
      String(body.action || "action") + ":" +
      String(body.id || body.requestKey || "");

    setBusy(key);

    try {
      const response = await fetch("/api/apps/accounting/bank-cash",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Financial-account action failed.");
      }

      showSuccess(title,message);
      router.refresh();
      return payload.result;
    } catch (error) {
      showError(
        "Financial-account action failed",
        error instanceof Error ? error.message : "Retry this action.",
      );
      return null;
    } finally {
      setBusy("");
    }
  }

  function openNewAccount() {
    setEditAccount(null);
    setAccountType("bank");
    setAccountFormOpen(true);
  }

  function openEditAccount(account: AccountingFinancialAccount) {
    setEditAccount(account);
    setAccountType(account.account_type);
    setAccountFormOpen(true);
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const result = await postAction(
      editAccount
        ? {
            action:"update-account",
            id:editAccount.id,
            name:form.get("name"),
            institutionName:form.get("institutionName"),
            branchName:form.get("branchName"),
            accountHolderName:form.get("accountHolderName"),
            accountReferenceMasked:form.get("accountReferenceMasked"),
            mobileMoneyProvider:form.get("mobileMoneyProvider"),
            allowOverdraft:form.get("allowOverdraft") === "on",
            overdraftLimit:form.get("overdraftLimit"),
          }
        : {
            action:"create-account",
            name:form.get("name"),
            accountType,
            ledgerAccountId:form.get("ledgerAccountId"),
            institutionName:form.get("institutionName"),
            branchName:form.get("branchName"),
            accountHolderName:form.get("accountHolderName"),
            accountReferenceMasked:form.get("accountReferenceMasked"),
            mobileMoneyProvider:form.get("mobileMoneyProvider"),
            countryCode:form.get("countryCode"),
            currency:data.currency,
            allowOverdraft:form.get("allowOverdraft") === "on",
            overdraftLimit:form.get("overdraftLimit"),
          },
      editAccount ? "Financial account updated" : "Financial account created",
      editAccount
        ? "The account metadata and overdraft policy were saved."
        : "The financial account is now linked to its authoritative ledger account.",
    );

    if (result) {
      setAccountFormOpen(false);
      setEditAccount(null);
    }
  }

  async function changeStatus(
    account: AccountingFinancialAccount,
    status: "active" | "inactive" | "closed",
  ) {
    await postAction(
      {
        action:"change-status",
        id:account.id,
        status,
      },
      "Financial account updated",
      "The account status is now " + status + ".",
    );
  }

  async function createTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    transferKey.current = transferKey.current || browserUuid();

    const result = await postAction(
      {
        action:"create-transfer",
        requestKey:transferKey.current,
        transferDate:form.get("transferDate"),
        sourceAccountId:form.get("sourceAccountId"),
        destinationAccountId:form.get("destinationAccountId"),
        amount:form.get("amount"),
        reference:form.get("reference"),
        notes:form.get("notes"),
      },
      "Internal transfer posted",
      "The transfer was posted as one balanced immutable Accounting journal.",
    );

    if (result) {
      transferKey.current = "";
      formElement.reset();
      setTransferFormOpen(false);
    }
  }

  async function reverseTransfer(id: string) {
    await postAction(
      {
        action:"reverse-transfer",
        id,
        reversalDate:today(),
      },
      "Transfer reversed",
      "A linked compensating journal reversed the internal transfer.",
    );
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.heading}>
        <div>
          <div className={styles.eyebrow}>
            Accounting · Bank, Cash & Mobile Money · {data.currency}
          </div>
          <h2>Financial accounts</h2>
          <p>
            Manage bank accounts, cash tills and mobile-money wallets against the authoritative ledger. Statement imports and reconciliation remain separate workflows.
          </p>
        </div>

        <div className={styles.actions}>
          {canCreate ? (
            <button type="button" className={styles.primary} onClick={openNewAccount}>
              <Plus size={16} />
              New account
            </button>
          ) : null}
          {canEdit && activeAccounts.length >= 2 ? (
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                transferKey.current = "";
                setTransferFormOpen(value => !value);
              }}
            >
              <ArrowRightLeft size={16} />
              Internal transfer
            </button>
          ) : null}
        </div>
      </div>

      <section className={styles.financeCards}>
        <div className={styles.financeCard}>
          <span>Bank balance</span>
          <strong>{amount(data.metrics.bankBalance)}</strong>
          <small>Posted ledger balance</small>
        </div>
        <div className={styles.financeCard}>
          <span>Cash balance</span>
          <strong>{amount(data.metrics.cashBalance)}</strong>
          <small>Cash-type ledger accounts</small>
        </div>
        <div className={styles.financeCard}>
          <span>Mobile money</span>
          <strong>{amount(data.metrics.mobileMoneyBalance)}</strong>
          <small>Posted wallet balances</small>
        </div>
        <div className={styles.financeCard}>
          <span>Active financial accounts</span>
          <strong>{data.metrics.activeAccounts}</strong>
          <small>{data.metrics.unreconciledLines} statement lines await later reconciliation</small>
        </div>
      </section>

      {accountFormOpen ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>
                {editAccount ? "Account maintenance" : "Financial account setup"}
              </span>
              <h3>{editAccount ? editAccount.name : "New bank, cash or mobile-money account"}</h3>
            </div>
          </div>

          <form className={styles.filters} onSubmit={saveAccount}>
            {!editAccount ? (
              <>
                <label>
                  Account type
                  <select
                    value={accountType}
                    onChange={event =>
                      setAccountType(event.target.value as AccountingFinancialAccountType)
                    }
                  >
                    <option value="bank">Bank</option>
                    <option value="cash">Cash</option>
                    <option value="mobile_money">Mobile money</option>
                  </select>
                </label>
                <label>
                  Linked ledger account
                  <select name="ledgerAccountId" required defaultValue="">
                    <option value="">Choose ledger account</option>
                    {allowedLedgerAccounts.map(account => (
                      <option key={account.id} value={account.id}>
                        {account.code} · {account.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            <label>
              Display name
              <input
                name="name"
                required
                maxLength={160}
                defaultValue={editAccount?.name || ""}
                placeholder={
                  accountType === "cash"
                    ? "Main cash till"
                    : accountType === "mobile_money"
                      ? "M-Pesa business wallet"
                      : "Operating bank account"
                }
              />
            </label>

            {accountType === "bank" ? (
              <>
                <label>
                  Institution
                  <input
                    name="institutionName"
                    required
                    maxLength={160}
                    defaultValue={editAccount?.institution_name || ""}
                  />
                </label>
                <label>
                  Branch
                  <input
                    name="branchName"
                    maxLength={160}
                    defaultValue={editAccount?.branch_name || ""}
                  />
                </label>
              </>
            ) : (
              <input
                type="hidden"
                name="institutionName"
                value={editAccount?.institution_name || ""}
              />
            )}

            {accountType === "mobile_money" ? (
              <label>
                Mobile-money provider
                <input
                  name="mobileMoneyProvider"
                  required
                  maxLength={80}
                  defaultValue={editAccount?.mobile_money_provider || ""}
                  placeholder="M-Pesa"
                />
              </label>
            ) : (
              <input
                type="hidden"
                name="mobileMoneyProvider"
                value={editAccount?.mobile_money_provider || ""}
              />
            )}

            <label>
              Account holder
              <input
                name="accountHolderName"
                maxLength={200}
                defaultValue={editAccount?.account_holder_name || ""}
              />
            </label>
            <label>
              Masked account / wallet reference
              <input
                name="accountReferenceMasked"
                maxLength={80}
                defaultValue={editAccount?.account_reference_masked || ""}
                placeholder="•••• 1234"
              />
            </label>

            {!editAccount ? (
              <label>
                Country code
                <input name="countryCode" maxLength={3} defaultValue="KE" />
              </label>
            ) : null}

            <label>
              <input
                type="checkbox"
                name="allowOverdraft"
                defaultChecked={editAccount?.allow_overdraft || false}
              />
              Allow overdraft
            </label>
            <label>
              Overdraft limit
              <input
                name="overdraftLimit"
                inputMode="decimal"
                defaultValue={editAccount?.overdraft_limit || "0.00"}
                required
              />
            </label>

            <button className={styles.primary} disabled={busy.length > 0}>
              {editAccount ? <Pencil size={16} /> : <Plus size={16} />}
              {editAccount ? "Save changes" : "Create account"}
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                setAccountFormOpen(false);
                setEditAccount(null);
              }}
            >
              Cancel
            </button>
          </form>

          {!editAccount ? (
            <div className={styles.notice}>
              Opening balances are not entered here. Use Accounting Opening Balances so the financial account and general ledger remain identical.
            </div>
          ) : null}
        </section>
      ) : null}

      {transferFormOpen ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Cash movement</span>
              <h3>Internal transfer</h3>
            </div>
          </div>
          <form className={styles.filters} onSubmit={createTransfer}>
            <label>
              Transfer date
              <input type="date" name="transferDate" defaultValue={today()} required />
            </label>
            <label>
              From
              <select name="sourceAccountId" required defaultValue="">
                <option value="">Choose source</option>
                {activeAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {amount(account.book_balance)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To
              <select name="destinationAccountId" required defaultValue="">
                <option value="">Choose destination</option>
                {activeAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount
              <input name="amount" inputMode="decimal" required />
            </label>
            <label>
              Reference
              <input name="reference" maxLength={255} />
            </label>
            <label>
              Notes
              <input name="notes" maxLength={2000} />
            </label>
            <button className={styles.primary} disabled={busy.startsWith("create-transfer")}>
              <ArrowRightLeft size={16} />
              Post transfer
            </button>
          </form>
        </section>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Account register</span>
            <h3>Bank, cash and mobile-money accounts</h3>
          </div>
          <Building2 size={20} />
        </div>

        {data.accounts.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Ledger</th>
                  <th className={styles.number}>Book balance</th>
                  <th>Status</th>
                  <th>Controls</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map(account => (
                  <tr key={account.id}>
                    <td>
                      {account.name}
                      <span className={styles.meta}>
                        {account.institution_name || account.mobile_money_provider || "Internal cash"}
                        {account.account_reference_masked
                          ? " · " + account.account_reference_masked
                          : ""}
                      </span>
                    </td>
                    <td>
                      <span className={styles.badge}>
                        <TypeIcon type={account.account_type} />
                        {typeLabel(account.account_type)}
                      </span>
                    </td>
                    <td>
                      {account.ledger_code
                        ? account.ledger_code + " · " + account.ledger_name
                        : "Not linked"}
                    </td>
                    <td className={styles.number}>{amount(account.book_balance)}</td>
                    <td>
                      <span className={styles.badge}>{account.status}</span>
                      {account.unreconciled_count ? (
                        <span className={styles.meta}>
                          {account.unreconciled_count} statement lines pending
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <div className={styles.actions}>
                        {canEdit && account.status !== "closed" ? (
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => openEditAccount(account)}
                          >
                            <Pencil size={14} />
                            Edit
                          </button>
                        ) : null}
                        {canEdit && account.status === "active" ? (
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => changeStatus(account,"inactive")}
                          >
                            Pause
                          </button>
                        ) : null}
                        {canEdit && account.status === "inactive" ? (
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => changeStatus(account,"active")}
                          >
                            Activate
                          </button>
                        ) : null}
                        {canEdit && account.status !== "closed" ? (
                          <button
                            type="button"
                            className={styles.button}
                            onClick={() => changeStatus(account,"closed")}
                          >
                            Close
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
            <Banknote size={26} />
            <p>
              No financial accounts yet. Link a bank, cash or mobile-money account to an active ledger account.
            </p>
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Internal movements</span>
            <h3>Transfer register</h3>
          </div>
          <ArrowRightLeft size={20} />
        </div>

        {data.transfers.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Transfer</th>
                  <th>Route</th>
                  <th className={styles.number}>Amount</th>
                  <th>Status</th>
                  <th>Control</th>
                </tr>
              </thead>
              <tbody>
                {data.transfers.map(transfer => (
                  <tr key={transfer.id}>
                    <td>
                      {transfer.transfer_number}
                      <span className={styles.meta}>{transfer.transfer_date}</span>
                    </td>
                    <td>
                      {transfer.source_name} → {transfer.destination_name}
                      {transfer.reference ? (
                        <span className={styles.meta}>{transfer.reference}</span>
                      ) : null}
                    </td>
                    <td className={styles.number}>{amount(transfer.amount)}</td>
                    <td>
                      <span className={styles.badge}>{transfer.status}</span>
                    </td>
                    <td>
                      {canEdit && transfer.status === "posted" ? (
                        <button
                          type="button"
                          className={styles.button}
                          onClick={() => reverseTransfer(transfer.id)}
                        >
                          <RefreshCcw size={14} />
                          Reverse
                        </button>
                      ) : transfer.reversal_journal_id ? "Reversed" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.notice}>
            No internal transfers have been posted yet.
          </div>
        )}
      </section>

      <section className={styles.quickActions}>
        <div>
          <span className={styles.eyebrow}>Roadmap boundary</span>
          <h3>Balances are ledger-authoritative</h3>
          <p>
            Part 10 controls the financial accounts and internal movements. Statement files/feeds are Part 11; matching and reconciliation are Part 12.
          </p>
        </div>
        <div className={styles.actions}>
          <span className={styles.badge}>
            <Banknote size={14} /> Bank
          </span>
          <span className={styles.badge}>
            <Wallet size={14} /> Cash
          </span>
          <span className={styles.badge}>
            <Smartphone size={14} /> Mobile money
          </span>
        </div>
      </section>

      <SaMiOverlay {...overlay} onClose={closeOverlay} />
    </div>
  );
}
