import 'server-only';

import { queryControl } from '@/lib/db/control';

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
  avatar_url: string | null;
  status: string | null;
  email_verified: boolean | null;
  email_verified_at: Date | string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
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

const MAX_FIRST_NAME_LENGTH = 100;
const MAX_LAST_NAME_LENGTH = 100;
const MAX_PHONE_LENGTH = 50;
const MAX_LOCALE_LENGTH = 20;
const MAX_TIMEZONE_LENGTH = 100;

const THEMES = new Set<UserTheme>([
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

const DEFAULT_PREFERENCES: UserPreferences = {
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
    code: UserAccountValidationCode,
    field: string,
    message: string
  ) {
    super(message);

    this.name =
      'UserAccountValidationError';

    this.code = code;
    this.field = field;
  }
}

/* ============================================================
   HELPERS
   ============================================================ */

function toIsoString(
  value: Date | string | null
): string | null {
  if (!value) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    return value.toISOString();
  }

  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }

  return parsed.toISOString();
}

function normalizeName(
  value: string
): string {
  return value
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizePhone(
  value?: string | null
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized ||
    null;
}

function normalizeLocale(
  value: string
): string {
  return value
    .trim()
    .replace(/_/g, '-');
}

function normalizeTimezone(
  value: string
): string {
  return value.trim();
}

function isValidLocale(
  value: string
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
  value: string
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
        timeZone: value,
      }
    ).format();

    return true;
  } catch {
    return false;
  }
}

function assertUserId(
  userId: string
): string {
  const normalized =
    userId.trim();

  if (!normalized) {
    throw new UserAccountNotFoundError();
  }

  return normalized;
}

function validateProfileInput(
  input: UpdateUserProfileInput
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

  const fullName =
    `${firstName} ${lastName}`;

  return {
    firstName,
    lastName,
    fullName,
    phone,
  };
}

function validatePreferencePatch(
  input: UpdateUserPreferencesInput
): UpdateUserPreferencesInput {
  const patch:
    UpdateUserPreferencesInput = {};

  if (
    input.theme !== undefined
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
    input.locale !== undefined
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
    input.timezone !== undefined
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
    input.dateFormat !== undefined
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
    input.timeFormat !== undefined
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
    input.firstDayOfWeek !== undefined
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

function mapUserRow(
  row: UserRow
): UserAccount {
  const firstName =
    row.first_name || '';

  const lastName =
    row.last_name || '';

  const derivedFullName =
    `${firstName} ${lastName}`.trim();

  return {
    id: row.id,
    email: row.email,
    firstName,
    lastName,
    fullName:
      row.full_name ||
      derivedFullName,
    phone:
      row.phone ||
      null,
    avatarFileId:
      row.avatar_file_id ||
      null,
    avatarUrl:
      row.avatar_url ||
      null,
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
    | null
): UserPreferences {
  if (!row) {
    return {
      ...DEFAULT_PREFERENCES,
    };
  }

  const theme =
    THEMES.has(
      row.theme as UserTheme
    )
      ? (
          row.theme as UserTheme
        )
      : DEFAULT_PREFERENCES.theme;

  const dateFormat =
    DATE_FORMATS.has(
      row.date_format as UserDateFormat
    )
      ? (
          row.date_format as UserDateFormat
        )
      : DEFAULT_PREFERENCES.dateFormat;

  const timeFormat =
    TIME_FORMATS.has(
      row.time_format as UserTimeFormat
    )
      ? (
          row.time_format as UserTimeFormat
        )
      : DEFAULT_PREFERENCES.timeFormat;

  const firstDayOfWeek =
    Number.isInteger(
      row.first_day_of_week
    ) &&
    Number(
      row.first_day_of_week
    ) >= 0 &&
    Number(
      row.first_day_of_week
    ) <= 6
      ? Number(
          row.first_day_of_week
        )
      : DEFAULT_PREFERENCES.firstDayOfWeek;

  return {
    theme,
    locale:
      row.locale ||
      DEFAULT_PREFERENCES.locale,
    timezone:
      row.timezone ||
      DEFAULT_PREFERENCES.timezone,
    dateFormat,
    timeFormat,
    firstDayOfWeek,
  };
}

/* ============================================================
   ACCOUNT READ
   ============================================================ */

export async function getUserAccount(
  userId: string
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
          avatar_url,
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
    result.rows[0] as UserRow
  );
}

/* ============================================================
   PROFILE UPDATE

   Intentionally does NOT update:
   - email
   - password
   - avatar
   - status
   - security fields

   Those use their own protected workflows.
   ============================================================ */

export async function updateUserProfile(
  userId: string,
  input: UpdateUserProfileInput
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
          avatar_url,
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
    result.rows[0] as UserRow
  );
}

/* ============================================================
   PREFERENCES
   ============================================================ */

async function ensureUserPreferences(
  userId: string
): Promise<void> {
  await queryControl(
    `
      INSERT INTO user_preferences (
        user_id
      )

      SELECT
        id

      FROM users

      WHERE id = $1
        AND deleted_at IS NULL

      ON CONFLICT (
        user_id
      )
      DO NOTHING
    `,
    [
      userId,
    ]
  );
}

export async function getUserPreferences(
  userId: string
): Promise<UserPreferences> {
  const id =
    assertUserId(
      userId
    );

  /*
   * Confirm the user exists first so a nonexistent/deleted account
   * cannot silently receive fallback preferences.
   */
  await getUserAccount(
    id
  );

  await ensureUserPreferences(
    id
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

        FROM user_preferences

        WHERE user_id = $1

        LIMIT 1
      `,
      [
        id,
      ]
    );

  return mapPreferencesRow(
    result.rows[0] as
      | UserPreferencesRow
      | undefined
  );
}

export async function updateUserPreferences(
  userId: string,
  input: UpdateUserPreferencesInput
): Promise<UserPreferences> {
  const id =
    assertUserId(
      userId
    );

  const patch =
    validatePreferencePatch(
      input
    );

  const current =
    await getUserPreferences(
      id
    );

  const next:
    UserPreferences = {
      theme:
        patch.theme ??
        current.theme,

      locale:
        patch.locale ??
        current.locale,

      timezone:
        patch.timezone ??
        current.timezone,

      dateFormat:
        patch.dateFormat ??
        current.dateFormat,

      timeFormat:
        patch.timeFormat ??
        current.timeFormat,

      firstDayOfWeek:
        patch.firstDayOfWeek ??
        current.firstDayOfWeek,
    };

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

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          NOW(),
          NOW()
        )

        ON CONFLICT (
          user_id
        )

        DO UPDATE SET
          theme =
            EXCLUDED.theme,
          locale =
            EXCLUDED.locale,
          timezone =
            EXCLUDED.timezone,
          date_format =
            EXCLUDED.date_format,
          time_format =
            EXCLUDED.time_format,
          first_day_of_week =
            EXCLUDED.first_day_of_week,
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
        next.theme,
        next.locale,
        next.timezone,
        next.dateFormat,
        next.timeFormat,
        next.firstDayOfWeek,
      ]
    );

  return mapPreferencesRow(
    result.rows[0] as UserPreferencesRow
  );
}

/* ============================================================
   COMBINED ACCOUNT CONTEXT
   ============================================================ */

export async function getUserAccountWithPreferences(
  userId: string
): Promise<UserAccountWithPreferences> {
  const account =
    await getUserAccount(
      userId
    );

  const preferences =
    await getUserPreferences(
      userId
    );

  return {
    account,
    preferences,
  };
}
