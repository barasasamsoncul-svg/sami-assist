import 'server-only';

export function peopleSpecialistDepthSql(
  moduleKey:
    string,
) {
  switch (
    moduleKey
  ) {
    case 'employees':
      return `
CREATE TABLE IF NOT EXISTS public.employee_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  contract_type VARCHAR(40) NOT NULL DEFAULT 'permanent',
  start_date DATE NOT NULL,
  end_date DATE,
  job_title VARCHAR(255),
  department_reference UUID,
  base_salary NUMERIC(19,4),
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  working_hours_per_week NUMERIC(8,2),
  probation_end_date DATE,
  notice_days INTEGER NOT NULL DEFAULT 0,
  signed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK (base_salary IS NULL OR base_salary >= 0),
  CHECK (working_hours_per_week IS NULL OR working_hours_per_week >= 0),
  CHECK (notice_days >= 0),
  CHECK (status IN ('draft','active','expired','terminated','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_employee
  ON public.employee_contracts(company_id, employee_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.employee_emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  relationship VARCHAR(100),
  phone VARCHAR(80) NOT NULL,
  email VARCHAR(255),
  priority INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (priority > 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_employee_emergency_contacts
  ON public.employee_emergency_contacts(company_id, employee_id, priority)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.employee_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  effective_date DATE NOT NULL,
  from_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  to_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  approved_by UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'effective',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (event_type IN ('hire','promotion','transfer','salary_change','leave','return','termination','rehire','other')),
  CHECK (status IN ('planned','effective','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_employee_lifecycle_events
  ON public.employee_lifecycle_events(company_id, employee_id, effective_date DESC)
  WHERE deleted_at IS NULL;
`;

    case 'recruitment':
      return `
CREATE TABLE IF NOT EXISTS public.recruitment_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requisition_number VARCHAR(100) NOT NULL,
  position_title VARCHAR(255) NOT NULL,
  department VARCHAR(255),
  headcount INTEGER NOT NULL DEFAULT 1,
  employment_type VARCHAR(80),
  target_hire_date DATE,
  hiring_manager_reference UUID,
  reason TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (headcount > 0),
  CHECK (status IN ('draft','submitted','approved','rejected','open','filled','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recruitment_requisition_number
  ON public.recruitment_requisitions(company_id, requisition_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.applicant_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  source_type VARCHAR(60) NOT NULL,
  source_name VARCHAR(160),
  campaign_reference VARCHAR(160),
  referral_employee_reference UUID,
  acquisition_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (acquisition_cost >= 0)
);
CREATE INDEX IF NOT EXISTS idx_applicant_sources_applicant
  ON public.applicant_sources(company_id, applicant_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.interview_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  interviewer_reference UUID,
  competency VARCHAR(160) NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  weight NUMERIC(5,2) NOT NULL DEFAULT 100,
  notes TEXT,
  recommendation VARCHAR(30),
  submitted_at TIMESTAMPTZ,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (score >= 0 AND score <= 100),
  CHECK (weight >= 0 AND weight <= 100),
  CHECK (recommendation IS NULL OR recommendation IN ('strong_yes','yes','neutral','no','strong_no'))
);
CREATE INDEX IF NOT EXISTS idx_interview_scorecards_interview
  ON public.interview_scorecards(company_id, interview_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.job_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES public.applicants(id) ON DELETE RESTRICT,
  offer_number VARCHAR(100) NOT NULL,
  job_title VARCHAR(255) NOT NULL,
  base_salary NUMERIC(19,4) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  start_date DATE,
  expires_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (base_salary >= 0),
  CHECK (status IN ('draft','approved','sent','accepted','rejected','expired','withdrawn'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_offer_number
  ON public.job_offers(company_id, offer_number)
  WHERE deleted_at IS NULL;
`;

    case 'attendance':
      return `
CREATE TABLE IF NOT EXISTS public.attendance_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  attendance_entry_id UUID REFERENCES public.attendance_entries(id) ON DELETE CASCADE,
  employee_reference UUID NOT NULL,
  work_date DATE NOT NULL,
  exception_type VARCHAR(50) NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (minutes >= 0),
  CHECK (exception_type IN ('late','early_leave','missing_clock_in','missing_clock_out','absence','overtime','other')),
  CHECK (status IN ('open','acknowledged','resolved','waived'))
);
CREATE INDEX IF NOT EXISTS idx_attendance_exceptions_employee
  ON public.attendance_exceptions(company_id, employee_reference, work_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.attendance_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  attendance_entry_id UUID NOT NULL REFERENCES public.attendance_entries(id) ON DELETE CASCADE,
  requested_by UUID,
  requested_clock_in TIMESTAMPTZ,
  requested_clock_out TIMESTAMPTZ,
  reason TEXT NOT NULL,
  approved_by UUID,
  decided_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (requested_clock_out IS NULL OR requested_clock_in IS NULL OR requested_clock_out >= requested_clock_in),
  CHECK (status IN ('pending','approved','rejected','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_attendance_corrections_entry
  ON public.attendance_corrections(company_id, attendance_entry_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.attendance_overtime_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_reference UUID NOT NULL,
  work_date DATE NOT NULL,
  requested_minutes INTEGER NOT NULL,
  approved_minutes INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  approved_by UUID,
  decided_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (requested_minutes > 0),
  CHECK (approved_minutes >= 0 AND approved_minutes <= requested_minutes),
  CHECK (status IN ('pending','approved','rejected','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_attendance_overtime_employee
  ON public.attendance_overtime_requests(company_id, employee_reference, work_date)
  WHERE deleted_at IS NULL;
`;

    case 'shifts':
      return `
CREATE TABLE IF NOT EXISTS public.open_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES public.shift_schedules(id) ON DELETE CASCADE,
  shift_template_id UUID REFERENCES public.shift_templates(id) ON DELETE SET NULL,
  shift_date DATE NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  required_workers INTEGER NOT NULL DEFAULT 1,
  claimed_workers INTEGER NOT NULL DEFAULT 0,
  location VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CHECK (required_workers > 0),
  CHECK (claimed_workers >= 0 AND claimed_workers <= required_workers),
  CHECK (status IN ('open','filled','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_open_shifts_company_date
  ON public.open_shifts(company_id, shift_date, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.shift_swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_assignment_id UUID NOT NULL REFERENCES public.shift_assignments(id) ON DELETE CASCADE,
  requested_by_employee_reference UUID NOT NULL,
  target_employee_reference UUID,
  target_assignment_id UUID REFERENCES public.shift_assignments(id) ON DELETE SET NULL,
  reason TEXT,
  approved_by UUID,
  decided_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('pending','accepted','approved','rejected','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_shift_swap_requests
  ON public.shift_swap_requests(company_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.shift_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_reference UUID NOT NULL,
  weekday INTEGER NOT NULL,
  available_from TIME,
  available_to TIME,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from DATE,
  effective_to DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (weekday >= 0 AND weekday <= 6),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_shift_availability_employee
  ON public.shift_availability(company_id, employee_reference, weekday)
  WHERE deleted_at IS NULL;
`;

    case 'time_off':
      return `
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS employee_reference UUID;

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_reference
  ON public.leave_requests(company_id, employee_reference, start_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_reference UUID NOT NULL,
  leave_type_id UUID NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  accrued NUMERIC(10,2) NOT NULL DEFAULT 0,
  used NUMERIC(10,2) NOT NULL DEFAULT 0,
  adjusted NUMERIC(10,2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (opening_balance >= 0),
  CHECK (accrued >= 0),
  CHECK (used >= 0),
  CHECK (status IN ('active','closed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_balance_employee_type_year
  ON public.leave_balances(company_id, employee_reference, leave_type_id, year)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.leave_accruals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  leave_balance_id UUID NOT NULL REFERENCES public.leave_balances(id) ON DELETE CASCADE,
  accrual_date DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  source VARCHAR(80) NOT NULL DEFAULT 'policy',
  note TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'posted',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount > 0),
  CHECK (status IN ('draft','posted','reversed'))
);
CREATE INDEX IF NOT EXISTS idx_leave_accruals_balance
  ON public.leave_accruals(company_id, leave_balance_id, accrual_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.leave_blackout_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  leave_type_id UUID REFERENCES public.leave_types(id) ON DELETE CASCADE,
  reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (ends_on >= starts_on),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_leave_blackout_periods
  ON public.leave_blackout_periods(company_id, starts_on, ends_on)
  WHERE deleted_at IS NULL;
`;

    case 'timesheets':
      return `
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS employee_reference UUID;

CREATE INDEX IF NOT EXISTS idx_time_entries_employee_reference
  ON public.time_entries(company_id, employee_reference, work_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.timesheet_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  submission_deadline TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (period_end >= period_start),
  CHECK (status IN ('open','submitted','locked','closed'))
);
CREATE INDEX IF NOT EXISTS idx_timesheet_periods_company
  ON public.timesheet_periods(company_id, period_start, period_end)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.timesheet_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.timesheet_periods(id) ON DELETE CASCADE,
  employee_reference UUID NOT NULL,
  total_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (total_hours >= 0),
  CHECK (status IN ('draft','submitted','approved','rejected','locked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_timesheet_submission
  ON public.timesheet_submissions(company_id, period_id, employee_reference)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.timesheet_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES public.timesheet_submissions(id) ON DELETE CASCADE,
  approver_user_id UUID NOT NULL,
  decision VARCHAR(30),
  decided_at TIMESTAMPTZ,
  notes TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (decision IS NULL OR decision IN ('approved','rejected')),
  CHECK (status IN ('pending','completed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_submission
  ON public.timesheet_approvals(company_id, submission_id, status)
  WHERE deleted_at IS NULL;
`;

    case 'benefits':
      return `
CREATE TABLE IF NOT EXISTS public.benefit_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.benefit_enrollments(id) ON DELETE RESTRICT,
  claim_number VARCHAR(100) NOT NULL,
  claim_date DATE NOT NULL,
  provider_reference VARCHAR(160),
  claimed_amount NUMERIC(19,4) NOT NULL,
  approved_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  reason TEXT,
  decided_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'submitted',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (claimed_amount > 0),
  CHECK (approved_amount >= 0 AND approved_amount <= claimed_amount),
  CHECK (status IN ('submitted','under_review','approved','rejected','paid','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_benefit_claim_number
  ON public.benefit_claims(company_id, claim_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.benefit_dependents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.benefit_enrollments(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  relationship VARCHAR(80),
  date_of_birth DATE,
  identification_reference VARCHAR(160),
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_benefit_dependents_enrollment
  ON public.benefit_dependents(company_id, enrollment_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.benefit_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.benefit_enrollments(id) ON DELETE CASCADE,
  contribution_date DATE NOT NULL,
  employer_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  employee_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  payroll_reference UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'posted',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (employer_amount >= 0),
  CHECK (employee_amount >= 0),
  CHECK (status IN ('draft','posted','reversed'))
);
CREATE INDEX IF NOT EXISTS idx_benefit_contributions_enrollment
  ON public.benefit_contributions(company_id, enrollment_id, contribution_date)
  WHERE deleted_at IS NULL;
`;

    case 'appraisals':
      return `
CREATE TABLE IF NOT EXISTS public.appraisal_competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  weight NUMERIC(5,2) NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (weight >= 0 AND weight <= 100),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_appraisal_competencies_company
  ON public.appraisal_competencies(company_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.appraisal_competency_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  appraisal_id UUID NOT NULL REFERENCES public.appraisals(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES public.appraisal_competencies(id) ON DELETE RESTRICT,
  self_score NUMERIC(5,2),
  reviewer_score NUMERIC(5,2),
  final_score NUMERIC(5,2),
  comments TEXT,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (self_score IS NULL OR (self_score >= 0 AND self_score <= 100)),
  CHECK (reviewer_score IS NULL OR (reviewer_score >= 0 AND reviewer_score <= 100)),
  CHECK (final_score IS NULL OR (final_score >= 0 AND final_score <= 100))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_appraisal_competency_score
  ON public.appraisal_competency_scores(company_id, appraisal_id, competency_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.appraisal_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  appraisal_id UUID NOT NULL REFERENCES public.appraisals(id) ON DELETE CASCADE,
  feedback_type VARCHAR(30) NOT NULL DEFAULT 'peer',
  reviewer_reference UUID,
  rating NUMERIC(5,2),
  feedback TEXT,
  anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (rating IS NULL OR (rating >= 0 AND rating <= 100)),
  CHECK (feedback_type IN ('self','manager','peer','direct_report','external')),
  CHECK (status IN ('draft','submitted','withdrawn'))
);
CREATE INDEX IF NOT EXISTS idx_appraisal_feedback_appraisal
  ON public.appraisal_feedback(company_id, appraisal_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.appraisal_calibrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  appraisal_id UUID NOT NULL REFERENCES public.appraisals(id) ON DELETE CASCADE,
  original_rating NUMERIC(5,2),
  calibrated_rating NUMERIC(5,2) NOT NULL,
  calibrated_by UUID,
  calibrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'effective',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (original_rating IS NULL OR (original_rating >= 0 AND original_rating <= 100)),
  CHECK (calibrated_rating >= 0 AND calibrated_rating <= 100),
  CHECK (status IN ('effective','reversed'))
);
CREATE INDEX IF NOT EXISTS idx_appraisal_calibrations_appraisal
  ON public.appraisal_calibrations(company_id, appraisal_id)
  WHERE deleted_at IS NULL;
`;

    case 'onboarding':
      return `
CREATE TABLE IF NOT EXISTS public.onboarding_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  onboarding_id UUID NOT NULL REFERENCES public.employee_onboardings(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  file_id UUID,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('pending','submitted','verified','rejected','waived'))
);
CREATE INDEX IF NOT EXISTS idx_onboarding_documents
  ON public.onboarding_documents(company_id, onboarding_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.onboarding_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  onboarding_id UUID NOT NULL REFERENCES public.employee_onboardings(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL,
  manager_reference UUID,
  employee_rating NUMERIC(5,2),
  manager_rating NUMERIC(5,2),
  employee_notes TEXT,
  manager_notes TEXT,
  follow_up_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (employee_rating IS NULL OR (employee_rating >= 0 AND employee_rating <= 100)),
  CHECK (manager_rating IS NULL OR (manager_rating >= 0 AND manager_rating <= 100)),
  CHECK (status IN ('scheduled','completed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_onboarding_checkins
  ON public.onboarding_checkins(company_id, onboarding_id, checkin_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.onboarding_equipment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  onboarding_id UUID NOT NULL REFERENCES public.employee_onboardings(id) ON DELETE CASCADE,
  asset_reference UUID,
  item_name VARCHAR(200) NOT NULL,
  assigned_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  condition_on_issue TEXT,
  condition_on_return TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (returned_at IS NULL OR assigned_at IS NULL OR returned_at >= assigned_at),
  CHECK (status IN ('pending','assigned','returned','lost','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_onboarding_equipment
  ON public.onboarding_equipment_assignments(company_id, onboarding_id, status)
  WHERE deleted_at IS NULL;
`;

    case 'learning':
      return `
CREATE TABLE IF NOT EXISTS public.learning_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.learning_courses(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  passing_score NUMERIC(5,2) NOT NULL DEFAULT 70,
  maximum_attempts INTEGER,
  time_limit_minutes INTEGER,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (passing_score >= 0 AND passing_score <= 100),
  CHECK (maximum_attempts IS NULL OR maximum_attempts > 0),
  CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_learning_assessments_course
  ON public.learning_assessments(company_id, course_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.learning_assessment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES public.learning_assessments(id) ON DELETE CASCADE,
  employee_reference UUID NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  score NUMERIC(5,2),
  passed BOOLEAN,
  status VARCHAR(30) NOT NULL DEFAULT 'in_progress',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (attempt_number > 0),
  CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  CHECK (status IN ('in_progress','submitted','graded','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_learning_attempts_employee
  ON public.learning_assessment_attempts(company_id, employee_reference, assessment_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.learning_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_reference UUID NOT NULL,
  course_id UUID REFERENCES public.learning_courses(id) ON DELETE SET NULL,
  certificate_number VARCHAR(120) NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  file_id UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'valid',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (expires_at IS NULL OR expires_at >= issued_at),
  CHECK (status IN ('valid','expired','revoked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_certificate_number
  ON public.learning_certificates(company_id, certificate_number)
  WHERE deleted_at IS NULL;
`;

    case 'org_chart':
      return `
CREATE TABLE IF NOT EXISTS public.position_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES public.org_positions(id) ON DELETE CASCADE,
  requirement_type VARCHAR(50) NOT NULL,
  name VARCHAR(160) NOT NULL,
  required_level VARCHAR(80),
  mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (requirement_type IN ('skill','certification','experience','education','other')),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_position_requirements_position
  ON public.position_requirements(company_id, position_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.succession_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES public.org_positions(id) ON DELETE CASCADE,
  criticality VARCHAR(30) NOT NULL DEFAULT 'medium',
  target_ready_date DATE,
  owner_reference UUID,
  notes TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (criticality IN ('low','medium','high','critical')),
  CHECK (status IN ('active','closed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_succession_plans_position
  ON public.succession_plans(company_id, position_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.succession_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  succession_plan_id UUID NOT NULL REFERENCES public.succession_plans(id) ON DELETE CASCADE,
  employee_reference UUID NOT NULL,
  readiness VARCHAR(30) NOT NULL DEFAULT 'developing',
  readiness_score NUMERIC(5,2),
  development_plan TEXT,
  target_ready_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (readiness IN ('ready_now','ready_soon','developing','not_ready')),
  CHECK (readiness_score IS NULL OR (readiness_score >= 0 AND readiness_score <= 100)),
  CHECK (status IN ('active','selected','withdrawn'))
);
CREATE INDEX IF NOT EXISTS idx_succession_candidates_plan
  ON public.succession_candidates(company_id, succession_plan_id, readiness)
  WHERE deleted_at IS NULL;
`;

    default:
      return '';
  }
}
