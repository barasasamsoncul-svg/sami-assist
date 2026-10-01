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

## Remaining depth, in the agreed order

6. Receivables.
7. Payables.
8. Purchasing controls.
9. Expenses and reimbursements.
10. Bank, cash and mobile money.
11. Statement imports and supported feeds.
12. Reconciliation.
13. Payments and settlements.
14. Tax engine.
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

`node --conditions=react-server --import tsx --test tests/accounting-foundation.test.mjs`

Set `TEST_DATABASE_URL` to a disposable PostgreSQL database to run transaction and reporting tests (including simultaneous duplicate requests). Tests create and remove an isolated random schema. For local embedded PostgreSQL testing, `PGLITE_TEST_MODULE` can point to an installed PGlite module; the simultaneous-connection test requires real PostgreSQL. The Accounting GitHub Actions workflow supplies PostgreSQL automatically.

Also run TypeScript, production build, module-migration tests, app UI contracts and Invoicing regressions. A component fixture preview verifies layout; it does not substitute for authenticated production workflow testing.
