CREATE TABLE IF NOT EXISTS public.time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_name VARCHAR(255) NOT NULL,
    project_name VARCHAR(255),
    task_name VARCHAR(255),
    work_date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    hours NUMERIC(8,2) NOT NULL DEFAULT 0,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON public.time_entries(work_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_employee ON public.time_entries(employee_name);
