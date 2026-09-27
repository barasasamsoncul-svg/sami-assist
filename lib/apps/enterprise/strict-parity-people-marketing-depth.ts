import 'server-only';


export function peopleMarketingParityDepthSql(
  moduleKey:
    string,
) {
  switch (
    moduleKey
  ) {
    case 'employees':
      return `
CREATE TABLE IF NOT EXISTS public.employee_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  parent_department_id UUID REFERENCES public.employee_departments(id) ON DELETE SET NULL,
  manager_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  cost_center VARCHAR(120),
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','inactive','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_department_name
  ON public.employee_departments(company_id, LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.employee_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  certification_name VARCHAR(255) NOT NULL,
  issuing_organization VARCHAR(255),
  credential_id VARCHAR(180),
  issued_on DATE,
  expires_on DATE,
  verified_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'valid',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on),
  CHECK (status IN ('valid','expired','revoked','pending_verification'))
);
CREATE INDEX IF NOT EXISTS idx_employee_certifications
  ON public.employee_certifications(company_id, employee_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.employee_equipment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  asset_reference UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_back_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  condition_out TEXT,
  condition_in TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'assigned',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('assigned','returned','lost','damaged','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_employee_equipment_assignments
  ON public.employee_equipment_assignments(company_id, employee_id, status)
  WHERE deleted_at IS NULL;
`;

    case 'attendance':
      return `
CREATE TABLE IF NOT EXISTS public.attendance_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  device_type VARCHAR(40) NOT NULL,
  device_reference VARCHAR(255),
  location_name VARCHAR(255),
  last_seen_at TIMESTAMPTZ,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (device_type IN ('kiosk','biometric','mobile','web','facial','other')),
  CHECK (status IN ('active','inactive','offline'))
);
CREATE INDEX IF NOT EXISTS idx_attendance_devices
  ON public.attendance_devices(company_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.attendance_geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  radius_meters NUMERIC(12,2) NOT NULL,
  allowed_clock_types JSONB NOT NULL DEFAULT '["in","out"]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (latitude BETWEEN -90 AND 90),
  CHECK (longitude BETWEEN -180 AND 180),
  CHECK (radius_meters > 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_attendance_geofences
  ON public.attendance_geofences(company_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.attendance_kiosk_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.attendance_devices(id) ON DELETE SET NULL,
  employee_reference UUID NOT NULL,
  authenticated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method VARCHAR(30) NOT NULL,
  clock_action VARCHAR(10) NOT NULL,
  attendance_entry_id UUID REFERENCES public.attendance_entries(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'accepted',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (method IN ('pin','badge','barcode','biometric','face','mobile')),
  CHECK (clock_action IN ('in','out')),
  CHECK (status IN ('accepted','rejected','review'))
);
CREATE INDEX IF NOT EXISTS idx_attendance_kiosk_sessions
  ON public.attendance_kiosk_sessions(company_id, employee_reference, authenticated_at DESC)
  WHERE deleted_at IS NULL;
`;

    case 'payroll':
      return `
CREATE TABLE IF NOT EXISTS public.payroll_salary_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(60) NOT NULL,
  calculation_type VARCHAR(30) NOT NULL,
  calculation JSONB NOT NULL DEFAULT '{}'::jsonb,
  sequence INTEGER NOT NULL DEFAULT 100,
  taxable BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (category IN ('earning','deduction','employer_contribution','tax','net')),
  CHECK (calculation_type IN ('fixed','percentage','formula','table')),
  CHECK (status IN ('active','inactive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_salary_rule_code
  ON public.payroll_salary_rules(company_id, code)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payroll_work_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payroll_employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  entry_type VARCHAR(50) NOT NULL,
  hours NUMERIC(9,2) NOT NULL DEFAULT 0,
  source_module VARCHAR(50),
  source_record_id UUID,
  conflict_reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (hours >= 0),
  CHECK (status IN ('draft','validated','conflict','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_payroll_work_entries
  ON public.payroll_work_entries(company_id, payroll_employee_id, work_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payroll_salary_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payroll_employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  attachment_type VARCHAR(50) NOT NULL,
  reference VARCHAR(180),
  amount NUMERIC(19,4),
  percentage NUMERIC(9,4),
  start_date DATE NOT NULL,
  end_date DATE,
  priority INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount IS NULL OR amount >= 0),
  CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100)),
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK (status IN ('active','paused','completed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_payroll_salary_attachments
  ON public.payroll_salary_attachments(company_id, payroll_employee_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payroll_payment_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payroll_run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  batch_reference VARCHAR(120) NOT NULL,
  payment_method VARCHAR(40) NOT NULL DEFAULT 'bank_transfer',
  total_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  provider_reference VARCHAR(255),
  processed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (total_amount >= 0),
  CHECK (status IN ('draft','approved','processing','paid','failed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_payment_batch_reference
  ON public.payroll_payment_batches(company_id, batch_reference)
  WHERE deleted_at IS NULL;
`;

    case 'email_marketing':
      return `
CREATE TABLE IF NOT EXISTS public.email_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_members INTEGER NOT NULL DEFAULT 0,
  last_evaluated_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (estimated_members >= 0),
  CHECK (status IN ('active','paused','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_segment_name
  ON public.email_segments(company_id, LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.email_segment_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES public.email_segments(id) ON DELETE CASCADE,
  email VARCHAR(320) NOT NULL,
  contact_reference UUID,
  source VARCHAR(80),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'subscribed',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('subscribed','unsubscribed','bounced','suppressed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_segment_member
  ON public.email_segment_members(company_id, segment_id, LOWER(email))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email VARCHAR(320) NOT NULL,
  reason VARCHAR(80) NOT NULL,
  source VARCHAR(100),
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','released'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_suppression
  ON public.email_suppressions(company_id, LOWER(email))
  WHERE deleted_at IS NULL AND status = 'active';
`;

    case 'sms_marketing':
      return `
CREATE TABLE IF NOT EXISTS public.sms_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_members INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (estimated_members >= 0),
  CHECK (status IN ('active','paused','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_segment_name
  ON public.sms_segments(company_id, LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.sms_segment_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES public.sms_segments(id) ON DELETE CASCADE,
  phone VARCHAR(80) NOT NULL,
  contact_reference UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'subscribed',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('subscribed','opted_out','invalid','suppressed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_segment_member
  ON public.sms_segment_members(company_id, segment_id, phone)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.sms_opt_outs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone VARCHAR(80) NOT NULL,
  keyword VARCHAR(80),
  source VARCHAR(100),
  opted_out_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','released'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_opt_out
  ON public.sms_opt_outs(company_id, phone)
  WHERE deleted_at IS NULL AND status = 'active';
`;

    case 'social_marketing':
      return `
CREATE TABLE IF NOT EXISTS public.social_inbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  platform VARCHAR(80) NOT NULL,
  external_id VARCHAR(255),
  item_type VARCHAR(30) NOT NULL,
  author_name VARCHAR(255),
  author_handle VARCHAR(255),
  body TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_user_id UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (item_type IN ('comment','message','mention','review')),
  CHECK (status IN ('open','in_progress','replied','closed','spam'))
);
CREATE INDEX IF NOT EXISTS idx_social_inbox_items
  ON public.social_inbox_items(company_id, status, received_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.social_audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  platform VARCHAR(80),
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_size BIGINT NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (estimated_size >= 0),
  CHECK (status IN ('draft','syncing','ready','failed','archived'))
);
CREATE INDEX IF NOT EXISTS idx_social_audiences
  ON public.social_audiences(company_id, platform, status)
  WHERE deleted_at IS NULL;
`;

    case 'documents':
      return `
CREATE TABLE IF NOT EXISTS public.document_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  share_token_hash CHAR(64) NOT NULL,
  recipient_email VARCHAR(320),
  permission VARCHAR(30) NOT NULL DEFAULT 'view',
  expires_at TIMESTAMPTZ,
  password_hash TEXT,
  revoked_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (permission IN ('view','download','comment')),
  CHECK (status IN ('active','expired','revoked'))
);
CREATE INDEX IF NOT EXISTS idx_document_shares
  ON public.document_shares(company_id, document_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.document_access_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  share_id UUID REFERENCES public.document_shares(id) ON DELETE SET NULL,
  event_type VARCHAR(30) NOT NULL,
  actor_user_id UUID,
  actor_email VARCHAR(320),
  ip_hash CHAR(64),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (event_type IN ('viewed','downloaded','commented','shared','revoked'))
);
CREATE INDEX IF NOT EXISTS idx_document_access_events
  ON public.document_access_events(company_id, document_id, occurred_at DESC)
  WHERE deleted_at IS NULL;
`;

    case 'quality':
      return `
CREATE TABLE IF NOT EXISTS public.quality_control_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  operation_type VARCHAR(80) NOT NULL,
  product_reference UUID,
  frequency_type VARCHAR(30) NOT NULL DEFAULT 'all',
  frequency_value NUMERIC(9,4),
  check_type VARCHAR(50) NOT NULL,
  instructions TEXT,
  responsible_user_id UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (frequency_type IN ('all','random','periodic','quantity')),
  CHECK (frequency_value IS NULL OR frequency_value >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_quality_control_points
  ON public.quality_control_points(company_id, operation_type, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.quality_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quality_issue_id UUID REFERENCES public.quality_issues(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  severity VARCHAR(30) NOT NULL DEFAULT 'medium',
  assigned_user_id UUID,
  due_on DATE,
  resolved_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (severity IN ('low','medium','high','critical')),
  CHECK (status IN ('open','in_progress','resolved','closed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_quality_alerts
  ON public.quality_alerts(company_id, status, severity, due_on)
  WHERE deleted_at IS NULL;
`;

    case 'spreadsheet':
      return `
CREATE TABLE IF NOT EXISTS public.workbook_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workbook_id UUID NOT NULL REFERENCES public.workbooks(id) ON DELETE CASCADE,
  source_type VARCHAR(40) NOT NULL,
  source_module VARCHAR(80),
  source_table VARCHAR(120),
  query_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  refresh_interval_minutes INTEGER,
  last_refreshed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (source_type IN ('module','report','api','upload','manual')),
  CHECK (refresh_interval_minutes IS NULL OR refresh_interval_minutes > 0),
  CHECK (status IN ('active','paused','failed','archived'))
);
CREATE INDEX IF NOT EXISTS idx_workbook_data_sources
  ON public.workbook_data_sources(company_id, workbook_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.workbook_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workbook_id UUID NOT NULL REFERENCES public.workbooks(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_summary TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (version_number > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workbook_version
  ON public.workbook_versions(company_id, workbook_id, version_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.bi_reports(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  widget_type VARCHAR(40) NOT NULL,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  position JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (widget_type IN ('metric','table','bar','line','area','pie','scatter','pivot','text')),
  CHECK (status IN ('active','hidden','archived'))
);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets
  ON public.dashboard_widgets(company_id, report_id, status)
  WHERE deleted_at IS NULL;
`;

    default:
      return '';
  }
}
