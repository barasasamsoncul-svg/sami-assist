-- ============================================================
-- SaMi Control DB Migration
-- Synchronize released Finance module catalog versions
-- ============================================================
-- Tenant module versions are advanced only after their tenant
-- migrations succeed. This control migration keeps the global
-- app catalog metadata aligned with the released code manifests.
-- It does not modify tenant business data.
-- ============================================================

UPDATE modules
SET
  version = '2.34.0',
  updated_at = NOW()
WHERE LOWER(key) = 'accounting'
  AND deleted_at IS NULL
  AND LOWER(COALESCE(status, 'active')) = 'active'
  AND version IS DISTINCT FROM '2.34.0';

UPDATE modules
SET
  version = '2.22.0',
  updated_at = NOW()
WHERE LOWER(key) = 'invoicing'
  AND deleted_at IS NULL
  AND LOWER(COALESCE(status, 'active')) = 'active'
  AND version IS DISTINCT FROM '2.22.0';
