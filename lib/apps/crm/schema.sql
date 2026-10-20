CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    company_name VARCHAR(255),
    source VARCHAR(100),
    stage VARCHAR(100) NOT NULL DEFAULT 'new',
    estimated_value NUMERIC(15,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    stage VARCHAR(100) NOT NULL DEFAULT 'qualification',
    value NUMERIC(15,2) NOT NULL DEFAULT 0,
    expected_close_date DATE,
    probability NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.crm_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE CASCADE,
    activity_type VARCHAR(100) NOT NULL,
    subject VARCHAR(255),
    notes TEXT,
    scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_lead ON public.opportunities(lead_id);

-- CRM owns relationship records; Sales owns leads and opportunities.
CREATE TABLE IF NOT EXISTS public.crm_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_name VARCHAR(255) NOT NULL,
  account_type VARCHAR(30) NOT NULL DEFAULT 'prospect',
  lifecycle_stage VARCHAR(30) NOT NULL DEFAULT 'lead',
  source VARCHAR(120),
  website VARCHAR(500),
  industry VARCHAR(160),
  email VARCHAR(320),
  phone VARCHAR(80),
  employee_count INTEGER,
  annual_revenue NUMERIC(19,4) NOT NULL DEFAULT 0,
  owner_user_id UUID,
  notes TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (account_type IN ('prospect','customer','partner','competitor')),
  CHECK (lifecycle_stage IN ('lead','qualified','customer','inactive')),
  CHECK (employee_count IS NULL OR employee_count >= 0),
  CHECK (annual_revenue >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_accounts_company_name
  ON public.crm_accounts(company_id, LOWER(BTRIM(account_name)))
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_accounts_company_lifecycle
  ON public.crm_accounts(company_id, lifecycle_stage, LOWER(account_name))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  first_name VARCHAR(160) NOT NULL,
  last_name VARCHAR(160) NOT NULL DEFAULT '',
  job_title VARCHAR(160),
  department VARCHAR(160),
  email VARCHAR(320),
  phone VARCHAR(80),
  mobile VARCHAR(80),
  contact_role VARCHAR(30) NOT NULL DEFAULT 'other',
  preferred_channel VARCHAR(20) NOT NULL DEFAULT 'email',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  do_not_contact BOOLEAN NOT NULL DEFAULT FALSE,
  owner_user_id UUID,
  notes TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (contact_role IN ('decision_maker','influencer','champion','buyer','user','other')),
  CHECK (preferred_channel IN ('email','phone','sms','whatsapp','none'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_contacts_company_email
  ON public.crm_contacts(company_id, LOWER(BTRIM(email)))
  WHERE deleted_at IS NULL AND NULLIF(BTRIM(email),'') IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company_account
  ON public.crm_contacts(company_id, account_id, LOWER(last_name), LOWER(first_name))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  interaction_type VARCHAR(20) NOT NULL DEFAULT 'note',
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  occurred_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome VARCHAR(255),
  owner_user_id UUID,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (interaction_type IN ('call','email','meeting','note','task','sms','whatsapp','other')),
  CHECK (status IN ('planned','completed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_crm_interactions_account_timeline
  ON public.crm_interactions(company_id, account_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_interactions_contact_timeline
  ON public.crm_interactions(company_id, contact_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_interactions_due_queue
  ON public.crm_interactions(company_id, owner_user_id, due_at)
  WHERE deleted_at IS NULL AND status = 'planned';

