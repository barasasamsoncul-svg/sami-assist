CREATE TABLE IF NOT EXISTS public.boms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50),
    quantity NUMERIC(15,2) NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.bom_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bom_id UUID NOT NULL REFERENCES public.boms(id) ON DELETE CASCADE,
    component_product_id UUID,
    quantity NUMERIC(15,2) NOT NULL DEFAULT 1,
    unit_of_measure VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.manufacturing_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(100) NOT NULL UNIQUE,
    product_id UUID,
    bom_id UUID REFERENCES public.boms(id) ON DELETE SET NULL,
    planned_quantity NUMERIC(15,2) NOT NULL DEFAULT 1,
    produced_quantity NUMERIC(15,2) NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    planned_start_date DATE,
    planned_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.production_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manufacturing_order_id UUID NOT NULL REFERENCES public.manufacturing_orders(id) ON DELETE CASCADE,
    operation_name VARCHAR(255) NOT NULL,
    sequence_number INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bom_items_bom ON public.bom_items(bom_id);
CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_bom ON public.manufacturing_orders(bom_id);
CREATE INDEX IF NOT EXISTS idx_production_operations_order ON public.production_operations(manufacturing_order_id);
