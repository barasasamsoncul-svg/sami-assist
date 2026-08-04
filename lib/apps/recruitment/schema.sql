CREATE TABLE IF NOT EXISTS public.job_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    department VARCHAR(255),
    description TEXT,
    employment_type VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    opened_at DATE NOT NULL DEFAULT CURRENT_DATE,
    closed_at DATE
);
CREATE TABLE IF NOT EXISTS public.applicants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    position_id UUID NOT NULL REFERENCES public.job_positions(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    resume_path TEXT,
    stage VARCHAR(100) NOT NULL DEFAULT 'applied',
    rating NUMERIC(5,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    interviewer_name VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    feedback TEXT
);
CREATE INDEX IF NOT EXISTS idx_applicants_position ON public.applicants(position_id);
CREATE INDEX IF NOT EXISTS idx_interviews_applicant ON public.interviews(applicant_id);
