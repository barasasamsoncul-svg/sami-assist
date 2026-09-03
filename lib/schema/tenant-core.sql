-- ============================================================
-- SaMi Tenant Core Schema (Odoo-Inspired)
-- Installed in every tenant database
-- ============================================================

-- ============================================================
-- ORGANIZATION STRUCTURE
-- ============================================================

-- Companies (Odoo: res.company - multi-company)
CREATE TABLE IF NOT EXISTS {schema}.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    legal_name VARCHAR(200),
    logo_url TEXT,
    email VARCHAR(255),
    phone VARCHAR(50),
    website VARCHAR(255),
    address TEXT,
    country VARCHAR(100),
    currency VARCHAR(3) DEFAULT 'KES',
    timezone VARCHAR(50) DEFAULT 'Africa/Nairobi',
    tax_id VARCHAR(100),
    registration_number VARCHAR(100),
    industry VARCHAR(100),
    business_type VARCHAR(100),
    founded_year INTEGER,
    employee_count INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_companies_active ON {schema}.companies(is_active) WHERE is_active = true;

-- Branches
CREATE TABLE IF NOT EXISTS {schema}.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES {schema}.companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    address TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branches_company ON {schema}.branches(company_id);

-- Departments (Odoo: hr.department)
CREATE TABLE IF NOT EXISTS {schema}.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES {schema}.companies(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES {schema}.departments(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_departments_company ON {schema}.departments(company_id);

-- ============================================================
-- COMPANY USERS (user access to companies)
-- ============================================================

CREATE TABLE IF NOT EXISTS {schema}.company_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES {schema}.companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    is_default BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_users_user ON {schema}.company_users(user_id);

-- ============================================================
-- COMPANY SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS {schema}.company_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES {schema}.companies(id) ON DELETE CASCADE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id)
);

-- ============================================================
-- DOCUMENTS (Odoo: ir.attachment)
-- ============================================================

CREATE TABLE IF NOT EXISTS {schema}.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES {schema}.companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    file_url TEXT,
    file_type VARCHAR(100),
    file_size INTEGER,
    uploaded_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_company ON {schema}.documents(company_id);

-- ============================================================
-- AI CONTEXT (SaMi AI Core)
-- ============================================================

-- AI Conversations
CREATE TABLE IF NOT EXISTS {schema}.ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID REFERENCES {schema}.companies(id),
    title VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON {schema}.ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_company ON {schema}.ai_conversations(company_id);

-- AI Messages
CREATE TABLE IF NOT EXISTS {schema}.ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES {schema}.ai_conversations(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON {schema}.ai_messages(conversation_id);

-- AI Memory (business knowledge)
CREATE TABLE IF NOT EXISTS {schema}.ai_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES {schema}.companies(id),
    memory_type VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    source_type VARCHAR(100),
    source_id UUID,
    importance INTEGER DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_memory_company ON {schema}.ai_memory(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_memory_importance ON {schema}.ai_memory(importance DESC);

-- AI Actions (tasks AI executed)
CREATE TABLE IF NOT EXISTS {schema}.ai_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES {schema}.ai_conversations(id),
    user_id UUID NOT NULL,
    company_id UUID REFERENCES {schema}.companies(id),
    action_name VARCHAR(150) NOT NULL,
    source_module VARCHAR(100),
    source_record_id UUID,
    target_module VARCHAR(100),
    target_record_id UUID,
    status VARCHAR(50) DEFAULT 'completed',
    input JSONB,
    output JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_actions_company ON {schema}.ai_actions(company_id);

-- ============================================================
-- TENANT AUDIT LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS {schema}.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    company_id UUID REFERENCES {schema}.companies(id),
    actor_type VARCHAR(20) DEFAULT 'human',
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    module VARCHAR(100),
    result VARCHAR(20),
    metadata JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_company ON {schema}.audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON {schema}.audit_logs(company_id, created_at DESC);

-- ============================================================
-- WORKFLOW & APPROVALS
-- ============================================================

-- Workflow Definitions
CREATE TABLE IF NOT EXISTS {schema}.workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES {schema}.companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    module VARCHAR(100),
    model VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_company ON {schema}.workflows(company_id);

-- Workflow Transitions
CREATE TABLE IF NOT EXISTS {schema}.workflow_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES {schema}.workflows(id) ON DELETE CASCADE,
    from_state VARCHAR(100),
    to_state VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    condition TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_transitions_workflow ON {schema}.workflow_transitions(workflow_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS {schema}.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES {schema}.companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    link TEXT,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON {schema}.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON {schema}.notifications(user_id, is_read) WHERE is_read = false;

-- ============================================================
-- TAGS / CATEGORIES
-- ============================================================

CREATE TABLE IF NOT EXISTS {schema}.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES {schema}.companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#6366f1',
    model VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tags_company ON {schema}.tags(company_id);

-- ============================================================
-- COMMENTS / NOTES
-- ============================================================

CREATE TABLE IF NOT EXISTS {schema}.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES {schema}.companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    model VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    content TEXT NOT NULL,
    parent_id UUID REFERENCES {schema}.comments(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_comments_record ON {schema}.comments(model, record_id);
CREATE INDEX IF NOT EXISTS idx_comments_company ON {schema}.comments(company_id);

-- ============================================================
-- ACTIVITY TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS {schema}.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES {schema}.companies(id) ON DELETE CASCADE,
    user_id UUID,
    model VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    content TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_record ON {schema}.activities(model, record_id);

-- ============================================================
-- FILES (Odoo: ir.attachment - more detailed)
-- ============================================================

CREATE TABLE IF NOT EXISTS {schema}.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES {schema}.companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    size_bytes BIGINT,
    storage_key TEXT,
    storage_provider VARCHAR(50) DEFAULT 'local',
    uploaded_by UUID,
    model VARCHAR(100),
    record_id UUID,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_files_company ON {schema}.files(company_id);
CREATE INDEX IF NOT EXISTS idx_files_record ON {schema}.files(model, record_id);

-- ============================================================
-- SEQUENCES (for numbering documents)
-- ============================================================

CREATE TABLE IF NOT EXISTS {schema}.sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES {schema}.companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    prefix VARCHAR(50),
    suffix VARCHAR(50),
    padding INTEGER DEFAULT 5,
    next_number INTEGER DEFAULT 1,
    increment INTEGER DEFAULT 1,
    model VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sequences_company ON {schema}.sequences(company_id);

-- ============================================================
-- SYSTEM PARAMETERS
-- ============================================================

CREATE TABLE IF NOT EXISTS {schema}.system_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES {schema}.companies(id),
    key VARCHAR(100) NOT NULL,
    value TEXT,
    is_global BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, key)
);

CREATE INDEX IF NOT EXISTS idx_system_parameters_company ON {schema}.system_parameters(company_id);

-- ============================================================
-- INITIAL DATA
-- ============================================================

-- Insert default sequences
INSERT INTO {schema}.sequences (company_id, name, prefix, padding, next_number, created_at)
VALUES 
    (NULL, 'invoice', 'INV', 5, 1, NOW()),
    (NULL, 'sales_order', 'SO', 5, 1, NOW()),
    (NULL, 'purchase_order', 'PO', 5, 1, NOW()),
    (NULL, 'payment', 'PAY', 5, 1, NOW())
ON CONFLICT (company_id, name) DO NOTHING;

-- Insert default tags
INSERT INTO {schema}.tags (company_id, name, color, created_at)
VALUES 
    (NULL, 'VIP', '#8b5cf6', NOW()),
    (NULL, 'Priority', '#f59e0b', NOW()),
    (NULL, 'Bug', '#ef4444', NOW()),
    (NULL, 'Feature', '#10b981', NOW()),
    (NULL, 'Enhancement', '#3b82f6', NOW())
ON CONFLICT DO NOTHING;