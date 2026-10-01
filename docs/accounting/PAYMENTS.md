# Payments and settlements (Accounting 2.15)

Open Accounting → Payments & settlements.

- **Vendor payment:** choose the bank, cash or mobile-money account, external reference, date and full or partial bill allocations. Save a draft, approve it, then record the completed external payment. Posting debits each bill's original payable control account and credits the source financial account. Payables balances and aging include posted allocations.
- **Settlement:** select the financial account holding already-recorded provider receipts, destination bank, gross amount and fees. Posting credits clearing for gross, debits the bank for net and debits the selected expense account for fees.
- **Correction:** cancel an unposted batch, or reverse a posted payment using an open accounting date. Reconcile corrections outside SaMi with the provider separately. Existing reconciliation matches must first be reversed. Original journals and payment history remain intact.
- **Remittance:** select a vendor payment to download a CSV containing its reference, status, date, currency, vendors, bills and amounts. No email is sent.

SaMi records external payments; this release does not initiate bank payouts. Customer receipts stay in Invoicing. This release supports company-base-currency transactions; foreign-currency payments follow the FX accounting roadmap. The bill picker shows the oldest 500 open bills and allows up to 90 allocations per batch.

## Controls

Create requires Accounting create permission. Approve, record, cancel and reverse require Accounting transition permission. All commands validate the active company. Generic mutation APIs cannot modify payment records. Drafts are immutable: cancel and replace a draft to change it.

Request keys are permanent and tied to canonical payload hashes. Source account plus external reference is unique (case-insensitive) across non-cancelled batches. Approval does not reserve money or bill balances: both are checked again under transaction locks when recording payment. The financial-account locks coordinate with internal transfers. Journals use the central balanced-posting engine, fiscal-period locks and idempotency keys. Payment reversal restores bill balances and prevents source bill reversal while payment allocations remain posted.

## Release prerequisites

Apply the existing versioned Accounting migration chain through 2.14, then `accounting-2.14.0-to-2.15.0`, to each installed tenant. Rehearse the complete required chain on fresh production copies before live application. Confirm the tenant migration ledger and control-plane `tenant_modules.version` agree. The 2.15 SQL is shared with fresh installs and does not create or alter customer invoices.

Local validation: executable embedded PostgreSQL payment posting/reversal regressions, Accounting foundation and statement tests, migration contracts, app UI contracts, Invoicing regressions, TypeScript, lint and production build. PostgreSQL CI additionally checks simultaneous duplicate requests, competing bill payments and competing source withdrawals. Authenticated browser verification is still required before calling the full user flow verified.
