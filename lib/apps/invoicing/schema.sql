
-- ============================================
-- 1. CUSTOMERS
-- ============================================
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core
    company_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    website VARCHAR(255),
    
    -- Addresses
    billing_address TEXT,
    shipping_address TEXT,
    
    -- Tax & Legal
    tax_id VARCHAR(100),                          -- VAT/GST/EIN
    tax_id_type VARCHAR(50) DEFAULT 'vat',        -- vat, ein, gst, etc.
    registration_number VARCHAR(100),
    
    -- B2B Settings
    currency VARCHAR(3) DEFAULT 'USD',
    payment_terms_id UUID,                        -- References payment_terms
    credit_limit NUMERIC(15,2),
    
    -- Classification
    customer_type VARCHAR(50) DEFAULT 'company',  -- individual, company, government, non_profit
    industry VARCHAR(100),
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, inactive, blocked
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. PAYMENT TERMS
-- ============================================
CREATE TABLE IF NOT EXISTS public.payment_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,                   -- "Net 30", "Due on Receipt"
    description TEXT,
    due_days INTEGER NOT NULL DEFAULT 30,         -- 0 for due on receipt
    discount_percentage NUMERIC(5,2) DEFAULT 0,   -- Early payment discount
    discount_days INTEGER,                        -- Days to qualify for discount
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 3. TAX RATES
-- ============================================
CREATE TABLE IF NOT EXISTS public.tax_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,                   -- "VAT 20%", "GST 10%"
    rate NUMERIC(5,2) NOT NULL,
    tax_type VARCHAR(50) DEFAULT 'vat',           -- vat, gst, sales_tax, withholding, none
    country VARCHAR(100),
    region VARCHAR(100),
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 4. PRODUCTS / SERVICES CATALOG
-- ============================================
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

-- ============================================
-- 5. INVOICE TEMPLATES
-- ============================================
CREATE TABLE IF NOT EXISTS public.invoice_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    -- Design
    primary_color VARCHAR(7) DEFAULT '#1a56db',
    secondary_color VARCHAR(7) DEFAULT '#374151',
    logo_url TEXT,
    font_family VARCHAR(100) DEFAULT 'Inter, sans-serif',
    
    -- Visibility toggles
    show_payment_instructions BOOLEAN DEFAULT true,
    show_bank_details BOOLEAN DEFAULT true,
    show_tax_breakdown BOOLEAN DEFAULT true,
    show_discount BOOLEAN DEFAULT true,
    show_shipping BOOLEAN DEFAULT true,
    show_po_number BOOLEAN DEFAULT true,
    
    -- Content
    header_text TEXT,
    footer_text TEXT,
    payment_instructions TEXT,
    bank_details TEXT,
    terms_and_conditions TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 6. INVOICES (MAIN)
-- ============================================
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relationships
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    
    -- Numbering
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    
    -- Dates
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    payment_date DATE,                            -- Actual date fully paid
    sent_at TIMESTAMPTZ,
    viewed_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'draft',  -- draft, pending_approval, sent, viewed, partially_paid, paid, overdue, cancelled, void
    
    -- Financials
    subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
    
    -- Discount (applied to entire invoice)
    discount_type VARCHAR(20),                    -- percentage, fixed
    discount_value NUMERIC(15,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Tax
    tax_calculation_method VARCHAR(20) DEFAULT 'exclusive', -- exclusive, inclusive
    tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    
    -- Shipping
    shipping_cost NUMERIC(15,2) DEFAULT 0,
    shipping_tax NUMERIC(15,2) DEFAULT 0,
    
    -- Totals
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0,
    amount_due NUMERIC(15,2) NOT NULL DEFAULT 0,
    
    -- B2B Fields
    po_number VARCHAR(100),                       -- Customer's Purchase Order
    currency VARCHAR(3) DEFAULT 'USD',
    exchange_rate NUMERIC(10,4) DEFAULT 1,
    payment_terms_id UUID REFERENCES public.payment_terms(id) ON DELETE SET NULL,
    payment_terms_display VARCHAR(50),            -- Denormalized for display (e.g., "Net 30")
    
    -- Template
    template_id UUID REFERENCES public.invoice_templates(id) ON DELETE SET NULL,
    
    -- Approval Workflow
    created_by UUID,                              -- User ID from master DB
    approved_by UUID,                             -- User ID from master DB
    cancelled_by UUID,                            -- User ID from master DB
    cancelled_reason TEXT,
    
    -- Reminders
    reminder_count INTEGER DEFAULT 0,
    last_reminder_sent_at TIMESTAMPTZ,
    next_reminder_at TIMESTAMPTZ,
    
    -- Content
    notes TEXT,                                   -- Shown to customer
    internal_notes TEXT,                          -- Staff only
    footer_text TEXT,                             -- Override template footer
    
    -- Attachments
    attachments JSONB DEFAULT '[]'::jsonb,        -- Array of {name, url, size, type}
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,           -- Flexible key-value store
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 7. INVOICE ITEMS (LINE ITEMS)
-- ============================================
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    
    description TEXT NOT NULL,
    quantity NUMERIC(15,2) NOT NULL DEFAULT 1,
    unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
    
    -- Line discount
    discount_type VARCHAR(20),                    -- percentage, fixed
    discount_value NUMERIC(15,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Tax (line-specific)
    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    tax_rate_id UUID REFERENCES public.tax_rates(id) ON DELETE SET NULL,
    
    -- Totals
    line_total NUMERIC(15,2) NOT NULL DEFAULT 0,  -- quantity * unit_price - discount
    
    -- Ordering
    sort_order INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 8. PAYMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    
    amount NUMERIC(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    exchange_rate NUMERIC(10,4) DEFAULT 1,
    
    payment_method VARCHAR(50) NOT NULL,          -- cash, bank_transfer, credit_card, debit_card, check, online, other
    payment_method_details JSONB,                 -- {card_last4, bank_name, reference, etc.}
    
    transaction_reference VARCHAR(255),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded, disputed
    
    -- Reconciliation
    reconciled BOOLEAN DEFAULT false,
    reconciled_at TIMESTAMPTZ,
    reconciled_by UUID,                          -- User ID from master DB
    
    notes TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 9. CREDIT NOTES
-- ============================================
CREATE TABLE IF NOT EXISTS public.credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relationships
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    
    -- Numbering
    credit_note_number VARCHAR(100) NOT NULL UNIQUE,
    
    -- Dates
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Financials
    amount NUMERIC(15,2) NOT NULL,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Status
    status VARCHAR(50) DEFAULT 'issued',          -- issued, applied, void
    
    -- Application
    applied_to_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    applied_amount NUMERIC(15,2),
    applied_at TIMESTAMPTZ,
    
    -- Reason
    reason VARCHAR(255) NOT NULL,
    reason_details TEXT,
    
    -- Created by
    created_by UUID,                              -- User ID from master DB
    
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 10. RECURRING INVOICES
-- ============================================
CREATE TABLE IF NOT EXISTS public.recurring_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relationships
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    template_id UUID REFERENCES public.invoice_templates(id) ON DELETE SET NULL,
    payment_terms_id UUID REFERENCES public.payment_terms(id) ON DELETE SET NULL,
    
    -- Schedule
    frequency VARCHAR(50) NOT NULL,               -- daily, weekly, biweekly, monthly, quarterly, biannual, yearly
    interval_value INTEGER DEFAULT 1,             -- every X days/weeks/months
    start_date DATE NOT NULL,
    end_date DATE,
    next_issue_date DATE NOT NULL,
    last_issue_date DATE,
    
    -- Invoice defaults
    currency VARCHAR(3) DEFAULT 'USD',
    discount_type VARCHAR(20),                    -- percentage, fixed
    discount_value NUMERIC(15,2) DEFAULT 0,
    tax_calculation_method VARCHAR(20) DEFAULT 'exclusive',
    
    -- Items (stored as JSON)
    items JSONB NOT NULL,                         -- Array of {description, quantity, unit_price, tax_rate, product_id?}
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',          -- active, paused, completed, cancelled
    
    -- Tracking
    total_generated INTEGER DEFAULT 0,
    total_amount_generated NUMERIC(15,2) DEFAULT 0,
    
    notes TEXT,
    
    -- Created by
    created_by UUID,                              -- User ID from master DB
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 11. INVOICE REMINDERS
-- ============================================
CREATE TABLE IF NOT EXISTS public.invoice_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    
    reminder_type VARCHAR(50) NOT NULL,           -- due_soon, overdue, follow_up, custom
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    
    email_subject VARCHAR(255),
    email_body TEXT,
    email_to VARCHAR(255),
    email_cc TEXT,
    
    status VARCHAR(50) DEFAULT 'scheduled',       -- scheduled, sent, failed, cancelled
    
    error_message TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 12. INVOICE ACTIVITY LOG
-- ============================================
CREATE TABLE IF NOT EXISTS public.invoice_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    
    user_id UUID,                                 -- From master DB
    user_name VARCHAR(255),
    action VARCHAR(100) NOT NULL,                 -- created, updated, sent, viewed, paid, cancelled, voided, reminder_sent, etc.
    details JSONB,
    
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 13. INVOICE SETTINGS (App-Specific)
-- ============================================
CREATE TABLE IF NOT EXISTS public.invoice_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Company Details (displayed on invoices)
    company_name VARCHAR(255),
    company_logo_url TEXT,
    company_address TEXT,
    company_email VARCHAR(255),
    company_phone VARCHAR(50),
    company_tax_id VARCHAR(100),
    company_website VARCHAR(255),
    company_registration_number VARCHAR(100),
    
    -- Invoice Numbering
    invoice_prefix VARCHAR(20) DEFAULT 'INV-',
    invoice_next_number INTEGER DEFAULT 1,
    invoice_number_padding INTEGER DEFAULT 6,
    invoice_number_format VARCHAR(100) DEFAULT '{prefix}{number}',
    
    credit_note_prefix VARCHAR(20) DEFAULT 'CN-',
    credit_note_next_number INTEGER DEFAULT 1,
    
    -- Defaults
    default_payment_terms_id UUID REFERENCES public.payment_terms(id) ON DELETE SET NULL,
    default_tax_rate_id UUID REFERENCES public.tax_rates(id) ON DELETE SET NULL,
    default_currency VARCHAR(3) DEFAULT 'USD',
    default_template_id UUID REFERENCES public.invoice_templates(id) ON DELETE SET NULL,
    default_due_days INTEGER DEFAULT 30,
    
    -- Tax
    default_tax_calculation VARCHAR(20) DEFAULT 'exclusive', -- exclusive, inclusive
    
    -- Payment
    payment_instructions TEXT,
    bank_details JSONB,                            -- {bank_name, account_name, account_number, routing_number, swift}
    payment_gateways JSONB DEFAULT '{}'::jsonb,    -- {stripe: {enabled, secret_key, publishable_key}, paypal: {...}}
    
    -- Reminders
    reminder_enabled BOOLEAN DEFAULT true,
    reminder_days_before INTEGER DEFAULT 3,
    reminder_days_after INTEGER DEFAULT 1,
    reminder_after_days INTEGER DEFAULT 7,
    reminder_after_days_2 INTEGER DEFAULT 14,
    reminder_grace_period_days INTEGER DEFAULT 0,
    
    -- Email Templates
    email_subject_template VARCHAR(255) DEFAULT 'Invoice {invoice_number} from {company_name}',
    email_body_template TEXT,
    
    -- Terms
    terms_and_conditions TEXT,
    
    -- Feature Toggles
    auto_send_enabled BOOLEAN DEFAULT false,
    auto_pay_enabled BOOLEAN DEFAULT false,
    allow_partial_payments BOOLEAN DEFAULT true,
    allow_credit_notes BOOLEAN DEFAULT true,
    require_approval BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Customers
CREATE INDEX IF NOT EXISTS idx_customers_company ON public.customers(company_name);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_tax_id ON public.customers(tax_id);

-- Invoices
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON public.invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_currency ON public.invoices(currency);
CREATE INDEX IF NOT EXISTS idx_invoices_po_number ON public.invoices(po_number);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status ON public.invoices(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date_status ON public.invoices(due_date, status);

-- Invoice Items
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON public.invoice_items(product_id);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON public.payments(transaction_reference);

-- Credit Notes
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON public.credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer ON public.credit_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_number ON public.credit_notes(credit_note_number);
CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON public.credit_notes(status);

-- Recurring Invoices
CREATE INDEX IF NOT EXISTS idx_recurring_customer ON public.recurring_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_recurring_status ON public.recurring_invoices(status);
CREATE INDEX IF NOT EXISTS idx_recurring_next_issue ON public.recurring_invoices(next_issue_date);

-- Reminders
CREATE INDEX IF NOT EXISTS idx_reminders_invoice ON public.invoice_reminders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON public.invoice_reminders(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON public.invoice_reminders(status);

-- Activity Log
CREATE INDEX IF NOT EXISTS idx_activity_invoice ON public.invoice_activity_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON public.invoice_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON public.invoice_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_created ON public.invoice_activity_log(created_at);

-- ============================================
-- DEFAULT SEED DATA
-- ============================================

-- Payment Terms
INSERT INTO public.payment_terms (id, name, description, due_days, is_default, sort_order)
VALUES 
    (gen_random_uuid(), 'Due on Receipt', 'Payment is due immediately', 0, true, 1),
    (gen_random_uuid(), 'Net 15', 'Payment due within 15 days', 15, false, 2),
    (gen_random_uuid(), 'Net 30', 'Payment due within 30 days', 30, false, 3),
    (gen_random_uuid(), 'Net 60', 'Payment due within 60 days', 60, false, 4)
ON CONFLICT DO NOTHING;

-- Tax Rates
INSERT INTO public.tax_rates (id, name, rate, tax_type, is_default, sort_order)
VALUES 
    (gen_random_uuid(), 'No Tax', 0, 'none', false, 1),
    (gen_random_uuid(), 'VAT 20%', 20, 'vat', true, 2),
    (gen_random_uuid(), 'VAT 10%', 10, 'vat', false, 3),
    (gen_random_uuid(), 'GST 10%', 10, 'gst', false, 4),
    (gen_random_uuid(), 'Sales Tax 8%', 8, 'sales_tax', false, 5)
ON CONFLICT DO NOTHING;

-- Invoice Templates
INSERT INTO public.invoice_templates (id, name, is_default, primary_color, show_payment_instructions, show_bank_details, show_tax_breakdown)
VALUES 
    (gen_random_uuid(), 'Default Modern', true, '#1a56db', true, true, true)
ON CONFLICT DO NOTHING;

-- Invoice Settings
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
VALUES (
    gen_random_uuid(),
    'INV-',
    1,
    'USD',
    30,
    true,
    true,
    true
)
ON CONFLICT DO NOTHING;

-- ============================================
-- TRIGGERS & FUNCTIONS
-- ============================================

-- Auto-update updated_at
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

-- Triggers for updated_at
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payment_terms_updated_at
    BEFORE UPDATE ON public.payment_terms
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tax_rates_updated_at
    BEFORE UPDATE ON public.tax_rates
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoice_templates_updated_at
    BEFORE UPDATE ON public.invoice_templates
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_credit_notes_updated_at
    BEFORE UPDATE ON public.credit_notes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recurring_invoices_updated_at
    BEFORE UPDATE ON public.recurring_invoices
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoice_settings_updated_at
    BEFORE UPDATE ON public.invoice_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to update invoice amount_due when payment is inserted/updated/deleted
CREATE TRIGGER update_invoice_amount_due_on_payment_change
    AFTER INSERT OR UPDATE OF amount, status OR DELETE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.update_invoice_amount_due();

-- ============================================
-- END OF SCHEMA
-- ============================================