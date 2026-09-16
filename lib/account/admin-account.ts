import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';

/* ============================================================
   TYPES
   ============================================================ */

export type AdminTheme =
  | 'system'
  | 'light'
  | 'dark';

export type AdminDateFormat =
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'YYYY-MM-DD';

export type AdminTimeFormat =
  | '12h'
  | '24h';

export type AdminPreferences = {
  theme: AdminTheme;
  locale: string;
  timezone: string;
  dateFormat: AdminDateFormat;
  timeFormat: AdminTimeFormat;
  firstDayOfWeek: number;
};

export type UpdateAdminPreferencesInput = {
  theme?: AdminTheme;
  locale?: string;
  timezone?: string;
  dateFormat?: AdminDateFormat;
  timeFormat?: AdminTimeFormat;
  firstDayOfWeek?: number;
};

type AdminPreferenceRow = {
  theme: string | null;
  locale: string | null;
  timezone: string | null;
  date_format: string | null;
  time_format: string | null;
  first_day_of_week: number | null;
};

export type AdminAccountValidationCode =
  | 'INVALID_THEME'
  | 'INVALID_LOCALE'
  | 'INVALID_TIMEZONE'
  | 'INVALID_DATE_FORMAT'
  | 'INVALID_TIME_FORMAT'
  | 'INVALID_FIRST_DAY_OF_WEEK';

/* ============================================================
   CONSTANTS
   ============================================================ */

const THEMES =
  new Set<AdminTheme>([
    'system',
    'light',
    'dark',
  ]);

const DATE_FORMATS =
  new Set<AdminDateFormat>([
    'DD/MM/YYYY',
    'MM/DD/YYYY',
    'YYYY-MM-DD',
  ]);

const TIME_FORMATS =
  new Set<AdminTimeFormat>([
    '12h',
    '24h',
  ]);

const MAX_LOCALE_LENGTH =
  20;

const MAX_TIMEZONE_LENGTH =
  100;

export const DEFAULT_ADMIN_PREFERENCES:
  AdminPreferences = {
    theme: 'system',
    locale: 'en',
    timezone: 'UTC',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    firstDayOfWeek: 1,
  };

/* ============================================================
   ERRORS
   ============================================================ */

export class AdminAccountNotFoundError
  extends Error {
  constructor() {
    super(
      'Platform Administrator account was not found.'
    );

    this.name =
      'AdminAccountNotFoundError';
  }
}

export class AdminAccountValidationError
  extends Error {
  readonly code:
    AdminAccountValidationCode;

  readonly field:
    string;

  constructor(
    code:
      AdminAccountValidationCode,
    field: string,
    message: string
  ) {
    super(message);

    this.name =
      'AdminAccountValidationError';

    this.code =
      code;

    this.field =
      field;
  }
}

/* ============================================================
   HELPERS
   ============================================================ */

function assertAdminId(
  adminId: string
) {
  const normalized =
    adminId.trim();

  if (!normalized) {
    throw new AdminAccountNotFoundError();
  }

  return normalized;
}

function normalizeLocale(
  value: string
) {
  return value
    .trim()
    .replace(/_/g, '-');
}

function normalizeTimezone(
  value: string
) {
  return value.trim();
}

function isValidLocale(
  value: string
) {
  if (
    !value ||
    value.length >
      MAX_LOCALE_LENGTH
  ) {
    return false;
  }

  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(
    value
  );
}

function isValidTimezone(
  value: string
) {
  if (
    !value ||
    value.length >
      MAX_TIMEZONE_LENGTH
  ) {
    return false;
  }

  try {
    new Intl.DateTimeFormat(
      'en',
      {
        timeZone:
          value,
      }
    ).format();

    return true;
  } catch {
    return false;
  }
}

function mapPreferences(
  row:
    | AdminPreferenceRow
    | undefined
    | null
): AdminPreferences {
  if (!row) {
    return {
      ...DEFAULT_ADMIN_PREFERENCES,
    };
  }

  const theme =
    THEMES.has(
      row.theme as
        AdminTheme
    )
      ? (
          row.theme as
            AdminTheme
        )
      : DEFAULT_ADMIN_PREFERENCES.theme;

  const dateFormat =
    DATE_FORMATS.has(
      row.date_format as
        AdminDateFormat
    )
      ? (
          row.date_format as
            AdminDateFormat
        )
      : DEFAULT_ADMIN_PREFERENCES.dateFormat;

  const timeFormat =
    TIME_FORMATS.has(
      row.time_format as
        AdminTimeFormat
    )
      ? (
          row.time_format as
            AdminTimeFormat
        )
      : DEFAULT_ADMIN_PREFERENCES.timeFormat;

  const firstDay =
    Number(
      row.first_day_of_week
    );

  return {
    theme,

    locale:
      row.locale ||
      DEFAULT_ADMIN_PREFERENCES.locale,

    timezone:
      row.timezone ||
      DEFAULT_ADMIN_PREFERENCES.timezone,

    dateFormat,

    timeFormat,

    firstDayOfWeek:
      Number.isInteger(
        firstDay
      ) &&
      firstDay >= 0 &&
      firstDay <= 6
        ? firstDay
        : DEFAULT_ADMIN_PREFERENCES.firstDayOfWeek,
  };
}

/* ============================================================
   ADMIN EXISTENCE / STATE
   ============================================================ */

async function assertActiveAdmin(
  adminId: string
) {
  const id =
    assertAdminId(
      adminId
    );

  const result =
    await queryControl(
      `
        SELECT id

        FROM platform_admins

        WHERE id = $1
          AND status = 'active'
          AND deleted_at IS NULL

        LIMIT 1
      `,
      [
        id,
      ]
    );

  if (
    result.rows.length !==
    1
  ) {
    throw new AdminAccountNotFoundError();
  }

  return id;
}

/* ============================================================
   VALIDATION
   ============================================================ */

function validatePatch(
  input:
    UpdateAdminPreferencesInput
): UpdateAdminPreferencesInput {
  const patch:
    UpdateAdminPreferencesInput =
      {};

  if (
    input.theme !==
    undefined
  ) {
    if (
      !THEMES.has(
        input.theme
      )
    ) {
      throw new AdminAccountValidationError(
        'INVALID_THEME',
        'theme',
        'Choose a valid appearance.'
      );
    }

    patch.theme =
      input.theme;
  }

  if (
    input.locale !==
    undefined
  ) {
    const locale =
      normalizeLocale(
        input.locale
      );

    if (
      !isValidLocale(
        locale
      )
    ) {
      throw new AdminAccountValidationError(
        'INVALID_LOCALE',
        'locale',
        'Choose a valid language or locale.'
      );
    }

    patch.locale =
      locale;
  }

  if (
    input.timezone !==
    undefined
  ) {
    const timezone =
      normalizeTimezone(
        input.timezone
      );

    if (
      !isValidTimezone(
        timezone
      )
    ) {
      throw new AdminAccountValidationError(
        'INVALID_TIMEZONE',
        'timezone',
        'Choose a valid timezone.'
      );
    }

    patch.timezone =
      timezone;
  }

  if (
    input.dateFormat !==
    undefined
  ) {
    if (
      !DATE_FORMATS.has(
        input.dateFormat
      )
    ) {
      throw new AdminAccountValidationError(
        'INVALID_DATE_FORMAT',
        'dateFormat',
        'Choose a valid date format.'
      );
    }

    patch.dateFormat =
      input.dateFormat;
  }

  if (
    input.timeFormat !==
    undefined
  ) {
    if (
      !TIME_FORMATS.has(
        input.timeFormat
      )
    ) {
      throw new AdminAccountValidationError(
        'INVALID_TIME_FORMAT',
        'timeFormat',
        'Choose a valid time format.'
      );
    }

    patch.timeFormat =
      input.timeFormat;
  }

  if (
    input.firstDayOfWeek !==
    undefined
  ) {
    if (
      !Number.isInteger(
        input.firstDayOfWeek
      ) ||
      input.firstDayOfWeek <
        0 ||
      input.firstDayOfWeek >
        6
    ) {
      throw new AdminAccountValidationError(
        'INVALID_FIRST_DAY_OF_WEEK',
        'firstDayOfWeek',
        'Choose a valid first day of the week.'
      );
    }

    patch.firstDayOfWeek =
      input.firstDayOfWeek;
  }

  return patch;
}

/* ============================================================
   GET PREFERENCES
   ============================================================ */

export async function getAdminPreferences(
  adminId: string
): Promise<AdminPreferences> {
  const id =
    await assertActiveAdmin(
      adminId
    );

  const result =
    await queryControl(
      `
        SELECT
          theme,
          locale,
          timezone,
          date_format,
          time_format,
          first_day_of_week

        FROM platform_admin_preferences

        WHERE admin_id = $1

        LIMIT 1
      `,
      [
        id,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    return {
      ...DEFAULT_ADMIN_PREFERENCES,
    };
  }

  return mapPreferences(
    result.rows[0] as
      AdminPreferenceRow
  );
}

/* ============================================================
   UPDATE PREFERENCES

   IMPORTANT:
   Partial PATCH values are resolved inside PostgreSQL.

   We do NOT:
   1. read the current row,
   2. merge in Node,
   3. write the complete row.

   That pattern allows two concurrent PATCH requests to overwrite
   each other's changes.

   Each supplied field is instead applied independently by the
   single atomic UPSERT below.
   ============================================================ */

export async function updateAdminPreferences(
  adminId: string,
  input:
    UpdateAdminPreferencesInput
): Promise<AdminPreferences> {
  const id =
    await assertActiveAdmin(
      adminId
    );

  const patch =
    validatePatch(
      input
    );

  const fields =
    Object.keys(
      patch
    );

  if (
    fields.length ===
    0
  ) {
    return getAdminPreferences(
      id
    );
  }

  const hasTheme =
    patch.theme !==
    undefined;

  const hasLocale =
    patch.locale !==
    undefined;

  const hasTimezone =
    patch.timezone !==
    undefined;

  const hasDateFormat =
    patch.dateFormat !==
    undefined;

  const hasTimeFormat =
    patch.timeFormat !==
    undefined;

  const hasFirstDayOfWeek =
    patch.firstDayOfWeek !==
    undefined;

  /*
   * INSERT case:
   * Missing values receive SaMi defaults.
   *
   * CONFLICT case:
   * Only fields explicitly supplied by this PATCH are replaced.
   *
   * This keeps concurrent partial updates independent.
   *
   * Administrator state is checked again inside the INSERT
   * source. If the administrator is disabled/deleted after the
   * earlier validation, the write returns zero rows.
   */

  const result =
    await queryControl(
      `
        INSERT INTO platform_admin_preferences (
          admin_id,
          theme,
          locale,
          timezone,
          date_format,
          time_format,
          first_day_of_week,
          created_at,
          updated_at
        )

        SELECT
          pa.id,

          CASE
            WHEN $2::boolean
              THEN $3::text
            ELSE $14::text
          END,

          CASE
            WHEN $4::boolean
              THEN $5::text
            ELSE $15::text
          END,

          CASE
            WHEN $6::boolean
              THEN $7::text
            ELSE $16::text
          END,

          CASE
            WHEN $8::boolean
              THEN $9::text
            ELSE $17::text
          END,

          CASE
            WHEN $10::boolean
              THEN $11::text
            ELSE $18::text
          END,

          CASE
            WHEN $12::boolean
              THEN $13::integer
            ELSE $19::integer
          END,

          NOW(),
          NOW()

        FROM platform_admins pa

        WHERE pa.id = $1
          AND pa.status = 'active'
          AND pa.deleted_at IS NULL

        ON CONFLICT (admin_id)
        DO UPDATE SET

          theme =
            CASE
              WHEN $2::boolean
                THEN $3::text
              ELSE platform_admin_preferences.theme
            END,

          locale =
            CASE
              WHEN $4::boolean
                THEN $5::text
              ELSE platform_admin_preferences.locale
            END,

          timezone =
            CASE
              WHEN $6::boolean
                THEN $7::text
              ELSE platform_admin_preferences.timezone
            END,

          date_format =
            CASE
              WHEN $8::boolean
                THEN $9::text
              ELSE platform_admin_preferences.date_format
            END,

          time_format =
            CASE
              WHEN $10::boolean
                THEN $11::text
              ELSE platform_admin_preferences.time_format
            END,

          first_day_of_week =
            CASE
              WHEN $12::boolean
                THEN $13::integer
              ELSE platform_admin_preferences.first_day_of_week
            END,

          updated_at =
            NOW()

        RETURNING
          theme,
          locale,
          timezone,
          date_format,
          time_format,
          first_day_of_week
      `,
      [
        id,

        hasTheme,
        patch.theme ??
          null,

        hasLocale,
        patch.locale ??
          null,

        hasTimezone,
        patch.timezone ??
          null,

        hasDateFormat,
        patch.dateFormat ??
          null,

        hasTimeFormat,
        patch.timeFormat ??
          null,

        hasFirstDayOfWeek,
        patch.firstDayOfWeek ??
          null,

        DEFAULT_ADMIN_PREFERENCES.theme,
        DEFAULT_ADMIN_PREFERENCES.locale,
        DEFAULT_ADMIN_PREFERENCES.timezone,
        DEFAULT_ADMIN_PREFERENCES.dateFormat,
        DEFAULT_ADMIN_PREFERENCES.timeFormat,
        DEFAULT_ADMIN_PREFERENCES.firstDayOfWeek,
      ]
    );

  if (
    result.rows.length !==
    1
  ) {
    throw new AdminAccountNotFoundError();
  }

  return mapPreferences(
    result.rows[0] as
      AdminPreferenceRow
  );
}