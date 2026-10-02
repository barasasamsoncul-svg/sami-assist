-- ============================================================
-- SaMi Tenant Core Migration
-- 1.8.0 -> 1.9.0
-- Workspace notification sounds and in-app calling
-- ============================================================

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS alert_sound VARCHAR(40) NOT NULL DEFAULT 'chime',
  ADD COLUMN IF NOT EXISTS message_sound VARCHAR(40) NOT NULL DEFAULT 'soft',
  ADD COLUMN IF NOT EXISTS call_ringtone VARCHAR(40) NOT NULL DEFAULT 'classic';

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_preferences_alert_sound_check'
      AND conrelid = 'notification_preferences'::regclass
  ) THEN
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_preferences_alert_sound_check
      CHECK (alert_sound IN ('chime','soft','pulse','classic','silent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_preferences_message_sound_check'
      AND conrelid = 'notification_preferences'::regclass
  ) THEN
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_preferences_message_sound_check
      CHECK (message_sound IN ('chime','soft','pulse','classic','silent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_preferences_call_ringtone_check'
      AND conrelid = 'notification_preferences'::regclass
  ) THEN
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_preferences_call_ringtone_check
      CHECK (call_ringtone IN ('classic','chime','pulse','soft','silent'));
  END IF;
END
$;


CREATE TABLE IF NOT EXISTS workspace_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    conversation_id UUID
        REFERENCES workspace_conversations(id)
        ON DELETE SET NULL,

    caller_user_id UUID NOT NULL,
    callee_user_id UUID NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'ringing'
        CHECK (
            status IN (
                'ringing',
                'accepted',
                'declined',
                'ended',
                'cancelled',
                'missed'
            )
        ),

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answered_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (caller_user_id <> callee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_calls_callee_status
    ON workspace_calls(callee_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_calls_caller_status
    ON workspace_calls(caller_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_calls_company_created
    ON workspace_calls(company_id, created_at DESC);


CREATE TABLE IF NOT EXISTS workspace_call_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    call_id UUID NOT NULL
        REFERENCES workspace_calls(id)
        ON DELETE CASCADE,

    sender_user_id UUID NOT NULL,

    signal_type VARCHAR(20) NOT NULL
        CHECK (
            signal_type IN (
                'offer',
                'answer',
                'ice'
            )
        ),

    payload JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_call_signals_call_created
    ON workspace_call_signals(call_id, created_at ASC, id ASC);


DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_workspace_calls_updated_at'
      AND tgrelid = 'workspace_calls'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_workspace_calls_updated_at
    BEFORE UPDATE ON workspace_calls
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END
$;


INSERT INTO core_schema_version (version, installed_at)
VALUES ('1.9.0', NOW())
ON CONFLICT (version) DO NOTHING;
