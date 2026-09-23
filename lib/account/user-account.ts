import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getRuntimePlatformSettings,
} from '@/lib/admin/platform-settings';

/* ============================================================
   TYPES
   ============================================================ */

export type UserTheme =
  | 'system'
  | 'light'
  | 'dark';

export type UserTimeFormat =
  | '12h'
  | '24h';

export type UserDateFormat =
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'YYYY-MM-DD';

export type UserAccount = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  avatarFileId: string | null;
  avatarUrl: string | null;
  status: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type UserPreferences = {
  theme: UserTheme;
  locale: string;
  timezone: string;
  dateFormat: UserDateFormat;
  timeFormat: UserTimeFormat;
  firstDayOfWeek: number;
};

export type UserAccountWithPreferences = {
  account: UserAccount;
  preferences: UserPreferences;
};

export type UpdateUserProfileInput = {
  firstName: string;
  lastName: string;
  phone?: string | null;
};

export type UpdateUserPreferencesInput = {
  theme?: UserTheme;
  locale?: string;
  timezone?: string;
  dateFormat?: UserDateFormat;
  timeFormat?: UserTimeFormat;
  firstDayOfWeek?: number;
};

export type UserAccountValidationCode =
  | 'INVALID_FIRST_NAME'
  | 'INVALID_LAST_NAME'
  | 'INVALID_PHONE'
  | 'INVALID_THEME'
  | 'INVALID_LOCALE'
  | 'INVALID_TIMEZONE'
  | 'INVALID_DATE_FORMAT'
  | 'INVALID_TIME_FORMAT'
  | 'INVALID_FIRST_DAY_OF_WEEK';

type UserRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_file_id: string | null;
  status: string | null;
  email_verified: boolean | null;
  email_verified_at:
    | Date
    | string
    | null;
  created_at:
    | Date
    | string
    | null;
  updated_at:
    | Date
    | string
    | null;
};

type UserPreferencesRow = {
  theme: string | null;
  locale: string | null;
  timezone: string | null;
  date_format: string | null;
  time_format: string | null;
  first_day_of_week: number | null;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_FIRST_NAME_LENGTH =
  100;

const MAX_LAST_NAME_LENGTH =
  100;

const MAX_PHONE_LENGTH =
  50;

const MAX_LOCALE_LENGTH =
  20;

const MAX_TIMEZONE_LENGTH =
  100;

const THEMES =
  new Set<UserTheme>([
    'system',
    'light',
    'dark',
  ]);

const DATE_FORMATS =
  new Set<UserDateFormat>([
    'DD/MM/YYYY',
    'MM/DD/YYYY',
    'YYYY-MM-DD',
  ]);

const TIME_FORMATS =
  new Set<UserTimeFormat>([
    '12h',
    '24h',
  ]);

const DEFAULT_PREFERENCES:
  UserPreferences = {
    theme:
      'system',

    locale:
      'en',

    timezone:
      'UTC',

    dateFormat:
      'DD/MM/YYYY',

    timeFormat:
      '24h',

    firstDayOfWeek:
      1,
  };

/* ============================================================
   ERRORS
   ============================================================ */

export class UserAccountNotFoundError
  extends Error {
  constructor() {
    super(
      'User account was not found.'
    );

    this.name =
      'UserAccountNotFoundError';
  }
}

export class UserAccountValidationError
  extends Error {
  readonly code:
    UserAccountValidationCode;

  readonly field:
    string;

  constructor(
    code:
      UserAccountValidationCode,
    field:
      string,
    message:
      string
  ) {
    super(
      message
    );

    this.name =
      'UserAccountValidationError';

    this.code =
      code;

    this.field =
      field;
  }
}

/* ============================================================
   GENERAL HELPERS
   ============================================================ */

function toIsoString(
  value:
    | Date
    | string
    | null
): string | null {
  if (!value) {
    return null;
  }

  if (
    value instanceof
    Date
  ) {
    return value.toISOString();
  }

  const parsed =
    new Date(
      value
    );

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }

  return parsed.toISOString();
}

function assertUserId(
  userId:
    string
): string {
  const normalized =
    userId.trim();

  if (!normalized) {
    throw new UserAccountNotFoundError();
  }

  return normalized;
}

function normalizeName(
  value:
    string
): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(
      /\s+/g,
      ' '
    );
}

function normalizePhone(
  value?:
    string | null
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const normalized =
    value
      .normalize('NFKC')
      .trim();

  return normalized ||
    null;
}

function normalizeLocale(
  value:
    string
): string {
  return value
    .trim()
    .replace(
      /_/g,
      '-'
    );
}

function normalizeTimezone(
  value:
    string
): string {
  return value.trim();
}

function isValidLocale(
  value:
    string
): boolean {
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
  value:
    string
): boolean {
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

/* ============================================================
   PROFILE VALIDATION
   ============================================================ */

function validateProfileInput(
  input:
    UpdateUserProfileInput
) {
  const firstName =
    normalizeName(
      input.firstName
    );

  const lastName =
    normalizeName(
      input.lastName
    );

  const phone =
    normalizePhone(
      input.phone
    );

  if (
    !firstName ||
    firstName.length >
      MAX_FIRST_NAME_LENGTH
  ) {
    throw new UserAccountValidationError(
      'INVALID_FIRST_NAME',
      'firstName',
      'Enter a valid first name.'
    );
  }

  if (
    !lastName ||
    lastName.length >
      MAX_LAST_NAME_LENGTH
  ) {
    throw new UserAccountValidationError(
      'INVALID_LAST_NAME',
      'lastName',
      'Enter a valid last name.'
    );
  }

  if (
    phone &&
    phone.length >
      MAX_PHONE_LENGTH
  ) {
    throw new UserAccountValidationError(
      'INVALID_PHONE',
      'phone',
      'Phone number is too long.'
    );
  }

  return {
    firstName,
    lastName,

    fullName:
      `${firstName} ${lastName}`,

    phone,
  };
}

/* ============================================================
   PREFERENCE VALIDATION
   ============================================================ */

function validatePreferencePatch(
  input:
    UpdateUserPreferencesInput
): UpdateUserPreferencesInput {
  const patch:
    UpdateUserPreferencesInput =
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
      throw new UserAccountValidationError(
        'INVALID_THEME',
        'theme',
        'Choose a valid theme.'
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
      throw new UserAccountValidationError(
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
      throw new UserAccountValidationError(
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
      throw new UserAccountValidationError(
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
      throw new UserAccountValidationError(
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
      throw new UserAccountValidationError(
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
   ACCOUNT MAPPING
   ============================================================ */

function mapUserRow(
  row:
    UserRow
): UserAccount {
  const firstName =
    row.first_name ||
    '';

  const lastName =
    row.last_name ||
    '';

  const derivedFullName =
    `${firstName} ${lastName}`
      .trim();

  const avatarFileId =
    row.avatar_file_id ||
    null;

  return {
    id:
      row.id,

    email:
      row.email,

    firstName,

    lastName,

    fullName:
      row.full_name ||
      derivedFullName,

    phone:
      row.phone ||
      null,

    avatarFileId,

    /*
     * Avatar bytes are private in R2.
     *
     * The client receives only SaMi's authenticated
     * avatar endpoint. R2 keys/endpoints are never exposed.
     */
    avatarUrl:
      avatarFileId
        ? '/api/account/avatar'
        : null,

    status:
      row.status ||
      'unknown',

    emailVerified:
      row.email_verified ===
        true ||
      Boolean(
        row.email_verified_at
      ),

    emailVerifiedAt:
      toIsoString(
        row.email_verified_at
      ),

    createdAt:
      toIsoString(
        row.created_at
      ),

    updatedAt:
      toIsoString(
        row.updated_at
      ),
  };
}

function mapPreferencesRow(
  row:
    | UserPreferencesRow
    | undefined
    | null,
  defaults:
    UserPreferences =
      DEFAULT_PREFERENCES,
): UserPreferences {
  if (!row) {
    return {
      ...defaults,
    };
  }

  const theme =
    THEMES.has(
      row.theme as
        UserTheme
    )
      ? (
          row.theme as
            UserTheme
        )
      : defaults.theme;

  const dateFormat =
    DATE_FORMATS.has(
      row.date_format as
        UserDateFormat
    )
      ? (
          row.date_format as
            UserDateFormat
        )
      : defaults.dateFormat;

  const timeFormat =
    TIME_FORMATS.has(
      row.time_format as
        UserTimeFormat
    )
      ? (
          row.time_format as
            UserTimeFormat
        )
      : defaults.timeFormat;

  const firstDay =
    Number(
      row.first_day_of_week
    );

  return {
    theme,

    locale:
      row.locale ||
      defaults.locale,

    timezone:
      row.timezone ||
      defaults.timezone,

    dateFormat,

    timeFormat,

    firstDayOfWeek:
      Number.isInteger(
        firstDay
      ) &&
      firstDay >=
        0 &&
      firstDay <=
        6
        ? firstDay
        : defaults.firstDayOfWeek,
  };
}

/* ============================================================
   ACCOUNT READ
   ============================================================ */

export async function getUserAccount(
  userId:
    string
): Promise<UserAccount> {
  const id =
    assertUserId(
      userId
    );

  const result =
    await queryControl(
      `
        SELECT
          id,
          email,
          first_name,
          last_name,
          full_name,
          phone,
          avatar_file_id,
          status,
          email_verified,
          email_verified_at,
          created_at,
          updated_at

        FROM users

        WHERE id = $1
          AND deleted_at IS NULL

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
    throw new UserAccountNotFoundError();
  }

  return mapUserRow(
    result.rows[0] as
      UserRow
  );
}

/* ============================================================
   PROFILE UPDATE

   Does NOT update:
   - email
   - password
   - avatar
   - status
   - security state
   ============================================================ */

export async function updateUserProfile(
  userId:
    string,
  input:
    UpdateUserProfileInput
): Promise<UserAccount> {
  const id =
    assertUserId(
      userId
    );

  const profile =
    validateProfileInput(
      input
    );

  const result =
    await queryControl(
      `
        UPDATE users

        SET
          first_name = $2,
          last_name = $3,
          full_name = $4,
          phone = $5,
          updated_at = NOW()

        WHERE id = $1
          AND deleted_at IS NULL

        RETURNING
          id,
          email,
          first_name,
          last_name,
          full_name,
          phone,
          avatar_file_id,
          status,
          email_verified,
          email_verified_at,
          created_at,
          updated_at
      `,
      [
        id,
        profile.firstName,
        profile.lastName,
        profile.fullName,
        profile.phone,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    throw new UserAccountNotFoundError();
  }

  return mapUserRow(
    result.rows[0] as
      UserRow
  );
}

/* ============================================================
   PREFERENCES READ
   ============================================================ */

export async function getUserPreferences(
  userId:
    string
): Promise<UserPreferences> {
  const id =
    assertUserId(
      userId
    );

  /*
   * Validate the account and read preferences without
   * performing a write during an ordinary GET.
   */
  const result =
    await queryControl(
      `
        SELECT
          p.theme,
          p.locale,
          p.timezone,
          p.date_format,
          p.time_format,
          p.first_day_of_week

        FROM users u

        LEFT JOIN user_preferences p
          ON p.user_id =
            u.id

        WHERE u.id = $1
          AND u.deleted_at IS NULL

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
    throw new UserAccountNotFoundError();
  }

  const platformSettings =
    await getRuntimePlatformSettings();

  return mapPreferencesRow(
    result.rows[0] as
      UserPreferencesRow,
    {
      theme:
        'system',
      locale:
        platformSettings.defaults.locale,
      timezone:
        platformSettings.defaults.timezone,
      dateFormat:
        platformSettings.defaults.dateFormat,
      timeFormat:
        platformSettings.defaults.timeFormat,
      firstDayOfWeek:
        platformSettings.defaults.firstDayOfWeek,
    },
  );
}

/* ============================================================
   PREFERENCES UPDATE

   Atomic partial UPSERT.

   Each supplied field updates independently.

   An omitted field preserves the existing database value,
   preventing two concurrent partial PATCH requests from
   overwriting each other's unrelated changes.
   ============================================================ */

export async function updateUserPreferences(
  userId:
    string,
  input:
    UpdateUserPreferencesInput
): Promise<UserPreferences> {
  const id =
    assertUserId(
      userId
    );

  const patch =
    validatePreferencePatch(
      input
    );

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

  const hasFirstDay =
    patch.firstDayOfWeek !==
    undefined;

  if (
    !hasTheme &&
    !hasLocale &&
    !hasTimezone &&
    !hasDateFormat &&
    !hasTimeFormat &&
    !hasFirstDay
  ) {
    return getUserPreferences(
      id
    );
  }

  const platformSettings =
    await getRuntimePlatformSettings();

  const defaults: UserPreferences = {
    theme:
      'system',
    locale:
      platformSettings.defaults.locale,
    timezone:
      platformSettings.defaults.timezone,
    dateFormat:
      platformSettings.defaults.dateFormat,
    timeFormat:
      platformSettings.defaults.timeFormat,
    firstDayOfWeek:
      platformSettings.defaults.firstDayOfWeek,
  };

  /*
   * INSERT defaults are supplied for fields absent from the
   * patch because a preference row may not exist yet.
   *
   * During ON CONFLICT, the boolean flags decide whether each
   * existing value is replaced. This preserves true PATCH
   * semantics without a read-before-write race.
   */
  const result =
    await queryControl(
      `
        INSERT INTO user_preferences (
          user_id,
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
          u.id,
          $2,
          $4,
          $6,
          $8,
          $10,
          $12,
          NOW(),
          NOW()

        FROM users u

        WHERE u.id = $1
          AND u.deleted_at IS NULL

        ON CONFLICT (user_id)
        DO UPDATE SET

          theme =
            CASE
              WHEN $3::boolean
                THEN EXCLUDED.theme
              ELSE user_preferences.theme
            END,

          locale =
            CASE
              WHEN $5::boolean
                THEN EXCLUDED.locale
              ELSE user_preferences.locale
            END,

          timezone =
            CASE
              WHEN $7::boolean
                THEN EXCLUDED.timezone
              ELSE user_preferences.timezone
            END,

          date_format =
            CASE
              WHEN $9::boolean
                THEN EXCLUDED.date_format
              ELSE user_preferences.date_format
            END,

          time_format =
            CASE
              WHEN $11::boolean
                THEN EXCLUDED.time_format
              ELSE user_preferences.time_format
            END,

          first_day_of_week =
            CASE
              WHEN $13::boolean
                THEN EXCLUDED.first_day_of_week
              ELSE user_preferences.first_day_of_week
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

        patch.theme ??
          defaults.theme,
        hasTheme,

        patch.locale ??
          defaults.locale,
        hasLocale,

        patch.timezone ??
          defaults.timezone,
        hasTimezone,

        patch.dateFormat ??
          defaults.dateFormat,
        hasDateFormat,

        patch.timeFormat ??
          defaults.timeFormat,
        hasTimeFormat,

        patch.firstDayOfWeek ??
          defaults.firstDayOfWeek,
        hasFirstDay,
      ]
    );

  if (
    result.rows.length !==
    1
  ) {
    throw new UserAccountNotFoundError();
  }

  return mapPreferencesRow(
    result.rows[0] as
      UserPreferencesRow,
    defaults,
  );
}

/* ============================================================
   COMBINED ACCOUNT CONTEXT
   ============================================================ */

export async function getUserAccountWithPreferences(
  userId:
    string
): Promise<UserAccountWithPreferences> {
  const id =
    assertUserId(
      userId
    );

  const [
    account,
    preferences,
  ] =
    await Promise.all([
      getUserAccount(
        id
      ),

      getUserPreferences(
        id
      ),
    ]);

  return {
    account,
    preferences,
  };
}