-- ============================================
-- MIGRATION: Invoice App v1 → v2
-- For existing tenants with old schema
-- ============================================

BEGIN;

-- ============================================
-- 1. ADD NEW TABLES
-- ============================================

-- Payment Terms
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

-- Tax Rates
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

-- Products
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sku VARCHAR(100) UNIQUE,
    unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_rate_id UUID REFERENCES public.tax_rates(id) ON DELETE SET NULL,
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoice Templates
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

-- Credit Notes
CREATE TABLE IF NOT EXISTS public.credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    credit_note_number VARCHAR(100) NOT NULL UNIQUE,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(15,2) NOT NULL,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'issued',
    applied_to_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    applied_amount NUMERIC(15,2),
    applied_at TIMESTAMPTZ,
    reason VARCHAR(255) NOT NULL,
    reason_details TEXT,
    created_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recurring Invoices
CREATE TABLE IF NOT EXISTS public.recurring_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    template_id UUID REFERENCES public.invoice_templates(id) ON DELETE SET NULL,
    payment_terms_id UUID REFERENCES public.payment_terms(id) ON DELETE SET NULL,
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

-- Invoice Reminders
CREATE TABLE IF NOT EXISTS public.invoice_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
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

-- Invoice Activity Log
CREATE TABLE IF NOT EXISTS public.invoice_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    user_id UUID,
    user_name VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoice Settings
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
    default_payment_terms_id UUID REFERENCES public.payment_terms(id) ON DELETE SET NULL,
    default_tax_rate_id UUID REFERENCES public.tax_rates(id) ON DELETE SET NULL,
    default_currency VARCHAR(3) DEFAULT 'USD',
    default_template_id UUID REFERENCES public.invoice_templates(id) ON DELETE SET NULL,
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
    email_subject_template VARCHAR(255) DEFAULT 'Invoice {invoice_number} from {company_name}',
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

-- ============================================
-- 2. ADD NEW COLUMNS TO EXISTING TABLES
-- ============================================

-- Customers: Add new columns
ALTER TABLE public.customers 
    ADD COLUMN IF NOT EXISTS website VARCHAR(255),
    ADD COLUMN IF NOT EXISTS shipping_address TEXT,
    ADD COLUMN IF NOT EXISTS tax_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS tax_id_type VARCHAR(50) DEFAULT 'vat',
    ADD COLUMN IF NOT EXISTS registration_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS payment_terms_id UUID,
    ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS customer_type VARCHAR(50) DEFAULT 'company',
    ADD COLUMN IF NOT EXISTS industry VARCHAR(100);

-- Invoices: Add new columns
ALTER TABLE public.invoices 
    ADD COLUMN IF NOT EXISTS payment_date DATE,
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS discount_value NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_calculation_method VARCHAR(20) DEFAULT 'exclusive',
    ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shipping_tax NUMERIC(15,2) DEFAULT 0,
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
    ADD COLUMN IF NOT EXISTS internal_notes TEXT,
    ADD COLUMN IF NOT EXISTS footer_text TEXT,
    ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Invoice Items: Add new columns
ALTER TABLE public.invoice_items 
    ADD COLUMN IF NOT EXISTS product_id UUID,
    ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS discount_value NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_rate_id UUID,
    ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Payments: Add new columns
ALTER TABLE public.payments 
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10,4) DEFAULT 1,
    ADD COLUMN IF NOT EXISTS payment_method_details JSONB,
    ADD COLUMN IF NOT EXISTS reconciled BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reconciled_by UUID,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- 3. MIGRATE EXISTING DATA
-- ============================================

-- Set default currency for existing invoices
UPDATE public.invoices SET currency = 'USD' WHERE currency IS NULL;

-- Set default tax_calculation_method for existing invoices
UPDATE public.invoices SET tax_calculation_method = 'exclusive' WHERE tax_calculation_method IS NULL;

-- Set default currency for existing customers
UPDATE public.customers SET currency = 'USD' WHERE currency IS NULL;

-- Set default currency for existing payments
UPDATE public.payments SET currency = 'USD' WHERE currency IS NULL;

-- ============================================
-- 4. CREATE INDEXES
-- ============================================

-- Customers indexes
CREATE INDEX IF NOT EXISTS idx_customers_company ON public.customers(company_name);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_tax_id ON public.customers(tax_id);

-- Invoices indexes
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON public.invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_currency ON public.invoices(currency);
CREATE INDEX IF NOT EXISTS idx_invoices_po_number ON public.invoices(po_number);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status ON public.invoices(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date_status ON public.invoices(due_date, status);

-- Invoice items indexes
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON public.invoice_items(product_id);

-- Payments indexes
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON public.payments(transaction_reference);

-- Credit notes indexes
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON public.credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer ON public.credit_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_number ON public.credit_notes(credit_note_number);
CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON public.credit_notes(status);

-- Recurring invoices indexes
CREATE INDEX IF NOT EXISTS idx_recurring_customer ON public.recurring_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_recurring_status ON public.recurring_invoices(status);
CREATE INDEX IF NOT EXISTS idx_recurring_next_issue ON public.recurring_invoices(next_issue_date);

-- Reminders indexes
CREATE INDEX IF NOT EXISTS idx_reminders_invoice ON public.invoice_reminders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON public.invoice_reminders(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON public.invoice_reminders(status);

-- Activity log indexes
CREATE INDEX IF NOT EXISTS idx_activity_invoice ON public.invoice_activity_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON public.invoice_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON public.invoice_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_created ON public.invoice_activity_log(created_at);

-- ============================================
-- 5. ADD TRIGGERS
-- ============================================

-- Auto-update updated_at function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-update amount_due when payments change
CREATE OR REPLACE FUNCTION public.update_invoice_amount_due()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.invoices
    SET 
        amount_paid = (
            SELECT COALESCE(SUM(amount), 0)
            FROM public.payments
            WHERE invoice_id = NEW.invoice_id
            AND status = 'completed'
        ),
        amount_due = total_amount - amount_paid
    WHERE id = NEW.invoice_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for tables with updated_at
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_customers_updated_at') THEN
        CREATE TRIGGER update_customers_updated_at
            BEFORE UPDATE ON public.customers
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_invoices_updated_at') THEN
        CREATE TRIGGER update_invoices_updated_at
            BEFORE UPDATE ON public.invoices
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_invoice_items_updated_at') THEN
        CREATE TRIGGER update_invoice_items_updated_at
            BEFORE UPDATE ON public.invoice_items
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_payments_updated_at') THEN
        CREATE TRIGGER update_payments_updated_at
            BEFORE UPDATE ON public.payments
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_invoice_amount_due_on_payment_change') THEN
        CREATE TRIGGER update_invoice_amount_due_on_payment_change
            AFTER INSERT OR UPDATE OF amount, status OR DELETE ON public.payments
            FOR EACH ROW EXECUTE FUNCTION public.update_invoice_amount_due();
    END IF;
END $$;

-- ============================================
-- 6. SEED DEFAULT DATA (if not exists)
-- ============================================

-- Insert default payment terms
INSERT INTO public.payment_terms (id, name, description, due_days, is_default, sort_order)
SELECT 
    gen_random_uuid(), 'Due on Receipt', 'Payment is due immediately', 0, true, 1
WHERE NOT EXISTS (SELECT 1 FROM public.payment_terms WHERE name = 'Due on Receipt');

INSERT INTO public.payment_terms (id, name, description, due_days, is_default, sort_order)
SELECT 
    gen_random_uuid(), 'Net 15', 'Payment due within 15 days', 15, false, 2
WHERE NOT EXISTS (SELECT 1 FROM public.payment_terms WHERE name = 'Net 15');

INSERT INTO public.payment_terms (id, name, description, due_days, is_default, sort_order)
SELECT 
    gen_random_uuid(), 'Net 30', 'Payment due within 30 days', 30, false, 3
WHERE NOT EXISTS (SELECT 1 FROM public.payment_terms WHERE name = 'Net 30');

INSERT INTO public.payment_terms (id, name, description, due_days, is_default, sort_order)
SELECT 
    gen_random_uuid(), 'Net 60', 'Payment due within 60 days', 60, false, 4
WHERE NOT EXISTS (SELECT 1 FROM public.payment_terms WHERE name = 'Net 60');

-- Insert default tax rates
INSERT INTO public.tax_rates (id, name, rate, tax_type, is_default, sort_order)
SELECT 
    gen_random_uuid(), 'No Tax', 0, 'none', false, 1
WHERE NOT EXISTS (SELECT 1 FROM public.tax_rates WHERE name = 'No Tax');

INSERT INTO public.tax_rates (id, name, rate, tax_type, is_default, sort_order)
SELECT 
    gen_random_uuid(), 'VAT 20%', 20, 'vat', true, 2
WHERE NOT EXISTS (SELECT 1 FROM public.tax_rates WHERE name = 'VAT 20%');

INSERT INTO public.tax_rates (id, name, rate, tax_type, is_default, sort_order)
SELECT 
    gen_random_uuid(), 'VAT 10%', 10, 'vat', false, 3
WHERE NOT EXISTS (SELECT 1 FROM public.tax_rates WHERE name = 'VAT 10%');

INSERT INTO public.tax_rates (id, name, rate, tax_type, is_default, sort_order)
SELECT 
    gen_random_uuid(), 'GST 10%', 10, 'gst', false, 4
WHERE NOT EXISTS (SELECT 1 FROM public.tax_rates WHERE name = 'GST 10%');

-- Insert default invoice template
INSERT INTO public.invoice_templates (id, name, is_default, primary_color, show_payment_instructions, show_bank_details, show_tax_breakdown)
SELECT 
    gen_random_uuid(), 'Default Modern', true, '#1a56db', true, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.invoice_templates WHERE is_default = true);

-- Insert default invoice settings if not exists
INSERT INTO public.invoice_settings (
    id, 
    invoice_prefix, 
    invoice_next_number, 
    default_currency, 
    default_due_days,
    reminder_enabled,
    allow_partial_payments,
    allow_credit_notes
)
SELECT 
    gen_random_uuid(),
    'INV-',
    COALESCE((SELECT MAX(CAST(REGEXP_REPLACE(invoice_number, '^INV-', '') AS INTEGER)) + 1 FROM public.invoices WHERE invoice_number LIKE 'INV-%'), 1),
    'USD',
    30,
    true,
    true,
    true
WHERE NOT EXISTS (SELECT 1 FROM public.invoice_settings);

COMMIT;