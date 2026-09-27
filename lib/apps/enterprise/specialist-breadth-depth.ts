import 'server-only';


const SPECIALIST_BREADTH_SQL:
  Record<
    string,
    string
  > = {
  appointments: `
CREATE TABLE IF NOT EXISTS public.appointment_availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.appointment_services(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'blocked',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (ends_at > starts_at),
  CHECK (status IN ('blocked','released','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_appointment_availability_blocks_company
  ON public.appointment_availability_blocks(company_id, starts_at, ends_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.appointment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
  provider_reference VARCHAR(255),
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (channel IN ('email','sms','whatsapp','push')),
  CHECK (status IN ('scheduled','sent','failed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_queue
  ON public.appointment_reminders(company_id, status, scheduled_at)
  WHERE deleted_at IS NULL;
`,

  documents: `
CREATE TABLE IF NOT EXISTS public.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  checksum_sha256 CHAR(64),
  size_bytes BIGINT NOT NULL DEFAULT 0,
  mime_type VARCHAR(160),
  status VARCHAR(30) NOT NULL DEFAULT 'current',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (version_number > 0),
  CHECK (size_bytes >= 0),
  CHECK (status IN ('current','superseded','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_versions_number
  ON public.document_versions(company_id, document_id, version_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.document_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  reviewer_user_id UUID,
  decision VARCHAR(30) NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  comment TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (decision IN ('pending','approved','rejected')),
  CHECK (status IN ('pending','approved','rejected','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_document_approvals_queue
  ON public.document_approvals(company_id, status, requested_at)
  WHERE deleted_at IS NULL;
`,

  email_marketing: `
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  html_body TEXT,
  text_body TEXT,
  category VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('draft','active','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_templates_name
  ON public.email_templates(company_id, LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.email_campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.email_recipients(id) ON DELETE SET NULL,
  event_type VARCHAR(40) NOT NULL,
  provider_message_id VARCHAR(255),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'recorded',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (event_type IN ('queued','sent','delivered','opened','clicked','bounced','complained','unsubscribed')),
  CHECK (status IN ('recorded','ignored'))
);
CREATE INDEX IF NOT EXISTS idx_email_campaign_events_campaign
  ON public.email_campaign_events(company_id, campaign_id, occurred_at DESC)
  WHERE deleted_at IS NULL;
`,

  events: `
CREATE TABLE IF NOT EXISTS public.event_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  capacity INTEGER,
  location VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (ends_at > starts_at),
  CHECK (capacity IS NULL OR capacity >= 0),
  CHECK (status IN ('scheduled','open','completed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_event_sessions_event
  ON public.event_sessions(company_id, event_id, starts_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.event_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  registration_id UUID REFERENCES public.event_registrations(id) ON DELETE SET NULL,
  ticket_code VARCHAR(160) NOT NULL,
  ticket_type VARCHAR(100) NOT NULL DEFAULT 'general',
  amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  checked_in_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'issued',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount >= 0),
  CHECK (status IN ('issued','checked_in','cancelled','refunded'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_ticket_code
  ON public.event_tickets(company_id, ticket_code)
  WHERE deleted_at IS NULL;
`,

  field_services: `
CREATE TABLE IF NOT EXISTS public.service_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  service_visit_id UUID REFERENCES public.service_visits(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('open','completed','waived','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_service_checklists_order
  ON public.service_checklists(company_id, service_order_id, status)
  WHERE deleted_at IS NULL;
`,

  fleet: `
CREATE TABLE IF NOT EXISTS public.vehicle_fuel_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  fueled_on DATE NOT NULL,
  odometer NUMERIC(19,2),
  litres NUMERIC(19,4) NOT NULL,
  total_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
  vendor VARCHAR(180),
  receipt_reference VARCHAR(180),
  status VARCHAR(30) NOT NULL DEFAULT 'posted',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (odometer IS NULL OR odometer >= 0),
  CHECK (litres > 0),
  CHECK (total_cost >= 0),
  CHECK (status IN ('draft','posted','void'))
);
CREATE INDEX IF NOT EXISTS idx_vehicle_fuel_logs_vehicle
  ON public.vehicle_fuel_logs(company_id, vehicle_id, fueled_on DESC)
  WHERE deleted_at IS NULL;
`,

  maintenance: `
CREATE TABLE IF NOT EXISTS public.preventive_maintenance_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  frequency_days INTEGER NOT NULL,
  next_due_on DATE NOT NULL,
  last_completed_on DATE,
  instructions TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (frequency_days > 0),
  CHECK (status IN ('active','paused','retired'))
);
CREATE INDEX IF NOT EXISTS idx_preventive_maintenance_due
  ON public.preventive_maintenance_plans(company_id, status, next_due_on)
  WHERE deleted_at IS NULL;
`,

  marketing_automation: `
CREATE TABLE IF NOT EXISTS public.automation_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  description TEXT,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_members INTEGER NOT NULL DEFAULT 0,
  last_evaluated_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (estimated_members >= 0),
  CHECK (status IN ('draft','active','paused','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_segments_name
  ON public.automation_segments(company_id, LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;
`,

  planning: `
CREATE TABLE IF NOT EXISTS public.planning_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.planning_resources(id) ON DELETE CASCADE,
  capacity_date DATE NOT NULL,
  capacity_hours NUMERIC(9,2) NOT NULL DEFAULT 0,
  allocated_hours NUMERIC(9,2) NOT NULL DEFAULT 0,
  unavailable_hours NUMERIC(9,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (capacity_hours >= 0),
  CHECK (allocated_hours >= 0),
  CHECK (unavailable_hours >= 0),
  CHECK (status IN ('open','overallocated','closed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_planning_capacity_resource_date
  ON public.planning_capacity(company_id, resource_id, capacity_date)
  WHERE deleted_at IS NULL;
`,

  plm: `
CREATE TABLE IF NOT EXISTS public.engineering_change_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  engineering_change_id UUID NOT NULL REFERENCES public.engineering_changes(id) ON DELETE CASCADE,
  reviewer_user_id UUID,
  decision VARCHAR(30) NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  comment TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (decision IN ('pending','approved','rejected')),
  CHECK (status IN ('pending','approved','rejected','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_engineering_change_approvals
  ON public.engineering_change_approvals(company_id, engineering_change_id, status)
  WHERE deleted_at IS NULL;
`,

  pos_shop: `
CREATE TABLE IF NOT EXISTS public.shop_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.shop_orders(id) ON DELETE RESTRICT,
  return_number VARCHAR(120) NOT NULL,
  reason TEXT,
  amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  restock BOOLEAN NOT NULL DEFAULT TRUE,
  processed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount >= 0),
  CHECK (status IN ('draft','approved','processed','rejected','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_returns_number
  ON public.shop_returns(company_id, return_number)
  WHERE deleted_at IS NULL;
`,

  quality: `
CREATE TABLE IF NOT EXISTS public.quality_corrective_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quality_issue_id UUID NOT NULL REFERENCES public.quality_issues(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  owner_user_id UUID,
  due_on DATE,
  root_cause TEXT,
  action_plan TEXT,
  verified_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('open','in_progress','implemented','verified','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_quality_corrective_actions_queue
  ON public.quality_corrective_actions(company_id, status, due_on)
  WHERE deleted_at IS NULL;
`,

  referrals: `
CREATE TABLE IF NOT EXISTS public.referral_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  referral_id UUID NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  converted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  conversion_reference VARCHAR(180),
  value NUMERIC(19,4) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'confirmed',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (value >= 0),
  CHECK (status IN ('pending','confirmed','reversed'))
);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_referral
  ON public.referral_conversions(company_id, referral_id, converted_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  referral_id UUID NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  conversion_id UUID REFERENCES public.referral_conversions(id) ON DELETE SET NULL,
  reward_type VARCHAR(40) NOT NULL DEFAULT 'credit',
  amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  issued_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount >= 0),
  CHECK (status IN ('pending','approved','issued','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_queue
  ON public.referral_rewards(company_id, status, created_at)
  WHERE deleted_at IS NULL;
`,

  rentals: `
CREATE TABLE IF NOT EXISTS public.rental_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rental_item_id UUID NOT NULL REFERENCES public.rental_items(id) ON DELETE RESTRICT,
  rental_contract_id UUID REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  quantity NUMERIC(19,4) NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'reserved',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (ends_at > starts_at),
  CHECK (quantity > 0),
  CHECK (status IN ('reserved','active','returned','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_rental_reservations_item
  ON public.rental_reservations(company_id, rental_item_id, starts_at, ends_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.rental_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rental_contract_id UUID NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  charge_type VARCHAR(40) NOT NULL,
  description TEXT,
  amount NUMERIC(19,4) NOT NULL,
  charge_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount >= 0),
  CHECK (status IN ('pending','posted','waived','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_rental_charges_contract
  ON public.rental_charges(company_id, rental_contract_id, charge_date DESC)
  WHERE deleted_at IS NULL;
`,

  sign: `
CREATE TABLE IF NOT EXISTS public.signature_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  document_kind VARCHAR(100),
  subject VARCHAR(255),
  message TEXT,
  signer_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('draft','active','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_signature_templates_name
  ON public.signature_templates(company_id, LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.signature_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  signature_request_id UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  signer_id UUID REFERENCES public.signers(id) ON DELETE SET NULL,
  event_type VARCHAR(40) NOT NULL,
  ip_hash CHAR(64),
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'recorded',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (event_type IN ('created','sent','viewed','authenticated','signed','declined','expired','cancelled')),
  CHECK (status IN ('recorded','ignored'))
);
CREATE INDEX IF NOT EXISTS idx_signature_audit_events_request
  ON public.signature_audit_events(company_id, signature_request_id, occurred_at DESC)
  WHERE deleted_at IS NULL;
`,

  sms_marketing: `
CREATE TABLE IF NOT EXISTS public.sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  sender_id VARCHAR(80),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('draft','active','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_templates_name
  ON public.sms_templates(company_id, LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.sms_delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.sms_campaigns(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.sms_recipients(id) ON DELETE SET NULL,
  event_type VARCHAR(40) NOT NULL,
  provider_message_id VARCHAR(255),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'recorded',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (event_type IN ('queued','sent','delivered','failed','opted_out')),
  CHECK (status IN ('recorded','ignored'))
);
CREATE INDEX IF NOT EXISTS idx_sms_delivery_events_campaign
  ON public.sms_delivery_events(company_id, campaign_id, occurred_at DESC)
  WHERE deleted_at IS NULL;
`,

  social_marketing: `
CREATE TABLE IF NOT EXISTS public.social_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  objective VARCHAR(120),
  starts_on DATE,
  ends_on DATE,
  budget NUMERIC(19,4) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  CHECK (budget >= 0),
  CHECK (status IN ('draft','scheduled','active','completed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_social_campaigns_company
  ON public.social_campaigns(company_id, status, starts_on)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.social_post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  impressions BIGINT NOT NULL DEFAULT 0,
  reach BIGINT NOT NULL DEFAULT 0,
  engagements BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'recorded',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (impressions >= 0),
  CHECK (reach >= 0),
  CHECK (engagements >= 0),
  CHECK (clicks >= 0),
  CHECK (conversions >= 0),
  CHECK (status IN ('recorded','estimated'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_post_metrics_day
  ON public.social_post_metrics(company_id, post_id, metric_date)
  WHERE deleted_at IS NULL;
`,
};


export function specialistBreadthDepthSql(
  moduleKey:
    string,
) {
  return (
    SPECIALIST_BREADTH_SQL[
      moduleKey
    ] ||
    ''
  );
}
