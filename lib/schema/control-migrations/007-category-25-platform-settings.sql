-- ============================================================
-- SaMi Control DB Migration
-- Category 25: Platform Settings
-- ============================================================
--
-- Stores global, non-secret runtime configuration for SaMi.
-- Provider credentials, database URLs, API keys and other secrets
-- remain environment-managed and are intentionally excluded.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_settings (
    singleton_key SMALLINT PRIMARY KEY DEFAULT 1,
    revision BIGINT NOT NULL DEFAULT 1
        CHECK (revision >= 1),
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by_admin_id UUID
        REFERENCES platform_admins(id)
        ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT platform_settings_singleton
        CHECK (singleton_key = 1),

    CONSTRAINT platform_settings_object
        CHECK (jsonb_typeof(settings) = 'object')
);

CREATE TABLE IF NOT EXISTS platform_settings_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revision BIGINT NOT NULL
        CHECK (revision >= 1),
    settings JSONB NOT NULL,
    changed_keys TEXT[] NOT NULL DEFAULT '{}'::text[],
    changed_by_admin_id UUID
        REFERENCES platform_admins(id)
        ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT platform_settings_history_object
        CHECK (jsonb_typeof(settings) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_settings_history_revision
    ON platform_settings_history(revision);

CREATE INDEX IF NOT EXISTS idx_platform_settings_history_created
    ON platform_settings_history(created_at DESC);

INSERT INTO platform_settings (
    singleton_key,
    revision,
    settings,
    created_at,
    updated_at
)
VALUES (
    1,
    1,
    '{
      "defaults": {
        "locale": "en-KE",
        "timezone": "Africa/Nairobi",
        "dateFormat": "DD/MM/YYYY",
        "timeFormat": "24h",
        "firstDayOfWeek": 1
      },
      "registration": {
        "publicRegistrationEnabled": true,
        "googleRegistrationEnabled": true,
        "selfServiceWorkspaceCreationEnabled": true
      },
      "security": {
        "normalSessionHours": 24,
        "rememberMeDays": 30,
        "allowMultipleActiveSessions": false
      },
      "features": {
        "samiAiEnabled": true,
        "automationEnabled": true,
        "developerApiEnabled": true
      },
      "operations": {
        "maintenanceMode": false,
        "maintenanceMessage": "SaMi is temporarily unavailable while scheduled maintenance is in progress."
      }
    }'::jsonb,
    NOW(),
    NOW()
)
ON CONFLICT (singleton_key)
DO NOTHING;

INSERT INTO platform_settings_history (
    revision,
    settings,
    changed_keys,
    changed_by_admin_id,
    created_at
)
SELECT
    revision,
    settings,
    ARRAY['category_25_initial_settings']::text[],
    updated_by_admin_id,
    created_at
FROM platform_settings
WHERE singleton_key = 1
ON CONFLICT (revision)
DO NOTHING;
