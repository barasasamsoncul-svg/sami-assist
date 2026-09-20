-- ============================================================
-- SaMi Documents App Schema
-- Category 14 integration: Documents uses Core files storage.
--
-- Physical bytes + storage metadata live in core.files.
-- This app owns business document/folder records only.
-- ============================================================

CREATE TABLE IF NOT EXISTS document_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID
        REFERENCES companies(id)
        ON DELETE CASCADE,

    parent_id UUID
        REFERENCES document_folders(id)
        ON DELETE SET NULL,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    created_by UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

ALTER TABLE document_folders
    ADD COLUMN IF NOT EXISTS company_id UUID,
    ADD COLUMN IF NOT EXISTS parent_id UUID,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_document_folders_company
    ON document_folders(company_id);

CREATE INDEX IF NOT EXISTS idx_document_folders_parent
    ON document_folders(parent_id);

CREATE INDEX IF NOT EXISTS idx_document_folders_active
    ON document_folders(company_id, name)
    WHERE deleted_at IS NULL;


CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID
        REFERENCES companies(id)
        ON DELETE CASCADE,

    file_id UUID
        REFERENCES files(id)
        ON DELETE SET NULL,

    folder_id UUID
        REFERENCES document_folders(id)
        ON DELETE SET NULL,

    name VARCHAR(255) NOT NULL,
    document_type VARCHAR(100),

    model VARCHAR(150),
    record_id UUID,

    description TEXT,

    uploaded_by UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Upgrade compatibility for tenants where the historical core
-- already created a minimal documents table.
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS company_id UUID,
    ADD COLUMN IF NOT EXISTS file_id UUID,
    ADD COLUMN IF NOT EXISTS folder_id UUID,
    ADD COLUMN IF NOT EXISTS name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS document_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS model VARCHAR(150),
    ADD COLUMN IF NOT EXISTS record_id UUID,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS uploaded_by UUID,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'documents_folder_id_fkey'
          AND conrelid = 'documents'::regclass
    ) THEN
        ALTER TABLE documents
            ADD CONSTRAINT documents_folder_id_fkey
            FOREIGN KEY (folder_id)
            REFERENCES document_folders(id)
            ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_documents_company
    ON documents(company_id);

CREATE INDEX IF NOT EXISTS idx_documents_file
    ON documents(file_id);

CREATE INDEX IF NOT EXISTS idx_documents_folder
    ON documents(folder_id);

CREATE INDEX IF NOT EXISTS idx_documents_record
    ON documents(company_id, model, record_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_type
    ON documents(company_id, document_type)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_active_created
    ON documents(company_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
