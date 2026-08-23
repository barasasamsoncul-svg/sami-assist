CREATE TABLE IF NOT EXISTS public.product_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_code VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    effective_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_code, version)
);
CREATE TABLE IF NOT EXISTS public.engineering_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    change_number VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    change_type VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.change_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    change_id UUID NOT NULL REFERENCES public.engineering_changes(id) ON DELETE CASCADE,
    product_version_id UUID REFERENCES public.product_versions(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL DEFAULT 'update'
);
CREATE INDEX IF NOT EXISTS idx_change_items_change ON public.change_items(change_id);
