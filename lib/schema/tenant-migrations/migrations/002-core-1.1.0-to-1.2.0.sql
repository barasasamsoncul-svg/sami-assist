-- ============================================================
-- SaMi Tenant Core Migration
-- 1.1.0 -> 1.2.0
-- Category 14: Files & Storage
-- ============================================================

ALTER TABLE files
    ADD COLUMN IF NOT EXISTS purpose VARCHAR(100) NOT NULL DEFAULT 'attachment',
    ADD COLUMN IF NOT EXISTS storage_etag VARCHAR(255),
    ADD COLUMN IF NOT EXISTS upload_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cleanup_required BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS scan_status VARCHAR(30) NOT NULL DEFAULT 'not_scanned',
    ADD COLUMN IF NOT EXISTS scan_checked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE files
    ALTER COLUMN storage_provider SET DEFAULT 'r2';

UPDATE files
SET activated_at = COALESCE(activated_at, created_at)
WHERE status = 'active'
  AND activated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_files_storage_provider_key_unique
    ON files(storage_provider, storage_key)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_files_company_active_created
    ON files(company_id, created_at DESC, id DESC)
    WHERE status = 'active'
      AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_files_pending_expiry
    ON files(upload_expires_at)
    WHERE status = 'pending_upload'
      AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_files_cleanup_required
    ON files(cleanup_required)
    WHERE cleanup_required = TRUE;

CREATE TABLE IF NOT EXISTS file_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    file_id UUID NOT NULL
        REFERENCES files(id)
        ON DELETE CASCADE,

    module_key VARCHAR(150),

    model VARCHAR(150) NOT NULL,
    record_id UUID NOT NULL,

    purpose VARCHAR(100) NOT NULL DEFAULT 'attachment',

    created_by UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_file_links_company
    ON file_links(company_id);

CREATE INDEX IF NOT EXISTS idx_file_links_file
    ON file_links(file_id);

CREATE INDEX IF NOT EXISTS idx_file_links_record
    ON file_links(company_id, model, record_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_file_links_module
    ON file_links(company_id, module_key)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_file_links_active_unique
    ON file_links(file_id, model, record_id, purpose)
    WHERE deleted_at IS NULL;
