-- ============================================================
-- SaMi Tenant Core Migration
-- 1.8.0 -> 1.9.0
-- Platform hardening: company-scoped notification deduplication
-- ============================================================

/*
 * The previous unique index used (user_id, dedupe_key), which could
 * collapse the same semantic event across two companies belonging to
 * the same workspace user. Company-scoped notifications must dedupe
 * inside their own company boundary, while tenant-wide notifications
 * (company_id IS NULL) still share one deterministic dedupe domain.
 */

DROP INDEX IF EXISTS idx_notifications_user_dedupe_active;

CREATE UNIQUE INDEX idx_notifications_user_dedupe_active
    ON notifications(
        user_id,
        COALESCE(
            company_id,
            '00000000-0000-0000-0000-000000000000'::UUID
        ),
        dedupe_key
    )
    WHERE dedupe_key IS NOT NULL
      AND archived_at IS NULL;

INSERT INTO core_schema_version (version)
VALUES ('1.9.0')
ON CONFLICT (version) DO NOTHING;
