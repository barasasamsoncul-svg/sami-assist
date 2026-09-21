-- ============================================================
-- SaMi Tenant Core Migration
-- 1.4.0 -> 1.5.0
-- Category 18: SaMi AI Core
-- ============================================================

ALTER TABLE ai_conversations
    ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

UPDATE ai_conversations
SET last_message_at = COALESCE(last_message_at, updated_at, created_at)
WHERE last_message_at IS NULL;

ALTER TABLE ai_messages
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'completed',
    ADD COLUMN IF NOT EXISTS provider VARCHAR(50),
    ADD COLUMN IF NOT EXISTS model VARCHAR(255),
    ADD COLUMN IF NOT EXISTS correlation_id UUID;

CREATE INDEX IF NOT EXISTS idx_ai_messages_correlation
    ON ai_messages(correlation_id);

CREATE TABLE IF NOT EXISTS ai_preferences (
    user_id UUID NOT NULL,

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    memory_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    use_account_preferences BOOLEAN NOT NULL DEFAULT TRUE,

    response_style VARCHAR(30) NOT NULL DEFAULT 'balanced',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_preferences_company
    ON ai_preferences(company_id, user_id);

ALTER TABLE ai_memory
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS scope VARCHAR(30) NOT NULL DEFAULT 'company',
    ADD COLUMN IF NOT EXISTS memory_key VARCHAR(150),
    ADD COLUMN IF NOT EXISTS source_module VARCHAR(150),
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS sensitivity VARCHAR(30) NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS created_by_ai BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE ai_memory
    DROP CONSTRAINT IF EXISTS ai_memory_scope_check;

ALTER TABLE ai_memory
    ADD CONSTRAINT ai_memory_scope_check
    CHECK (scope IN ('personal', 'company', 'workspace'));

CREATE INDEX IF NOT EXISTS idx_ai_memory_user_company
    ON ai_memory(
        user_id,
        company_id,
        status,
        updated_at DESC
    )
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_memory_module
    ON ai_memory(source_module, source_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_memory_personal_key
    ON ai_memory(user_id, company_id, memory_key)
    WHERE scope = 'personal'
      AND memory_key IS NOT NULL
      AND archived_at IS NULL;

ALTER TABLE ai_actions
    ADD COLUMN IF NOT EXISTS tool_key VARCHAR(150),
    ADD COLUMN IF NOT EXISTS operation VARCHAR(30) NOT NULL DEFAULT 'read',
    ADD COLUMN IF NOT EXISTS risk_level VARCHAR(30) NOT NULL DEFAULT 'low',
    ADD COLUMN IF NOT EXISTS confirmation_required BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS confirmed_by UUID,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ai_actions_tool
    ON ai_actions(tool_key, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_actions_expiry
    ON ai_actions(expires_at)
    WHERE status = 'pending_confirmation';

CREATE TABLE IF NOT EXISTS ai_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    conversation_id UUID
        REFERENCES ai_conversations(id)
        ON DELETE SET NULL,

    user_id UUID NOT NULL,

    company_id UUID
        REFERENCES companies(id)
        ON DELETE SET NULL,

    provider VARCHAR(50) NOT NULL,
    model VARCHAR(255) NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'running',

    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,

    tool_calls_count INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,

    error_code VARCHAR(100),
    error_message TEXT,

    correlation_id UUID NOT NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_user_created
    ON ai_runs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_runs_company_created
    ON ai_runs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_runs_conversation_created
    ON ai_runs(conversation_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_runs_correlation
    ON ai_runs(correlation_id);

DROP TRIGGER IF EXISTS trg_ai_preferences_updated_at
    ON ai_preferences;

CREATE TRIGGER trg_ai_preferences_updated_at
BEFORE UPDATE ON ai_preferences
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO core_schema_version (version, installed_at)
VALUES ('1.5.0', NOW())
ON CONFLICT (version) DO NOTHING;
