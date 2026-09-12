/* ============================================================
   SaMi USER FORMATTING

   Shared formatting rules for a person's global SaMi account.

   IMPORTANT ARCHITECTURE:

   Database timestamps
        ↓
   remain UTC / absolute timestamps
        ↓
   user's personal preferences
        ↓
   displayed in their preferred timezone / format

   This file does NOT change stored database values.

   It only controls how values are presented to a user.

   Workspace/business settings remain separate.
   ============================================================ */

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

export type UserDisplayPreferences = {
  theme: UserTheme;
  locale: string;
  timezone: string;
  dateFormat: UserDateFormat;
  timeFormat: UserTimeFormat;
  firstDayOfWeek: number;
};

export type DateInput =
  | Date
  | string
  | number;

export type WeekdayStyle =
  | 'long'
  | 'short'
  | 'narrow';

/* ============================================================
   DEFAULTS

   These match the Category 02 user_preferences defaults.

   UTC remains the safest platform default because SaMi should
   never silently assume where a user lives.
   ============================================================ */

export const DEFAULT_USER_DISPLAY_PREFERENCES:
  Readonly<UserDisplayPreferences> = {
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
   VALID VALUES
   ============================================================ */

const DATE_FORMATS:
  readonly UserDateFormat[] = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
];

const TIME_FORMATS:
  readonly UserTimeFormat[] = [
  '12h',
  '24h',
];

const THEMES:
  readonly UserTheme[] = [
  'system',
  'light',
  'dark',
];

/* ============================================================
   INTERNAL HELPERS
   ============================================================ */

function isObject(
  value: unknown
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      'object' &&
    value !== null &&
    !Array.isArray(
      value
    )
  );
}

function isUserTheme(
  value: unknown
): value is UserTheme {
  return THEMES.includes(
    value as UserTheme
  );
}

function isUserDateFormat(
  value: unknown
): value is UserDateFormat {
  return DATE_FORMATS.includes(
    value as UserDateFormat
  );
}

function isUserTimeFormat(
  value: unknown
): value is UserTimeFormat {
  return TIME_FORMATS.includes(
    value as UserTimeFormat
  );
}

function normalizeLocale(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return DEFAULT_USER_DISPLAY_PREFERENCES.locale;
  }

  const locale =
    value
      .trim()
      .replace(
        /_/g,
        '-'
      );

  if (!locale) {
    return DEFAULT_USER_DISPLAY_PREFERENCES.locale;
  }

  try {
    const canonical =
      Intl.getCanonicalLocales(
        locale
      );

    return (
      canonical[0] ||
      DEFAULT_USER_DISPLAY_PREFERENCES.locale
    );
  } catch {
    return DEFAULT_USER_DISPLAY_PREFERENCES.locale;
  }
}

function isValidTimezone(
  timezone: string
): boolean {
  try {
    new Intl.DateTimeFormat(
      'en',
      {
        timeZone:
          timezone,
      }
    ).format(
      new Date()
    );

    return true;
  } catch {
    return false;
  }
}

function normalizeTimezone(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return DEFAULT_USER_DISPLAY_PREFERENCES.timezone;
  }

  const timezone =
    value.trim();

  if (
    !timezone ||
    !isValidTimezone(
      timezone
    )
  ) {
    return DEFAULT_USER_DISPLAY_PREFERENCES.timezone;
  }

  return timezone;
}

function normalizeFirstDayOfWeek(
  value: unknown
): number {
  const number =
    Number(value);

  if (
    !Number.isInteger(
      number
    ) ||
    number < 0 ||
    number > 6
  ) {
    return DEFAULT_USER_DISPLAY_PREFERENCES.firstDayOfWeek;
  }

  return number;
}

/* ============================================================
   NORMALIZE PREFERENCES

   Useful when data comes from:
   - API
   - database
   - cached state
   - older accounts

   Invalid values never break the UI.
   ============================================================ */

export function normalizeUserDisplayPreferences(
  value?: unknown
): UserDisplayPreferences {
  const source =
    isObject(value)
      ? value
      : {};

  return {
    theme:
      isUserTheme(
        source.theme
      )
        ? source.theme
        : DEFAULT_USER_DISPLAY_PREFERENCES.theme,

    locale:
      normalizeLocale(
        source.locale
      ),

    timezone:
      normalizeTimezone(
        source.timezone
      ),

    dateFormat:
      isUserDateFormat(
        source.dateFormat
      )
        ? source.dateFormat
        : DEFAULT_USER_DISPLAY_PREFERENCES.dateFormat,

    timeFormat:
      isUserTimeFormat(
        source.timeFormat
      )
        ? source.timeFormat
        : DEFAULT_USER_DISPLAY_PREFERENCES.timeFormat,

    firstDayOfWeek:
      normalizeFirstDayOfWeek(
        source.firstDayOfWeek
      ),
  };
}

/* ============================================================
   DATE-ONLY VALUES

   Example:

     2026-09-12

   A date-only value is NOT a timestamp.

   It must not shift to another day because of timezone.

   This matters for:
   - invoice due dates
   - birthdays
   - reporting dates
   - leave dates
   - business calendar dates
   ============================================================ */

function isDateOnlyString(
  value: unknown
): value is string {
  return (
    typeof value ===
      'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      value
    )
  );
}

function getDateOnlyParts(
  value: string
): {
  year: string;
  month: string;
  day: string;
} | null {
  if (
    !isDateOnlyString(
      value
    )
  ) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] =
    value.split(
      '-'
    );

  if (
    !year ||
    !month ||
    !day
  ) {
    return null;
  }

  const numericYear =
    Number(year);

  const numericMonth =
    Number(month);

  const numericDay =
    Number(day);

  if (
    !Number.isInteger(
      numericYear
    ) ||
    !Number.isInteger(
      numericMonth
    ) ||
    !Number.isInteger(
      numericDay
    ) ||
    numericMonth < 1 ||
    numericMonth > 12 ||
    numericDay < 1 ||
    numericDay > 31
  ) {
    return null;
  }

  const test =
    new Date(
      Date.UTC(
        numericYear,
        numericMonth - 1,
        numericDay
      )
    );

  if (
    test.getUTCFullYear() !==
      numericYear ||
    test.getUTCMonth() + 1 !==
      numericMonth ||
    test.getUTCDate() !==
      numericDay
  ) {
    return null;
  }

  return {
    year,
    month,
    day,
  };
}

/* ============================================================
   TIMESTAMP PARSING
   ============================================================ */

function toDate(
  value: DateInput
): Date | null {
  if (
    value instanceof Date
  ) {
    if (
      Number.isNaN(
        value.getTime()
      )
    ) {
      return null;
    }

    return value;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}

/* ============================================================
   DATE PARTS IN USER TIMEZONE
   ============================================================ */

function getZonedDateParts(
  date: Date,
  locale: string,
  timezone: string
): {
  year: string;
  month: string;
  day: string;
} | null {
  try {
    const parts =
      new Intl.DateTimeFormat(
        locale,
        {
          timeZone:
            timezone,

          year:
            'numeric',

          month:
            '2-digit',

          day:
            '2-digit',

          numberingSystem:
            'latn',
        }
      ).formatToParts(
        date
      );

    const values =
      new Map<
        string,
        string
      >();

    for (
      const part of parts
    ) {
      if (
        part.type !==
        'literal'
      ) {
        values.set(
          part.type,
          part.value
        );
      }
    }

    const year =
      values.get(
        'year'
      );

    const month =
      values.get(
        'month'
      );

    const day =
      values.get(
        'day'
      );

    if (
      !year ||
      !month ||
      !day
    ) {
      return null;
    }

    return {
      year,
      month,
      day,
    };
  } catch {
    return null;
  }
}

/* ============================================================
   DATE COMPOSER
   ============================================================ */

function composeDate(
  parts: {
    year: string;
    month: string;
    day: string;
  },
  format: UserDateFormat
): string {
  switch (
    format
  ) {
    case 'MM/DD/YYYY':
      return `${parts.month}/${parts.day}/${parts.year}`;

    case 'YYYY-MM-DD':
      return `${parts.year}-${parts.month}-${parts.day}`;

    case 'DD/MM/YYYY':
    default:
      return `${parts.day}/${parts.month}/${parts.year}`;
  }
}

/* ============================================================
   FORMAT DATE

   Timestamp:
   - converted into user's timezone

   Date-only:
   - NOT timezone shifted
   ============================================================ */

export function formatUserDate(
  value:
    | DateInput
    | null
    | undefined,
  preferences:
    Partial<UserDisplayPreferences> = {}
): string {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  ) {
    return '—';
  }

  const prefs =
    normalizeUserDisplayPreferences(
      {
        ...DEFAULT_USER_DISPLAY_PREFERENCES,
        ...preferences,
      }
    );

  if (
    isDateOnlyString(
      value
    )
  ) {
    const parts =
      getDateOnlyParts(
        value
      );

    if (!parts) {
      return '—';
    }

    return composeDate(
      parts,
      prefs.dateFormat
    );
  }

  const date =
    toDate(
      value
    );

  if (!date) {
    return '—';
  }

  const parts =
    getZonedDateParts(
      date,
      prefs.locale,
      prefs.timezone
    );

  if (!parts) {
    return '—';
  }

  return composeDate(
    parts,
    prefs.dateFormat
  );
}

/* ============================================================
   FORMAT TIME

   Time is always calculated from a timestamp using the user's
   timezone.

   Example stored timestamp:

     2026-09-12T18:45:00Z

   Africa/Nairobi + 24h:
     21:45

   Africa/Nairobi + 12h:
     9:45 PM
   ============================================================ */

export function formatUserTime(
  value:
    | DateInput
    | null
    | undefined,
  preferences:
    Partial<UserDisplayPreferences> = {},
  options?: {
    includeSeconds?: boolean;
  }
): string {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  ) {
    return '—';
  }

  if (
    isDateOnlyString(
      value
    )
  ) {
    return '—';
  }

  const date =
    toDate(
      value
    );

  if (!date) {
    return '—';
  }

  const prefs =
    normalizeUserDisplayPreferences(
      {
        ...DEFAULT_USER_DISPLAY_PREFERENCES,
        ...preferences,
      }
    );

  try {
    return new Intl.DateTimeFormat(
      prefs.locale,
      {
        timeZone:
          prefs.timezone,

        hour:
          '2-digit',

        minute:
          '2-digit',

        second:
          options?.includeSeconds
            ? '2-digit'
            : undefined,

        hour12:
          prefs.timeFormat ===
          '12h',
      }
    ).format(
      date
    );
  } catch {
    return '—';
  }
}

/* ============================================================
   FORMAT DATE + TIME
   ============================================================ */

export function formatUserDateTime(
  value:
    | DateInput
    | null
    | undefined,
  preferences:
    Partial<UserDisplayPreferences> = {},
  options?: {
    includeSeconds?: boolean;
  }
): string {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  ) {
    return '—';
  }

  if (
    isDateOnlyString(
      value
    )
  ) {
    return formatUserDate(
      value,
      preferences
    );
  }

  const date =
    toDate(
      value
    );

  if (!date) {
    return '—';
  }

  const formattedDate =
    formatUserDate(
      date,
      preferences
    );

  const formattedTime =
    formatUserTime(
      date,
      preferences,
      options
    );

  if (
    formattedDate ===
      '—' ||
    formattedTime ===
      '—'
  ) {
    return '—';
  }

  return `${formattedDate} ${formattedTime}`;
}

/* ============================================================
   FORMAT NUMBER

   Locale belongs to the user.

   Example:
   - en-KE
   - en-US
   - de-DE

   The underlying numeric value never changes.
   ============================================================ */

export function formatUserNumber(
  value:
    | number
    | null
    | undefined,
  preferences:
    Partial<UserDisplayPreferences> = {},
  options:
    Intl.NumberFormatOptions = {}
): string {
  if (
    value ===
      null ||
    value ===
      undefined ||
    !Number.isFinite(
      value
    )
  ) {
    return '—';
  }

  const prefs =
    normalizeUserDisplayPreferences(
      {
        ...DEFAULT_USER_DISPLAY_PREFERENCES,
        ...preferences,
      }
    );

  try {
    return new Intl.NumberFormat(
      prefs.locale,
      options
    ).format(
      value
    );
  } catch {
    return String(
      value
    );
  }
}

/* ============================================================
   FORMAT CURRENCY

   Currency is NOT chosen from personal preferences.

   The caller must provide it.

   Why?

   Personal preference:
      how the user sees SaMi

   Business/app setting:
      which currency a business transaction uses

   Example:

     formatUserCurrency(
       125000,
       'KES',
       preferences
     )
   ============================================================ */

export function formatUserCurrency(
  value:
    | number
    | null
    | undefined,
  currency: string,
  preferences:
    Partial<UserDisplayPreferences> = {},
  options:
    Omit<
      Intl.NumberFormatOptions,
      'style' | 'currency'
    > = {}
): string {
  if (
    value ===
      null ||
    value ===
      undefined ||
    !Number.isFinite(
      value
    )
  ) {
    return '—';
  }

  const normalizedCurrency =
    currency
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      normalizedCurrency
    )
  ) {
    return '—';
  }

  const prefs =
    normalizeUserDisplayPreferences(
      {
        ...DEFAULT_USER_DISPLAY_PREFERENCES,
        ...preferences,
      }
    );

  try {
    return new Intl.NumberFormat(
      prefs.locale,
      {
        style:
          'currency',

        currency:
          normalizedCurrency,

        ...options,
      }
    ).format(
      value
    );
  } catch {
    return '—';
  }
}

/* ============================================================
   WEEKDAY LABELS

   firstDayOfWeek:

     0 = Sunday
     1 = Monday
     ...
     6 = Saturday

   This will later drive:
   - calendars
   - scheduling
   - timesheets
   - weekly reports
   ============================================================ */

export function getUserWeekdayLabels(
  preferences:
    Partial<UserDisplayPreferences> = {},
  style:
    WeekdayStyle = 'short'
): string[] {
  const prefs =
    normalizeUserDisplayPreferences(
      {
        ...DEFAULT_USER_DISPLAY_PREFERENCES,
        ...preferences,
      }
    );

  const labels:
    string[] = [];

  /*
   * 2024-01-07 was a Sunday.
   *
   * UTC is deliberately used here because weekday labels are
   * names/order, not business timestamps.
   */

  const sunday =
    Date.UTC(
      2024,
      0,
      7
    );

  try {
    const formatter =
      new Intl.DateTimeFormat(
        prefs.locale,
        {
          weekday:
            style,

          timeZone:
            'UTC',
        }
      );

    for (
      let offset = 0;
      offset < 7;
      offset += 1
    ) {
      const weekday =
        (
          prefs.firstDayOfWeek +
          offset
        ) %
        7;

      const date =
        new Date(
          sunday +
            weekday *
              24 *
              60 *
              60 *
              1000
        );

      labels.push(
        formatter.format(
          date
        )
      );
    }

    return labels;
  } catch {
    return [
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ];
  }
}

/* ============================================================
   THEME RESOLUTION

   Pure helper.

   UI components can supply the browser's system preference.

   Example:

     resolveUserTheme(
       preferences.theme,
       systemPrefersDark
     )
   ============================================================ */

export function resolveUserTheme(
  theme: UserTheme,
  systemPrefersDark: boolean
): 'light' | 'dark' {
  if (
    theme ===
    'dark'
  ) {
    return 'dark';
  }

  if (
    theme ===
    'light'
  ) {
    return 'light';
  }

  return systemPrefersDark
    ? 'dark'
    : 'light';
}

/* ============================================================
   TIMEZONE LABEL

   Used when we want the UI to make the active timezone obvious.

   Example:

     Africa/Nairobi (GMT+3)
   ============================================================ */

export function getUserTimezoneLabel(
  preferences:
    Partial<UserDisplayPreferences> = {},
  at:
    DateInput = new Date()
): string {
  const prefs =
    normalizeUserDisplayPreferences(
      {
        ...DEFAULT_USER_DISPLAY_PREFERENCES,
        ...preferences,
      }
    );

  const date =
    toDate(
      at
    );

  if (!date) {
    return prefs.timezone;
  }

  try {
    const parts =
      new Intl.DateTimeFormat(
        prefs.locale,
        {
          timeZone:
            prefs.timezone,

          timeZoneName:
            'shortOffset',
        }
      ).formatToParts(
        date
      );

    const offset =
      parts.find(
        (
          part
        ) =>
          part.type ===
          'timeZoneName'
      )?.value;

    if (!offset) {
      return prefs.timezone;
    }

    return `${prefs.timezone} (${offset})`;
  } catch {
    return prefs.timezone;
  }
}

/* ============================================================
   PREFERENCE PREVIEW

   Used by My Account settings so changing preferences has an
   immediately visible meaning before the user presses Save.

   It is also useful for testing.

   Example result:

   {
     date: "12/09/2026",
     time: "21:45",
     dateTime: "12/09/2026 21:45",
     timezone: "Africa/Nairobi (GMT+3)"
   }
   ============================================================ */

export function getUserFormattingPreview(
  preferences:
    Partial<UserDisplayPreferences> = {},
  at:
    DateInput = new Date()
): {
  date: string;
  time: string;
  dateTime: string;
  timezone: string;
  weekdays: string[];
} {
  const prefs =
    normalizeUserDisplayPreferences(
      {
        ...DEFAULT_USER_DISPLAY_PREFERENCES,
        ...preferences,
      }
    );

  return {
    date:
      formatUserDate(
        at,
        prefs
      ),

    time:
      formatUserTime(
        at,
        prefs
      ),

    dateTime:
      formatUserDateTime(
        at,
        prefs
      ),

    timezone:
      getUserTimezoneLabel(
        prefs,
        at
      ),

    weekdays:
      getUserWeekdayLabels(
        prefs
      ),
  };
}