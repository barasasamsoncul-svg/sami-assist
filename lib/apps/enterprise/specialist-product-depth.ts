import 'server-only';


const PRODUCT_DEPTH_SQL:
  Record<string, string> = {
  pos_shop: `
ALTER TABLE public.shop_products
  ADD COLUMN IF NOT EXISTS inventory_product_id UUID;

CREATE TABLE IF NOT EXISTS public.shop_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  opened_by UUID,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  opening_cash NUMERIC(19,4) NOT NULL DEFAULT 0,
  closing_cash NUMERIC(19,4),
  expected_cash NUMERIC(19,4),
  cash_difference NUMERIC(19,4),
  device_reference VARCHAR(180),
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (opening_cash >= 0),
  CHECK (closing_cash IS NULL OR closing_cash >= 0),
  CHECK (status IN ('open','closing','closed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_shop_sessions_company
  ON public.shop_sessions(company_id, status, opened_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.shop_orders
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.shop_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_warehouse_id UUID;

CREATE TABLE IF NOT EXISTS public.shop_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.shop_orders(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.shop_sessions(id) ON DELETE SET NULL,
  method VARCHAR(60) NOT NULL,
  amount NUMERIC(19,4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  provider_reference VARCHAR(255),
  paid_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount > 0),
  CHECK (status IN ('pending','authorized','captured','failed','refunded','void'))
);
CREATE INDEX IF NOT EXISTS idx_shop_payments_order
  ON public.shop_payments(company_id, order_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.shop_offline_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.shop_sessions(id) ON DELETE SET NULL,
  device_reference VARCHAR(180) NOT NULL,
  client_batch_reference VARCHAR(180) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  failure_reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'received',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('received','processing','processed','failed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_offline_batch
  ON public.shop_offline_batches(company_id, device_reference, client_batch_reference)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.shop_inventory_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.shop_orders(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'posted',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('posted','reversed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_inventory_posting
  ON public.shop_inventory_postings(company_id, order_id)
  WHERE deleted_at IS NULL AND status = 'posted';
`,

  pos_restaurant: `
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS inventory_product_id UUID;

CREATE TABLE IF NOT EXISTS public.restaurant_floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 10,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (sequence >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_floor_name
  ON public.restaurant_floors(company_id, LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;

ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS floor_id UUID REFERENCES public.restaurant_floors(id) ON DELETE SET NULL;

ALTER TABLE public.restaurant_orders
  ADD COLUMN IF NOT EXISTS inventory_warehouse_id UUID;

CREATE TABLE IF NOT EXISTS public.restaurant_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.restaurant_orders(id) ON DELETE CASCADE,
  method VARCHAR(60) NOT NULL,
  amount NUMERIC(19,4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  tip_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  provider_reference VARCHAR(255),
  paid_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount > 0),
  CHECK (tip_amount >= 0),
  CHECK (status IN ('pending','authorized','captured','failed','refunded','void'))
);
CREATE INDEX IF NOT EXISTS idx_restaurant_payments_order
  ON public.restaurant_payments(company_id, order_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.restaurant_kitchen_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.restaurant_orders(id) ON DELETE CASCADE,
  station VARCHAR(100),
  course VARCHAR(80),
  notes TEXT,
  fired_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('queued','preparing','ready','served','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_restaurant_kitchen_queue
  ON public.restaurant_kitchen_tickets(company_id, status, created_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.restaurant_inventory_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.restaurant_orders(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'posted',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('posted','reversed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_inventory_posting
  ON public.restaurant_inventory_postings(company_id, order_id)
  WHERE deleted_at IS NULL AND status = 'posted';
`,

  sign: `
CREATE TABLE IF NOT EXISTS public.signature_envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  message TEXT,
  expires_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('draft','sent','completed','expired','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_signature_envelopes_company
  ON public.signature_envelopes(company_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.signature_envelope_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  envelope_id UUID NOT NULL REFERENCES public.signature_envelopes(id) ON DELETE CASCADE,
  signature_request_id UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 10,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (sequence >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_signature_envelope_request
  ON public.signature_envelope_requests(company_id, envelope_id, signature_request_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.signature_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  signature_request_id UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  signer_id UUID REFERENCES public.signers(id) ON DELETE CASCADE,
  field_type VARCHAR(40) NOT NULL,
  page_number INTEGER NOT NULL DEFAULT 1,
  x NUMERIC(8,4) NOT NULL,
  y NUMERIC(8,4) NOT NULL,
  width NUMERIC(8,4) NOT NULL,
  height NUMERIC(8,4) NOT NULL,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  prefill_value TEXT,
  completed_value TEXT,
  completed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (page_number > 0),
  CHECK (width > 0 AND height > 0),
  CHECK (status IN ('pending','completed','waived'))
);
CREATE INDEX IF NOT EXISTS idx_signature_fields_request
  ON public.signature_fields(company_id, signature_request_id, signer_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.signature_auth_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  signature_request_id UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  signer_id UUID NOT NULL REFERENCES public.signers(id) ON DELETE CASCADE,
  method VARCHAR(30) NOT NULL,
  challenge_hash CHAR(64),
  expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (method IN ('email','sms','otp','identity','none')),
  CHECK (attempts >= 0),
  CHECK (status IN ('pending','verified','expired','locked','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_signature_auth_challenges
  ON public.signature_auth_challenges(company_id, signature_request_id, signer_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.signature_completion_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  signature_request_id UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  certificate_reference VARCHAR(180) NOT NULL,
  evidence_hash CHAR(64) NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  signer_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'issued',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('issued','revoked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_signature_completion_certificate
  ON public.signature_completion_certificates(company_id, signature_request_id)
  WHERE deleted_at IS NULL AND status = 'issued';
`,

  appointments: `
CREATE TABLE IF NOT EXISTS public.appointment_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  resource_type VARCHAR(80) NOT NULL,
  user_id UUID,
  capacity INTEGER NOT NULL DEFAULT 1,
  timezone VARCHAR(100) NOT NULL DEFAULT 'Africa/Nairobi',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (capacity > 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_appointment_resources_company
  ON public.appointment_resources(company_id, status, resource_type)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.appointment_resource_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.appointment_resources(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'reserved',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('reserved','released','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_resource_assignment
  ON public.appointment_resource_assignments(company_id, appointment_id, resource_id)
  WHERE deleted_at IS NULL AND status = 'reserved';

CREATE TABLE IF NOT EXISTS public.appointment_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.appointment_services(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  question_type VARCHAR(40) NOT NULL DEFAULT 'text',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 10,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (position >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_appointment_questions_service
  ON public.appointment_questions(company_id, service_id, position)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.appointment_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.appointment_questions(id) ON DELETE CASCADE,
  answer JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_answer
  ON public.appointment_answers(company_id, appointment_id, question_id)
  WHERE deleted_at IS NULL;
`,

  calendar: `
CREATE TABLE IF NOT EXISTS public.external_calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID,
  provider VARCHAR(40) NOT NULL,
  external_account_reference VARCHAR(255),
  sync_token_hash CHAR(64),
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (provider IN ('google','microsoft','caldav','other')),
  CHECK (status IN ('active','paused','error','revoked'))
);
CREATE INDEX IF NOT EXISTS idx_external_calendar_connections
  ON public.external_calendar_connections(company_id, user_id, provider, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.calendar_sync_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.external_calendar_connections(id) ON DELETE CASCADE,
  calendar_id UUID NOT NULL REFERENCES public.calendars(id) ON DELETE CASCADE,
  external_calendar_id VARCHAR(255) NOT NULL,
  direction VARCHAR(30) NOT NULL DEFAULT 'two_way',
  last_synced_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (direction IN ('import','export','two_way')),
  CHECK (status IN ('active','paused','error','revoked'))
);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_mappings
  ON public.calendar_sync_mappings(company_id, connection_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.calendar_event_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (channel IN ('email','sms','push','whatsapp')),
  CHECK (status IN ('scheduled','sent','failed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_calendar_event_reminders_due
  ON public.calendar_event_reminders(company_id, status, remind_at)
  WHERE deleted_at IS NULL;
`,

  documents: `
CREATE TABLE IF NOT EXISTS public.document_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_tags_name
  ON public.document_tags(company_id, LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.document_tag_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.document_tags(id) ON DELETE CASCADE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_tag_link
  ON public.document_tag_links(company_id, document_id, tag_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.document_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  share_reference VARCHAR(120) NOT NULL DEFAULT gen_random_uuid()::text,
  share_code_hash CHAR(64) NOT NULL DEFAULT encode(digest(gen_random_uuid()::text,'sha256'),'hex'),
  permission VARCHAR(30) NOT NULL DEFAULT 'view',
  expires_at TIMESTAMPTZ,
  max_downloads INTEGER,
  download_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (max_downloads IS NULL OR max_downloads > 0),
  CHECK (download_count >= 0),
  CHECK (permission IN ('view','download')),
  CHECK (status IN ('active','expired','revoked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_share_reference
  ON public.document_share_links(company_id, share_reference)
  WHERE deleted_at IS NULL;
`,

  surveys: `
CREATE TABLE IF NOT EXISTS public.survey_question_logic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  source_question_id UUID NOT NULL REFERENCES public.survey_questions(id) ON DELETE CASCADE,
  operator VARCHAR(30) NOT NULL,
  compare_value TEXT,
  target_question_id UUID REFERENCES public.survey_questions(id) ON DELETE CASCADE,
  action VARCHAR(30) NOT NULL DEFAULT 'show',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (operator IN ('equals','not_equals','contains','greater_than','less_than','answered')),
  CHECK (action IN ('show','hide','skip_to','end')),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_survey_question_logic
  ON public.survey_question_logic(company_id, survey_id, source_question_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.survey_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  email VARCHAR(320),
  phone VARCHAR(80),
  invite_reference VARCHAR(160) NOT NULL DEFAULT gen_random_uuid()::text,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CHECK (status IN ('pending','sent','opened','completed','expired','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_invitation_reference
  ON public.survey_invitations(company_id, invite_reference)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.survey_response_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  response_id UUID NOT NULL REFERENCES public.survey_responses(id) ON DELETE CASCADE,
  score NUMERIC(12,4) NOT NULL DEFAULT 0,
  max_score NUMERIC(12,4) NOT NULL DEFAULT 0,
  percentage NUMERIC(7,4),
  grading JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'computed',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (score >= 0),
  CHECK (max_score >= 0),
  CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100)),
  CHECK (status IN ('computed','reviewed','invalidated'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_response_score
  ON public.survey_response_scores(company_id, response_id)
  WHERE deleted_at IS NULL AND status <> 'invalidated';
`,

  spreadsheet: `
CREATE TABLE IF NOT EXISTS public.spreadsheet_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workbook_id UUID NOT NULL REFERENCES public.workbooks(id) ON DELETE CASCADE,
  sheet_id UUID REFERENCES public.sheets(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  chart_type VARCHAR(60) NOT NULL,
  data_range VARCHAR(120),
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  position JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','archived'))
);
CREATE INDEX IF NOT EXISTS idx_spreadsheet_charts
  ON public.spreadsheet_charts(company_id, workbook_id, sheet_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.spreadsheet_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workbook_id UUID NOT NULL REFERENCES public.workbooks(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  filter_type VARCHAR(60) NOT NULL,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','archived'))
);
CREATE INDEX IF NOT EXISTS idx_spreadsheet_filters
  ON public.spreadsheet_filters(company_id, workbook_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.spreadsheet_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workbook_id UUID NOT NULL REFERENCES public.workbooks(id) ON DELETE CASCADE,
  snapshot_reference VARCHAR(160) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'current',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('current','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_spreadsheet_snapshot_reference
  ON public.spreadsheet_snapshots(company_id, snapshot_reference)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.spreadsheet_refresh_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  data_source_id UUID NOT NULL REFERENCES public.spreadsheet_data_sources(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  row_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'running',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (row_count >= 0),
  CHECK (status IN ('running','completed','failed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_spreadsheet_refresh_runs
  ON public.spreadsheet_refresh_runs(company_id, data_source_id, started_at DESC)
  WHERE deleted_at IS NULL;
`,
};


export function specialistProductDepthSql(
  moduleKey:
    string,
) {
  return (
    PRODUCT_DEPTH_SQL[
      moduleKey
    ] ||
    ''
  );
}
