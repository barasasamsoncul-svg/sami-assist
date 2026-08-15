-- ============================================================
-- SaMi Assist - Invoice App
-- MIGRATION: Invoice App v1 -> v2
--
-- Purpose:
--   Upgrade EXISTING tenant databases safely.
--
-- Important:
--   This migration is intentionally idempotent.
--   It can be executed more than once.
--
--   It does NOT use its own BEGIN/COMMIT.
--   The migration runner controls the transaction.
-- ============================================================


-- ============================================================
-- 1. PAYMENT TERMS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payment_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    due_days INTEGER NOT NULL DEFAULT 30,
    discount_percentage NUMERIC(5,2) DEFAULT 0,
    discount_days INTEGER,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 2. TAX RATES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tax_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    rate NUMERIC(5,2) NOT NULL,
    tax_type VARCHAR(50) DEFAULT 'vat',
    country VARCHAR(100),
    region VARCHAR(100),
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 3. CUSTOMERS
--
-- Existing customers table may be older.
-- ADD missing columns instead of relying on CREATE TABLE.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    website VARCHAR(255),
    billing_address TEXT,
    shipping_address TEXT,
    tax_id VARCHAR(100),
    tax_id_type VARCHAR(50) DEFAULT 'vat',
    registration_number VARCHAR(100),
    currency VARCHAR(3) DEFAULT 'USD',
    payment_terms_id UUID,
    credit_limit NUMERIC(15,2),
    customer_type VARCHAR(50) DEFAULT 'company',
    industry VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS company_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS website VARCHAR(255),
    ADD COLUMN IF NOT EXISTS billing_address TEXT,
    ADD COLUMN IF NOT EXISTS shipping_address TEXT,
    ADD COLUMN IF NOT EXISTS tax_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS tax_id_type VARCHAR(50) DEFAULT 'vat',
    ADD COLUMN IF NOT EXISTS registration_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS payment_terms_id UUID,
    ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS customer_type VARCHAR(50) DEFAULT 'company',
    ADD COLUMN IF NOT EXISTS industry VARCHAR(100),
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.customers
SET currency = 'USD'
WHERE currency IS NULL;

UPDATE public.customers
SET customer_type = 'company'
WHERE customer_type IS NULL;

UPDATE public.customers
SET status = 'active'
WHERE status IS NULL;


-- ============================================================
-- 4. PRODUCTS / SERVICES
--
-- IMPORTANT:
-- Existing products table may NOT have tax_rate_id.
-- This explicitly adds it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sku VARCHAR(100) UNIQUE,
    unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_rate_id UUID,
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS sku VARCHAR(100),
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_rate_id UUID,
    ADD COLUMN IF NOT EXISTS category VARCHAR(100),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.products
SET unit_price = 0
WHERE unit_price IS NULL;

UPDATE public.products
SET is_active = true
WHERE is_active IS NULL;


-- ============================================================
-- 5. INVOICE TEMPLATES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoice_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,

    primary_color VARCHAR(7) DEFAULT '#1a56db',
    secondary_color VARCHAR(7) DEFAULT '#374151',
    logo_url TEXT,
    font_family VARCHAR(100) DEFAULT 'Inter, sans-serif',

    show_payment_instructions BOOLEAN DEFAULT true,
    show_bank_details BOOLEAN DEFAULT true,
    show_tax_breakdown BOOLEAN DEFAULT true,
    show_discount BOOLEAN DEFAULT true,
    show_shipping BOOLEAN DEFAULT true,
    show_po_number BOOLEAN DEFAULT true,

    header_text TEXT,
    footer_text TEXT,
    payment_instructions TEXT,
    bank_details TEXT,
    terms_and_conditions TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.invoice_templates
    ADD COLUMN IF NOT EXISTS name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) DEFAULT '#1a56db',
    ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) DEFAULT '#374151',
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS font_family VARCHAR(100) DEFAULT 'Inter, sans-serif',
    ADD COLUMN IF NOT EXISTS show_payment_instructions BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_bank_details BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_tax_breakdown BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_discount BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_shipping BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_po_number BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS header_text TEXT,
    ADD COLUMN IF NOT EXISTS footer_text TEXT,
    ADD COLUMN IF NOT EXISTS payment_instructions TEXT,
    ADD COLUMN IF NOT EXISTS bank_details TEXT,
    ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();


-- ============================================================
-- 6. INVOICES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    customer_id UUID NOT NULL,

    invoice_number VARCHAR(100) NOT NULL UNIQUE,

    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    payment_date DATE,
    sent_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,

    status VARCHAR(50) NOT NULL DEFAULT 'draft',

    subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,

    discount_type VARCHAR(20),
    discount_value NUMERIC(15,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,

    tax_calculation_method VARCHAR(20) DEFAULT 'exclusive',
    tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,

    shipping_cost NUMERIC(15,2) DEFAULT 0,
    shipping_tax NUMERIC(15,2) DEFAULT 0,

    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0,
    amount_due NUMERIC(15,2) NOT NULL DEFAULT 0,

    po_number VARCHAR(100),
    currency VARCHAR(3) DEFAULT 'USD',
    exchange_rate NUMERIC(10,4) DEFAULT 1,

    payment_terms_id UUID,
    payment_terms_display VARCHAR(50),

    template_id UUID,

    created_by UUID,
    approved_by UUID,
    cancelled_by UUID,
    cancelled_reason TEXT,

    reminder_count INTEGER DEFAULT 0,
    last_reminder_sent_at TIMESTAMPTZ,
    next_reminder_at TIMESTAMPTZ,

    notes TEXT,
    internal_notes TEXT,
    footer_text TEXT,

    attachments JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS customer_id UUID,
    ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS issue_date DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS due_date DATE,
    ADD COLUMN IF NOT EXISTS payment_date DATE,
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS subtotal NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS discount_value NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_calculation_method VARCHAR(20) DEFAULT 'exclusive',
    ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shipping_tax NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS amount_due NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS po_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,4) DEFAULT 1,
    ADD COLUMN IF NOT EXISTS payment_terms_id UUID,
    ADD COLUMN IF NOT EXISTS payment_terms_display VARCHAR(50),
    ADD COLUMN IF NOT EXISTS template_id UUID,
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS approved_by UUID,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID,
    ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
    ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS next_reminder_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS internal_notes TEXT,
    ADD COLUMN IF NOT EXISTS footer_text TEXT,
    ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.invoices
SET currency = 'USD'
WHERE currency IS NULL;

UPDATE public.invoices
SET exchange_rate = 1
WHERE exchange_rate IS NULL;

UPDATE public.invoices
SET tax_calculation_method = 'exclusive'
WHERE tax_calculation_method IS NULL;

UPDATE public.invoices
SET discount_value = 0
WHERE discount_value IS NULL;

UPDATE public.invoices
SET discount_amount = 0
WHERE discount_amount IS NULL;

UPDATE public.invoices
SET shipping_cost = 0
WHERE shipping_cost IS NULL;

UPDATE public.invoices
SET shipping_tax = 0
WHERE shipping_tax IS NULL;

UPDATE public.invoices
SET amount_paid = 0
WHERE amount_paid IS NULL;

UPDATE public.invoices
SET amount_due = total_amount - amount_paid
WHERE amount_due IS NULL;


-- ============================================================
-- 7. INVOICE ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL,
    product_id UUID,

    description TEXT NOT NULL,
    quantity NUMERIC(15,2) NOT NULL DEFAULT 1,
    unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,

    discount_type VARCHAR(20),
    discount_value NUMERIC(15,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,

    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    tax_rate_id UUID,

    line_total NUMERIC(15,2) NOT NULL DEFAULT 0,

    sort_order INTEGER DEFAULT 0,

    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.invoice_items
    ADD COLUMN IF NOT EXISTS invoice_id UUID,
    ADD COLUMN IF NOT EXISTS product_id UUID,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS quantity NUMERIC(15,2) DEFAULT 1,
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS discount_value NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_rate_id UUID,
    ADD COLUMN IF NOT EXISTS line_total NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();


-- ============================================================
-- 8. PAYMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL,

    amount NUMERIC(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    exchange_rate NUMERIC(10,4) DEFAULT 1,

    payment_method VARCHAR(50) NOT NULL,
    payment_method_details JSONB,

    transaction_reference VARCHAR(255),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    status VARCHAR(50) NOT NULL DEFAULT 'pending',

    reconciled BOOLEAN DEFAULT false,
    reconciled_at TIMESTAMPTZ,
    reconciled_by UUID,

    notes TEXT,

    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS invoice_id UUID,
    ADD COLUMN IF NOT EXISTS amount NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,4) DEFAULT 1,
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
    ADD COLUMN IF NOT EXISTS payment_method_details JSONB,
    ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(255),
    ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS reconciled BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reconciled_by UUID,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.payments
SET currency = 'USD'
WHERE currency IS NULL;

UPDATE public.payments
SET exchange_rate = 1
WHERE exchange_rate IS NULL;

UPDATE public.payments
SET reconciled = false
WHERE reconciled IS NULL;


-- ============================================================
-- 9. CREDIT NOTES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invoice_id UUID NOT NULL,
    customer_id UUID NOT NULL,

    credit_note_number VARCHAR(100) NOT NULL UNIQUE,

    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,

    amount NUMERIC(15,2) NOT NULL,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',

    status VARCHAR(50) DEFAULT 'issued',

    applied_to_invoice_id UUID,
    applied_amount NUMERIC(15,2),
    applied_at TIMESTAMPTZ,

    reason VARCHAR(255) NOT NULL,
    reason_details TEXT,

    created_by UUID,

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 10. RECURRING INVOICES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.recurring_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    customer_id UUID NOT NULL,
    template_id UUID,
    payment_terms_id UUID,

    frequency VARCHAR(50) NOT NULL,
    interval_value INTEGER DEFAULT 1,

    start_date DATE NOT NULL,
    end_date DATE,
    next_issue_date DATE NOT NULL,
    last_issue_date DATE,

    currency VARCHAR(3) DEFAULT 'USD',

    discount_type VARCHAR(20),
    discount_value NUMERIC(15,2) DEFAULT 0,

    tax_calculation_method VARCHAR(20) DEFAULT 'exclusive',

    items JSONB NOT NULL,

    status VARCHAR(50) DEFAULT 'active',

    total_generated INTEGER DEFAULT 0,
    total_amount_generated NUMERIC(15,2) DEFAULT 0,

    notes TEXT,

    created_by UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 11. INVOICE REMINDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoice_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invoice_id UUID NOT NULL,

    reminder_type VARCHAR(50) NOT NULL,

    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,

    email_subject VARCHAR(255),
    email_body TEXT,
    email_to VARCHAR(255),
    email_cc TEXT,

    status VARCHAR(50) DEFAULT 'scheduled',

    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 12. INVOICE ACTIVITY LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoice_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invoice_id UUID NOT NULL,

    user_id UUID,
    user_name VARCHAR(255),

    action VARCHAR(100) NOT NULL,

    details JSONB,

    ip_address INET,
    user_agent TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 13. INVOICE SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoice_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_name VARCHAR(255),
    company_logo_url TEXT,
    company_address TEXT,
    company_email VARCHAR(255),
    company_phone VARCHAR(50),
    company_tax_id VARCHAR(100),
    company_website VARCHAR(255),
    company_registration_number VARCHAR(100),

    invoice_prefix VARCHAR(20) DEFAULT 'INV-',
    invoice_next_number INTEGER DEFAULT 1,
    invoice_number_padding INTEGER DEFAULT 6,
    invoice_number_format VARCHAR(100) DEFAULT '{prefix}{number}',

    credit_note_prefix VARCHAR(20) DEFAULT 'CN-',
    credit_note_next_number INTEGER DEFAULT 1,

    default_payment_terms_id UUID,
    default_tax_rate_id UUID,
    default_currency VARCHAR(3) DEFAULT 'USD',
    default_template_id UUID,
    default_due_days INTEGER DEFAULT 30,

    default_tax_calculation VARCHAR(20) DEFAULT 'exclusive',

    payment_instructions TEXT,
    bank_details JSONB,

    payment_gateways JSONB DEFAULT '{}'::jsonb,

    reminder_enabled BOOLEAN DEFAULT true,
    reminder_days_before INTEGER DEFAULT 3,
    reminder_days_after INTEGER DEFAULT 1,
    reminder_after_days INTEGER DEFAULT 7,
    reminder_after_days_2 INTEGER DEFAULT 14,
    reminder_grace_period_days INTEGER DEFAULT 0,

    email_subject_template VARCHAR(255)
        DEFAULT 'Invoice {invoice_number} from {company_name}',

    email_body_template TEXT,

    terms_and_conditions TEXT,

    auto_send_enabled BOOLEAN DEFAULT false,
    auto_pay_enabled BOOLEAN DEFAULT false,
    allow_partial_payments BOOLEAN DEFAULT true,
    allow_credit_notes BOOLEAN DEFAULT true,
    require_approval BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 14. FOREIGN KEYS
--
-- Added separately so existing tables can be upgraded.
-- ============================================================

DO $$
BEGIN

    -- customers -> payment_terms
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'customers_payment_terms_id_fkey'
    ) THEN
        ALTER TABLE public.customers
        ADD CONSTRAINT customers_payment_terms_id_fkey
        FOREIGN KEY (payment_terms_id)
        REFERENCES public.payment_terms(id)
        ON DELETE SET NULL;
    END IF;


    -- products -> tax_rates
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'products_tax_rate_id_fkey'
    ) THEN
        ALTER TABLE public.products
        ADD CONSTRAINT products_tax_rate_id_fkey
        FOREIGN KEY (tax_rate_id)
        REFERENCES public.tax_rates(id)
        ON DELETE SET NULL;
    END IF;


    -- invoices -> customers
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'invoices_customer_id_fkey'
    ) THEN
        ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_customer_id_fkey
        FOREIGN KEY (customer_id)
        REFERENCES public.customers(id)
        ON DELETE RESTRICT;
    END IF;


    -- invoices -> payment_terms
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'invoices_payment_terms_id_fkey'
    ) THEN
        ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_payment_terms_id_fkey
        FOREIGN KEY (payment_terms_id)
        REFERENCES public.payment_terms(id)
        ON DELETE SET NULL;
    END IF;


    -- invoices -> invoice_templates
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'invoices_template_id_fkey'
    ) THEN
        ALTER TABLE public.invoices
        ADD CONSTRAINT invoices_template_id_fkey
        FOREIGN KEY (template_id)
        REFERENCES public.invoice_templates(id)
        ON DELETE SET NULL;
    END IF;


    -- invoice_items -> invoices
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'invoice_items_invoice_id_fkey'
    ) THEN
        ALTER TABLE public.invoice_items
        ADD CONSTRAINT invoice_items_invoice_id_fkey
        FOREIGN KEY (invoice_id)
        REFERENCES public.invoices(id)
        ON DELETE CASCADE;
    END IF;


    -- invoice_items -> products
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'invoice_items_product_id_fkey'
    ) THEN
        ALTER TABLE public.invoice_items
        ADD CONSTRAINT invoice_items_product_id_fkey
        FOREIGN KEY (product_id)
        REFERENCES public.products(id)
        ON DELETE SET NULL;
    END IF;


    -- invoice_items -> tax_rates
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'invoice_items_tax_rate_id_fkey'
    ) THEN
        ALTER TABLE public.invoice_items
        ADD CONSTRAINT invoice_items_tax_rate_id_fkey
        FOREIGN KEY (tax_rate_id)
        REFERENCES public.tax_rates(id)
        ON DELETE SET NULL;
    END IF;


    -- payments -> invoices
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'payments_invoice_id_fkey'
    ) THEN
        ALTER TABLE public.payments
        ADD CONSTRAINT payments_invoice_id_fkey
        FOREIGN KEY (invoice_id)
        REFERENCES public.invoices(id)
        ON DELETE RESTRICT;
    END IF;


    -- credit_notes -> invoices
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'credit_notes_invoice_id_fkey'
    ) THEN
        ALTER TABLE public.credit_notes
        ADD CONSTRAINT credit_notes_invoice_id_fkey
        FOREIGN KEY (invoice_id)
        REFERENCES public.invoices(id)
        ON DELETE RESTRICT;
    END IF;


    -- credit_notes -> customers
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'credit_notes_customer_id_fkey'
    ) THEN
        ALTER TABLE public.credit_notes
        ADD CONSTRAINT credit_notes_customer_id_fkey
        FOREIGN KEY (customer_id)
        REFERENCES public.customers(id)
        ON DELETE RESTRICT;
    END IF;


    -- credit_notes -> applied invoice
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'credit_notes_applied_to_invoice_id_fkey'
    ) THEN
        ALTER TABLE public.credit_notes
        ADD CONSTRAINT credit_notes_applied_to_invoice_id_fkey
        FOREIGN KEY (applied_to_invoice_id)
        REFERENCES public.invoices(id)
        ON DELETE SET NULL;
    END IF;


    -- recurring -> customers
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'recurring_invoices_customer_id_fkey'
    ) THEN
        ALTER TABLE public.recurring_invoices
        ADD CONSTRAINT recurring_invoices_customer_id_fkey
        FOREIGN KEY (customer_id)
        REFERENCES public.customers(id)
        ON DELETE RESTRICT;
    END IF;


    -- recurring -> templates
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'recurring_invoices_template_id_fkey'
    ) THEN
        ALTER TABLE public.recurring_invoices
        ADD CONSTRAINT recurring_invoices_template_id_fkey
        FOREIGN KEY (template_id)
        REFERENCES public.invoice_templates(id)
        ON DELETE SET NULL;
    END IF;


    -- recurring -> payment terms
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'recurring_invoices_payment_terms_id_fkey'
    ) THEN
        ALTER TABLE public.recurring_invoices
        ADD CONSTRAINT recurring_invoices_payment_terms_id_fkey
        FOREIGN KEY (payment_terms_id)
        REFERENCES public.payment_terms(id)
        ON DELETE SET NULL;
    END IF;


    -- reminders -> invoices
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'invoice_reminders_invoice_id_fkey'
    ) THEN
        ALTER TABLE public.invoice_reminders
        ADD CONSTRAINT invoice_reminders_invoice_id_fkey
        FOREIGN KEY (invoice_id)
        REFERENCES public.invoices(id)
        ON DELETE CASCADE;
    END IF;


    -- activity log -> invoices
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'invoice_activity_log_invoice_id_fkey'
    ) THEN
        ALTER TABLE public.invoice_activity_log
        ADD CONSTRAINT invoice_activity_log_invoice_id_fkey
        FOREIGN KEY (invoice_id)
        REFERENCES public.invoices(id)
        ON DELETE CASCADE;
    END IF;


    -- invoice settings -> payment terms
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'invoice_settings_default_payment_terms_id_fkey'
    ) THEN
        ALTER TABLE public.invoice_settings
        ADD CONSTRAINT invoice_settings_default_payment_terms_id_fkey
        FOREIGN KEY (default_payment_terms_id)
        REFERENCES public.payment_terms(id)
        ON DELETE SET NULL;
    END IF;


    -- invoice settings -> tax rates
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'invoice_settings_default_tax_rate_id_fkey'
    ) THEN
        ALTER TABLE public.invoice_settings
        ADD CONSTRAINT invoice_settings_default_tax_rate_id_fkey
        FOREIGN KEY (default_tax_rate_id)
        REFERENCES public.tax_rates(id)
        ON DELETE SET NULL;
    END IF;


    -- invoice settings -> template
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'invoice_settings_default_template_id_fkey'
    ) THEN
        ALTER TABLE public.invoice_settings
        ADD CONSTRAINT invoice_settings_default_template_id_fkey
        FOREIGN KEY (default_template_id)
        REFERENCES public.invoice_templates(id)
        ON DELETE SET NULL;
    END IF;

END $$;


-- ============================================================
-- 15. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_customers_company
    ON public.customers(company_name);

CREATE INDEX IF NOT EXISTS idx_customers_email
    ON public.customers(email);

CREATE INDEX IF NOT EXISTS idx_customers_status
    ON public.customers(status);

CREATE INDEX IF NOT EXISTS idx_customers_tax_id
    ON public.customers(tax_id);

CREATE INDEX IF NOT EXISTS idx_customers_payment_terms
    ON public.customers(payment_terms_id);


CREATE INDEX IF NOT EXISTS idx_products_name
    ON public.products(name);

CREATE INDEX IF NOT EXISTS idx_products_sku
    ON public.products(sku);

CREATE INDEX IF NOT EXISTS idx_products_tax_rate
    ON public.products(tax_rate_id);

CREATE INDEX IF NOT EXISTS idx_products_active
    ON public.products(is_active);


CREATE INDEX IF NOT EXISTS idx_invoices_customer
    ON public.invoices(customer_id);

CREATE INDEX IF NOT EXISTS idx_invoices_number
    ON public.invoices(invoice_number);

CREATE INDEX IF NOT EXISTS idx_invoices_status
    ON public.invoices(status);

CREATE INDEX IF NOT EXISTS idx_invoices_issue_date
    ON public.invoices(issue_date);

CREATE INDEX IF NOT EXISTS idx_invoices_due_date
    ON public.invoices(due_date);

CREATE INDEX IF NOT EXISTS idx_invoices_currency
    ON public.invoices(currency);

CREATE INDEX IF NOT EXISTS idx_invoices_po_number
    ON public.invoices(po_number);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_status
    ON public.invoices(customer_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_due_date_status
    ON public.invoices(due_date, status);


CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
    ON public.invoice_items(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_items_product
    ON public.invoice_items(product_id);

CREATE INDEX IF NOT EXISTS idx_invoice_items_tax_rate
    ON public.invoice_items(tax_rate_id);


CREATE INDEX IF NOT EXISTS idx_payments_invoice
    ON public.payments(invoice_id);

CREATE INDEX IF NOT EXISTS idx_payments_date
    ON public.payments(payment_date);

CREATE INDEX IF NOT EXISTS idx_payments_status
    ON public.payments(status);

CREATE INDEX IF NOT EXISTS idx_payments_reference
    ON public.payments(transaction_reference);


CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice
    ON public.credit_notes(invoice_id);

CREATE INDEX IF NOT EXISTS idx_credit_notes_customer
    ON public.credit_notes(customer_id);

CREATE INDEX IF NOT EXISTS idx_credit_notes_number
    ON public.credit_notes(credit_note_number);

CREATE INDEX IF NOT EXISTS idx_credit_notes_status
    ON public.credit_notes(status);


CREATE INDEX IF NOT EXISTS idx_recurring_customer
    ON public.recurring_invoices(customer_id);

CREATE INDEX IF NOT EXISTS idx_recurring_status
    ON public.recurring_invoices(status);

CREATE INDEX IF NOT EXISTS idx_recurring_next_issue
    ON public.recurring_invoices(next_issue_date);


CREATE INDEX IF NOT EXISTS idx_reminders_invoice
    ON public.invoice_reminders(invoice_id);

CREATE INDEX IF NOT EXISTS idx_reminders_scheduled
    ON public.invoice_reminders(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_reminders_status
    ON public.invoice_reminders(status);


CREATE INDEX IF NOT EXISTS idx_activity_invoice
    ON public.invoice_activity_log(invoice_id);

CREATE INDEX IF NOT EXISTS idx_activity_user
    ON public.invoice_activity_log(user_id);

CREATE INDEX IF NOT EXISTS idx_activity_action
    ON public.invoice_activity_log(action);

CREATE INDEX IF NOT EXISTS idx_activity_created
    ON public.invoice_activity_log(created_at);


-- ============================================================
-- 16. UPDATED_AT FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 17. PAYMENT -> INVOICE TOTAL FUNCTION
--
-- IMPORTANT:
-- DELETE uses OLD.invoice_id.
-- INSERT/UPDATE uses NEW.invoice_id.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_invoice_amount_due()
RETURNS TRIGGER AS $$
DECLARE
    target_invoice_id UUID;
BEGIN

    IF TG_OP = 'DELETE' THEN
        target_invoice_id := OLD.invoice_id;
    ELSE
        target_invoice_id := NEW.invoice_id;
    END IF;

    UPDATE public.invoices
    SET
        amount_paid = (
            SELECT COALESCE(SUM(amount), 0)
            FROM public.payments
            WHERE invoice_id = target_invoice_id
              AND status = 'completed'
        ),
        amount_due = total_amount - (
            SELECT COALESCE(SUM(amount), 0)
            FROM public.payments
            WHERE invoice_id = target_invoice_id
              AND status = 'completed'
        )
    WHERE id = target_invoice_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 18. UPDATED_AT TRIGGERS
-- ============================================================

DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_customers_updated_at'
    ) THEN
        CREATE TRIGGER update_customers_updated_at
        BEFORE UPDATE ON public.customers
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;


    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_products_updated_at'
    ) THEN
        CREATE TRIGGER update_products_updated_at
        BEFORE UPDATE ON public.products
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;


    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_payment_terms_updated_at'
    ) THEN
        CREATE TRIGGER update_payment_terms_updated_at
        BEFORE UPDATE ON public.payment_terms
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;


    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_tax_rates_updated_at'
    ) THEN
        CREATE TRIGGER update_tax_rates_updated_at
        BEFORE UPDATE ON public.tax_rates
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;


    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_invoice_templates_updated_at'
    ) THEN
        CREATE TRIGGER update_invoice_templates_updated_at
        BEFORE UPDATE ON public.invoice_templates
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;


    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_invoices_updated_at'
    ) THEN
        CREATE TRIGGER update_invoices_updated_at
        BEFORE UPDATE ON public.invoices
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;


    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_invoice_items_updated_at'
    ) THEN
        CREATE TRIGGER update_invoice_items_updated_at
        BEFORE UPDATE ON public.invoice_items
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;


    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_payments_updated_at'
    ) THEN
        CREATE TRIGGER update_payments_updated_at
        BEFORE UPDATE ON public.payments
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;


    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_credit_notes_updated_at'
    ) THEN
        CREATE TRIGGER update_credit_notes_updated_at
        BEFORE UPDATE ON public.credit_notes
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;


    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_recurring_invoices_updated_at'
    ) THEN
        CREATE TRIGGER update_recurring_invoices_updated_at
        BEFORE UPDATE ON public.recurring_invoices
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;


    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_invoice_settings_updated_at'
    ) THEN
        CREATE TRIGGER update_invoice_settings_updated_at
        BEFORE UPDATE ON public.invoice_settings
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;


    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_invoice_reminders_updated_at'
    ) THEN
        CREATE TRIGGER update_invoice_reminders_updated_at
        BEFORE UPDATE ON public.invoice_reminders
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;

END $$;


-- ============================================================
-- 19. PAYMENT TOTAL TRIGGER
--
-- Drop first so the corrected DELETE handling is guaranteed.
-- ============================================================

DROP TRIGGER IF EXISTS update_invoice_amount_due_on_payment_change
ON public.payments;

CREATE TRIGGER update_invoice_amount_due_on_payment_change
AFTER INSERT OR UPDATE OF amount, status OR DELETE
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_invoice_amount_due();


-- ============================================================
-- 20. DEFAULT PAYMENT TERMS
-- ============================================================

INSERT INTO public.payment_terms
    (id, name, description, due_days, is_default, sort_order)
SELECT
    gen_random_uuid(),
    'Due on Receipt',
    'Payment is due immediately',
    0,
    true,
    1
WHERE NOT EXISTS (
    SELECT 1
    FROM public.payment_terms
    WHERE name = 'Due on Receipt'
);


INSERT INTO public.payment_terms
    (id, name, description, due_days, is_default, sort_order)
SELECT
    gen_random_uuid(),
    'Net 15',
    'Payment due within 15 days',
    15,
    false,
    2
WHERE NOT EXISTS (
    SELECT 1
    FROM public.payment_terms
    WHERE name = 'Net 15'
);


INSERT INTO public.payment_terms
    (id, name, description, due_days, is_default, sort_order)
SELECT
    gen_random_uuid(),
    'Net 30',
    'Payment due within 30 days',
    30,
    false,
    3
WHERE NOT EXISTS (
    SELECT 1
    FROM public.payment_terms
    WHERE name = 'Net 30'
);


INSERT INTO public.payment_terms
    (id, name, description, due_days, is_default, sort_order)
SELECT
    gen_random_uuid(),
    'Net 60',
    'Payment due within 60 days',
    60,
    false,
    4
WHERE NOT EXISTS (
    SELECT 1
    FROM public.payment_terms
    WHERE name = 'Net 60'
);


-- ============================================================
-- 21. DEFAULT TAX RATES
-- ============================================================

INSERT INTO public.tax_rates
    (id, name, rate, tax_type, is_default, sort_order)
SELECT
    gen_random_uuid(),
    'No Tax',
    0,
    'none',
    false,
    1
WHERE NOT EXISTS (
    SELECT 1
    FROM public.tax_rates
    WHERE name = 'No Tax'
);


INSERT INTO public.tax_rates
    (id, name, rate, tax_type, is_default, sort_order)
SELECT
    gen_random_uuid(),
    'VAT 20%',
    20,
    'vat',
    true,
    2
WHERE NOT EXISTS (
    SELECT 1
    FROM public.tax_rates
    WHERE name = 'VAT 20%'
);


INSERT INTO public.tax_rates
    (id, name, rate, tax_type, is_default, sort_order)
SELECT
    gen_random_uuid(),
    'VAT 10%',
    10,
    'vat',
    false,
    3
WHERE NOT EXISTS (
    SELECT 1
    FROM public.tax_rates
    WHERE name = 'VAT 10%'
);


INSERT INTO public.tax_rates
    (id, name, rate, tax_type, is_default, sort_order)
SELECT
    gen_random_uuid(),
    'GST 10%',
    10,
    'gst',
    false,
    4
WHERE NOT EXISTS (
    SELECT 1
    FROM public.tax_rates
    WHERE name = 'GST 10%'
);


INSERT INTO public.tax_rates
    (id, name, rate, tax_type, is_default, sort_order)
SELECT
    gen_random_uuid(),
    'Sales Tax 8%',
    8,
    'sales_tax',
    false,
    5
WHERE NOT EXISTS (
    SELECT 1
    FROM public.tax_rates
    WHERE name = 'Sales Tax 8%'
);


-- ============================================================
-- 22. DEFAULT INVOICE TEMPLATE
-- ============================================================

INSERT INTO public.invoice_templates (
    id,
    name,
    is_default,
    is_active,
    primary_color,
    show_payment_instructions,
    show_bank_details,
    show_tax_breakdown,
    show_discount,
    show_shipping,
    show_po_number
)
SELECT
    gen_random_uuid(),
    'Default Modern',
    true,
    true,
    '#1a56db',
    true,
    true,
    true,
    true,
    true,
    true
WHERE NOT EXISTS (
    SELECT 1
    FROM public.invoice_templates
    WHERE is_default = true
);


-- ============================================================
-- 23. DEFAULT INVOICE SETTINGS
-- ============================================================

INSERT INTO public.invoice_settings (
    id,
    invoice_prefix,
    invoice_next_number,
    invoice_number_padding,
    invoice_number_format,
    default_currency,
    default_due_days,
    default_tax_calculation,
    reminder_enabled,
    allow_partial_payments,
    allow_credit_notes
)
SELECT
    gen_random_uuid(),
    'INV-',
    COALESCE(
        (
            SELECT
                MAX(
                    CASE
                        WHEN invoice_number ~ '^INV-[0-9]+$'
                        THEN CAST(
                            REGEXP_REPLACE(
                                invoice_number,
                                '^INV-',
                                ''
                            ) AS INTEGER
                        )
                        ELSE 0
                    END
                ) + 1
            FROM public.invoices
        ),
        1
    ),
    6,
    '{prefix}{number}',
    'USD',
    30,
    'exclusive',
    true,
    true,
    true
WHERE NOT EXISTS (
    SELECT 1
    FROM public.invoice_settings
);


-- ============================================================
-- 24. FINAL DEFAULT NORMALIZATION
-- ============================================================

UPDATE public.invoice_settings
SET default_currency = 'USD'
WHERE default_currency IS NULL;

UPDATE public.invoice_settings
SET default_due_days = 30
WHERE default_due_days IS NULL;

UPDATE public.invoice_settings
SET default_tax_calculation = 'exclusive'
WHERE default_tax_calculation IS NULL;

UPDATE public.invoice_settings
SET reminder_enabled = true
WHERE reminder_enabled IS NULL;

UPDATE public.invoice_settings
SET allow_partial_payments = true
WHERE allow_partial_payments IS NULL;

UPDATE public.invoice_settings
SET allow_credit_notes = true
WHERE allow_credit_notes IS NULL;


-- ============================================================
-- END OF MIGRATION
-- ============================================================