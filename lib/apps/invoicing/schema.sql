-- ============================================================
-- SaMi Assist
-- INVOICE MODULE - COMPLETE REPLACEMENT SCHEMA
-- ============================================================
--
-- Version: 2.0
--
-- Designed for:
--   - PostgreSQL / Neon / Supabase
--   - SaMi Assist tenant databases
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


-- ============================================================
-- 1. REMOVE EXISTING INVOICE MODULE
-- ============================================================
--
-- Dependency order is handled explicitly.
--
-- If you are running this against a fresh tenant database,
-- these DROP statements simply do nothing.
--
-- ============================================================

DROP TABLE IF EXISTS public.invoice_activity_log CASCADE;
DROP TABLE IF EXISTS public.invoice_reminders CASCADE;
DROP TABLE IF EXISTS public.recurring_invoices CASCADE;
DROP TABLE IF EXISTS public.credit_notes CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.invoice_items CASCADE;
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


-- ------------------------------------------------------------
-- 2.1 Automatically update updated_at
-- ------------------------------------------------------------

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


CREATE UNIQUE INDEX uq_payment_terms_name
ON public.payment_terms (LOWER(name));


-- ============================================================
-- 4. TAX RATES
-- ============================================================

CREATE TABLE public.tax_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL,

    rate NUMERIC(5,2) NOT NULL,

    tax_type VARCHAR(50) NOT NULL DEFAULT 'vat',
    -- vat, gst, sales_tax, withholding, none

    country VARCHAR(100),
    region VARCHAR(100),

    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,

    sort_order INTEGER NOT NULL DEFAULT 0,

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


CREATE UNIQUE INDEX uq_tax_rates_name
ON public.tax_rates (LOWER(name));


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

    credit_limit NUMERIC(15,2),

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


-- ============================================================
-- 6. PRODUCTS / SERVICES
-- ============================================================

CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(255) NOT NULL,

    description TEXT,

    sku VARCHAR(100),

    unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,

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


CREATE UNIQUE INDEX uq_products_sku
ON public.products (LOWER(sku))
WHERE sku IS NOT NULL;


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
    -- Financials
    -- --------------------------------------------------------

    subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,

    discount_type VARCHAR(20),

    discount_value NUMERIC(15,2) NOT NULL DEFAULT 0,

    discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,

    tax_calculation_method VARCHAR(20)
        NOT NULL DEFAULT 'exclusive',

    tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,

    shipping_cost NUMERIC(15,2) NOT NULL DEFAULT 0,

    shipping_tax NUMERIC(15,2) NOT NULL DEFAULT 0,

    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,

    amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0,

    amount_due NUMERIC(15,2) NOT NULL DEFAULT 0,

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


-- ============================================================
-- 9. INVOICE ITEMS
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

    quantity NUMERIC(15,2) NOT NULL DEFAULT 1,

    unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,

    discount_type VARCHAR(20),

    discount_value NUMERIC(15,2) NOT NULL DEFAULT 0,

    discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,

    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,

    tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,

    tax_rate_id UUID
        REFERENCES public.tax_rates(id)
        ON DELETE SET NULL,

    line_total NUMERIC(15,2) NOT NULL DEFAULT 0,

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


-- ============================================================
-- 10. PAYMENTS
-- ============================================================

CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invoice_id UUID NOT NULL
        REFERENCES public.invoices(id)
        ON DELETE RESTRICT,

    amount NUMERIC(15,2) NOT NULL,

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


-- ============================================================
-- 11. CREDIT NOTES
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

    amount NUMERIC(15,2) NOT NULL,

    tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,

    currency VARCHAR(3) NOT NULL DEFAULT 'KES',

    status VARCHAR(50) NOT NULL DEFAULT 'issued',

    -- issued
    -- applied
    -- void

    applied_to_invoice_id UUID
        REFERENCES public.invoices(id)
        ON DELETE SET NULL,

    applied_amount NUMERIC(15,2),

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


-- ============================================================
-- 12. RECURRING INVOICES
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

    discount_value NUMERIC(15,2) NOT NULL DEFAULT 0,

    tax_calculation_method VARCHAR(20)
        NOT NULL DEFAULT 'exclusive',

    items JSONB NOT NULL,

    status VARCHAR(50) NOT NULL DEFAULT 'active',

    total_generated INTEGER NOT NULL DEFAULT 0,

    total_amount_generated NUMERIC(15,2) NOT NULL DEFAULT 0,

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


-- ============================================================
-- 13. INVOICE REMINDERS
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


-- ============================================================
-- 14. INVOICE ACTIVITY LOG
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


-- ============================================================
-- 15. INVOICE SETTINGS
-- ============================================================
--
-- One row per tenant database.
--
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
        CHECK (reminder_grace_period_days >= 0)
);


-- ============================================================
-- 16. SETTINGS SINGLETON
-- ============================================================

CREATE UNIQUE INDEX uq_invoice_settings_singleton
ON public.invoice_settings ((true));


-- ============================================================
-- 17. INDEXES
-- ============================================================

-- ------------------------------------------------------------
-- Customers
-- ------------------------------------------------------------

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


-- ------------------------------------------------------------
-- Products
-- ------------------------------------------------------------

CREATE INDEX idx_products_name
ON public.products(name);

CREATE INDEX idx_products_category
ON public.products(category);

CREATE INDEX idx_products_active
ON public.products(is_active);

CREATE INDEX idx_products_tax_rate
ON public.products(tax_rate_id);


-- ------------------------------------------------------------
-- Tax rates
-- ------------------------------------------------------------

CREATE INDEX idx_tax_rates_active
ON public.tax_rates(is_active);

CREATE INDEX idx_tax_rates_type
ON public.tax_rates(tax_type);


-- ------------------------------------------------------------
-- Payment terms
-- ------------------------------------------------------------

CREATE INDEX idx_payment_terms_active
ON public.payment_terms(is_active);

CREATE INDEX idx_payment_terms_sort
ON public.payment_terms(sort_order);


-- ------------------------------------------------------------
-- Templates
-- ------------------------------------------------------------

CREATE INDEX idx_invoice_templates_active
ON public.invoice_templates(is_active);


-- ------------------------------------------------------------
-- Invoices
-- ------------------------------------------------------------

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


-- ------------------------------------------------------------
-- Invoice items
-- ------------------------------------------------------------

CREATE INDEX idx_invoice_items_invoice
ON public.invoice_items(invoice_id);

CREATE INDEX idx_invoice_items_product
ON public.invoice_items(product_id);

CREATE INDEX idx_invoice_items_tax_rate
ON public.invoice_items(tax_rate_id);


-- ------------------------------------------------------------
-- Payments
-- ------------------------------------------------------------

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


-- ------------------------------------------------------------
-- Credit notes
-- ------------------------------------------------------------

CREATE INDEX idx_credit_notes_invoice
ON public.credit_notes(invoice_id);

CREATE INDEX idx_credit_notes_customer
ON public.credit_notes(customer_id);

CREATE INDEX idx_credit_notes_status
ON public.credit_notes(status);

CREATE INDEX idx_credit_notes_applied_invoice
ON public.credit_notes(applied_to_invoice_id);


-- ------------------------------------------------------------
-- Recurring invoices
-- ------------------------------------------------------------

CREATE INDEX idx_recurring_customer
ON public.recurring_invoices(customer_id);

CREATE INDEX idx_recurring_status
ON public.recurring_invoices(status);

CREATE INDEX idx_recurring_next_issue
ON public.recurring_invoices(next_issue_date);


-- ------------------------------------------------------------
-- Reminders
-- ------------------------------------------------------------

CREATE INDEX idx_reminders_invoice
ON public.invoice_reminders(invoice_id);

CREATE INDEX idx_reminders_scheduled
ON public.invoice_reminders(scheduled_at);

CREATE INDEX idx_reminders_status
ON public.invoice_reminders(status);


-- ------------------------------------------------------------
-- Activity log
-- ------------------------------------------------------------

CREATE INDEX idx_activity_invoice
ON public.invoice_activity_log(invoice_id);

CREATE INDEX idx_activity_user
ON public.invoice_activity_log(user_id);

CREATE INDEX idx_activity_action
ON public.invoice_activity_log(action);

CREATE INDEX idx_activity_created
ON public.invoice_activity_log(created_at);


-- ============================================================
-- 18. UPDATED_AT TRIGGERS
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
-- 19. PAYMENT → INVOICE CALCULATION
-- ============================================================
--
-- This is deliberately written to work for:
--
-- INSERT
-- UPDATE
-- DELETE
--
-- It uses OLD.invoice_id when a payment is deleted.
--
-- ============================================================

CREATE OR REPLACE FUNCTION public.recalculate_invoice_payment_state(
    p_invoice_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_total NUMERIC(15,2);
    v_paid NUMERIC(15,2);
    v_due NUMERIC(15,2);
    v_status VARCHAR(50);
    v_current_status VARCHAR(50);
    v_due_date DATE;
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

    v_paid := LEAST(v_paid, v_total);

    v_due := GREATEST(v_total - v_paid, 0);

    -- --------------------------------------------------------
    -- Determine status
    -- --------------------------------------------------------

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
            WHEN v_status = 'paid'
                THEN CURRENT_DATE
            ELSE payment_date
        END
    WHERE id = p_invoice_id;

END;
$$;


-- ============================================================
-- 20. PAYMENT CHANGE TRIGGER
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


CREATE TRIGGER update_invoice_payment_state
AFTER INSERT OR UPDATE OR DELETE
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.handle_payment_change();


-- ============================================================
-- 21. INVOICE NUMBER GENERATION
-- ============================================================
--
-- Generates invoice numbers atomically.
--
-- Example:
--
-- INV-000001
-- INV-000002
-- INV-000003
--
-- This prevents two simultaneous users from receiving
-- the same invoice number.
--
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
BEGIN

    SELECT
        invoice_next_number,
        invoice_prefix,
        invoice_number_padding,
        invoice_number_format
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
        '{number}',
        LPAD(
            v_number::TEXT,
            v_padding,
            '0'
        )
    );

    UPDATE public.invoice_settings
    SET invoice_next_number = v_number + 1;

    RETURN v_result;

END;
$$;


-- ============================================================
-- 22. CREDIT NOTE NUMBER GENERATION
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


-- ============================================================
-- 23. AUTOMATIC OVERDUE FUNCTION
-- ============================================================
--
-- Can be called by a scheduled job/cron.
--
-- It does NOT mark drafts/cancelled/void invoices overdue.
--
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

    RETURN v_count;

END;
$$;


-- ============================================================
-- 24. DEFAULT SEED DATA
-- ============================================================

-- ------------------------------------------------------------
-- Payment Terms
-- ------------------------------------------------------------

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
ON CONFLICT DO NOTHING;


-- ------------------------------------------------------------
-- Tax Rates
-- ------------------------------------------------------------

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
ON CONFLICT DO NOTHING;


-- ------------------------------------------------------------
-- Default Invoice Template
-- ------------------------------------------------------------

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
ON CONFLICT DO NOTHING;


-- ============================================================
-- 25. INITIAL INVOICE SETTINGS
-- ============================================================

INSERT INTO public.invoice_settings (
    company_name,

    invoice_prefix,
    invoice_next_number,
    invoice_number_padding,
    invoice_number_format,

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
-- 26. LINK DEFAULT SETTINGS TO DEFAULT DATA
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
-- 27. ENSURE ONLY ONE DEFAULT PAYMENT TERM
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
-- 28. ENSURE ONLY ONE DEFAULT TAX RATE
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
-- 29. ENSURE ONLY ONE DEFAULT TEMPLATE
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
-- 30. FINAL VERIFICATION QUERIES
-- ============================================================
--
-- Run these after the schema has completed.
--
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
      'invoice_items',
      'payments',
      'credit_notes',
      'recurring_invoices',
      'invoice_reminders',
      'invoice_activity_log',
      'invoice_settings'
  )
ORDER BY table_name;


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
-- END OF SaMi ASSIST INVOICE MODULE SCHEMA
-- ============================================================