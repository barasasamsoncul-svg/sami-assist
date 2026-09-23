-- ============================================================
-- SaMi Control DB Migration
-- Category 24: Platform Administrator Alert Preferences
-- ============================================================
--
-- Controls how SaMi Platform Administrators receive operational
-- alerts about the infrastructure required to keep SaMi online.
--
-- Credentials are never stored here.
-- SMS phone is an alert destination only and is optional.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_admin_alert_preferences (
    admin_id UUID PRIMARY KEY
        REFERENCES platform_admins(id)
        ON DELETE CASCADE,

    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    sms_phone_e164 VARCHAR(20),

    warning_email BOOLEAN NOT NULL DEFAULT TRUE,
    critical_email BOOLEAN NOT NULL DEFAULT TRUE,
    warning_sms BOOLEAN NOT NULL DEFAULT FALSE,
    critical_sms BOOLEAN NOT NULL DEFAULT TRUE,

    service_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    incident_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    quiet_hours_start TIME,
    quiet_hours_end TIME,

    timezone VARCHAR(80) NOT NULL DEFAULT 'Africa/Nairobi',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT platform_admin_alert_sms_phone_format
        CHECK (
            sms_phone_e164 IS NULL
            OR sms_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
        ),

    CONSTRAINT platform_admin_alert_quiet_hours
        CHECK (
            (
                quiet_hours_enabled = FALSE
                AND quiet_hours_start IS NULL
                AND quiet_hours_end IS NULL
            )
            OR
            (
                quiet_hours_enabled = TRUE
                AND quiet_hours_start IS NOT NULL
                AND quiet_hours_end IS NOT NULL
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_alert_preferences_email
    ON platform_admin_alert_preferences(email_enabled)
    WHERE email_enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_platform_admin_alert_preferences_sms
    ON platform_admin_alert_preferences(sms_enabled)
    WHERE sms_enabled = TRUE;


CREATE TABLE IF NOT EXISTS platform_admin_alert_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    admin_id UUID NOT NULL
        REFERENCES platform_admins(id)
        ON DELETE CASCADE,

    service_event_id UUID
        REFERENCES platform_service_events(id)
        ON DELETE SET NULL,

    incident_id UUID
        REFERENCES platform_incidents(id)
        ON DELETE SET NULL,

    channel VARCHAR(16) NOT NULL
        CHECK (
            channel IN (
                'email',
                'sms'
            )
        ),

    destination_fingerprint CHAR(64) NOT NULL,

    status VARCHAR(24) NOT NULL
        CHECK (
            status IN (
                'pending',
                'sent',
                'failed',
                'skipped'
            )
        ),

    provider VARCHAR(80),
    provider_message_id VARCHAR(255),
    error_code VARCHAR(160),

    attempt_count INTEGER NOT NULL DEFAULT 1
        CHECK (attempt_count >= 1),

    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT platform_admin_alert_delivery_target
        CHECK (
            service_event_id IS NOT NULL
            OR incident_id IS NOT NULL
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_admin_alert_delivery_service
    ON platform_admin_alert_deliveries(
        admin_id,
        service_event_id,
        channel
    )
    WHERE service_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_admin_alert_delivery_incident
    ON platform_admin_alert_deliveries(
        admin_id,
        incident_id,
        channel
    )
    WHERE incident_id IS NOT NULL;


-- Existing active administrators get the safe default:
-- operational email alerts on, SMS off until a phone is configured.
INSERT INTO platform_admin_alert_preferences (
    admin_id,
    email_enabled,
    sms_enabled,
    warning_email,
    critical_email,
    warning_sms,
    critical_sms,
    service_alerts_enabled,
    incident_alerts_enabled,
    timezone,
    created_at,
    updated_at
)
SELECT
    id,
    TRUE,
    FALSE,
    TRUE,
    TRUE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    'Africa/Nairobi',
    NOW(),
    NOW()
FROM platform_admins
WHERE deleted_at IS NULL
ON CONFLICT (admin_id)
DO NOTHING;
