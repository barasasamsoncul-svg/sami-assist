export interface Customer {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  tax_id: string | null;
  tax_id_type: string;
  registration_number: string | null;
  currency: string;
  payment_terms_id: string | null;
  credit_limit: number | null;
  customer_type: 'individual' | 'company' | 'government' | 'non_profit';
  industry: string | null;
  status: 'active' | 'inactive' | 'blocked';
  notes: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  unit_price: number;
  tax_rate_id: string | null;
  category: string | null;
  is_active: boolean;
  notes: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  tax_rate_name?: string;
  tax_rate?: number;
  tax_type?: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_type: 'percentage' | 'fixed' | null;
  discount_value: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  tax_rate_id: string | null;
  line_total: number;
  sort_order: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  product?: Product;
  tax_rate_details?: {
    id: string;
    name: string;
    rate: number;
    tax_type: string;
  };
}

export interface Invoice {
  id: string;
  customer_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  payment_date: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  approved_at: string | null;
  status: 'draft' | 'pending_approval' | 'sent' | 'viewed' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled' | 'void';
  subtotal: number;
  discount_type: 'percentage' | 'fixed' | null;
  discount_value: number;
  discount_amount: number;
  tax_calculation_method: 'exclusive' | 'inclusive';
  tax_amount: number;
  shipping_cost: number;
  shipping_tax: number;
  rounding_adjustment: number;
  rounded_total: number | null;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  po_number: string | null;
  currency: string;
  exchange_rate: number;
  payment_terms_id: string | null;
  payment_terms_display: string | null;
  fiscal_year: number | null;
  fiscal_period: number | null;
  template_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  cancelled_by: string | null;
  cancelled_reason: string | null;
  reminder_count: number;
  last_reminder_sent_at: string | null;
  next_reminder_at: string | null;
  notes: string | null;
  internal_notes: string | null;
  footer_text: string | null;
  attachments: any[];
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  items?: InvoiceItem[];
  payment_terms?: {
    id: string;
    name: string;
    due_days: number;
  };
  template?: {
    id: string;
    name: string;
    primary_color: string;
  };
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  payment_method: 'cash' | 'bank_transfer' | 'credit_card' | 'debit_card' | 'mobile_money' | 'cheque' | 'paypal' | 'stripe' | 'mpesa' | 'other';
  payment_method_details: Record<string, any>;
  transaction_reference: string | null;
  payment_date: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'disputed';
  reconciled: boolean;
  reconciled_at: string | null;
  reconciled_by: string | null;
  notes: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CreditNote {
  id: string;
  invoice_id: string;
  customer_id: string;
  credit_note_number: string;
  issue_date: string;
  amount: number;
  tax_amount: number;
  currency: string;
  status: 'issued' | 'applied' | 'void';
  applied_to_invoice_id: string | null;
  applied_amount: number | null;
  applied_at: string | null;
  reason: string;
  reason_details: string | null;
  created_by: string | null;
  notes: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface RecurringInvoice {
  id: string;
  customer_id: string;
  template_id: string | null;
  payment_terms_id: string | null;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'biannual' | 'yearly';
  interval_value: number;
  start_date: string;
  end_date: string | null;
  next_issue_date: string;
  last_issue_date: string | null;
  currency: string;
  discount_type: 'percentage' | 'fixed' | null;
  discount_value: number;
  tax_calculation_method: 'exclusive' | 'inclusive';
  items: any[];
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  total_generated: number;
  total_amount_generated: number;
  notes: string | null;
  created_by: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  tax_type: 'vat' | 'gst' | 'sales_tax' | 'withholding' | 'none' | 'other';
  country: string | null;
  region: string | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PaymentTerm {
  id: string;
  name: string;
  description: string | null;
  due_days: number;
  discount_percentage: number;
  discount_days: number | null;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface InvoiceTemplate {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
  primary_color: string;
  secondary_color: string;
  accent_color: string | null;
  logo_url: string | null;
  font_family: string;
  logo_position: 'left' | 'center' | 'right';
  header_style: 'modern' | 'classic' | 'minimal' | 'bold';
  show_company_logo: boolean;
  show_company_address: boolean;
  show_company_contact: boolean;
  show_tax_id: boolean;
  show_payment_instructions: boolean;
  show_bank_details: boolean;
  show_tax_breakdown: boolean;
  show_discount: boolean;
  show_shipping: boolean;
  show_po_number: boolean;
  show_customer_tax_id: boolean;
  show_customer_address: boolean;
  show_invoice_notes: boolean;
  show_terms_and_conditions: boolean;
  header_text: string | null;
  footer_text: string | null;
  payment_instructions: string | null;
  bank_details: string | null;
  terms_and_conditions: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}