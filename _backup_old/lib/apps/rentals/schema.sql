CREATE TABLE IF NOT EXISTS public.rental_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rental_rate NUMERIC(15,2) NOT NULL DEFAULT 0,
    rate_period VARCHAR(50) NOT NULL DEFAULT 'day',
    availability_status VARCHAR(50) NOT NULL DEFAULT 'available',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.rental_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_number VARCHAR(100) NOT NULL UNIQUE,
    rental_item_id UUID NOT NULL REFERENCES public.rental_items(id) ON DELETE RESTRICT,
    customer_name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    expected_return_date DATE,
    actual_return_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rental_contracts_item ON public.rental_contracts(rental_item_id);
