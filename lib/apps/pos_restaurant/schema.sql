CREATE TABLE IF NOT EXISTS public.menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    price NUMERIC(15,2) NOT NULL DEFAULT 0,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_number VARCHAR(50) NOT NULL UNIQUE,
    seats INTEGER NOT NULL DEFAULT 2,
    status VARCHAR(50) NOT NULL DEFAULT 'available'
);
CREATE TABLE IF NOT EXISTS public.restaurant_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(100) NOT NULL UNIQUE,
    table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
    order_type VARCHAR(50) NOT NULL DEFAULT 'dine_in',
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.restaurant_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.restaurant_orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
    quantity NUMERIC(15,2) NOT NULL DEFAULT 1,
    unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
    line_total NUMERIC(15,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_restaurant_order_items_order ON public.restaurant_order_items(order_id);
