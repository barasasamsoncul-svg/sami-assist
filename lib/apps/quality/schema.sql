CREATE TABLE IF NOT EXISTS public.quality_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_number VARCHAR(100) NOT NULL UNIQUE,
    check_type VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    result VARCHAR(50),
    checked_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.quality_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_number VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(50) NOT NULL DEFAULT 'medium',
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    root_cause TEXT,
    corrective_action TEXT,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.quality_check_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_id UUID NOT NULL REFERENCES public.quality_checks(id) ON DELETE CASCADE,
    criterion VARCHAR(255) NOT NULL,
    expected_value TEXT,
    actual_value TEXT,
    passed BOOLEAN,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_quality_check_items_check ON public.quality_check_items(check_id);
