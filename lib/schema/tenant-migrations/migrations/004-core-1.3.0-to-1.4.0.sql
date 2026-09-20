-- ============================================================
-- SaMi Tenant Core Migration
-- 1.3.0 -> 1.4.0
-- Category 16: Activity & Audit
-- ============================================================

ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS event_type VARCHAR(150),
    ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'activity',
    ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NOT NULL DEFAULT 'info',
    ADD COLUMN IF NOT EXISTS summary VARCHAR(500),
    ADD COLUMN IF NOT EXISTS entity_type VARCHAR(150),
    ADD COLUMN IF NOT EXISTS entity_id UUID,
    ADD COLUMN IF NOT EXISTS changes JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS request_method VARCHAR(10),
    ADD COLUMN IF NOT EXISTS request_path TEXT;

UPDATE audit_logs
SET
    event_type = COALESCE(event_type, action),
    entity_type = COALESCE(entity_type, resource_type),
    entity_id = COALESCE(entity_id, resource_id)
WHERE event_type IS NULL
   OR (entity_type IS NULL AND resource_type IS NOT NULL)
   OR (entity_id IS NULL AND resource_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_category_created
    ON audit_logs(company_id, category, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_result_created
    ON audit_logs(company_id, result, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_actor_created
    ON audit_logs(company_id, user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type
    ON audit_logs(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
    ON audit_logs(entity_type, entity_id, created_at DESC);

INSERT INTO core_schema_version (version, installed_at)
VALUES ('1.4.0', NOW())
ON CONFLICT (version) DO NOTHING;
