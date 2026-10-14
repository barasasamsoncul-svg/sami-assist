# SaMi Sales parity audit ledger

**Audit baseline:** `main` at `4465bf7ca2701942e574f7a09944ef7aba349be6` (2026-10-15 audit session).  
**Purpose:** one authoritative checklist for finishing Sales. This is an evidence ledger, not a claim that Sales has already achieved Odoo/Zoho parity.

## Completion rule

A capability is **verified complete** only when (1) its UI action is wired to the authoritative backend, (2) tenant/company and permission checks are correct, (3) persistent side effects are transactional/idempotent where required, (4) regressions exercise meaningful behavior (not only source-text patterns), and (5) the relevant integration and release gates pass on the same commit. “Exists” or “has a page” is not completion evidence.

## Workflow and capability matrix

| Domain | Primary implementation surfaces | Existing evidence in repository | Audit disposition |
|---|---|---|---|
| Sales workspace, customer records, search/views | `SalesWorkspaceClient.tsx`, `SalesCustomersManager.tsx`, `queries.ts`, `search.ts`, `saved-views.ts` | UI-quality and Sales module tests; source-level placeholder scan found no obvious TODO/disabled stubs | Implementation exists; verify interactive paths, pagination/bulk actions and permission boundaries before closure |
| Quotations, revisions, templates, optional products, PDF | `commands.ts`, `commercial.ts`, `pdf.ts`, `SalesQuoteComposer.tsx`, `SalesQuoteDetailClient.tsx`, `SalesQuotePdfBuilder.tsx`, `SalesTemplatesManager.tsx` | Sales module and UI-quality tests; quote/approval logic in backend | End-to-end quote create → revise → send/view → accept/reject/expire → convert must be confirmed on one test path |
| Approval policies and quote/order controls | `approvals.ts`, `commands.ts`, approvals UI | `sales-part-11-approval-engine.test.mjs`, approval migration test, Sales module validation | Explicit approval lifecycle exists; verify threshold and retry paths against the actual database |
| Lead and opportunity pipeline | `pipeline.ts`, `lead-assignment.ts`, `lead-assignment-rules.ts`, `lead-scoring.ts`, pipeline UI | Pipeline board/multi-pipeline/funnel/outcomes/velocity and lead-assignment tests | Pipeline code and tests exist; verify stage transitions, loss reasons, ownership, won/lost side effects, and quote-to-order bridge together |
| Pricing, pricelists, currencies, catalogue and variants | `commercial.ts`, `currencies.ts`, `product-variants.ts`, pricing/catalogue/pricelist UI | Pricelist scope, variants, Sales and TypeScript checks | Verify date/effective pricing, discounts, taxes/rounding, variant availability and snapshot stability as integrated flows |
| Order lifecycle, fulfillment, shipment and returns | `commands.ts`, `operations.ts`, `delivery.ts`, `inventory.ts`, order/operations UI | Sales module, return-credit idempotency, return/fulfillment quality and ERP integration tests; source shows duplicate-line checks and return quantity guards | Significant domain logic exists; confirm ordered-vs-delivered-vs-invoiced quantities, partial fulfillment, stock movement, return receipt, credit/refund, duplicate retries |
| Invoicing, credit notes and accounting bridge | Sales bulk-invoice/operations plus Invoicing/Accounting integration | `erp-parity-integration.test.ts` and ERP Parity Integration gate | Integration proof exists for stock and accounting transaction chains; confirm sales-specific partial invoicing, cancellations and return credits end-to-end |
| Sales reports and analytics | `management-insights.ts`, `quotation-effectiveness.ts`, `product-performance.ts`, `commission-performance.ts`, `commercial-margin-quality.ts`, `return-fulfillment-quality.ts`, forecast, pipeline and target reports | Dedicated report tests plus currency regressions merged in #196–#203 | Cross-currency aggregation/ranking is a recurring risk; fixes must be checked across the full report family, not one page at a time. This audit found and fixes per-currency row-cap gaps in return status/reason reporting |
| Authorization, tenant isolation, audit trail and migration safety | `context.ts`, `schema.sql`, `migrations/`, command/operation modules | Permission and company-scope assertions throughout Sales tests; platform and migration gates | Coverage exists but cannot be certified from static tests alone; finish review of each write boundary, migration upgrade/fresh install, and negative-access behavior |
| UI integration, navigation, responsiveness and empty/error states | `app/apps/sales/**` (workspace, quotes, orders, pipeline, customers, reports, settings and managers) | `sales-ui-quality.test.mjs`, App Surfaces UI workflow | Obvious placeholder scan passed; that scan is not proof of complete UX. Each major workflow must be exercised for loading/empty/error/denied/success states and small-screen layout |

## Confirmed cross-currency report rules

1. Never add monetary values from different currencies into one scalar total unless each amount has been explicitly converted to the same reporting currency using a documented exchange-rate source and rate date.
2. When a report is displayed in currency-specific sections, ranking and row caps must also be scoped per currency. A global `LIMIT` after grouping by currency can silently suppress an entire currency.
3. Counts that are currency-independent may be global, but any ranking that incorporates monetary amounts must state and test its currency semantics.
4. Regression coverage must protect both the SQL/query shape and the UI grouping contract.

## Consolidated findings / next gates

- **Fixed in this audit branch:** return lifecycle status results now cap independently per currency; return-reason ranking now selects the top 100 independently per currency, matching the UI's currency sections. Regression assertions are added.
- **Previously merged:** currency-safe forecasts, management insights, quotation effectiveness, product performance, commission performance, and margin-quality row caps (#196–#203). Do not re-open these areas without a failing regression or a newly demonstrated defect.
- **Last observed main release gates at `4465bf7ca2701942e574f7a09944ef7aba349be6`:** Sales Module Validation, ERP Parity Integration, App Surfaces UI, Platform Kernel Closure, and Pre-Module Core Hardening all completed successfully.
- **Not yet certified:** this ledger does not mark the entire module “done.” The remaining work is execution-level verification of each workflow row, with any confirmed gaps fixed in grouped changes. Only after that and a full release validation should Sales be called complete.

## Audit evidence index

- Sales entry points: `app/apps/sales/page.tsx`, `app/apps/sales/SalesSectionPage.tsx`
- Core state transitions: `lib/apps/sales/commands.ts`, `lib/apps/sales/pipeline.ts`, `lib/apps/sales/operations.ts`
- Domain integration: `lib/apps/sales/inventory.ts`, `lib/apps/sales/delivery.ts`, `tests/erp-parity-integration.test.ts`
- Report regressions: `tests/sales-management-insights-currency.test.mjs`, `tests/sales-quotation-effectiveness.test.mjs`, `tests/sales-product-performance.test.mjs`, `tests/sales-commission-performance.test.mjs`, `tests/sales-commercial-margin-quality.test.mjs`, `tests/sales-return-fulfillment-quality.test.mjs`

