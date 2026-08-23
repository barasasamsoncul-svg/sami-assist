CREATE TABLE IF NOT EXISTS public.appraisal_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.appraisals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES public.appraisal_cycles(id) ON DELETE CASCADE,
    employee_name VARCHAR(255) NOT NULL,
    reviewer_name VARCHAR(255),
    rating NUMERIC(5,2),
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    summary TEXT,
    submitted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.appraisal_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appraisal_id UUID NOT NULL REFERENCES public.appraisals(id) ON DELETE CASCADE,
    goal TEXT NOT NULL,
    target_value TEXT,
    result_value TEXT,
    rating NUMERIC(5,2)
);
CREATE INDEX IF NOT EXISTS idx_appraisals_cycle ON public.appraisals(cycle_id);
