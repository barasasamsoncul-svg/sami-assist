import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';

import {
  normalizeSmsPhone,
} from '@/lib/services/sms';


export type PlatformAdminAlertPreferences = {
  emailEnabled:
    boolean;
  smsEnabled:
    boolean;
  smsPhoneE164:
    string | null;
  warningEmail:
    boolean;
  criticalEmail:
    boolean;
  warningSms:
    boolean;
  criticalSms:
    boolean;
  serviceAlertsEnabled:
    boolean;
  incidentAlertsEnabled:
    boolean;
  timezone:
    string;
};


const DEFAULTS:
  PlatformAdminAlertPreferences = {
    emailEnabled:
      true,
    smsEnabled:
      false,
    smsPhoneE164:
      null,
    warningEmail:
      true,
    criticalEmail:
      true,
    warningSms:
      false,
    criticalSms:
      true,
    serviceAlertsEnabled:
      true,
    incidentAlertsEnabled:
      true,
    timezone:
      'Africa/Nairobi',
  };


function booleanValue(
  value:
    unknown,
  fallback:
    boolean,
) {
  return typeof value ===
    'boolean'
    ? value
    : fallback;
}


function timezoneValue(
  value:
    unknown,
) {
  if (
    typeof value !==
      'string'
  ) {
    return DEFAULTS
      .timezone;
  }

  const timezone =
    value
      .trim()
      .slice(
        0,
        80,
      );

  if (
    !timezone
  ) {
    return DEFAULTS
      .timezone;
  }

  try {
    new Intl.DateTimeFormat(
      'en',
      {
        timeZone:
          timezone,
      },
    );

    return timezone;
  } catch {
    throw new Error(
      'INVALID_TIMEZONE',
    );
  }
}


export async function getPlatformAdminAlertPreferences(
  adminId:
    string,
): Promise<
  PlatformAdminAlertPreferences
> {
  const result =
    await queryControl(
      `
        SELECT
          email_enabled,
          sms_enabled,
          sms_phone_e164,
          warning_email,
          critical_email,
          warning_sms,
          critical_sms,
          service_alerts_enabled,
          incident_alerts_enabled,
          timezone
        FROM platform_admin_alert_preferences
        WHERE admin_id = $1
        LIMIT 1
      `,
      [
        adminId,
      ],
    );

  const row =
    result.rows[0];

  if (
    !row
  ) {
    return {
      ...DEFAULTS,
    };
  }

  return {
    emailEnabled:
      row.email_enabled !==
      false,
    smsEnabled:
      row.sms_enabled ===
      true,
    smsPhoneE164:
      row.sms_phone_e164
        ? String(
            row.sms_phone_e164,
          )
        : null,
    warningEmail:
      row.warning_email !==
      false,
    criticalEmail:
      row.critical_email !==
      false,
    warningSms:
      row.warning_sms ===
      true,
    criticalSms:
      row.critical_sms !==
      false,
    serviceAlertsEnabled:
      row.service_alerts_enabled !==
      false,
    incidentAlertsEnabled:
      row.incident_alerts_enabled !==
      false,
    timezone:
      typeof row.timezone ===
        'string' &&
      row.timezone
        .trim()
        ? row.timezone
        : DEFAULTS
            .timezone,
  };
}


export async function updatePlatformAdminAlertPreferences(
  input: {
    adminId:
      string;
    emailEnabled?:
      unknown;
    smsEnabled?:
      unknown;
    smsPhone?:
      unknown;
    warningEmail?:
      unknown;
    criticalEmail?:
      unknown;
    warningSms?:
      unknown;
    criticalSms?:
      unknown;
    serviceAlertsEnabled?:
      unknown;
    incidentAlertsEnabled?:
      unknown;
    timezone?:
      unknown;
  },
) {
  const current =
    await getPlatformAdminAlertPreferences(
      input.adminId,
    );

  const smsEnabled =
    booleanValue(
      input.smsEnabled,
      current.smsEnabled,
    );

  const rawPhone =
    typeof input.smsPhone ===
      'string'
      ? input.smsPhone
          .trim()
      : current
          .smsPhoneE164 ||
        '';

  const phone =
    rawPhone
      ? normalizeSmsPhone(
          rawPhone,
        )
      : null;

  if (
    rawPhone &&
    !phone
  ) {
    throw new Error(
      'INVALID_SMS_PHONE',
    );
  }

  if (
    smsEnabled &&
    !phone
  ) {
    throw new Error(
      'SMS_PHONE_REQUIRED',
    );
  }

  const updated:
    PlatformAdminAlertPreferences = {
    emailEnabled:
      booleanValue(
        input.emailEnabled,
        current.emailEnabled,
      ),
    smsEnabled,
    smsPhoneE164:
      phone,
    warningEmail:
      booleanValue(
        input.warningEmail,
        current.warningEmail,
      ),
    criticalEmail:
      booleanValue(
        input.criticalEmail,
        current.criticalEmail,
      ),
    warningSms:
      booleanValue(
        input.warningSms,
        current.warningSms,
      ),
    criticalSms:
      booleanValue(
        input.criticalSms,
        current.criticalSms,
      ),
    serviceAlertsEnabled:
      booleanValue(
        input.serviceAlertsEnabled,
        current.serviceAlertsEnabled,
      ),
    incidentAlertsEnabled:
      booleanValue(
        input.incidentAlertsEnabled,
        current.incidentAlertsEnabled,
      ),
    timezone:
      input.timezone ===
        undefined
        ? current.timezone
        : timezoneValue(
            input.timezone,
          ),
  };

  await queryControl(
    `
      INSERT INTO platform_admin_alert_preferences (
        admin_id,
        email_enabled,
        sms_enabled,
        sms_phone_e164,
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
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        NOW(),
        NOW()
      )
      ON CONFLICT (
        admin_id
      )
      DO UPDATE SET
        email_enabled =
          EXCLUDED.email_enabled,
        sms_enabled =
          EXCLUDED.sms_enabled,
        sms_phone_e164 =
          EXCLUDED.sms_phone_e164,
        warning_email =
          EXCLUDED.warning_email,
        critical_email =
          EXCLUDED.critical_email,
        warning_sms =
          EXCLUDED.warning_sms,
        critical_sms =
          EXCLUDED.critical_sms,
        service_alerts_enabled =
          EXCLUDED.service_alerts_enabled,
        incident_alerts_enabled =
          EXCLUDED.incident_alerts_enabled,
        timezone =
          EXCLUDED.timezone,
        updated_at =
          NOW()
    `,
    [
      input.adminId,
      updated.emailEnabled,
      updated.smsEnabled,
      updated.smsPhoneE164,
      updated.warningEmail,
      updated.criticalEmail,
      updated.warningSms,
      updated.criticalSms,
      updated.serviceAlertsEnabled,
      updated.incidentAlertsEnabled,
      updated.timezone,
    ],
  );

  return updated;
}
