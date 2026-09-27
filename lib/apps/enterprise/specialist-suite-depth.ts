import 'server-only';


const SUITE_DEPTH_SQL:
  Record<
    string,
    string
  > = {
  assets: `
CREATE TABLE IF NOT EXISTS public.operational_asset_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.operational_assets(id) ON DELETE CASCADE,
  assigned_user_id UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  returned_at TIMESTAMPTZ,
  condition_out VARCHAR(80),
  condition_in VARCHAR(80),
  notes TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (returned_at IS NULL OR returned_at >= assigned_at),
  CHECK (status IN ('active','returned','lost','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_operational_asset_assignments_asset
  ON public.operational_asset_assignments(company_id, asset_id, assigned_at DESC)
  WHERE deleted_at IS NULL;
`,

  barcode: `
CREATE TABLE IF NOT EXISTS public.barcode_scan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  operation VARCHAR(80) NOT NULL,
  warehouse_id UUID,
  started_by UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expected_count INTEGER,
  scanned_count INTEGER NOT NULL DEFAULT 0,
  exceptions INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (expected_count IS NULL OR expected_count >= 0),
  CHECK (scanned_count >= 0),
  CHECK (exceptions >= 0),
  CHECK (status IN ('open','completed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_barcode_scan_sessions_company
  ON public.barcode_scan_sessions(company_id, status, started_at DESC)
  WHERE deleted_at IS NULL;
`,

  chat: `
CREATE TABLE IF NOT EXISTS public.chat_read_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  last_read_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_read_receipts_member
  ON public.chat_read_receipts(company_id, channel_id, user_id)
  WHERE deleted_at IS NULL;
`,

  customer_portal: `
CREATE TABLE IF NOT EXISTS public.portal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  portal_customer_id UUID NOT NULL REFERENCES public.portal_customers(id) ON DELETE CASCADE,
  request_type VARCHAR(80) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body TEXT,
  resource_type VARCHAR(80),
  resource_id UUID,
  assigned_user_id UUID,
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('open','in_progress','resolved','closed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_portal_requests_queue
  ON public.portal_requests(company_id, status, created_at DESC)
  WHERE deleted_at IS NULL;
`,

  email_marketing: `
CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email VARCHAR(320) NOT NULL,
  reason VARCHAR(80) NOT NULL,
  source VARCHAR(120),
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (reason IN ('unsubscribe','bounce','complaint','manual','invalid')),
  CHECK (status IN ('active','released'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_suppressions_email
  ON public.email_suppressions(company_id, LOWER(BTRIM(email)))
  WHERE deleted_at IS NULL AND status = 'active';
`,

  landing_pages: `
CREATE TABLE IF NOT EXISTS public.landing_page_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  landing_page_id UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title VARCHAR(255),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (version_number > 0),
  CHECK (status IN ('draft','published','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_landing_page_versions_number
  ON public.landing_page_versions(company_id, landing_page_id, version_number)
  WHERE deleted_at IS NULL;
`,

  lead_capture: `
CREATE TABLE IF NOT EXISTS public.lead_routing_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES public.lead_capture_entries(id) ON DELETE CASCADE,
  assigned_user_id UUID,
  rule_reference VARCHAR(180),
  score NUMERIC(8,2),
  reason TEXT,
  crm_lead_id UUID,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'applied',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (score IS NULL OR score >= 0),
  CHECK (status IN ('applied','overridden','failed'))
);
CREATE INDEX IF NOT EXISTS idx_lead_routing_decisions_entry
  ON public.lead_routing_decisions(company_id, entry_id, decided_at DESC)
  WHERE deleted_at IS NULL;
`,

  mail: `
CREATE TABLE IF NOT EXISTS public.mail_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  mail_account_id UUID REFERENCES public.mail_accounts(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_matched_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (priority >= 0),
  CHECK (status IN ('active','paused','archived'))
);
CREATE INDEX IF NOT EXISTS idx_mail_rules_order
  ON public.mail_rules(company_id, status, priority, created_at)
  WHERE deleted_at IS NULL;
`,

  sales_inbox: `
CREATE TABLE IF NOT EXISTS public.sales_conversation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.sales_conversations(id) ON DELETE CASCADE,
  lead_id UUID,
  opportunity_id UUID,
  sales_quote_id UUID,
  sales_order_id UUID,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_conversation_links
  ON public.sales_conversation_links(company_id, conversation_id)
  WHERE deleted_at IS NULL AND status = 'active';
`,

  sms_marketing: `
CREATE TABLE IF NOT EXISTS public.sms_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone VARCHAR(80) NOT NULL,
  reason VARCHAR(80) NOT NULL,
  source VARCHAR(120),
  suppressed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (reason IN ('opt_out','failed','complaint','manual','invalid')),
  CHECK (status IN ('active','released'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_suppressions_phone
  ON public.sms_suppressions(company_id, BTRIM(phone))
  WHERE deleted_at IS NULL AND status = 'active';
`,

  social_marketing: `
CREATE TABLE IF NOT EXISTS public.social_publish_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  attempted_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  provider_reference VARCHAR(255),
  failure_reason TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (attempt_count >= 0),
  CHECK (status IN ('queued','processing','published','failed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_social_publish_queue_due
  ON public.social_publish_queue(company_id, status, scheduled_at)
  WHERE deleted_at IS NULL;
`,

  spreadsheet: `
CREATE TABLE IF NOT EXISTS public.spreadsheet_named_ranges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workbook_id UUID NOT NULL REFERENCES public.workbooks(id) ON DELETE CASCADE,
  sheet_id UUID REFERENCES public.sheets(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  range_reference VARCHAR(120) NOT NULL,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_spreadsheet_named_ranges
  ON public.spreadsheet_named_ranges(company_id, workbook_id, LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.spreadsheet_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workbook_id UUID NOT NULL REFERENCES public.workbooks(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  source_module VARCHAR(80) NOT NULL,
  source_table VARCHAR(120) NOT NULL,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_refreshed_at TIMESTAMPTZ,
  refresh_error TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','paused','error','archived'))
);
CREATE INDEX IF NOT EXISTS idx_spreadsheet_data_sources
  ON public.spreadsheet_data_sources(company_id, workbook_id, status)
  WHERE deleted_at IS NULL;
`,

  team_inbox: `
CREATE TABLE IF NOT EXISTS public.team_inbox_assignment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.team_inbox_threads(id) ON DELETE CASCADE,
  from_user_id UUID,
  to_user_id UUID,
  reason TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'recorded',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('recorded','reversed'))
);
CREATE INDEX IF NOT EXISTS idx_team_inbox_assignment_events
  ON public.team_inbox_assignment_events(company_id, thread_id, assigned_at DESC)
  WHERE deleted_at IS NULL;
`,

  vendor_portal: `
CREATE TABLE IF NOT EXISTS public.vendor_portal_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vendor_account_id UUID NOT NULL REFERENCES public.vendor_portal_accounts(id) ON DELETE CASCADE,
  resource_type VARCHAR(80) NOT NULL,
  resource_id UUID NOT NULL,
  acknowledgement_type VARCHAR(80) NOT NULL,
  comment TEXT,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(30) NOT NULL DEFAULT 'accepted',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('accepted','rejected','withdrawn'))
);
CREATE INDEX IF NOT EXISTS idx_vendor_portal_acknowledgements
  ON public.vendor_portal_acknowledgements(company_id, vendor_account_id, acknowledged_at DESC)
  WHERE deleted_at IS NULL;
`,
};


export function specialistSuiteDepthSql(
  moduleKey:
    string,
) {
  return (
    SUITE_DEPTH_SQL[
      moduleKey
    ] ||
    ''
  );
}
