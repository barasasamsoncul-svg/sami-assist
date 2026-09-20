ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS logo_file_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'companies_logo_file_id_fkey'
          AND conrelid = 'companies'::regclass
    ) THEN
        ALTER TABLE companies
            ADD CONSTRAINT companies_logo_file_id_fkey
            FOREIGN KEY (logo_file_id)
            REFERENCES files(id)
            ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_companies_logo_file
    ON companies(logo_file_id)
    WHERE logo_file_id IS NOT NULL;


-- ============================================================
-- SaMi Tenant Core Migration
-- 1.2.0 -> 1.3.0
-- Category 15: Notifications
-- ============================================================

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS event_key VARCHAR(150),
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS source_module VARCHAR(150),
    ADD COLUMN IF NOT EXISTS source_model VARCHAR(150),
    ADD COLUMN IF NOT EXISTS source_record_id UUID,
    ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(255),
    ADD COLUMN IF NOT EXISTS in_app_visible BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_notifications_user_company_active
    ON notifications(user_id, company_id, created_at DESC, id DESC)
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_active
    ON notifications(user_id, company_id, created_at DESC, id DESC)
    WHERE is_read = FALSE
      AND in_app_visible = TRUE
      AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_event_key
    ON notifications(event_key)
    WHERE event_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe_active
    ON notifications(user_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL
      AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    user_id UUID NOT NULL,

    event_key VARCHAR(150) NOT NULL DEFAULT '*',

    in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    mute_until TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(company_id, user_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user
    ON notification_preferences(user_id, company_id);

CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    notification_id UUID NOT NULL
        REFERENCES notifications(id)
        ON DELETE CASCADE,

    recipient_user_id UUID NOT NULL,

    channel VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',

    attempts INTEGER NOT NULL DEFAULT 0,

    provider_message_id TEXT,

    last_attempt_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,

    error_code VARCHAR(100),
    error_message TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(notification_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_pending
    ON notification_deliveries(channel, status, created_at)
    WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_recipient
    ON notification_deliveries(recipient_user_id, created_at DESC);


CREATE TABLE IF NOT EXISTS workspace_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    conversation_type VARCHAR(30) NOT NULL DEFAULT 'direct',
    subject VARCHAR(255),
    direct_key VARCHAR(100),
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_conversations_direct_key
    ON workspace_conversations(company_id, direct_key)
    WHERE conversation_type = 'direct'
      AND direct_key IS NOT NULL
      AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_conversations_company_updated
    ON workspace_conversations(company_id, updated_at DESC)
    WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS workspace_conversation_members (
    conversation_id UUID NOT NULL REFERENCES workspace_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    member_role VARCHAR(30) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    muted_until TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    PRIMARY KEY(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_conversation_members_user
    ON workspace_conversation_members(user_id, conversation_id)
    WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS workspace_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES workspace_conversations(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL,
    reply_to_message_id UUID REFERENCES workspace_messages(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workspace_messages_conversation
    ON workspace_messages(conversation_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_messages_sender
    ON workspace_messages(sender_user_id, created_at DESC)
    WHERE deleted_at IS NULL;
