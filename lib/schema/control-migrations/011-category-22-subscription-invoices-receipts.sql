-- ============================================================
-- SaMi Control DB Migration
-- Category 22: Subscription invoices and payment receipts
-- ============================================================
-- Platform subscription billing documents are immutable billing
-- snapshots. Provider callbacks may be retried, so uniqueness is
-- enforced at the database layer as well as in application code.
-- This migration intentionally does not delete or rewrite billing
-- or payment history.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS sami_subscription_invoice_number_seq
    AS BIGINT
    START WITH 1
    INCREMENT BY 1
    NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS sami_subscription_receipt_number_seq
    AS BIGINT
    START WITH 1
    INCREMENT BY 1
    NO CYCLE;

CREATE TABLE IF NOT EXISTS subscription_billing_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id UUID NOT NULL
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    subscription_id UUID NOT NULL
        REFERENCES subscriptions(id)
        ON DELETE CASCADE,

    payment_transaction_id UUID,

    document_type VARCHAR(16) NOT NULL
        CHECK (document_type IN ('invoice', 'receipt')),

    document_number VARCHAR(80) NOT NULL UNIQUE,

    status VARCHAR(24) NOT NULL
        CHECK (
            status IN (
                'issued',
                'paid',
                'overdue',
                'void',
                'cancelled'
            )
        ),

    currency VARCHAR(10) NOT NULL
        CHECK (currency ~ '^[A-Z]{3}$'),

    subtotal NUMERIC(14, 2) NOT NULL
        CHECK (subtotal >= 0),

    tax_total NUMERIC(14, 2) NOT NULL DEFAULT 0
        CHECK (tax_total >= 0),

    total_amount NUMERIC(14, 2) NOT NULL
        CHECK (total_amount >= 0),

    billing_period_start TIMESTAMPTZ NOT NULL,
    billing_period_end TIMESTAMPTZ NOT NULL,

    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,

    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT subscription_billing_documents_period_valid
        CHECK (billing_period_end > billing_period_start),

    CONSTRAINT subscription_receipts_require_payment
        CHECK (
            document_type <> 'receipt'
            OR (
                payment_transaction_id IS NOT NULL
                AND paid_at IS NOT NULL
                AND status = 'paid'
            )
        )
);

-- Exactly one invoice per subscription billing period.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_invoice_per_period
    ON subscription_billing_documents (
        tenant_id,
        subscription_id,
        billing_period_start
    )
    WHERE document_type = 'invoice';

-- A verified transaction can issue no more than one receipt.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_receipt_per_payment
    ON subscription_billing_documents (payment_transaction_id)
    WHERE document_type = 'receipt';

CREATE INDEX IF NOT EXISTS idx_subscription_billing_documents_history
    ON subscription_billing_documents (
        tenant_id,
        subscription_id,
        issued_at DESC,
        id DESC
    );

CREATE INDEX IF NOT EXISTS idx_subscription_billing_documents_due
    ON subscription_billing_documents (due_at, tenant_id)
    WHERE document_type = 'invoice'
      AND status IN ('issued', 'overdue');

CREATE INDEX IF NOT EXISTS idx_subscription_billing_documents_payment
    ON subscription_billing_documents (tenant_id, payment_transaction_id)
    WHERE payment_transaction_id IS NOT NULL;
