import 'server-only';


export function commerceParityDepthSql(
  moduleKey:
    string,
) {
  switch (
    moduleKey
  ) {
    case 'appointments':
      return `
CREATE TABLE IF NOT EXISTS public.appointment_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.appointment_services(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer_type VARCHAR(30) NOT NULL DEFAULT 'text',
  required BOOLEAN NOT NULL DEFAULT FALSE,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  sequence INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (answer_type IN ('text','textarea','number','date','choice','boolean')),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_appointment_questions_service
  ON public.appointment_questions(company_id, service_id, sequence)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.appointment_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.appointment_questions(id) ON DELETE RESTRICT,
  answer JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_answer_question
  ON public.appointment_answers(company_id, appointment_id, question_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.appointment_calendar_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  provider VARCHAR(40) NOT NULL,
  external_calendar_id VARCHAR(255),
  external_event_id VARCHAR(255),
  sync_token TEXT,
  last_synced_at TIMESTAMPTZ,
  sync_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (provider IN ('google','microsoft','ical','other')),
  CHECK (sync_status IN ('pending','synced','failed','disabled'))
);
CREATE INDEX IF NOT EXISTS idx_appointment_calendar_links_appointment
  ON public.appointment_calendar_links(company_id, appointment_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.appointment_payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  payment_reference VARCHAR(180),
  checkout_reference VARCHAR(180),
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount >= 0),
  CHECK (status IN ('pending','paid','expired','cancelled','failed'))
);
CREATE INDEX IF NOT EXISTS idx_appointment_payment_requests
  ON public.appointment_payment_requests(company_id, appointment_id, status)
  WHERE deleted_at IS NULL;
`;

    case 'crm':
      return `
CREATE TABLE IF NOT EXISTS public.crm_assignment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  entity_type VARCHAR(30) NOT NULL DEFAULT 'lead',
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  assignee_user_id UUID,
  assignee_team VARCHAR(180),
  priority INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (entity_type IN ('lead','opportunity')),
  CHECK (priority >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_crm_assignment_rules_priority
  ON public.crm_assignment_rules(company_id, entity_type, priority)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  entity_type VARCHAR(30) NOT NULL DEFAULT 'lead',
  start_state VARCHAR(100) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (entity_type IN ('lead','opportunity')),
  CHECK (status IN ('draft','active','inactive','archived'))
);
CREATE INDEX IF NOT EXISTS idx_crm_blueprints_company
  ON public.crm_blueprints(company_id, entity_type, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_blueprint_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  blueprint_id UUID NOT NULL REFERENCES public.crm_blueprints(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  from_state VARCHAR(100) NOT NULL,
  to_state VARCHAR(100) NOT NULL,
  required_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_permission VARCHAR(180),
  automation_action VARCHAR(180),
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_crm_blueprint_transitions
  ON public.crm_blueprint_transitions(company_id, blueprint_id, from_state)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type VARCHAR(30) NOT NULL,
  entity_id UUID NOT NULL,
  requested_by UUID,
  approver_user_id UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decision VARCHAR(30) NOT NULL DEFAULT 'pending',
  reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (entity_type IN ('lead','opportunity')),
  CHECK (decision IN ('pending','approved','rejected')),
  CHECK (status IN ('pending','approved','rejected','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_crm_approval_queue
  ON public.crm_approval_requests(company_id, status, requested_at)
  WHERE deleted_at IS NULL;
`;

    case 'inventory':
      return `
CREATE TABLE IF NOT EXISTS public.inventory_item_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  sku_prefix VARCHAR(80),
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','inactive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_item_group_name
  ON public.inventory_item_groups(company_id, LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.inventory_composite_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity NUMERIC(19,4) NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (quantity > 0),
  CHECK (status IN ('active','inactive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_composite_product
  ON public.inventory_composite_items(company_id, product_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.inventory_composite_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  composite_id UUID NOT NULL REFERENCES public.inventory_composite_items(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC(19,4) NOT NULL,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_inventory_composite_components
  ON public.inventory_composite_components(company_id, composite_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.inventory_price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  valid_from DATE,
  valid_to DATE,
  customer_reference UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CHECK (status IN ('active','inactive','expired'))
);
CREATE INDEX IF NOT EXISTS idx_inventory_price_lists_company
  ON public.inventory_price_lists(company_id, status, valid_from)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.inventory_price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  price_list_id UUID NOT NULL REFERENCES public.inventory_price_lists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  min_quantity NUMERIC(19,4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(19,4) NOT NULL,
  discount_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (min_quantity > 0),
  CHECK (unit_price >= 0),
  CHECK (discount_percent >= 0 AND discount_percent <= 100)
);
CREATE INDEX IF NOT EXISTS idx_inventory_price_list_items
  ON public.inventory_price_list_items(company_id, price_list_id, product_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.inventory_transfer_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  transfer_number VARCHAR(100) NOT NULL,
  source_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  destination_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shipped_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (source_warehouse_id <> destination_warehouse_id),
  CHECK (status IN ('draft','approved','in_transit','received','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_transfer_number
  ON public.inventory_transfer_orders(company_id, transfer_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.inventory_transfer_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  transfer_id UUID NOT NULL REFERENCES public.inventory_transfer_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  requested_quantity NUMERIC(19,4) NOT NULL,
  shipped_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
  received_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (requested_quantity > 0),
  CHECK (shipped_quantity >= 0 AND shipped_quantity <= requested_quantity),
  CHECK (received_quantity >= 0 AND received_quantity <= shipped_quantity)
);
CREATE INDEX IF NOT EXISTS idx_inventory_transfer_lines
  ON public.inventory_transfer_order_lines(company_id, transfer_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.inventory_cycle_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  assigned_user_id UUID,
  due_on DATE NOT NULL,
  counted_at TIMESTAMPTZ,
  counted_quantity NUMERIC(19,4),
  system_quantity NUMERIC(19,4),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (counted_quantity IS NULL OR counted_quantity >= 0),
  CHECK (system_quantity IS NULL OR system_quantity >= 0),
  CHECK (status IN ('pending','in_progress','counted','posted','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_inventory_cycle_counts_due
  ON public.inventory_cycle_counts(company_id, status, due_on)
  WHERE deleted_at IS NULL;
`;

    case 'pos_shop':
      return `
CREATE TABLE IF NOT EXISTS public.pos_shop_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_number VARCHAR(100) NOT NULL,
  opened_by UUID,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opening_cash NUMERIC(19,4) NOT NULL DEFAULT 0,
  closed_by UUID,
  closed_at TIMESTAMPTZ,
  closing_cash NUMERIC(19,4),
  expected_cash NUMERIC(19,4),
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (opening_cash >= 0),
  CHECK (status IN ('open','closing','closed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_shop_session_number
  ON public.pos_shop_sessions(company_id, session_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.pos_shop_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.shop_orders(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.pos_shop_sessions(id) ON DELETE SET NULL,
  method VARCHAR(40) NOT NULL,
  amount NUMERIC(19,4) NOT NULL,
  provider_reference VARCHAR(255),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'posted',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount >= 0),
  CHECK (status IN ('pending','posted','failed','refunded','void'))
);
CREATE INDEX IF NOT EXISTS idx_pos_shop_payments_order
  ON public.pos_shop_payments(company_id, order_id, paid_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.pos_shop_cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.pos_shop_sessions(id) ON DELETE CASCADE,
  movement_type VARCHAR(20) NOT NULL,
  amount NUMERIC(19,4) NOT NULL,
  reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'posted',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (movement_type IN ('cash_in','cash_out')),
  CHECK (amount > 0),
  CHECK (status IN ('posted','void'))
);
CREATE INDEX IF NOT EXISTS idx_pos_shop_cash_movements
  ON public.pos_shop_cash_movements(company_id, session_id, occurred_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.pos_shop_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  device_type VARCHAR(50) NOT NULL,
  provider VARCHAR(100),
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (device_type IN ('terminal','printer','scanner','scale','cash_drawer','customer_display','kiosk','other')),
  CHECK (status IN ('active','inactive','offline'))
);
CREATE INDEX IF NOT EXISTS idx_pos_shop_devices
  ON public.pos_shop_devices(company_id, device_type, status)
  WHERE deleted_at IS NULL;
`;

    case 'pos_restaurant':
      return `
CREATE TABLE IF NOT EXISTS public.restaurant_floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','inactive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_floor_name
  ON public.restaurant_floors(company_id, LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.restaurant_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_number VARCHAR(100) NOT NULL,
  opened_by UUID,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_by UUID,
  closed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('open','closing','closed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_session_number
  ON public.restaurant_sessions(company_id, session_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.restaurant_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.restaurant_orders(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.restaurant_sessions(id) ON DELETE SET NULL,
  method VARCHAR(40) NOT NULL,
  amount NUMERIC(19,4) NOT NULL,
  tip_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  provider_reference VARCHAR(255),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'posted',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount >= 0),
  CHECK (tip_amount >= 0),
  CHECK (status IN ('pending','posted','failed','refunded','void'))
);
CREATE INDEX IF NOT EXISTS idx_restaurant_payments_order
  ON public.restaurant_payments(company_id, order_id, paid_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.restaurant_preparation_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.restaurant_orders(id) ON DELETE CASCADE,
  station VARCHAR(120),
  sequence INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('queued','preparing','ready','served','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_restaurant_preparation_queue
  ON public.restaurant_preparation_tickets(company_id, status, sequence)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.restaurant_self_order_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  customer_reference UUID,
  order_id UUID REFERENCES public.restaurant_orders(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','ordered','expired','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_restaurant_self_order_sessions
  ON public.restaurant_self_order_sessions(company_id, status, expires_at)
  WHERE deleted_at IS NULL;
`;

    case 'sign':
      return `
CREATE TABLE IF NOT EXISTS public.signature_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  signature_request_id UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  document_name VARCHAR(255) NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 1,
  checksum_sha256 CHAR(64),
  completed_file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('pending','ready','signed','declined','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_signature_documents_request
  ON public.signature_documents(company_id, signature_request_id, sequence)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.signature_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.signature_documents(id) ON DELETE CASCADE,
  signer_id UUID REFERENCES public.signers(id) ON DELETE SET NULL,
  field_type VARCHAR(30) NOT NULL,
  page_number INTEGER NOT NULL,
  x NUMERIC(9,4) NOT NULL,
  y NUMERIC(9,4) NOT NULL,
  width NUMERIC(9,4) NOT NULL,
  height NUMERIC(9,4) NOT NULL,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  value JSONB,
  completed_at TIMESTAMPTZ,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (field_type IN ('signature','initial','name','email','date','text','checkbox')),
  CHECK (page_number > 0),
  CHECK (width > 0 AND height > 0)
);
CREATE INDEX IF NOT EXISTS idx_signature_fields_document
  ON public.signature_fields(company_id, document_id, page_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.signature_auth_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  signer_id UUID NOT NULL REFERENCES public.signers(id) ON DELETE CASCADE,
  method VARCHAR(30) NOT NULL,
  challenge_hash CHAR(64),
  expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (method IN ('email','sms','otp','access_code','identity')),
  CHECK (attempts >= 0),
  CHECK (status IN ('pending','verified','failed','expired','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_signature_auth_challenges
  ON public.signature_auth_challenges(company_id, signer_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.signature_completion_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  signature_request_id UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  certificate_number VARCHAR(120) NOT NULL,
  document_hash CHAR(64) NOT NULL,
  audit_hash CHAR(64) NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  certificate_file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'issued',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('issued','revoked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_signature_certificate_number
  ON public.signature_completion_certificates(company_id, certificate_number)
  WHERE deleted_at IS NULL;
`;

    case 'purchase':
      return `
CREATE TABLE IF NOT EXISTS public.supplier_price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  valid_from DATE,
  valid_to DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CHECK (status IN ('active','inactive','expired'))
);
CREATE INDEX IF NOT EXISTS idx_supplier_price_lists
  ON public.supplier_price_lists(company_id, supplier_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.supplier_price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  price_list_id UUID NOT NULL REFERENCES public.supplier_price_lists(id) ON DELETE CASCADE,
  product_reference UUID,
  description TEXT,
  min_quantity NUMERIC(19,4) NOT NULL DEFAULT 1,
  unit_cost NUMERIC(19,4) NOT NULL,
  lead_time_days INTEGER NOT NULL DEFAULT 0,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (min_quantity > 0),
  CHECK (unit_cost >= 0),
  CHECK (lead_time_days >= 0)
);
CREATE INDEX IF NOT EXISTS idx_supplier_price_list_items
  ON public.supplier_price_list_items(company_id, price_list_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.supplier_rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rfq_number VARCHAR(100) NOT NULL,
  requisition_id UUID REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('draft','sent','evaluating','awarded','closed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_rfq_number
  ON public.supplier_rfqs(company_id, rfq_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.supplier_rfq_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rfq_id UUID NOT NULL REFERENCES public.supplier_rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  quote_reference VARCHAR(160),
  total_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  promised_date DATE,
  terms TEXT,
  submitted_at TIMESTAMPTZ,
  score NUMERIC(9,4),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (total_amount >= 0),
  CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  CHECK (status IN ('draft','submitted','shortlisted','awarded','rejected','withdrawn'))
);
CREATE INDEX IF NOT EXISTS idx_supplier_rfq_responses
  ON public.supplier_rfq_responses(company_id, rfq_id, status)
  WHERE deleted_at IS NULL;
`;

    case 'shipping':
      return `
CREATE TABLE IF NOT EXISTS public.shipping_rate_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shipment_id UUID REFERENCES public.shipments(id) ON DELETE CASCADE,
  carrier_id UUID REFERENCES public.shipping_carriers(id) ON DELETE SET NULL,
  service_code VARCHAR(120),
  amount NUMERIC(19,4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  estimated_days INTEGER,
  expires_at TIMESTAMPTZ,
  provider_reference VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'quoted',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount >= 0),
  CHECK (estimated_days IS NULL OR estimated_days >= 0),
  CHECK (status IN ('quoted','selected','expired','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_shipping_rate_quotes
  ON public.shipping_rate_quotes(company_id, shipment_id, amount)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.shipping_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  carrier_id UUID REFERENCES public.shipping_carriers(id) ON DELETE SET NULL,
  tracking_number VARCHAR(180),
  label_file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  provider_reference VARCHAR(255),
  purchased_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'created',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('created','purchased','printed','voided','failed'))
);
CREATE INDEX IF NOT EXISTS idx_shipping_labels_shipment
  ON public.shipping_labels(company_id, shipment_id, status)
  WHERE deleted_at IS NULL;
`;

    case 'customer_portal':
      return `
CREATE TABLE IF NOT EXISTS public.portal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  portal_customer_id UUID NOT NULL REFERENCES public.portal_customers(id) ON DELETE CASCADE,
  request_type VARCHAR(80) NOT NULL,
  resource_type VARCHAR(80),
  resource_id UUID,
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  priority VARCHAR(30) NOT NULL DEFAULT 'normal',
  assigned_user_id UUID,
  resolved_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (priority IN ('low','normal','high','urgent')),
  CHECK (status IN ('open','in_progress','resolved','closed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_portal_requests_queue
  ON public.portal_requests(company_id, status, priority, created_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.portal_document_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  portal_customer_id UUID NOT NULL REFERENCES public.portal_customers(id) ON DELETE CASCADE,
  resource_type VARCHAR(80) NOT NULL,
  resource_id UUID NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  downloaded_at TIMESTAMPTZ,
  ip_hash CHAR(64),
  user_agent TEXT,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_portal_document_views
  ON public.portal_document_views(company_id, portal_customer_id, viewed_at DESC)
  WHERE deleted_at IS NULL;
`;

    case 'vendor_portal':
      return `
CREATE TABLE IF NOT EXISTS public.vendor_portal_rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vendor_account_id UUID NOT NULL REFERENCES public.vendor_portal_accounts(id) ON DELETE CASCADE,
  purchase_rfq_id UUID,
  rfq_number VARCHAR(100) NOT NULL,
  due_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'sent',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('sent','opened','responded','awarded','closed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_vendor_portal_rfqs
  ON public.vendor_portal_rfqs(company_id, vendor_account_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.vendor_portal_rfq_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  portal_rfq_id UUID NOT NULL REFERENCES public.vendor_portal_rfqs(id) ON DELETE CASCADE,
  amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  promised_date DATE,
  terms TEXT,
  submitted_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount >= 0),
  CHECK (status IN ('draft','submitted','withdrawn','accepted','rejected'))
);
CREATE INDEX IF NOT EXISTS idx_vendor_portal_rfq_responses
  ON public.vendor_portal_rfq_responses(company_id, portal_rfq_id, status)
  WHERE deleted_at IS NULL;
`;

    default:
      return '';
  }
}
