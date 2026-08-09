# SaMi Assist — all-app audit

The available source evidence confirms an isolated PostgreSQL tenant architecture and an app registry with 36 business apps.

Verified tenant dump (PostgreSQL 18.4) contains:
ai_memory, conversations, customers, documents, employees, inventory,
invoice_items, invoices, messages, payments, products.

Verified relationships:
inventory.product_id -> products.id
invoice_items.invoice_id -> invoices.id
invoices.customer_id -> customers.id
payments.invoice_id -> invoices.id

The registry references dedicated files such as apps/accounting/schema.sql,
apps/inventory/schema.sql, etc., but those actual app-specific schema contents
were not present in the source material available to this build. Therefore this
package does not invent app-specific tables/columns or fake data.

This package adds an all-app workspace shell and keeps the existing Invoicing
implementation as the functional source of truth.
