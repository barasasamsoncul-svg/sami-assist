CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_number VARCHAR(100) NOT NULL UNIQUE,
    make VARCHAR(100),
    model VARCHAR(100),
    year INTEGER,
    vehicle_type VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    mileage NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.vehicle_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    driver_name VARCHAR(255) NOT NULL,
    assigned_from DATE NOT NULL,
    assigned_to DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS public.fleet_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    service_type VARCHAR(100) NOT NULL,
    service_date DATE NOT NULL DEFAULT CURRENT_DATE,
    mileage NUMERIC(15,2),
    cost NUMERIC(15,2) NOT NULL DEFAULT 0,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_vehicle ON public.vehicle_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fleet_services_vehicle ON public.fleet_services(vehicle_id);
