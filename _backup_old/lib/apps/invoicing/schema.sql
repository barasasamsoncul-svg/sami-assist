-- ============================================================
-- SaMi Assist
-- INVOICE MODULE - COMPLETE REPLACEMENT SCHEMA v3.0
-- ============================================================
--
-- Version: 3.0
--
-- Designed for:
--   - PostgreSQL / Neon / Supabase
--   - SaMi Assist tenant databases
--
-- CHANGES FROM v2.0:
--   - Added audit trail (deleted_at, deleted_by)
--   - Added status transition validation
--   - Added customer credit limit enforcement
--   - Added payment allocations to line items
--   - Added fiscal year/sequence reset support
--   - Added rounding adjustments
--   - Added soft delete for customers
--   - Added additional indexes for performance
--   - Added archive table for invoices
--   - Added webhook/event triggers
--   - Added reporting views
--   - Added table/column comments
--   - Enhanced decimal precision to NUMERIC(19,4)
--   - Added invoice status history tracking
--   - Added bulk operations support
--   - Added payment date accuracy fixes
--
-- IMPORTANT:
--   This script replaces the invoice module.
--   BACK UP EXISTING DATA before running in a database
--   containing production invoice data.
--
-- ============================================================


-- ============================================================
-- 0. EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- For overlapping date ranges


-- ============================================================
-- 1. REMOVE EXISTING INVOICE MODULE
-- ============================================================

DROP TABLE IF EXISTS public.invoice_events CASCADE;
DROP TABLE IF EXISTS public.payment_allocations CASCADE;
DROP TABLE IF EXISTS public.invoice_status_history CASCADE;
DROP TABLE IF EXISTS public.invoice_activity_log CASCADE;
DROP TABLE IF EXISTS public.invoice_reminders CASCADE;
DROP TABLE IF EXISTS public.recurring_invoices CASCADE;
DROP TABLE IF EXISTS public.credit_notes CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.invoice_items CASCADE;
DROP TABLE IF EXISTS public.invoices_archive CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.invoice_settings CASCADE;
DROP TABLE IF EXISTS public.invoice_templates CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.tax_rates CASCADE;
DROP TABLE IF EXISTS public.payment_terms CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;


-- ============================================================
-- 2. COMMON FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


-- ============================================================
-- 3. PAYMENT TERMS
-- ============================================================

CREATE TABLE public.payment_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL,
    description TEXT,

    due_days INTEGER NOT NULL DEFAULT 30,

    discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
    discount_days INTEGER,

    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,

    sort_order INTEGER NOT NULL DEFAULT 0,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT payment_terms_due_days_check
        CHECK (due_days >= 0),

    CONSTRAINT payment_terms_discount_percentage_check
        CHECK (
            discount_percentage >= 0
            AND discount_percentage <= 100
        ),

    CONSTRAINT payment_terms_discount_days_check
        CHECK (
            discount_days IS NULL
            OR discount_days >= 0
        )
);

COMMENT ON TABLE public.payment_terms IS 'Payment term configurations like Net 30, Due on Receipt';
COMMENT ON COLUMN public.payment_terms.due_days IS 'Number of days until payment is due';
COMMENT ON COLUMN public.payment_terms.discount_percentage IS 'Early payment discount percentage';
COMMENT ON COLUMN public.payment_terms.discount_days IS 'Days within which discount applies';


CREATE UNIQUE INDEX uq_payment_terms_name
ON public.payment_terms (LOWER(name));

CREATE INDEX idx_payment_terms_active
ON public.payment_terms(is_active);

CREATE INDEX idx_payment_terms_sort
ON public.payment_terms(sort_order);


-- ============================================================
-- 4. TAX RATES
-- ============================================================

CREATE TABLE public.tax_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL,

    rate NUMERIC(5,2) NOT NULL,

    tax_type VARCHAR(50) NOT NULL DEFAULT 'vat',
    -- vat, gst, sales_tax, withholding, none, other

    country VARCHAR(100),
    region VARCHAR(100),

    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,

    sort_order INTEGER NOT NULL DEFAULT 0,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT tax_rates_rate_check
        CHECK (rate >= 0 AND rate <= 100),

    CONSTRAINT tax_rates_type_check
        CHECK (
            tax_type IN (
                'vat',
                'gst',
                'sales_tax',
                'withholding',
                'none',
                'other'
            )
        )
);

COMMENT ON TABLE public.tax_rates IS 'Tax rates applicable to invoices and items';
COMMENT ON COLUMN public.tax_rates.tax_type IS 'Type of tax (vat, gst, sales_tax, withholding, none, other)';


CREATE UNIQUE INDEX uq_tax_rates_name
ON public.tax_rates (LOWER(name));

CREATE INDEX idx_tax_rates_active
ON public.tax_rates(is_active);

CREATE INDEX idx_tax_rates_type
ON public.tax_rates(tax_type);


-- ============================================================
-- 5. CUSTOMERS
-- ============================================================

CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- --------------------------------------------------------
    -- Core
    -- --------------------------------------------------------

    company_name VARCHAR(255) NOT NULL,

    contact_name VARCHAR(255),

    email VARCHAR(255),

    phone VARCHAR(50),

    website VARCHAR(255),

    -- --------------------------------------------------------
    -- Addresses
    -- --------------------------------------------------------

    billing_address TEXT,

    shipping_address TEXT,

    -- --------------------------------------------------------
    -- Tax / Legal
    -- --------------------------------------------------------

    tax_id VARCHAR(100),

    tax_id_type VARCHAR(50) NOT NULL DEFAULT 'vat',

    registration_number VARCHAR(100),

    -- --------------------------------------------------------
    -- B2B
    -- --------------------------------------------------------

    currency VARCHAR(3) NOT NULL DEFAULT 'KES',

    payment_terms_id UUID
        REFERENCES public.payment_terms(id)
        ON DELETE SET NULL,

    credit_limit NUMERIC(19,4),

    -- --------------------------------------------------------
    -- Classification
    -- --------------------------------------------------------

    customer_type VARCHAR(50) NOT NULL DEFAULT 'company',

    industry VARCHAR(100),

    -- --------------------------------------------------------
    -- Status
    -- --------------------------------------------------------

    status VARCHAR(50) NOT NULL DEFAULT 'active',

    -- --------------------------------------------------------
    -- Soft Delete
    -- --------------------------------------------------------

    deleted_at TIMESTAMPTZ,
    deleted_by UUID,

    -- --------------------------------------------------------
    -- Metadata
    -- --------------------------------------------------------

    notes TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT customers_credit_limit_check
        CHECK (
            credit_limit IS NULL
            OR credit_limit >= 0
        ),

    CONSTRAINT customers_currency_check
        CHECK (char_length(currency) = 3),

    CONSTRAINT customers_type_check
        CHECK (
            customer_type IN (
                'individual',
                'company',
                'government',
                'non_profit'
            )
        ),

    CONSTRAINT customers_status_check
        CHECK (
            status IN (
                'active',
                'inactive',
                'blocked'
            )
        )
);

COMMENT ON TABLE public.customers IS 'Customer/Client information';
COMMENT ON COLUMN public.customers.deleted_at IS 'Soft delete timestamp';
COMMENT ON COLUMN public.customers.deleted_by IS 'User who soft deleted this customer';


CREATE INDEX idx_customers_company
ON public.customers(company_name);

CREATE INDEX idx_customers_email
ON public.customers(email);

CREATE INDEX idx_customers_phone
ON public.customers(phone);

CREATE INDEX idx_customers_status
ON public.customers(status);

CREATE INDEX idx_customers_tax_id
ON public.customers(tax_id);

CREATE INDEX idx_customers_payment_terms
ON public.customers(payment_terms_id);

CREATE INDEX idx_customers_deleted_at
ON public.customers(deleted_at)
WHERE deleted_at IS NOT NULL;


-- ============================================================
-- 6. PRODUCTS / SERVICES
-- ============================================================

CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(255) NOT NULL,

    description TEXT,

    sku VARCHAR(100),

    unit_price NUMERIC(19,4) NOT NULL DEFAULT 0,

    tax_rate_id UUID
        REFERENCES public.tax_rates(id)
        ON DELETE SET NULL,

    category VARCHAR(100),

    is_active BOOLEAN NOT NULL DEFAULT true,

    notes TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT products_unit_price_check
        CHECK (unit_price >= 0)
);

COMMENT ON TABLE public.products IS 'Products and services sold to customers';


CREATE UNIQUE INDEX uq_products_sku
ON public.products (LOWER(sku))
WHERE sku IS NOT NULL;

CREATE INDEX idx_products_name
ON public.products(name);

CREATE INDEX idx_products_category
ON public.products(category);

CREATE INDEX idx_products_active
ON public.products(is_active);

CREATE INDEX idx_products_tax_rate
ON public.products(tax_rate_id);


-- ============================================================
-- 7. INVOICE TEMPLATES
-- ============================================================

CREATE TABLE public.invoice_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL,

    is_default BOOLEAN NOT NULL DEFAULT false,

    is_active BOOLEAN NOT NULL DEFAULT true,

    -- --------------------------------------------------------
    -- Design
    -- --------------------------------------------------------

    primary_color VARCHAR(7) NOT NULL DEFAULT '#1a56db',

    secondary_color VARCHAR(7) NOT NULL DEFAULT '#374151',

    accent_color VARCHAR(7),

    logo_url TEXT,

    font_family VARCHAR(100) NOT NULL DEFAULT 'Inter',

    logo_position VARCHAR(20) NOT NULL DEFAULT 'left',

    header_style VARCHAR(50) NOT NULL DEFAULT 'modern',

    -- --------------------------------------------------------
    -- Visibility
    -- --------------------------------------------------------

    show_company_logo BOOLEAN NOT NULL DEFAULT true,

    show_company_address BOOLEAN NOT NULL DEFAULT true,

    show_company_contact BOOLEAN NOT NULL DEFAULT true,

    show_tax_id BOOLEAN NOT NULL DEFAULT true,

    show_payment_instructions BOOLEAN NOT NULL DEFAULT true,

    show_bank_details BOOLEAN NOT NULL DEFAULT true,

    show_tax_breakdown BOOLEAN NOT NULL DEFAULT true,

    show_discount BOOLEAN NOT NULL DEFAULT true,

    show_shipping BOOLEAN NOT NULL DEFAULT true,

    show_po_number BOOLEAN NOT NULL DEFAULT true,

    show_customer_tax_id BOOLEAN NOT NULL DEFAULT false,

    show_customer_address BOOLEAN NOT NULL DEFAULT true,

    show_invoice_notes BOOLEAN NOT NULL DEFAULT true,

    show_terms_and_conditions BOOLEAN NOT NULL DEFAULT true,

    -- --------------------------------------------------------
    -- Content
    -- --------------------------------------------------------

    header_text TEXT,

    footer_text TEXT,

    payment_instructions TEXT,

    bank_details TEXT,

    terms_and_conditions TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT invoice_templates_logo_position_check
        CHECK (
            logo_position IN ('left', 'center', 'right')
        )
);

COMMENT ON TABLE public.invoice_templates IS 'Invoice design templates';


CREATE INDEX idx_invoice_templates_active
ON public.invoice_templates(is_active);


-- ============================================================
-- 8. INVOICES
-- ============================================================

CREATE TABLE public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- --------------------------------------------------------
    -- Relationships
    -- --------------------------------------------------------

    customer_id UUID NOT NULL
        REFERENCES public.customers(id)
        ON DELETE RESTRICT,

    -- --------------------------------------------------------
    -- Numbering
    -- --------------------------------------------------------

    invoice_number VARCHAR(100) NOT NULL UNIQUE,

    -- --------------------------------------------------------
    -- Dates
    -- --------------------------------------------------------

    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,

    due_date DATE,

    payment_date DATE,

    sent_at TIMESTAMPTZ,

    viewed_at TIMESTAMPTZ,

    approved_at TIMESTAMPTZ,

    -- --------------------------------------------------------
    -- Status
    -- --------------------------------------------------------

    status VARCHAR(50) NOT NULL DEFAULT 'draft',

    -- draft
    -- pending_approval
    -- sent
    -- viewed
    -- partially_paid
    -- paid
    -- overdue
    -- cancelled
    -- void

    -- --------------------------------------------------------
    -- Financials (Enhanced Precision)
    -- --------------------------------------------------------

    subtotal NUMERIC(19,4) NOT NULL DEFAULT 0,

    discount_type VARCHAR(20),

    discount_value NUMERIC(19,4) NOT NULL DEFAULT 0,

    discount_amount NUMERIC(19,4) NOT NULL DEFAULT 0,

    tax_calculation_method VARCHAR(20)
        NOT NULL DEFAULT 'exclusive',

    tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0,

    shipping_cost NUMERIC(19,4) NOT NULL DEFAULT 0,

    shipping_tax NUMERIC(19,4) NOT NULL DEFAULT 0,

    rounding_adjustment NUMERIC(19,4) NOT NULL DEFAULT 0,

    rounded_total NUMERIC(19,4),

    total_amount NUMERIC(19,4) NOT NULL DEFAULT 0,

    amount_paid NUMERIC(19,4) NOT NULL DEFAULT 0,

    amount_due NUMERIC(19,4) NOT NULL DEFAULT 0,

    -- --------------------------------------------------------
    -- B2B
    -- --------------------------------------------------------

    po_number VARCHAR(100),

    currency VARCHAR(3) NOT NULL DEFAULT 'KES',

    exchange_rate NUMERIC(10,4) NOT NULL DEFAULT 1,

    payment_terms_id UUID
        REFERENCES public.payment_terms(id)
        ON DELETE SET NULL,

    payment_terms_display VARCHAR(100),

    -- --------------------------------------------------------
    -- Fiscal Year
    -- --------------------------------------------------------

    fiscal_year INTEGER,

    fiscal_period INTEGER,

    -- --------------------------------------------------------
    -- Template
    -- --------------------------------------------------------

    template_id UUID
        REFERENCES public.invoice_templates(id)
        ON DELETE SET NULL,

    -- --------------------------------------------------------
    -- Approval
    -- --------------------------------------------------------

    created_by UUID,

    approved_by UUID,

    cancelled_by UUID,

    cancelled_reason TEXT,

    -- --------------------------------------------------------
    -- Reminders
    -- --------------------------------------------------------

    reminder_count INTEGER NOT NULL DEFAULT 0,

    last_reminder_sent_at TIMESTAMPTZ,

    next_reminder_at TIMESTAMPTZ,

    -- --------------------------------------------------------
    -- Content
    -- --------------------------------------------------------

    notes TEXT,

    internal_notes TEXT,

    footer_text TEXT,

    -- --------------------------------------------------------
    -- Attachments
    -- --------------------------------------------------------

    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- --------------------------------------------------------
    -- Soft Delete
    -- --------------------------------------------------------

    deleted_at TIMESTAMPTZ,
    deleted_by UUID,

    -- --------------------------------------------------------
    -- Metadata
    -- --------------------------------------------------------

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- --------------------------------------------------------
    -- Validation
    -- --------------------------------------------------------

    CONSTRAINT invoices_status_check
        CHECK (
            status IN (
                'draft',
                'pending_approval',
                'sent',
                'viewed',
                'partially_paid',
                'paid',
                'overdue',
                'cancelled',
                'void'
            )
        ),

    CONSTRAINT invoices_discount_type_check
        CHECK (
            discount_type IS NULL
            OR discount_type IN ('percentage', 'fixed')
        ),

    CONSTRAINT invoices_tax_method_check
        CHECK (
            tax_calculation_method IN (
                'exclusive',
                'inclusive'
            )
        ),

    CONSTRAINT invoices_currency_check
        CHECK (char_length(currency) = 3),

    CONSTRAINT invoices_subtotal_check
        CHECK (subtotal >= 0),

    CONSTRAINT invoices_discount_value_check
        CHECK (discount_value >= 0),

    CONSTRAINT invoices_discount_amount_check
        CHECK (discount_amount >= 0),

    CONSTRAINT invoices_tax_amount_check
        CHECK (tax_amount >= 0),

    CONSTRAINT invoices_shipping_cost_check
        CHECK (shipping_cost >= 0),

    CONSTRAINT invoices_shipping_tax_check
        CHECK (shipping_tax >= 0),

    CONSTRAINT invoices_rounding_adjustment_check
        CHECK (
            rounding_adjustment >= -1
            AND rounding_adjustment <= 1
        ),

    CONSTRAINT invoices_rounded_total_check
        CHECK (
            rounded_total IS NULL
            OR rounded_total >= 0
        ),

    CONSTRAINT invoices_total_amount_check
        CHECK (total_amount >= 0),

    CONSTRAINT invoices_amount_paid_check
        CHECK (amount_paid >= 0),

    CONSTRAINT invoices_amount_due_check
        CHECK (amount_due >= 0),

    CONSTRAINT invoices_exchange_rate_check
        CHECK (exchange_rate > 0),

    CONSTRAINT invoices_reminder_count_check
        CHECK (reminder_count >= 0)
);

COMMENT ON TABLE public.invoices IS 'Main invoice records';
COMMENT ON COLUMN public.invoices.fiscal_year IS 'Financial year of the invoice';
COMMENT ON COLUMN public.invoices.fiscal_period IS 'Financial period/month of the invoice';
COMMENT ON COLUMN public.invoices.rounding_adjustment IS 'Small adjustment to handle rounding differences';
COMMENT ON COLUMN public.invoices.rounded_total IS 'Final rounded total after adjustment';
COMMENT ON COLUMN public.invoices.deleted_at IS 'Soft delete timestamp';
COMMENT ON COLUMN public.invoices.deleted_by IS 'User who soft deleted this invoice';


CREATE INDEX idx_invoices_customer
ON public.invoices(customer_id);

CREATE INDEX idx_invoices_status
ON public.invoices(status);

CREATE INDEX idx_invoices_issue_date
ON public.invoices(issue_date);

CREATE INDEX idx_invoices_due_date
ON public.invoices(due_date);

CREATE INDEX idx_invoices_currency
ON public.invoices(currency);

CREATE INDEX idx_invoices_po_number
ON public.invoices(po_number);

CREATE INDEX idx_invoices_customer_status
ON public.invoices(customer_id, status);

CREATE INDEX idx_invoices_due_status
ON public.invoices(due_date, status);

CREATE INDEX idx_invoices_created_by
ON public.invoices(created_by);

CREATE INDEX idx_invoices_payment_terms
ON public.invoices(payment_terms_id);

CREATE INDEX idx_invoices_template
ON public.invoices(template_id);

CREATE INDEX idx_invoices_created_at
ON public.invoices(created_at);

CREATE INDEX idx_invoices_updated_at
ON public.invoices(updated_at);

CREATE INDEX idx_invoices_status_created
ON public.invoices(status, created_at DESC);

CREATE INDEX idx_invoices_customer_due
ON public.invoices(customer_id, due_date)
WHERE status NOT IN ('paid', 'cancelled', 'void');

CREATE INDEX idx_invoices_fiscal_year
ON public.invoices(fiscal_year, fiscal_period);

CREATE INDEX idx_invoices_deleted_at
ON public.invoices(deleted_at)
WHERE deleted_at IS NOT NULL;


-- ============================================================
-- 9. INVOICE STATUS HISTORY
-- ============================================================

CREATE TABLE public.invoice_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invoice_id UUID NOT NULL
        REFERENCES public.invoices(id)
        ON DELETE CASCADE,

    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,

    changed_by UUID,

    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    reason TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.invoice_status_history IS 'Audit trail of invoice status changes';


CREATE INDEX idx_invoice_status_history_invoice
ON public.invoice_status_history(invoice_id);

CREATE INDEX idx_invoice_status_history_changed_at
ON public.invoice_status_history(changed_at);

CREATE INDEX idx_invoice_status_history_changed_by
ON public.invoice_status_history(changed_by);


-- ============================================================
-- 10. INVOICE ITEMS
-- ============================================================

CREATE TABLE public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invoice_id UUID NOT NULL
        REFERENCES public.invoices(id)
        ON DELETE CASCADE,

    product_id UUID
        REFERENCES public.products(id)
        ON DELETE SET NULL,

    description TEXT NOT NULL,

    quantity NUMERIC(19,4) NOT NULL DEFAULT 1,

    unit_price NUMERIC(19,4) NOT NULL DEFAULT 0,

    discount_type VARCHAR(20),

    discount_value NUMERIC(19,4) NOT NULL DEFAULT 0,

    discount_amount NUMERIC(19,4) NOT NULL DEFAULT 0,

    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,

    tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0,

    tax_rate_id UUID
        REFERENCES public.tax_rates(id)
        ON DELETE SET NULL,

    line_total NUMERIC(19,4) NOT NULL DEFAULT 0,

    sort_order INTEGER NOT NULL DEFAULT 0,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT invoice_items_quantity_check
        CHECK (quantity >= 0),

    CONSTRAINT invoice_items_unit_price_check
        CHECK (unit_price >= 0),

    CONSTRAINT invoice_items_discount_type_check
        CHECK (
            discount_type IS NULL
            OR discount_type IN ('percentage', 'fixed')
        ),

    CONSTRAINT invoice_items_discount_value_check
        CHECK (discount_value >= 0),

    CONSTRAINT invoice_items_discount_amount_check
        CHECK (discount_amount >= 0),

    CONSTRAINT invoice_items_tax_rate_check
        CHECK (
            tax_rate >= 0
            AND tax_rate <= 100
        ),

    CONSTRAINT invoice_items_tax_amount_check
        CHECK (tax_amount >= 0),

    CONSTRAINT invoice_items_line_total_check
        CHECK (line_total >= 0)
);

COMMENT ON TABLE public.invoice_items IS 'Line items on invoices';


CREATE INDEX idx_invoice_items_invoice
ON public.invoice_items(invoice_id);

CREATE INDEX idx_invoice_items_product
ON public.invoice_items(product_id);

CREATE INDEX idx_invoice_items_tax_rate
ON public.invoice_items(tax_rate_id);


-- ============================================================
-- 11. PAYMENTS
-- ============================================================

CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invoice_id UUID NOT NULL
        REFERENCES public.invoices(id)
        ON DELETE RESTRICT,

    amount NUMERIC(19,4) NOT NULL,

    currency VARCHAR(3) NOT NULL DEFAULT 'KES',

    exchange_rate NUMERIC(10,4) NOT NULL DEFAULT 1,

    payment_method VARCHAR(50) NOT NULL,

    payment_method_details JSONB
        NOT NULL DEFAULT '{}'::jsonb,

    transaction_reference VARCHAR(255),

    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    status VARCHAR(50) NOT NULL DEFAULT 'pending',

    -- pending
    -- completed
    -- failed
    -- refunded
    -- disputed

    reconciled BOOLEAN NOT NULL DEFAULT false,

    reconciled_at TIMESTAMPTZ,

    reconciled_by UUID,

    notes TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT payments_amount_check
        CHECK (amount > 0),

    CONSTRAINT payments_exchange_rate_check
        CHECK (exchange_rate > 0),

    CONSTRAINT payments_status_check
        CHECK (
            status IN (
                'pending',
                'completed',
                'failed',
                'refunded',
                'disputed'
            )
        ),

    CONSTRAINT payments_currency_check
        CHECK (char_length(currency) = 3)
);

COMMENT ON TABLE public.payments IS 'Payment records against invoices';


CREATE INDEX idx_payments_invoice
ON public.payments(invoice_id);

CREATE INDEX idx_payments_date
ON public.payments(payment_date);

CREATE INDEX idx_payments_status
ON public.payments(status);

CREATE INDEX idx_payments_reference
ON public.payments(transaction_reference);

CREATE INDEX idx_payments_method
ON public.payments(payment_method);

CREATE INDEX idx_payments_created_at
ON public.payments(created_at);


-- ============================================================
-- 12. PAYMENT ALLOCATIONS
-- ============================================================

CREATE TABLE public.payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    payment_id UUID NOT NULL
        REFERENCES public.payments(id)
        ON DELETE CASCADE,

    invoice_item_id UUID
        REFERENCES public.invoice_items(id)
        ON DELETE SET NULL,

    amount NUMERIC(19,4) NOT NULL,

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT payment_allocations_amount_check
        CHECK (amount > 0)
);

COMMENT ON TABLE public.payment_allocations IS 'Allocation of payments to specific line items';


CREATE INDEX idx_payment_allocations_payment
ON public.payment_allocations(payment_id);

CREATE INDEX idx_payment_allocations_item
ON public.payment_allocations(invoice_item_id);


-- ============================================================
-- 13. CREDIT NOTES
-- ============================================================

CREATE TABLE public.credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invoice_id UUID NOT NULL
        REFERENCES public.invoices(id)
        ON DELETE RESTRICT,

    customer_id UUID NOT NULL
        REFERENCES public.customers(id)
        ON DELETE RESTRICT,

    credit_note_number VARCHAR(100) NOT NULL UNIQUE,

    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,

    amount NUMERIC(19,4) NOT NULL,

    tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0,

    currency VARCHAR(3) NOT NULL DEFAULT 'KES',

    status VARCHAR(50) NOT NULL DEFAULT 'issued',

    -- issued
    -- applied
    -- void

    applied_to_invoice_id UUID
        REFERENCES public.invoices(id)
        ON DELETE SET NULL,

    applied_amount NUMERIC(19,4),

    applied_at TIMESTAMPTZ,

    reason VARCHAR(255) NOT NULL,

    reason_details TEXT,

    created_by UUID,

    notes TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT credit_notes_amount_check
        CHECK (amount > 0),

    CONSTRAINT credit_notes_tax_check
        CHECK (tax_amount >= 0),

    CONSTRAINT credit_notes_applied_amount_check
        CHECK (
            applied_amount IS NULL
            OR applied_amount >= 0
        ),

    CONSTRAINT credit_notes_status_check
        CHECK (
            status IN (
                'issued',
                'applied',
                'void'
            )
        ),

    CONSTRAINT credit_notes_currency_check
        CHECK (char_length(currency) = 3)
);

COMMENT ON TABLE public.credit_notes IS 'Credit notes issued to customers';


CREATE INDEX idx_credit_notes_invoice
ON public.credit_notes(invoice_id);

CREATE INDEX idx_credit_notes_customer
ON public.credit_notes(customer_id);

CREATE INDEX idx_credit_notes_status
ON public.credit_notes(status);

CREATE INDEX idx_credit_notes_applied_invoice
ON public.credit_notes(applied_to_invoice_id);

CREATE INDEX idx_credit_notes_created_at
ON public.credit_notes(created_at);


-- ============================================================
-- 14. RECURRING INVOICES
-- ============================================================

CREATE TABLE public.recurring_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    customer_id UUID NOT NULL
        REFERENCES public.customers(id)
        ON DELETE RESTRICT,

    template_id UUID
        REFERENCES public.invoice_templates(id)
        ON DELETE SET NULL,

    payment_terms_id UUID
        REFERENCES public.payment_terms(id)
        ON DELETE SET NULL,

    frequency VARCHAR(50) NOT NULL,

    interval_value INTEGER NOT NULL DEFAULT 1,

    start_date DATE NOT NULL,

    end_date DATE,

    next_issue_date DATE NOT NULL,

    last_issue_date DATE,

    currency VARCHAR(3) NOT NULL DEFAULT 'KES',

    discount_type VARCHAR(20),

    discount_value NUMERIC(19,4) NOT NULL DEFAULT 0,

    tax_calculation_method VARCHAR(20)
        NOT NULL DEFAULT 'exclusive',

    items JSONB NOT NULL,

    status VARCHAR(50) NOT NULL DEFAULT 'active',

    total_generated INTEGER NOT NULL DEFAULT 0,

    total_amount_generated NUMERIC(19,4) NOT NULL DEFAULT 0,

    notes TEXT,

    created_by UUID,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT recurring_frequency_check
        CHECK (
            frequency IN (
                'daily',
                'weekly',
                'biweekly',
                'monthly',
                'quarterly',
                'biannual',
                'yearly'
            )
        ),

    CONSTRAINT recurring_interval_check
        CHECK (interval_value > 0),

    CONSTRAINT recurring_date_check
        CHECK (
            end_date IS NULL
            OR end_date >= start_date
        ),

    CONSTRAINT recurring_discount_type_check
        CHECK (
            discount_type IS NULL
            OR discount_type IN ('percentage', 'fixed')
        ),

    CONSTRAINT recurring_discount_value_check
        CHECK (discount_value >= 0),

    CONSTRAINT recurring_tax_method_check
        CHECK (
            tax_calculation_method IN (
                'exclusive',
                'inclusive'
            )
        ),

    CONSTRAINT recurring_status_check
        CHECK (
            status IN (
                'active',
                'paused',
                'completed',
                'cancelled'
            )
        ),

    CONSTRAINT recurring_total_generated_check
        CHECK (total_generated >= 0),

    CONSTRAINT recurring_total_amount_check
        CHECK (total_amount_generated >= 0),

    CONSTRAINT recurring_currency_check
        CHECK (char_length(currency) = 3)
);

COMMENT ON TABLE public.recurring_invoices IS 'Recurring invoice schedules';


CREATE INDEX idx_recurring_customer
ON public.recurring_invoices(customer_id);

CREATE INDEX idx_recurring_status
ON public.recurring_invoices(status);

CREATE INDEX idx_recurring_next_issue
ON public.recurring_invoices(next_issue_date);


-- ============================================================
-- 15. INVOICE REMINDERS
-- ============================================================

CREATE TABLE public.invoice_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invoice_id UUID NOT NULL
        REFERENCES public.invoices(id)
        ON DELETE CASCADE,

    reminder_type VARCHAR(50) NOT NULL,

    -- due_soon
    -- overdue
    -- follow_up
    -- custom

    scheduled_at TIMESTAMPTZ,

    sent_at TIMESTAMPTZ,

    email_subject VARCHAR(255),

    email_body TEXT,

    email_to VARCHAR(255),

    email_cc TEXT,

    status VARCHAR(50) NOT NULL DEFAULT 'scheduled',

    -- scheduled
    -- sent
    -- failed
    -- cancelled

    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT invoice_reminders_type_check
        CHECK (
            reminder_type IN (
                'due_soon',
                'overdue',
                'follow_up',
                'custom'
            )
        ),

    CONSTRAINT invoice_reminders_status_check
        CHECK (
            status IN (
                'scheduled',
                'sent',
                'failed',
                'cancelled'
            )
        )
);

COMMENT ON TABLE public.invoice_reminders IS 'Scheduled and sent reminders for invoices';


CREATE INDEX idx_reminders_invoice
ON public.invoice_reminders(invoice_id);

CREATE INDEX idx_reminders_scheduled
ON public.invoice_reminders(scheduled_at);

CREATE INDEX idx_reminders_status
ON public.invoice_reminders(status);


-- ============================================================
-- 16. INVOICE ACTIVITY LOG
-- ============================================================

CREATE TABLE public.invoice_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invoice_id UUID NOT NULL
        REFERENCES public.invoices(id)
        ON DELETE CASCADE,

    user_id UUID,

    user_name VARCHAR(255),

    action VARCHAR(100) NOT NULL,

    details JSONB
        NOT NULL DEFAULT '{}'::jsonb,

    ip_address INET,

    user_agent TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.invoice_activity_log IS 'Audit log of all invoice actions';


CREATE INDEX idx_activity_invoice
ON public.invoice_activity_log(invoice_id);

CREATE INDEX idx_activity_user
ON public.invoice_activity_log(user_id);

CREATE INDEX idx_activity_action
ON public.invoice_activity_log(action);

CREATE INDEX idx_activity_created
ON public.invoice_activity_log(created_at);


-- ============================================================
-- 17. INVOICE EVENTS (Webhooks)
-- ============================================================

CREATE TABLE public.invoice_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invoice_id UUID NOT NULL
        REFERENCES public.invoices(id)
        ON DELETE CASCADE,

    event_type VARCHAR(50) NOT NULL,
    -- created, updated, status_changed, paid, overdue, reminder_sent, etc.

    payload JSONB NOT NULL,

    processed BOOLEAN NOT NULL DEFAULT false,

    processed_at TIMESTAMPTZ,

    retry_count INTEGER NOT NULL DEFAULT 0,

    max_retries INTEGER NOT NULL DEFAULT 3,

    error_message TEXT,

    webhook_url TEXT,

    response_status INTEGER,

    response_body TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT invoice_events_retry_check
        CHECK (retry_count >= 0),

    CONSTRAINT invoice_events_max_retries_check
        CHECK (max_retries >= 0)
);

COMMENT ON TABLE public.invoice_events IS 'Event queue for webhooks and integrations';


CREATE INDEX idx_invoice_events_invoice
ON public.invoice_events(invoice_id);

CREATE INDEX idx_invoice_events_processed
ON public.invoice_events(processed, created_at)
WHERE processed = false;

CREATE INDEX idx_invoice_events_type
ON public.invoice_events(event_type);

CREATE INDEX idx_invoice_events_created_at
ON public.invoice_events(created_at);


-- ============================================================
-- 18. INVOICES ARCHIVE
-- ============================================================

CREATE TABLE public.invoices_archive (
    LIKE public.invoices INCLUDING ALL,

    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    archived_by UUID
);

COMMENT ON TABLE public.invoices_archive IS 'Archived invoices for historical retention';


CREATE INDEX idx_invoices_archive_archived_at
ON public.invoices_archive(archived_at);

CREATE INDEX idx_invoices_archive_customer
ON public.invoices_archive(customer_id);

CREATE INDEX idx_invoices_archive_invoice_number
ON public.invoices_archive(invoice_number);


-- ============================================================
-- 19. INVOICE SETTINGS
-- ============================================================

CREATE TABLE public.invoice_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- --------------------------------------------------------
    -- COMPANY
    -- --------------------------------------------------------

    company_name VARCHAR(255),

    company_logo_url TEXT,

    company_address TEXT,

    company_email VARCHAR(255),

    company_phone VARCHAR(50),

    company_tax_id VARCHAR(100),

    company_website VARCHAR(255),

    company_registration_number VARCHAR(100),

    -- --------------------------------------------------------
    -- BRANDING
    -- --------------------------------------------------------

    brand_primary_color VARCHAR(7)
        NOT NULL DEFAULT '#1a56db',

    brand_secondary_color VARCHAR(7)
        NOT NULL DEFAULT '#374151',

    brand_accent_color VARCHAR(7),

    invoice_font_family VARCHAR(100)
        NOT NULL DEFAULT 'Inter',

    invoice_logo_position VARCHAR(20)
        NOT NULL DEFAULT 'left',

    invoice_header_style VARCHAR(50)
        NOT NULL DEFAULT 'modern',

    -- --------------------------------------------------------
    -- INVOICE NUMBERING
    -- --------------------------------------------------------

    invoice_prefix VARCHAR(20)
        NOT NULL DEFAULT 'INV-',

    invoice_next_number INTEGER
        NOT NULL DEFAULT 1,

    invoice_number_padding INTEGER
        NOT NULL DEFAULT 6,

    invoice_number_format VARCHAR(100)
        NOT NULL DEFAULT '{prefix}{number}',

    -- --------------------------------------------------------
    -- INVOICE SEQUENCE RESET
    -- --------------------------------------------------------

    invoice_sequence_reset_frequency VARCHAR(20)
        NOT NULL DEFAULT 'never',
    -- never, yearly, quarterly, monthly

    invoice_sequence_last_reset DATE,

    -- --------------------------------------------------------
    -- CREDIT NOTE NUMBERING
    -- --------------------------------------------------------

    credit_note_prefix VARCHAR(20)
        NOT NULL DEFAULT 'CN-',

    credit_note_next_number INTEGER
        NOT NULL DEFAULT 1,

    credit_note_number_padding INTEGER
        NOT NULL DEFAULT 6,

    credit_note_number_format VARCHAR(100)
        NOT NULL DEFAULT '{prefix}{number}',

    -- --------------------------------------------------------
    -- DEFAULTS
    -- --------------------------------------------------------

    default_payment_terms_id UUID
        REFERENCES public.payment_terms(id)
        ON DELETE SET NULL,

    default_tax_rate_id UUID
        REFERENCES public.tax_rates(id)
        ON DELETE SET NULL,

    default_currency VARCHAR(3)
        NOT NULL DEFAULT 'KES',

    default_template_id UUID
        REFERENCES public.invoice_templates(id)
        ON DELETE SET NULL,

    default_due_days INTEGER
        NOT NULL DEFAULT 30,

    -- --------------------------------------------------------
    -- TAX
    -- --------------------------------------------------------

    default_tax_calculation VARCHAR(20)
        NOT NULL DEFAULT 'exclusive',

    -- --------------------------------------------------------
    -- PAYMENT
    -- --------------------------------------------------------

    payment_instructions TEXT,

    bank_details JSONB
        NOT NULL DEFAULT '{}'::jsonb,

    payment_gateways JSONB
        NOT NULL DEFAULT '{}'::jsonb,

    -- --------------------------------------------------------
    -- EMAIL
    -- --------------------------------------------------------

    email_enabled BOOLEAN
        NOT NULL DEFAULT true,

    email_provider VARCHAR(50)
        NOT NULL DEFAULT 'smtp',

    email_from_name VARCHAR(255),

    email_from_address VARCHAR(255),

    email_reply_to VARCHAR(255),

    email_cc TEXT,

    email_bcc TEXT,

    email_invoice_subject_template VARCHAR(255)
        NOT NULL DEFAULT
        'Invoice {invoice_number} from {company_name}',

    email_invoice_body_template TEXT,

    email_payment_subject_template VARCHAR(255)
        NOT NULL DEFAULT
        'Payment received for invoice {invoice_number}',

    email_payment_body_template TEXT,

    email_reminder_subject_template VARCHAR(255)
        NOT NULL DEFAULT
        'Payment reminder for invoice {invoice_number}',

    email_reminder_body_template TEXT,

    email_provider_config JSONB
        NOT NULL DEFAULT '{}'::jsonb,

    -- --------------------------------------------------------
    -- WHATSAPP
    -- --------------------------------------------------------

    whatsapp_enabled BOOLEAN
        NOT NULL DEFAULT false,

    whatsapp_provider VARCHAR(50),

    whatsapp_business_name VARCHAR(255),

    whatsapp_phone_number VARCHAR(50),

    whatsapp_invoice_template VARCHAR(255),

    whatsapp_payment_template VARCHAR(255),

    whatsapp_reminder_template VARCHAR(255),

    whatsapp_provider_config JSONB
        NOT NULL DEFAULT '{}'::jsonb,

    -- --------------------------------------------------------
    -- SHARING
    -- --------------------------------------------------------

    sharing_enabled BOOLEAN
        NOT NULL DEFAULT true,

    allow_public_invoice_links BOOLEAN
        NOT NULL DEFAULT true,

    allow_email_sharing BOOLEAN
        NOT NULL DEFAULT true,

    allow_whatsapp_sharing BOOLEAN
        NOT NULL DEFAULT true,

    allow_download BOOLEAN
        NOT NULL DEFAULT true,

    allow_print BOOLEAN
        NOT NULL DEFAULT true,

    allow_customer_view_tracking BOOLEAN
        NOT NULL DEFAULT true,

    public_link_expiry_days INTEGER,

    -- --------------------------------------------------------
    -- CUSTOMER ACCESS
    -- --------------------------------------------------------

    require_customer_authentication BOOLEAN
        NOT NULL DEFAULT false,

    require_invoice_password BOOLEAN
        NOT NULL DEFAULT false,

    invoice_link_password_enabled BOOLEAN
        NOT NULL DEFAULT false,

    -- --------------------------------------------------------
    -- INVOICE DISPLAY
    -- --------------------------------------------------------

    show_company_logo BOOLEAN
        NOT NULL DEFAULT true,

    show_company_address BOOLEAN
        NOT NULL DEFAULT true,

    show_company_contact BOOLEAN
        NOT NULL DEFAULT true,

    show_tax_id BOOLEAN
        NOT NULL DEFAULT true,

    show_payment_instructions BOOLEAN
        NOT NULL DEFAULT true,

    show_bank_details BOOLEAN
        NOT NULL DEFAULT true,

    show_tax_breakdown BOOLEAN
        NOT NULL DEFAULT true,

    show_discount BOOLEAN
        NOT NULL DEFAULT true,

    show_shipping BOOLEAN
        NOT NULL DEFAULT true,

    show_po_number BOOLEAN
        NOT NULL DEFAULT true,

    show_customer_tax_id BOOLEAN
        NOT NULL DEFAULT false,

    show_customer_address BOOLEAN
        NOT NULL DEFAULT true,

    show_invoice_notes BOOLEAN
        NOT NULL DEFAULT true,

    show_terms_and_conditions BOOLEAN
        NOT NULL DEFAULT true,

    -- --------------------------------------------------------
    -- REMINDERS
    -- --------------------------------------------------------

    reminder_enabled BOOLEAN
        NOT NULL DEFAULT true,

    reminder_days_before INTEGER
        NOT NULL DEFAULT 3,

    reminder_days_after INTEGER
        NOT NULL DEFAULT 1,

    reminder_after_days INTEGER
        NOT NULL DEFAULT 7,

    reminder_after_days_2 INTEGER
        NOT NULL DEFAULT 14,

    reminder_grace_period_days INTEGER
        NOT NULL DEFAULT 0,

    -- --------------------------------------------------------
    -- AUTOMATION
    -- --------------------------------------------------------

    auto_send_enabled BOOLEAN
        NOT NULL DEFAULT false,

    auto_pay_enabled BOOLEAN
        NOT NULL DEFAULT false,

    allow_partial_payments BOOLEAN
        NOT NULL DEFAULT true,

    allow_credit_notes BOOLEAN
        NOT NULL DEFAULT true,

    require_approval BOOLEAN
        NOT NULL DEFAULT false,

    -- --------------------------------------------------------
    -- TERMS
    -- --------------------------------------------------------

    terms_and_conditions TEXT,

    footer_text TEXT,

    -- --------------------------------------------------------
    -- METADATA
    -- --------------------------------------------------------

    metadata JSONB
        NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),

    -- --------------------------------------------------------
    -- VALIDATION
    -- --------------------------------------------------------

    CONSTRAINT invoice_settings_currency_check
        CHECK (char_length(default_currency) = 3),

    CONSTRAINT invoice_settings_invoice_number_check
        CHECK (invoice_next_number >= 1),

    CONSTRAINT invoice_settings_credit_number_check
        CHECK (credit_note_next_number >= 1),

    CONSTRAINT invoice_settings_invoice_padding_check
        CHECK (
            invoice_number_padding BETWEEN 1 AND 12
        ),

    CONSTRAINT invoice_settings_credit_padding_check
        CHECK (
            credit_note_number_padding BETWEEN 1 AND 12
        ),

    CONSTRAINT invoice_settings_due_days_check
        CHECK (default_due_days >= 0),

    CONSTRAINT invoice_settings_tax_check
        CHECK (
            default_tax_calculation IN (
                'exclusive',
                'inclusive'
            )
        ),

    CONSTRAINT invoice_settings_logo_position_check
        CHECK (
            invoice_logo_position IN (
                'left',
                'center',
                'right'
            )
        ),

    CONSTRAINT invoice_settings_expiry_check
        CHECK (
            public_link_expiry_days IS NULL
            OR public_link_expiry_days > 0
        ),

    CONSTRAINT invoice_settings_reminder_before_check
        CHECK (reminder_days_before >= 0),

    CONSTRAINT invoice_settings_reminder_after_check
        CHECK (reminder_days_after >= 0),

    CONSTRAINT invoice_settings_reminder_7_check
        CHECK (reminder_after_days >= 0),

    CONSTRAINT invoice_settings_reminder_14_check
        CHECK (reminder_after_days_2 >= 0),

    CONSTRAINT invoice_settings_grace_check
        CHECK (reminder_grace_period_days >= 0),

    CONSTRAINT invoice_settings_sequence_reset_check
        CHECK (
            invoice_sequence_reset_frequency IN (
                'never',
                'yearly',
                'quarterly',
                'monthly'
            )
        )
);

COMMENT ON TABLE public.invoice_settings IS 'System-wide invoice configuration (singleton)';
COMMENT ON COLUMN public.invoice_settings.invoice_sequence_reset_frequency IS 'How often to reset invoice numbering sequence';
COMMENT ON COLUMN public.invoice_settings.invoice_sequence_last_reset IS 'Date when sequence was last reset';


CREATE UNIQUE INDEX uq_invoice_settings_singleton
ON public.invoice_settings ((true));


-- ============================================================
-- 20. STATUS TRANSITION VALIDATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_invoice_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Skip validation for new invoices or if status hasn't changed
    IF TG_OP = 'INSERT' OR OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Define allowed transitions
    -- draft → pending_approval, sent, cancelled, void
    -- pending_approval → sent, cancelled, void
    -- sent → viewed, overdue, partially_paid, paid, cancelled, void
    -- viewed → overdue, partially_paid, paid, cancelled, void
    -- partially_paid → paid, overdue, cancelled, void
    -- overdue → partially_paid, paid, cancelled, void
    -- paid → cancelled (only with refund), void
    -- cancelled → (no transitions)
    -- void → (no transitions)

    -- Paid invoice restrictions
    IF OLD.status = 'paid' AND NEW.status IN ('cancelled', 'void') THEN
        RAISE EXCEPTION 'Cannot cancel or void a paid invoice. Issue a credit note instead.';
    END IF;

    -- Cancelled/void invoices cannot be changed
    IF OLD.status IN ('cancelled', 'void') THEN
        RAISE EXCEPTION 'Cannot change status of a cancelled or void invoice.';
    END IF;

    -- Draft invoice cannot go to paid directly
    IF OLD.status = 'draft' AND NEW.status = 'paid' THEN
        RAISE EXCEPTION 'Cannot mark a draft invoice as paid. Send it first.';
    END IF;

    -- Draft invoice cannot go to overdue or viewed
    IF OLD.status = 'draft' AND NEW.status IN ('overdue', 'viewed') THEN
        RAISE EXCEPTION 'Invalid status transition from draft to %', NEW.status;
    END IF;

    -- Pending approval cannot go to viewed/overdue/paid directly
    IF OLD.status = 'pending_approval' AND NEW.status IN ('viewed', 'overdue', 'paid', 'partially_paid') THEN
        RAISE EXCEPTION 'Cannot transition from pending_approval to %. Must be sent first.', NEW.status;
    END IF;

    -- Sent invoice cannot go directly to partially_paid without being viewed
    -- (allow this though, as some systems automatically send and receive payments)

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_invoice_status_transition()
IS 'Validates invoice status transitions to prevent invalid state changes';


CREATE TRIGGER validate_invoice_status_transition_trigger
BEFORE INSERT OR UPDATE OF status
ON public.invoices
FOR EACH ROW
WHEN (TG_OP = 'UPDATE' OR (TG_OP = 'INSERT' AND NEW.status IS NOT NULL))
EXECUTE FUNCTION public.validate_invoice_status_transition();


-- ============================================================
-- 21. CUSTOMER CREDIT LIMIT ENFORCEMENT
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_customer_credit_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_credit_limit NUMERIC(19,4);
    v_total_outstanding NUMERIC(19,4);
    v_existing_total NUMERIC(19,4);
    v_delta NUMERIC(19,4);
BEGIN
    -- Only enforce for non-draft, non-cancelled, non-void invoices
    IF NEW.status IN ('draft', 'cancelled', 'void') THEN
        RETURN NEW;
    END IF;

    -- Get customer credit limit
    SELECT credit_limit INTO v_credit_limit
    FROM public.customers
    WHERE id = NEW.customer_id;

    -- No limit set, skip enforcement
    IF v_credit_limit IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get total outstanding for this customer (excluding current invoice)
    SELECT COALESCE(SUM(amount_due), 0) INTO v_total_outstanding
    FROM public.invoices
    WHERE customer_id = NEW.customer_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
      AND status NOT IN ('paid', 'cancelled', 'void', 'draft');

    -- Calculate the change in outstanding amount
    IF TG_OP = 'INSERT' THEN
        v_delta = NEW.total_amount;
    ELSIF TG_OP = 'UPDATE' THEN
        -- If status changed from draft to something else, add the full amount
        IF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'cancelled', 'void') THEN
            v_delta = NEW.total_amount;
        ELSE
            -- Otherwise, adjust by the difference
            v_delta = NEW.total_amount - OLD.total_amount;
        END IF;
    ELSE
        RETURN NEW;
    END IF;

    -- Check if new total would exceed credit limit
    IF (v_total_outstanding + v_delta) > v_credit_limit THEN
        RAISE EXCEPTION 'Customer credit limit of % would be exceeded. Current outstanding: %, New invoice: %, Total would be: %, Limit: %',
            v_credit_limit, v_total_outstanding, v_delta, (v_total_outstanding + v_delta), v_credit_limit;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_customer_credit_limit()
IS 'Enforces customer credit limits when creating or updating invoices';


CREATE TRIGGER enforce_customer_credit_limit
BEFORE INSERT OR UPDATE OF status, total_amount
ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.check_customer_credit_limit();


-- ============================================================
-- 22. UPDATED_AT TRIGGERS
-- ============================================================

CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payment_terms_updated_at
BEFORE UPDATE ON public.payment_terms
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tax_rates_updated_at
BEFORE UPDATE ON public.tax_rates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoice_templates_updated_at
BEFORE UPDATE ON public.invoice_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoice_items_updated_at
BEFORE UPDATE ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_credit_notes_updated_at
BEFORE UPDATE ON public.credit_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recurring_invoices_updated_at
BEFORE UPDATE ON public.recurring_invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoice_reminders_updated_at
BEFORE UPDATE ON public.invoice_reminders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoice_settings_updated_at
BEFORE UPDATE ON public.invoice_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 23. PAYMENT → INVOICE CALCULATION (Enhanced)
-- ============================================================

CREATE OR REPLACE FUNCTION public.recalculate_invoice_payment_state(
    p_invoice_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_total NUMERIC(19,4);
    v_paid NUMERIC(19,4);
    v_due NUMERIC(19,4);
    v_status VARCHAR(50);
    v_current_status VARCHAR(50);
    v_due_date DATE;
    v_latest_payment_date TIMESTAMPTZ;
BEGIN

    SELECT
        total_amount,
        status,
        due_date
    INTO
        v_total,
        v_current_status,
        v_due_date
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT
        COALESCE(SUM(amount), 0)
    INTO
        v_paid
    FROM public.payments
    WHERE invoice_id = p_invoice_id
      AND status = 'completed';

    -- Get the latest payment date for paid invoices
    SELECT MAX(payment_date) INTO v_latest_payment_date
    FROM public.payments
    WHERE invoice_id = p_invoice_id
      AND status = 'completed';

    v_paid := LEAST(v_paid, v_total);

    v_due := GREATEST(v_total - v_paid, 0);

    -- Determine status
    IF v_current_status IN (
        'draft',
        'pending_approval',
        'cancelled',
        'void'
    ) THEN

        v_status := v_current_status;

    ELSIF v_paid >= v_total
      AND v_total > 0 THEN

        v_status := 'paid';

    ELSIF v_paid > 0 THEN

        v_status := 'partially_paid';

    ELSIF v_due_date IS NOT NULL
      AND v_due_date < CURRENT_DATE THEN

        v_status := 'overdue';

    ELSE

        -- Preserve viewed/sent where appropriate.
        IF v_current_status = 'viewed' THEN
            v_status := 'viewed';
        ELSE
            v_status := 'sent';
        END IF;

    END IF;

    UPDATE public.invoices
    SET
        amount_paid = v_paid,
        amount_due = v_due,
        status = v_status,
        payment_date = CASE
            WHEN v_status = 'paid' AND v_latest_payment_date IS NOT NULL
                THEN v_latest_payment_date::DATE
            WHEN v_status = 'paid'
                THEN CURRENT_DATE
            ELSE payment_date
        END
    WHERE id = p_invoice_id;

END;
$$;

COMMENT ON FUNCTION public.recalculate_invoice_payment_state(UUID)
IS 'Recalculates invoice payment status and amounts based on completed payments';


-- ============================================================
-- 24. PAYMENT CHANGE TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_payment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    IF TG_OP = 'DELETE' THEN

        PERFORM public.recalculate_invoice_payment_state(
            OLD.invoice_id
        );

        RETURN OLD;

    ELSIF TG_OP = 'UPDATE' THEN

        -- Recalculate old invoice if invoice_id changed.
        IF OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN

            PERFORM public.recalculate_invoice_payment_state(
                OLD.invoice_id
            );

        END IF;

        PERFORM public.recalculate_invoice_payment_state(
            NEW.invoice_id
        );

        RETURN NEW;

    ELSE

        PERFORM public.recalculate_invoice_payment_state(
            NEW.invoice_id
        );

        RETURN NEW;

    END IF;

END;
$$;

COMMENT ON FUNCTION public.handle_payment_change()
IS 'Triggers invoice payment state recalculation on payment changes';


CREATE TRIGGER update_invoice_payment_state
AFTER INSERT OR UPDATE OR DELETE
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.handle_payment_change();


-- ============================================================
-- 25. INVOICE NUMBER GENERATION (Enhanced)
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
    v_number INTEGER;
    v_prefix VARCHAR(20);
    v_padding INTEGER;
    v_format VARCHAR(100);
    v_result VARCHAR(100);
    v_reset_freq VARCHAR(20);
    v_last_reset DATE;
    v_current_date DATE := CURRENT_DATE;
    v_should_reset BOOLEAN := false;
BEGIN

    SELECT
        invoice_next_number,
        invoice_prefix,
        invoice_number_padding,
        invoice_number_format,
        invoice_sequence_reset_frequency,
        invoice_sequence_last_reset
    INTO
        v_number,
        v_prefix,
        v_padding,
        v_format,
        v_reset_freq,
        v_last_reset
    FROM public.invoice_settings
    LIMIT 1
    FOR UPDATE;

    IF v_number IS NULL THEN
        RAISE EXCEPTION
            'Invoice settings have not been initialized';
    END IF;

    -- Check if sequence should be reset
    IF v_reset_freq != 'never' THEN
        v_should_reset := CASE
            WHEN v_reset_freq = 'yearly' AND (
                v_last_reset IS NULL
                OR EXTRACT(YEAR FROM v_last_reset) != EXTRACT(YEAR FROM v_current_date)
            ) THEN true
            WHEN v_reset_freq = 'quarterly' AND (
                v_last_reset IS NULL
                OR EXTRACT(QUARTER FROM v_last_reset) != EXTRACT(QUARTER FROM v_current_date)
                OR EXTRACT(YEAR FROM v_last_reset) != EXTRACT(YEAR FROM v_current_date)
            ) THEN true
            WHEN v_reset_freq = 'monthly' AND (
                v_last_reset IS NULL
                OR EXTRACT(MONTH FROM v_last_reset) != EXTRACT(MONTH FROM v_current_date)
                OR EXTRACT(YEAR FROM v_last_reset) != EXTRACT(YEAR FROM v_current_date)
            ) THEN true
            ELSE false
        END;

        IF v_should_reset THEN
            v_number := 1;
            UPDATE public.invoice_settings
            SET
                invoice_next_number = 2,
                invoice_sequence_last_reset = v_current_date;
        END IF;
    END IF;

    v_result := REPLACE(
        v_format,
        '{prefix}',
        v_prefix
    );

    -- Add support for year and month in format
    v_result := REPLACE(
        v_result,
        '{year}',
        TO_CHAR(v_current_date, 'YYYY')
    );

    v_result := REPLACE(
        v_result,
        '{month}',
        TO_CHAR(v_current_date, 'MM')
    );

    v_result := REPLACE(
        v_result,
        '{day}',
        TO_CHAR(v_current_date, 'DD')
    );

    v_result := REPLACE(
        v_result,
        '{fiscal_year}',
        CASE
            WHEN EXTRACT(MONTH FROM v_current_date) >= 7
                THEN EXTRACT(YEAR FROM v_current_date) + 1
            ELSE EXTRACT(YEAR FROM v_current_date)
        END::TEXT
    );

    v_result := REPLACE(
        v_result,
        '{number}',
        LPAD(
            v_number::TEXT,
            v_padding,
            '0'
        )
    );

    IF NOT v_should_reset THEN
        UPDATE public.invoice_settings
        SET invoice_next_number = v_number + 1;
    END IF;

    RETURN v_result;

END;
$$;

COMMENT ON FUNCTION public.generate_invoice_number()
IS 'Generates next invoice number with sequence reset support';


-- ============================================================
-- 26. CREDIT NOTE NUMBER GENERATION (Enhanced)
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_credit_note_number()
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
    v_number INTEGER;
    v_prefix VARCHAR(20);
    v_padding INTEGER;
    v_format VARCHAR(100);
    v_result VARCHAR(100);
    v_current_date DATE := CURRENT_DATE;
BEGIN

    SELECT
        credit_note_next_number,
        credit_note_prefix,
        credit_note_number_padding,
        credit_note_number_format
    INTO
        v_number,
        v_prefix,
        v_padding,
        v_format
    FROM public.invoice_settings
    LIMIT 1
    FOR UPDATE;

    IF v_number IS NULL THEN
        RAISE EXCEPTION
            'Invoice settings have not been initialized';
    END IF;

    v_result := REPLACE(
        v_format,
        '{prefix}',
        v_prefix
    );

    v_result := REPLACE(
        v_result,
        '{year}',
        TO_CHAR(v_current_date, 'YYYY')
    );

    v_result := REPLACE(
        v_result,
        '{month}',
        TO_CHAR(v_current_date, 'MM')
    );

    v_result := REPLACE(
        v_result,
        '{number}',
        LPAD(
            v_number::TEXT,
            v_padding,
            '0'
        )
    );

    UPDATE public.invoice_settings
    SET credit_note_next_number = v_number + 1;

    RETURN v_result;

END;
$$;

COMMENT ON FUNCTION public.generate_credit_note_number()
IS 'Generates next credit note number';


-- ============================================================
-- 27. AUTOMATIC OVERDUE FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN

    UPDATE public.invoices
    SET status = 'overdue'
    WHERE due_date < CURRENT_DATE
      AND amount_due > 0
      AND status IN (
          'sent',
          'viewed'
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Create events for overdue invoices
    INSERT INTO public.invoice_events (
        invoice_id,
        event_type,
        payload
    )
    SELECT
        id,
        'overdue',
        jsonb_build_object(
            'invoice_number', invoice_number,
            'customer_id', customer_id,
            'amount_due', amount_due,
            'due_date', due_date
        )
    FROM public.invoices
    WHERE status = 'overdue'
      AND amount_due > 0
      AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_events
          WHERE invoice_id = invoices.id
            AND event_type = 'overdue'
            AND processed = false
      );

    RETURN v_count;

END;
$$;

COMMENT ON FUNCTION public.mark_overdue_invoices()
IS 'Marks overdue invoices and creates events for them';


-- ============================================================
-- 28. INVOICE ARCHIVE FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.archive_invoices(
    p_before_date DATE,
    p_statuses VARCHAR[] DEFAULT ARRAY['paid', 'cancelled', 'void']
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN

    -- Move invoices to archive
    INSERT INTO public.invoices_archive (
        id, customer_id, invoice_number, issue_date, due_date,
        payment_date, sent_at, viewed_at, approved_at, status,
        subtotal, discount_type, discount_value, discount_amount,
        tax_calculation_method, tax_amount, shipping_cost, shipping_tax,
        rounding_adjustment, rounded_total, total_amount, amount_paid,
        amount_due, po_number, currency, exchange_rate, payment_terms_id,
        payment_terms_display, fiscal_year, fiscal_period, template_id,
        created_by, approved_by, cancelled_by, cancelled_reason,
        reminder_count, last_reminder_sent_at, next_reminder_at,
        notes, internal_notes, footer_text, attachments,
        deleted_at, deleted_by, metadata, created_at, updated_at,
        archived_at, archived_by
    )
    SELECT
        id, customer_id, invoice_number, issue_date, due_date,
        payment_date, sent_at, viewed_at, approved_at, status,
        subtotal, discount_type, discount_value, discount_amount,
        tax_calculation_method, tax_amount, shipping_cost, shipping_tax,
        rounding_adjustment, rounded_total, total_amount, amount_paid,
        amount_due, po_number, currency, exchange_rate, payment_terms_id,
        payment_terms_display, fiscal_year, fiscal_period, template_id,
        created_by, approved_by, cancelled_by, cancelled_reason,
        reminder_count, last_reminder_sent_at, next_reminder_at,
        notes, internal_notes, footer_text, attachments,
        deleted_at, deleted_by, metadata, created_at, updated_at,
        NOW(), NULL
    FROM public.invoices
    WHERE due_date < p_before_date
      AND status = ANY(p_statuses)
      AND deleted_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Delete archived invoices from main table
    DELETE FROM public.invoices
    WHERE due_date < p_before_date
      AND status = ANY(p_statuses)
      AND deleted_at IS NULL;

    RETURN v_count;

END;
$$;

COMMENT ON FUNCTION public.archive_invoices(DATE, VARCHAR[])
IS 'Archives old invoices based on date and status';


-- ============================================================
-- 29. REPORTING VIEWS
-- ============================================================

-- Monthly invoice summary view
CREATE OR REPLACE VIEW public.invoice_monthly_summary AS
SELECT
    DATE_TRUNC('month', issue_date) AS month,
    status,
    COUNT(*) AS invoice_count,
    SUM(total_amount) AS total_amount,
    SUM(amount_paid) AS total_paid,
    SUM(amount_due) AS total_outstanding,
    AVG(total_amount) AS average_invoice_amount,
    MIN(issue_date) AS first_invoice_date,
    MAX(issue_date) AS last_invoice_date
FROM public.invoices
WHERE deleted_at IS NULL
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

COMMENT ON VIEW public.invoice_monthly_summary IS 'Monthly summary of invoices by status';


-- Customer aging report view
CREATE OR REPLACE VIEW public.customer_aging_report AS
WITH aging AS (
    SELECT
        customer_id,
        SUM(CASE
            WHEN due_date >= CURRENT_DATE THEN 0
            WHEN due_date >= CURRENT_DATE - INTERVAL '30 days' THEN amount_due
            ELSE 0
        END) AS current_30,
        SUM(CASE
            WHEN due_date < CURRENT_DATE - INTERVAL '30 days'
                AND due_date >= CURRENT_DATE - INTERVAL '60 days' THEN amount_due
            ELSE 0
        END) AS days_31_60,
        SUM(CASE
            WHEN due_date < CURRENT_DATE - INTERVAL '60 days'
                AND due_date >= CURRENT_DATE - INTERVAL '90 days' THEN amount_due
            ELSE 0
        END) AS days_61_90,
        SUM(CASE
            WHEN due_date < CURRENT_DATE - INTERVAL '90 days' THEN amount_due
            ELSE 0
        END) AS days_91_plus,
        SUM(amount_due) AS total_outstanding
    FROM public.invoices
    WHERE status NOT IN ('paid', 'cancelled', 'void')
      AND deleted_at IS NULL
    GROUP BY customer_id
)
SELECT
    c.id,
    c.company_name,
    c.email,
    c.phone,
    a.current_30,
    a.days_31_60,
    a.days_61_90,
    a.days_91_plus,
    a.total_outstanding,
    c.credit_limit,
    CASE
        WHEN c.credit_limit IS NOT NULL
            AND a.total_outstanding > c.credit_limit
            THEN true
        ELSE false
    END AS credit_limit_exceeded
FROM public.customers c
JOIN aging a ON c.id = a.customer_id
WHERE c.deleted_at IS NULL
ORDER BY a.total_outstanding DESC;

COMMENT ON VIEW public.customer_aging_report IS 'Customer accounts receivable aging report';


-- Payment reconciliation view
CREATE OR REPLACE VIEW public.payment_reconciliation AS
SELECT
    p.id AS payment_id,
    p.invoice_id,
    i.invoice_number,
    p.amount,
    p.currency,
    p.payment_method,
    p.payment_date,
    p.status,
    p.reconciled,
    p.reconciled_at,
    p.transaction_reference,
    i.customer_id,
    c.company_name,
    COALESCE(pa.allocated_amount, 0) AS allocated_amount,
    p.amount - COALESCE(pa.allocated_amount, 0) AS unallocated_amount
FROM public.payments p
JOIN public.invoices i ON p.invoice_id = i.id
JOIN public.customers c ON i.customer_id = c.id
LEFT JOIN (
    SELECT
        payment_id,
        SUM(amount) AS allocated_amount
    FROM public.payment_allocations
    GROUP BY payment_id
) pa ON p.id = pa.payment_id
WHERE i.deleted_at IS NULL
ORDER BY p.payment_date DESC;

COMMENT ON VIEW public.payment_reconciliation IS 'Payment reconciliation with allocation details';


-- ============================================================
-- 30. DEFAULT SEED DATA
-- ============================================================

-- Payment Terms
INSERT INTO public.payment_terms (
    name,
    description,
    due_days,
    discount_percentage,
    discount_days,
    is_default,
    sort_order
)
VALUES
(
    'Due on Receipt',
    'Payment is due immediately',
    0,
    0,
    NULL,
    true,
    1
),
(
    'Net 15',
    'Payment due within 15 days',
    15,
    0,
    NULL,
    false,
    2
),
(
    'Net 30',
    'Payment due within 30 days',
    30,
    0,
    NULL,
    false,
    3
),
(
    'Net 60',
    'Payment due within 60 days',
    60,
    0,
    NULL,
    false,
    4
)
ON CONFLICT (id) DO NOTHING;


-- Tax Rates
INSERT INTO public.tax_rates (
    name,
    rate,
    tax_type,
    country,
    is_default,
    sort_order
)
VALUES
(
    'No Tax',
    0,
    'none',
    NULL,
    false,
    1
),
(
    'VAT 16%',
    16,
    'vat',
    'Kenya',
    true,
    2
),
(
    'VAT 20%',
    20,
    'vat',
    NULL,
    false,
    3
),
(
    'VAT 10%',
    10,
    'vat',
    NULL,
    false,
    4
),
(
    'GST 10%',
    10,
    'gst',
    NULL,
    false,
    5
),
(
    'Sales Tax 8%',
    8,
    'sales_tax',
    NULL,
    false,
    6
)
ON CONFLICT (id) DO NOTHING;


-- Default Invoice Template
INSERT INTO public.invoice_templates (
    name,
    is_default,
    primary_color,
    secondary_color,
    font_family,
    logo_position,
    header_style,
    show_company_logo,
    show_company_address,
    show_company_contact,
    show_tax_id,
    show_payment_instructions,
    show_bank_details,
    show_tax_breakdown,
    show_discount,
    show_shipping,
    show_po_number
)
VALUES (
    'Default Modern',
    true,
    '#1a56db',
    '#374151',
    'Inter',
    'left',
    'modern',
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 31. INITIAL INVOICE SETTINGS
-- ============================================================

INSERT INTO public.invoice_settings (
    company_name,

    invoice_prefix,
    invoice_next_number,
    invoice_number_padding,
    invoice_number_format,
    invoice_sequence_reset_frequency,

    credit_note_prefix,
    credit_note_next_number,
    credit_note_number_padding,
    credit_note_number_format,

    default_currency,
    default_due_days,

    default_tax_calculation,

    email_enabled,
    email_provider,

    whatsapp_enabled,

    sharing_enabled,
    allow_public_invoice_links,
    allow_email_sharing,
    allow_whatsapp_sharing,
    allow_download,
    allow_print,
    allow_customer_view_tracking,

    reminder_enabled,
    reminder_days_before,
    reminder_days_after,
    reminder_after_days,
    reminder_after_days_2,

    allow_partial_payments,
    allow_credit_notes,

    auto_send_enabled,
    auto_pay_enabled,
    require_approval
)
SELECT
    NULL,

    'INV-',
    1,
    6,
    '{prefix}{number}',
    'never',

    'CN-',
    1,
    6,
    '{prefix}{number}',

    'KES',
    30,

    'exclusive',

    true,
    'smtp',

    false,

    true,
    true,
    true,
    true,
    true,
    true,
    true,

    true,
    3,
    1,
    7,
    14,

    true,
    true,

    false,
    false,
    false
WHERE NOT EXISTS (
    SELECT 1
    FROM public.invoice_settings
);


-- ============================================================
-- 32. LINK DEFAULT SETTINGS TO DEFAULT DATA
-- ============================================================

UPDATE public.invoice_settings
SET
    default_payment_terms_id = (
        SELECT id
        FROM public.payment_terms
        WHERE LOWER(name) = 'net 30'
        LIMIT 1
    ),

    default_tax_rate_id = (
        SELECT id
        FROM public.tax_rates
        WHERE LOWER(name) = 'vat 16%'
        LIMIT 1
    ),

    default_template_id = (
        SELECT id
        FROM public.invoice_templates
        WHERE LOWER(name) = 'default modern'
        LIMIT 1
    )
WHERE default_payment_terms_id IS NULL
   OR default_tax_rate_id IS NULL
   OR default_template_id IS NULL;


-- ============================================================
-- 33. ENSURE ONLY ONE DEFAULT PAYMENT TERM
-- ============================================================

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            ORDER BY sort_order, created_at
        ) AS rn
    FROM public.payment_terms
    WHERE is_default = true
)
UPDATE public.payment_terms pt
SET is_default = (ranked.rn = 1)
FROM ranked
WHERE pt.id = ranked.id;


-- ============================================================
-- 34. ENSURE ONLY ONE DEFAULT TAX RATE
-- ============================================================

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            ORDER BY sort_order, created_at
        ) AS rn
    FROM public.tax_rates
    WHERE is_default = true
)
UPDATE public.tax_rates tr
SET is_default = (ranked.rn = 1)
FROM ranked
WHERE tr.id = ranked.id;


-- ============================================================
-- 35. ENSURE ONLY ONE DEFAULT TEMPLATE
-- ============================================================

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            ORDER BY created_at
        ) AS rn
    FROM public.invoice_templates
    WHERE is_default = true
)
UPDATE public.invoice_templates it
SET is_default = (ranked.rn = 1)
FROM ranked
WHERE it.id = ranked.id;


-- ============================================================
-- 36. FINAL VERIFICATION QUERIES
-- ============================================================

SELECT
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
      'customers',
      'payment_terms',
      'tax_rates',
      'products',
      'invoice_templates',
      'invoices',
      'invoice_status_history',
      'invoice_items',
      'payments',
      'payment_allocations',
      'credit_notes',
      'recurring_invoices',
      'invoice_reminders',
      'invoice_activity_log',
      'invoice_events',
      'invoices_archive',
      'invoice_settings'
  )
ORDER BY table_name;

-- Check views
SELECT
    view_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND view_name IN (
      'invoice_monthly_summary',
      'customer_aging_report',
      'payment_reconciliation'
  )
ORDER BY view_name;

-- Count rows
SELECT
    COUNT(*) AS invoice_settings_rows
FROM public.invoice_settings;

SELECT
    COUNT(*) AS payment_terms
FROM public.payment_terms;

SELECT
    COUNT(*) AS tax_rates
FROM public.tax_rates;

SELECT
    COUNT(*) AS invoice_templates
FROM public.invoice_templates;

-- ============================================================
-- END OF SaMi ASSIST INVOICE MODULE SCHEMA v3.0
-- ============================================================