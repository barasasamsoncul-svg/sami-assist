CREATE TABLE IF NOT EXISTS public.planning_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'planned',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.planning_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES public.planning_shifts(id) ON DELETE CASCADE,
    assignee_name VARCHAR(255) NOT NULL,
    role VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'assigned'
);
CREATE TABLE IF NOT EXISTS public.planning_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100),
    availability_status VARCHAR(50) NOT NULL DEFAULT 'available'
);
CREATE INDEX IF NOT EXISTS idx_planning_assignments_shift ON public.planning_assignments(shift_id);
