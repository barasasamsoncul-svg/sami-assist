-- ============================================================
-- SaMi Tenant Core Schema
-- File: lib/schema/tenant-core.sql
--
-- Purpose:
--   Common foundation installed in EVERY SaMi tenant database.
--
-- Architecture:
--
--   SaMi Control DB
--       ├── tenants
--       ├── tenant_databases
--       ├── users
--       ├── tenant_users
--       ├── modules
--       ├── tenant_modules
--       ├── roles / permissions
--       ├── subscriptions
--       └── platform/authentication
--
--   Tenant DB
--       ├── CORE  <-- this schema
--       │   ├── Organization
--       │   ├── Resources
--       │   ├── Communication
--       │   ├── Workflow
--       │   ├── Configuration
--       │   ├── Numbering
--       │   ├── Audit
--       │   └── AI
--       │
--       └── MODULES
--           ├── CRM
--           ├── Sales
--           ├── Accounting
--           ├── Inventory
--           ├── Purchase
--           ├── HR
--           ├── Projects
--           └── etc.
--
-- IMPORTANT:
--   Replace {schema} with the tenant schema name before execution.
--
--   Example:
--     tenant_47e63eb8_0016_4095_8981_445b582cf1b6
--
-- SaMi Core Principle:
--   Core provides infrastructure.
--   Modules provide business functionality.
--   Core must NOT contain module-specific business tables.
--
-- ============================================================


-- ============================================================
-- 0. EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- 1. ORGANIZATION
-- ============================================================

-- ------------------------------------------------------------
-- Companies
--
-- Odoo-inspired:
--   res.company
--
-- A tenant may contain one or multiple companies.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(200) NOT NULL,
    legal_name VARCHAR(200),

    logo_url TEXT,

    company_code VARCHAR(50),

    email VARCHAR(255),
    phone VARCHAR(50),
    website VARCHAR(255),

    -- address is retained for compatibility with existing tenants.
    address TEXT,
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(30),
    country VARCHAR(100),
    country_code VARCHAR(2),

    currency VARCHAR(3) NOT NULL DEFAULT 'KES',
    timezone VARCHAR(100) NOT NULL DEFAULT 'Africa/Nairobi',
    locale VARCHAR(20) NOT NULL DEFAULT 'en',

    fiscal_country VARCHAR(2),
    fiscal_year_start_month SMALLINT NOT NULL DEFAULT 1
        CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
    fiscal_year_start_day SMALLINT NOT NULL DEFAULT 1
        CHECK (fiscal_year_start_day BETWEEN 1 AND 31),

    tax_id VARCHAR(100),
    registration_number VARCHAR(100),

    industry VARCHAR(100),
    business_type VARCHAR(100),

    founded_year INTEGER,
    employee_count INTEGER,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_companies_active
    ON {schema}.companies(is_active)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_companies_name
    ON {schema}.companies(name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_code_unique
    ON {schema}.companies(LOWER(company_code))
    WHERE company_code IS NOT NULL;


-- ------------------------------------------------------------
-- Branches
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES {schema}.companies(id)
        ON DELETE CASCADE,

    name VARCHAR(200) NOT NULL,

    code VARCHAR(50),

    -- address is retained for compatibility with existing tenants.
    address TEXT,
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(30),
    country VARCHAR(100),
    country_code VARCHAR(2),

    phone VARCHAR(50),
    email VARCHAR(255),

    is_main BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_branches_company
    ON {schema}.branches(company_id);

CREATE INDEX IF NOT EXISTS idx_branches_active
    ON {schema}.branches(company_id, is_active)
    WHERE is_active = TRUE;


-- ------------------------------------------------------------
-- Departments
--
-- Generic organizational departments.
-- HR module may extend this later.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES {schema}.companies(id)
        ON DELETE CASCADE,

    parent_id UUID
        REFERENCES {schema}.departments(id)
        ON DELETE SET NULL,

    name VARCHAR(200) NOT NULL,
    code VARCHAR(50),

    description TEXT,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_departments_company
    ON {schema}.departments(company_id);

CREATE INDEX IF NOT EXISTS idx_departments_parent
    ON {schema}.departments(parent_id);


-- ------------------------------------------------------------
-- Company Users
--
-- Links Control DB users to tenant companies.
--
-- user_id intentionally has no FK to Control DB because
-- the user lives outside this tenant database.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.company_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES {schema}.companies(id)
        ON DELETE CASCADE,

    user_id UUID NOT NULL,

    is_default BOOLEAN NOT NULL DEFAULT FALSE,

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_users_user
    ON {schema}.company_users(user_id);

CREATE INDEX IF NOT EXISTS idx_company_users_company
    ON {schema}.company_users(company_id);

CREATE INDEX IF NOT EXISTS idx_company_users_active
    ON {schema}.company_users(user_id, status)
    WHERE status = 'active';


-- ------------------------------------------------------------
-- Company Settings
--
-- Company-specific configuration.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.company_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES {schema}.companies(id)
        ON DELETE CASCADE,

    settings JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(company_id)
);


-- ============================================================
-- 2. FILES & STORAGE
-- ============================================================

-- ------------------------------------------------------------
-- Files
--
-- Physical storage metadata.
--
-- The actual binary file should normally live in:
--   S3
--   Cloudflare R2
--   Supabase Storage
--   etc.
--
-- This table stores metadata and the storage reference.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID
        REFERENCES {schema}.companies(id)
        ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,

    mime_type VARCHAR(150),
    extension VARCHAR(20),

    size_bytes BIGINT,

    storage_key TEXT NOT NULL,
    storage_provider VARCHAR(50) NOT NULL DEFAULT 'r2',
    storage_etag VARCHAR(255),

    checksum VARCHAR(128),

    uploaded_by UUID,

    purpose VARCHAR(100) NOT NULL DEFAULT 'attachment',

    is_public BOOLEAN NOT NULL DEFAULT FALSE,

    status VARCHAR(30) NOT NULL DEFAULT 'active',

    upload_expires_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,

    cleanup_required BOOLEAN NOT NULL DEFAULT FALSE,

    scan_status VARCHAR(30) NOT NULL DEFAULT 'not_scanned',
    scan_checked_at TIMESTAMPTZ,

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_files_company
    ON {schema}.files(company_id);

CREATE INDEX IF NOT EXISTS idx_files_storage_key
    ON {schema}.files(storage_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_files_storage_provider_key_unique
    ON {schema}.files(storage_provider, storage_key)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_files_uploaded_by
    ON {schema}.files(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_files_status
    ON {schema}.files(status);

CREATE INDEX IF NOT EXISTS idx_files_company_active_created
    ON {schema}.files(company_id, created_at DESC, id DESC)
    WHERE status = 'active'
      AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_files_pending_expiry
    ON {schema}.files(upload_expires_at)
    WHERE status = 'pending_upload'
      AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_files_cleanup_required
    ON {schema}.files(cleanup_required)
    WHERE cleanup_required = TRUE;


-- ------------------------------------------------------------
-- File Links
--
-- Generic record attachment relation.
--
-- Core owns only the physical file reference and generic link.
-- Business apps (Documents, CRM, Invoicing, HR, etc.) own their
-- own document/business records and authorize those records before
-- calling the file-link service.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.file_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES {schema}.companies(id)
        ON DELETE CASCADE,

    file_id UUID NOT NULL
        REFERENCES {schema}.files(id)
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
    ON {schema}.file_links(company_id);

CREATE INDEX IF NOT EXISTS idx_file_links_file
    ON {schema}.file_links(file_id);

CREATE INDEX IF NOT EXISTS idx_file_links_record
    ON {schema}.file_links(company_id, model, record_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_file_links_module
    ON {schema}.file_links(company_id, module_key)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_file_links_active_unique
    ON {schema}.file_links(file_id, model, record_id, purpose)
    WHERE deleted_at IS NULL;


-- ============================================================
-- 3. COMMENTS / CHATTER
-- ============================================================

-- ------------------------------------------------------------
-- Comments
--
-- Generic comments/notes attached to any module record.
-- Similar in spirit to Odoo chatter.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID
        REFERENCES {schema}.companies(id)
        ON DELETE CASCADE,

    user_id UUID NOT NULL,

    model VARCHAR(150) NOT NULL,
    record_id UUID NOT NULL,

    content TEXT NOT NULL,

    parent_id UUID
        REFERENCES {schema}.comments(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_comments_record
    ON {schema}.comments(model, record_id);

CREATE INDEX IF NOT EXISTS idx_comments_company
    ON {schema}.comments(company_id);

CREATE INDEX IF NOT EXISTS idx_comments_user
    ON {schema}.comments(user_id);

CREATE INDEX IF NOT EXISTS idx_comments_parent
    ON {schema}.comments(parent_id);


-- ============================================================
-- 4. ACTIVITIES
-- ============================================================

-- ------------------------------------------------------------
-- Activities
--
-- Generic activity/event timeline.
--
-- Examples:
--   "Quotation approved"
--   "Customer contacted"
--   "Invoice viewed"
--   "Employee profile updated"
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID
        REFERENCES {schema}.companies(id)
        ON DELETE CASCADE,

    user_id UUID,

    model VARCHAR(150) NOT NULL,
    record_id UUID NOT NULL,

    type VARCHAR(100) NOT NULL,

    content TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_record
    ON {schema}.activities(model, record_id);

CREATE INDEX IF NOT EXISTS idx_activities_company
    ON {schema}.activities(company_id);

CREATE INDEX IF NOT EXISTS idx_activities_user
    ON {schema}.activities(user_id);

CREATE INDEX IF NOT EXISTS idx_activities_created
    ON {schema}.activities(created_at DESC);


-- ============================================================
-- 5. TAGS
-- ============================================================

-- ------------------------------------------------------------
-- Tags
--
-- Tags may be:
--   tenant-wide    -> company_id NULL
--   company-wide   -> company_id populated
--
-- model indicates what type of record the tag is intended for.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID
        REFERENCES {schema}.companies(id)
        ON DELETE CASCADE,

    name VARCHAR(100) NOT NULL,

    color VARCHAR(7) DEFAULT '#6366f1',

    model VARCHAR(150),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(company_id, name, model)
);

CREATE INDEX IF NOT EXISTS idx_tags_company
    ON {schema}.tags(company_id);

CREATE INDEX IF NOT EXISTS idx_tags_model
    ON {schema}.tags(model);


-- ------------------------------------------------------------
-- Tag Relations
--
-- Generic many-to-many relationship between tags and records.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.tag_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tag_id UUID NOT NULL
        REFERENCES {schema}.tags(id)
        ON DELETE CASCADE,

    model VARCHAR(150) NOT NULL,

    record_id UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(tag_id, model, record_id)
);

CREATE INDEX IF NOT EXISTS idx_tag_relations_record
    ON {schema}.tag_relations(model, record_id);

CREATE INDEX IF NOT EXISTS idx_tag_relations_tag
    ON {schema}.tag_relations(tag_id);


-- ============================================================
-- 6. NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS {schema}.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID
        REFERENCES {schema}.companies(id)
        ON DELETE CASCADE,

    user_id UUID NOT NULL,

    type VARCHAR(100) NOT NULL,

    title VARCHAR(255) NOT NULL,

    message TEXT,

    link TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    is_read BOOLEAN NOT NULL DEFAULT FALSE,

    read_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON {schema}.notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_company
    ON {schema}.notifications(company_id);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON {schema}.notifications(user_id, is_read)
    WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_created
    ON {schema}.notifications(created_at DESC);


-- ============================================================
-- 7. WORKFLOW ENGINE
-- ============================================================

-- ------------------------------------------------------------
-- Workflows
--
-- Generic workflow definitions.
--
-- Core does NOT know what "invoice", "leave", "quotation",
-- etc. actually means.
--
-- Modules register their models with the workflow engine.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID
        REFERENCES {schema}.companies(id)
        ON DELETE CASCADE,

    name VARCHAR(200) NOT NULL,

    description TEXT,

    module VARCHAR(150),

    model VARCHAR(150),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_company
    ON {schema}.workflows(company_id);

CREATE INDEX IF NOT EXISTS idx_workflows_module_model
    ON {schema}.workflows(module, model);

CREATE INDEX IF NOT EXISTS idx_workflows_active
    ON {schema}.workflows(company_id, is_active)
    WHERE is_active = TRUE;


-- ------------------------------------------------------------
-- Workflow States
--
-- Explicit states make the workflow engine more extensible
-- than storing states only inside transitions.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.workflow_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workflow_id UUID NOT NULL
        REFERENCES {schema}.workflows(id)
        ON DELETE CASCADE,

    key VARCHAR(100) NOT NULL,

    name VARCHAR(150) NOT NULL,

    sequence INTEGER NOT NULL DEFAULT 0,

    is_initial BOOLEAN NOT NULL DEFAULT FALSE,
    is_final BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(workflow_id, key)
);

CREATE INDEX IF NOT EXISTS idx_workflow_states_workflow
    ON {schema}.workflow_states(workflow_id);


-- ------------------------------------------------------------
-- Workflow Transitions
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.workflow_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workflow_id UUID NOT NULL
        REFERENCES {schema}.workflows(id)
        ON DELETE CASCADE,

    from_state VARCHAR(100),

    to_state VARCHAR(100) NOT NULL,

    action VARCHAR(150) NOT NULL,

    condition TEXT,

    required_permissions JSONB NOT NULL DEFAULT '[]'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_transitions_workflow
    ON {schema}.workflow_transitions(workflow_id);

CREATE INDEX IF NOT EXISTS idx_workflow_transitions_states
    ON {schema}.workflow_transitions(
        workflow_id,
        from_state,
        to_state
    );


-- ============================================================
-- 8. SEQUENCES / DOCUMENT NUMBERING
-- ============================================================

-- ------------------------------------------------------------
-- Sequences
--
-- Centralized numbering service.
--
-- Examples:
--
--   INV-00001
--   SO-00001
--   PO-00001
--   PAY-00001
--
-- IMPORTANT:
--   Application code should use a transaction-safe sequence
--   allocation function rather than manually incrementing
--   next_number.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID
        REFERENCES {schema}.companies(id)
        ON DELETE CASCADE,

    name VARCHAR(100) NOT NULL,

    prefix VARCHAR(50),
    suffix VARCHAR(50),

    padding INTEGER NOT NULL DEFAULT 5,

    next_number BIGINT NOT NULL DEFAULT 1,

    increment INTEGER NOT NULL DEFAULT 1,

    model VARCHAR(150),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sequences_company
    ON {schema}.sequences(company_id);

CREATE INDEX IF NOT EXISTS idx_sequences_model
    ON {schema}.sequences(model);


-- ------------------------------------------------------------
-- Safe sequence number allocation
--
-- Atomically reserves the next number.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION {schema}.next_sequence_number(
    p_sequence_id UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_number BIGINT;
BEGIN

    UPDATE {schema}.sequences
    SET
        next_number = next_number + increment,
        updated_at = NOW()
    WHERE id = p_sequence_id
    RETURNING next_number - increment
    INTO v_number;

    IF v_number IS NULL THEN
        RAISE EXCEPTION 'Sequence % does not exist', p_sequence_id;
    END IF;

    RETURN v_number;

END;
$$;


-- ============================================================
-- 9. SYSTEM PARAMETERS
-- ============================================================

-- ------------------------------------------------------------
-- Tenant/company configuration.
--
-- company_id NULL + is_global TRUE:
--   tenant-wide configuration
--
-- company_id populated:
--   company-specific configuration
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.system_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID
        REFERENCES {schema}.companies(id)
        ON DELETE CASCADE,

    key VARCHAR(200) NOT NULL,

    value TEXT,

    is_global BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(company_id, key)
);

CREATE INDEX IF NOT EXISTS idx_system_parameters_company
    ON {schema}.system_parameters(company_id);

CREATE INDEX IF NOT EXISTS idx_system_parameters_key
    ON {schema}.system_parameters(key);


-- ============================================================
-- 10. TENANT AUDIT LOG
-- ============================================================

-- ------------------------------------------------------------
-- Tenant-level audit trail.
--
-- Control DB has platform audit logs.
-- This table contains BUSINESS activity inside the tenant.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID,

    company_id UUID
        REFERENCES {schema}.companies(id)
        ON DELETE SET NULL,

    actor_type VARCHAR(30) NOT NULL DEFAULT 'human',

    action VARCHAR(150) NOT NULL,

    resource_type VARCHAR(150),

    resource_id UUID,

    module VARCHAR(150),

    result VARCHAR(30),

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    ip_address INET,

    user_agent TEXT,

    correlation_id UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company
    ON {schema}.audit_logs(company_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created
    ON {schema}.audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
    ON {schema}.audit_logs(resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user
    ON {schema}.audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation
    ON {schema}.audit_logs(correlation_id);


-- ============================================================
-- 11. AI CORE
-- ============================================================

-- ------------------------------------------------------------
-- AI Conversations
--
-- Tenant-specific AI conversations.
--
-- AI models themselves are registered in Control DB.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,

    company_id UUID
        REFERENCES {schema}.companies(id)
        ON DELETE SET NULL,

    title VARCHAR(255),

    status VARCHAR(30) NOT NULL DEFAULT 'active',

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user
    ON {schema}.ai_conversations(user_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_company
    ON {schema}.ai_conversations(company_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_status
    ON {schema}.ai_conversations(user_id, status);


-- ------------------------------------------------------------
-- AI Messages
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    conversation_id UUID NOT NULL
        REFERENCES {schema}.ai_conversations(id)
        ON DELETE CASCADE,

    role VARCHAR(30) NOT NULL,

    content TEXT NOT NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
    ON {schema}.ai_messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_ai_messages_created
    ON {schema}.ai_messages(
        conversation_id,
        created_at
    );


-- ------------------------------------------------------------
-- AI Memory
--
-- Business knowledge stored for this tenant.
--
-- Examples:
--
--   company preferences
--   customer context
--   business rules
--   learned workflows
--   important facts
--
-- Actual AI model registry remains in Control DB.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.ai_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID
        REFERENCES {schema}.companies(id)
        ON DELETE CASCADE,

    memory_type VARCHAR(100) NOT NULL,

    content TEXT NOT NULL,

    source_type VARCHAR(150),

    source_id UUID,

    importance INTEGER NOT NULL DEFAULT 5,

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_memory_company
    ON {schema}.ai_memory(company_id);

CREATE INDEX IF NOT EXISTS idx_ai_memory_type
    ON {schema}.ai_memory(memory_type);

CREATE INDEX IF NOT EXISTS idx_ai_memory_importance
    ON {schema}.ai_memory(importance DESC);

CREATE INDEX IF NOT EXISTS idx_ai_memory_source
    ON {schema}.ai_memory(source_type, source_id);


-- ------------------------------------------------------------
-- AI Actions
--
-- Records actions performed by SaMi AI.
--
-- Example:
--
--   AI created quotation
--   AI updated customer
--   AI generated report
--   AI sent notification
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.ai_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    conversation_id UUID
        REFERENCES {schema}.ai_conversations(id)
        ON DELETE SET NULL,

    user_id UUID NOT NULL,

    company_id UUID
        REFERENCES {schema}.companies(id)
        ON DELETE SET NULL,

    action_name VARCHAR(150) NOT NULL,

    source_module VARCHAR(150),
    source_record_id UUID,

    target_module VARCHAR(150),
    target_record_id UUID,

    status VARCHAR(50) NOT NULL DEFAULT 'completed',

    input JSONB,
    output JSONB,

    error_message TEXT,

    correlation_id UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_actions_company
    ON {schema}.ai_actions(company_id);

CREATE INDEX IF NOT EXISTS idx_ai_actions_user
    ON {schema}.ai_actions(user_id);

CREATE INDEX IF NOT EXISTS idx_ai_actions_conversation
    ON {schema}.ai_actions(conversation_id);

CREATE INDEX IF NOT EXISTS idx_ai_actions_source
    ON {schema}.ai_actions(
        source_module,
        source_record_id
    );

CREATE INDEX IF NOT EXISTS idx_ai_actions_target
    ON {schema}.ai_actions(
        target_module,
        target_record_id
    );

CREATE INDEX IF NOT EXISTS idx_ai_actions_status
    ON {schema}.ai_actions(status);


-- ============================================================
-- 12. UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION {schema}.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


-- ------------------------------------------------------------
-- Apply updated_at triggers
-- ------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_companies_updated_at
    ON {schema}.companies;

CREATE TRIGGER trg_companies_updated_at
BEFORE UPDATE ON {schema}.companies
FOR EACH ROW
EXECUTE FUNCTION {schema}.set_updated_at();


DROP TRIGGER IF EXISTS trg_branches_updated_at
    ON {schema}.branches;

CREATE TRIGGER trg_branches_updated_at
BEFORE UPDATE ON {schema}.branches
FOR EACH ROW
EXECUTE FUNCTION {schema}.set_updated_at();


DROP TRIGGER IF EXISTS trg_departments_updated_at
    ON {schema}.departments;

CREATE TRIGGER trg_departments_updated_at
BEFORE UPDATE ON {schema}.departments
FOR EACH ROW
EXECUTE FUNCTION {schema}.set_updated_at();


DROP TRIGGER IF EXISTS trg_company_users_updated_at
    ON {schema}.company_users;

CREATE TRIGGER trg_company_users_updated_at
BEFORE UPDATE ON {schema}.company_users
FOR EACH ROW
EXECUTE FUNCTION {schema}.set_updated_at();


DROP TRIGGER IF EXISTS trg_company_settings_updated_at
    ON {schema}.company_settings;

CREATE TRIGGER trg_company_settings_updated_at
BEFORE UPDATE ON {schema}.company_settings
FOR EACH ROW
EXECUTE FUNCTION {schema}.set_updated_at();


DROP TRIGGER IF EXISTS trg_files_updated_at
    ON {schema}.files;

CREATE TRIGGER trg_files_updated_at
BEFORE UPDATE ON {schema}.files
FOR EACH ROW
EXECUTE FUNCTION {schema}.set_updated_at();


DROP TRIGGER IF EXISTS trg_documents_updated_at
    ON {schema}.documents;

CREATE TRIGGER trg_documents_updated_at
BEFORE UPDATE ON {schema}.documents
FOR EACH ROW
EXECUTE FUNCTION {schema}.set_updated_at();


DROP TRIGGER IF EXISTS trg_comments_updated_at
    ON {schema}.comments;

CREATE TRIGGER trg_comments_updated_at
BEFORE UPDATE ON {schema}.comments
FOR EACH ROW
EXECUTE FUNCTION {schema}.set_updated_at();


DROP TRIGGER IF EXISTS trg_workflows_updated_at
    ON {schema}.workflows;

CREATE TRIGGER trg_workflows_updated_at
BEFORE UPDATE ON {schema}.workflows
FOR EACH ROW
EXECUTE FUNCTION {schema}.set_updated_at();


DROP TRIGGER IF EXISTS trg_sequences_updated_at
    ON {schema}.sequences;

CREATE TRIGGER trg_sequences_updated_at
BEFORE UPDATE ON {schema}.sequences
FOR EACH ROW
EXECUTE FUNCTION {schema}.set_updated_at();


DROP TRIGGER IF EXISTS trg_system_parameters_updated_at
    ON {schema}.system_parameters;

CREATE TRIGGER trg_system_parameters_updated_at
BEFORE UPDATE ON {schema}.system_parameters
FOR EACH ROW
EXECUTE FUNCTION {schema}.set_updated_at();


DROP TRIGGER IF EXISTS trg_ai_conversations_updated_at
    ON {schema}.ai_conversations;

CREATE TRIGGER trg_ai_conversations_updated_at
BEFORE UPDATE ON {schema}.ai_conversations
FOR EACH ROW
EXECUTE FUNCTION {schema}.set_updated_at();


DROP TRIGGER IF EXISTS trg_ai_memory_updated_at
    ON {schema}.ai_memory;

CREATE TRIGGER trg_ai_memory_updated_at
BEFORE UPDATE ON {schema}.ai_memory
FOR EACH ROW
EXECUTE FUNCTION {schema}.set_updated_at();


DROP TRIGGER IF EXISTS trg_ai_actions_updated_at
    ON {schema}.ai_actions;

-- ai_actions intentionally has no updated_at column.
-- No trigger required.


-- ============================================================
-- 13. DEFAULT COMPANY
-- ============================================================

-- Every tenant starts with one company.
--
-- The application may rename/update this company during
-- onboarding.
-- ------------------------------------------------------------

INSERT INTO {schema}.companies (
    name,
    legal_name,
    currency,
    timezone,
    is_active
)
SELECT
    'Default Company',
    'Default Company',
    'KES',
    'Africa/Nairobi',
    TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM {schema}.companies
);

-- Every company gets a stable generic settings container.
INSERT INTO {schema}.company_settings (
    company_id,
    settings
)
SELECT
    c.id,
    '{}'::JSONB
FROM {schema}.companies c
ON CONFLICT (company_id) DO NOTHING;


-- ============================================================
-- 14. DEFAULT SEQUENCES
-- ============================================================

-- These are Core-level numbering definitions.
--
-- Modules can create additional sequences when installed.
-- ------------------------------------------------------------

INSERT INTO {schema}.sequences (
    company_id,
    name,
    prefix,
    padding,
    next_number,
    increment,
    model
)
SELECT
    NULL,
    v.name,
    v.prefix,
    5,
    1,
    1,
    v.model
FROM (
    VALUES
        ('invoice',       'INV-', 'accounting.invoice'),
        ('sales_order',   'SO-',  'sales.order'),
        ('purchase_order','PO-',  'purchase.order'),
        ('payment',       'PAY-', 'accounting.payment'),
        ('customer',      'CUS-', 'crm.customer'),
        ('employee',      'EMP-', 'hr.employee'),
        ('project',       'PRJ-', 'project.project')
) AS v(name, prefix, model)
WHERE NOT EXISTS (
    SELECT 1
    FROM {schema}.sequences s
    WHERE s.company_id IS NULL
      AND s.name = v.name
);


-- ============================================================
-- 15. DEFAULT TAGS
-- ============================================================

INSERT INTO {schema}.tags (
    company_id,
    name,
    color,
    model
)
SELECT
    NULL,
    v.name,
    v.color,
    NULL
FROM (
    VALUES
        ('VIP',         '#8b5cf6'),
        ('Priority',    '#f59e0b'),
        ('Bug',         '#ef4444'),
        ('Feature',     '#10b981'),
        ('Enhancement', '#3b82f6')
) AS v(name, color)
WHERE NOT EXISTS (
    SELECT 1
    FROM {schema}.tags t
    WHERE t.company_id IS NULL
      AND t.name = v.name
      AND t.model IS NULL
);


-- ============================================================
-- 16. DEFAULT SYSTEM PARAMETERS
-- ============================================================

INSERT INTO {schema}.system_parameters (
    company_id,
    key,
    value,
    is_global
)
SELECT
    NULL,
    v.key,
    v.value,
    TRUE
FROM (
    VALUES
        ('company.currency',             'KES'),
        ('company.timezone',             'Africa/Nairobi'),
        ('notification.email_enabled',   'true'),
        ('notification.sms_enabled',     'false'),
        ('notification.push_enabled',    'true'),
        ('ai.enabled',                   'true'),
        ('audit.enabled',                'true')
) AS v(key, value)
WHERE NOT EXISTS (
    SELECT 1
    FROM {schema}.system_parameters p
    WHERE p.company_id IS NULL
      AND p.key = v.key
);


-- ============================================================
-- 17. SCHEMA VERSION
-- ============================================================

-- Records the version of the Tenant Core schema.
--
-- This is intentionally tenant-side metadata.
-- Platform migration authority remains in the Control DB.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS {schema}.core_schema_version (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    version VARCHAR(50) NOT NULL,

    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(version)
);

INSERT INTO {schema}.core_schema_version (version)
VALUES ('1.2.0')
ON CONFLICT (version) DO NOTHING;


-- ============================================================
-- END OF SaMi TENANT CORE
-- ============================================================