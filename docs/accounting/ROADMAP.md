# SaMi Accounting implementation roadmap

## First delivery — accounting foundation

Implemented in this change:

- Accounting-owned overview with live company-scoped ledger counts and closing trial-balance difference.
- Separate setup, trial-balance, general-ledger and new-journal routes inside the existing Accounting shell.
- Trial balance: opening net, period debit/credit, closing debit/credit, account drill-down and date filters.
- General ledger: account selection, opening balance, correctly ordered running balances and 50-row pagination.
- Manual journal editor: active account selection, exact decimal validation, balanced draft creation, atomic parent/lines transaction, company-change guard, fiscal-period checks and duplicate request protection.
- Existing chart of accounts, fiscal periods, bank records, journal register, activity and generic reports remain accessible.
- Uses existing accounts/journals/journal_lines and enterprise infrastructure. No schema-version bump or deployment migration required.

This is the first usable slice, not completion of the full Accounting module. New manual entries are saved as drafts; this change does not introduce a new posting/reversal/approval engine. Invoicing's existing postings continue to feed the same ledger. Financial reports currently select `status = 'posted'` and use the existing two-decimal ledger amounts in company currency.

## Completed depth

1. Accounting setup: full validated company configuration, fiscal-year policy, control-account mappings, tax/cash/FX/write-off/rounding defaults, global lock date, open-period enforcement, dedicated setup UI/API, audited saves and migration-backed fresh-install support.
2. Chart of accounts: dedicated responsive editor, company-scoped codes, hierarchy, reconciliation/manual-posting controls, protected control/system roles, safe archive/restore, Kenya industry templates, additive setup mapping and migration-backed 2.5 schema.
3. Double-entry ledger: authoritative balanced-posting engine, company/source idempotency, company-scoped journal numbers, posting provenance, period/lock enforcement, active-account validation, persisted-balance proof, database line constraints, generic-write lockout, and immutable linked compensating reversals. Invoicing automatic postings now use the same engine.
4. Journals: dedicated journal register/detail, explicit approval metadata, same-record atomic posting through the ledger engine, immutable linked reversals, recurring journal templates and idempotent draft generation.
5. Opening balances: dedicated migration workspace, CSV/manual import, idempotent batch creation, row-level correction and validation, 10,000-line migration support, AR/AP subledger reconciliation, controlled posting into one immutable opening journal, pagination, audit history and migration-backed 2.8 schema.
6. Receivables: dedicated Accounting AR control workspace over the authoritative Invoicing subledger, base-currency open-item aging, customer exposure, customer credits, 90-day DSO estimate, invoice drill-through, filters/pagination, receivable and customer-credit GL reconciliation, and explicit legacy opening-AR treatment without duplicating or mutating Invoicing transactions.
7. Payables: company-scoped vendor master, vendor bills and credits, draft/approval/posting/reversal lifecycle, authoritative double-entry posting to the configured AP control account, vendor-credit applications, server-side filters/pagination, AP aging, legacy opening-AP inclusion, GL-to-subledger control reconciliation, exact quantity/FX arithmetic, protected workflow tables, dedicated standalone Accounting UI/API routes, and migration-backed 2.9 schema.
8. Purchasing controls: approval-band policies with role/user approvers, purchase requisitions, controlled requisition conversion, purchase orders, serialized document numbering, retry-safe create keys with payload hashes, goods/service receipts, partial receiving, receipt overrun protection, two-way/three-way vendor-bill matching, base-currency and per-line receipt variance checks, configurable quantity/price/amount tolerances, authorized exception overrides, AP posting guard for PO-linked bills, protected workflow tables, complete audit events, dedicated standalone Accounting UI/API routes, and migration-backed 2.10 schema with fresh-install parity.
9. Expenses and reimbursements: Accounting control layer over the existing Expenses subledger, optional-app-safe 2.11 migration, category-to-ledger mappings, default expense/employee payable/corporate-card control accounts, approved-report-only ledger posting, immutable posting provenance, partial retry-safe employee reimbursements, outstanding payable balances, linked compensating reversals, cross-app reimbursement-state protection, dedicated responsive Accounting UI/API, protected workflow tables, audit events, and fresh-install parity without duplicating expense claims.
10. Bank, cash and mobile money: dedicated financial-account registry for bank accounts, cash tills and mobile-money wallets, one-to-one ledger links, masked account metadata, provider-aware mobile-money setup, posted ledger balance view, configurable overdraft controls, zero-balance/unresolved-statement closure safeguards, retry-safe serialized internal transfers, deterministic transfer locking, authoritative double-entry posting and linked reversals, protected workflow tables, audit events, dedicated responsive Accounting UI/API, migration-backed 2.12 schema and fresh-install parity. Foreign-currency bank accounting remains reserved for the FX roadmap item.
11. Statement imports and supported feeds: dedicated statement-intake workspace with quoted CSV mapping, OFX FITID support, QIF date-order handling, 5 MB/10,000-transaction limits, file-content hashing and retry keys, serialized same-account imports, authoritative external-ID plus heuristic fingerprint duplicate detection, explicit override only for heuristic duplicates, per-row SQL savepoints, row diagnostics, safe pre-reconciliation batch undo and batch history, provider-neutral feed connections with sync cursor/error state, normalized authenticated feed ingestion that stores no provider secrets, protected statement workflow tables, audit events, executable parser regressions, dedicated UI/API, migration-backed 2.13 schema and fresh-install parity. CAMT.053 is intentionally not advertised until a proper XML parser is introduced.
12. Reconciliation: dedicated reconciliation control center over imported statement lines and the posted bank ledger, signed amount/date/reference candidate scoring, persisted suggestions with accepted/dismissed/stale provenance, manual and split allocation matching, partial journal-line availability controls, active-statement uniqueness, retry-safe request keys and payload hashes, account-specific adjustment rules, explicit rule acceptance before balanced adjustment journals, exclusions/restores, immutable reconciliation history, compensating reversals, legacy matched-line backfill, reconciliation-journal candidate exclusion, protected workflow tables, audit events, dedicated UI/API, migration-backed 2.14 schema and fresh-install parity.

13. Payments and settlements: company-scoped vendor payment batches and provider settlements, draft/approval/posting/cancellation lifecycle, exact full and partial bill allocations, AP aging/balance integration, original bill control-account debits, retry-key/payload and external-reference duplicate protection, source-balance/overdraft checks with serialized financial-account locks, settlement gross/net/fee posting, reconciliation-aware linked reversals, bill reversal guards, remittance CSV downloads, protected workflow tables, audit events, dedicated Accounting UI/API, and migration-backed 2.15 schema with shared fresh-install SQL. Records externally completed payments; does not initiate bank payouts. Customer receipts remain owned by Invoicing. Cross-currency payments remain item 17.
14. Tax engine: company-scoped effective-dated tax codes and ordered tax groups, percentage/fixed calculations, inclusive/exclusive pricing, compound-base controls, withholding behavior, recoverable/nonrecoverable purchase-tax splits, ledger account mappings, jurisdiction/reporting metadata, archive lifecycle, exact minor-unit calculation previews, protected workflow tables, source tax-register contract, dedicated responsive UI/API, migration-backed 2.16 schema and fresh-install parity. Statutory Kenya defaults are intentionally deferred to item 15 rather than hardcoded into the core.

## Remaining depth, in the agreed order

15. Kenya accounting and shared eTIMS integration.
16. International localization.
17. Foreign currency accounting.
18. Inventory valuation and ledger reconciliation.
19. Fixed assets.
20. Accruals and deferrals.
21. Loans and financing.
22. Budgets and forecasts.
23. Project and departmental accounting.
24. Payroll accounting integration.
25. Multiple companies and consolidation.
26. Financial statements beyond the first trial balance and ledger.
27. Management and exception reporting.
28. Month-end and year-end closing.
29. Granular accounting approvals and audit controls.
30. Documents and collaboration.
31. Automation and SaMi AI.
32. Complete accounting settings, usability and operational recovery.

## Boundaries

Keep changes scoped to Accounting. Reuse the existing authoritative ledger and trusted company context. Do not create duplicate invoices/customer balances, change the workspace shell/theme/tutorial settings, or overwrite ongoing Invoicing changes. Production deployments follow main; feature branches must not deploy previews.

## Validation

`node --conditions=react-server --import tsx --test tests/accounting-foundation.test.mjs tests/accounting-statements.test.mjs tests/accounting-payments.test.mjs tests/accounting-tax.test.mjs`

Set `TEST_DATABASE_URL` to a disposable PostgreSQL database to run transaction and reporting tests (including simultaneous duplicate requests). Tests create and remove an isolated random schema. For local embedded PostgreSQL testing, `PGLITE_TEST_MODULE` can point to an installed PGlite module; the simultaneous-connection test requires real PostgreSQL. The Accounting GitHub Actions workflow supplies PostgreSQL automatically.

Also run TypeScript, production build, module-migration tests, app UI contracts and Invoicing regressions. A component fixture preview verifies layout; it does not substitute for authenticated production workflow testing.
