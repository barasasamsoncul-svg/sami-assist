-- ============================================================
-- SaMi Control DB Migration
-- Category 22: subscription invoices and payment receipts
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS sami_subscription_invoice_number_seq;
CREATE SEQUENCE IF NOT EXISTS sami_subscription_receipt_number_seq;

CREATE TABLE IF NOT EXISTS subscription_billing_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id UUID NOT NULL
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    subscription_id UUID NOT NULL
        REFERENCES subscriptions(id)
        ON DELETE CASCADE,

    payment_transaction_id UUID
        REFERENCES payment_transactions(id)
        ON DELETE SET NULL,

    document_type VARCHAR(16) NOT NULL
        CHECK (document_type IN ('invoice', 'receipt')),

    document_number VARCHAR(64) NOT NULL UNIQUE,

    status VARCHAR(16) NOT NULL DEFAULT 'issued'
        CHECK (status IN ('issued', 'paid', 'void')),

    currency VARCHAR(3) NOT NULL DEFAULT 'KES'
        CHECK (currency ~ '^[A-Z]{3}$'),

    subtotal NUMERIC(14,2) NOT NULL
        CHECK (subtotal >= 0),

    tax_total NUMERIC(14,2) NOT NULL DEFAULT 0
        CHECK (tax_total >= 0),

    total_amount NUMERIC(14,2) NOT NULL
        CHECK (total_amount >= 0),

    billing_period_start TIMESTAMPTZ NOT NULL,
    billing_period_end TIMESTAMPTZ NOT NULL,

    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,

    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT subscription_billing_documents_period_check
        CHECK (billing_period_end > billing_period_start),

    CONSTRAINT subscription_billing_documents_payment_type_check
        CHECK (
          (document_type = 'receipt' AND payment_transaction_id IS NOT NULL)
          OR
          (document_type = 'invoice' AND payment_transaction_id IS NULL)
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_invoice_per_period
    ON subscription_billing_documents(
        subscription_id,
        billing_period_start
    )
    WHERE document_type = 'invoice';

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_receipt_per_payment
    ON subscription_billing_documents(payment_transaction_id)
    WHERE document_type = 'receipt' AND payment_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_billing_documents_tenant_issued
    ON subscription_billing_documents(
        tenant_id,
        issued_at DESC,
        id DESC
    );

CREATE INDEX IF NOT EXISTS idx_subscription_billing_documents_due
    ON subscription_billing_documents(due_at, status)
    WHERE document_type = 'invoice' AND status = 'issued';
