import 'server-only';

import {
  queryControl,
  withControlTransaction,
} from '@/lib/db/control';


export type PlatformDateFormat =
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'YYYY-MM-DD';

export type PlatformTimeFormat =
  | '12h'
  | '24h';

export type PlatformSettings = {
  defaults: {
    locale: string;
    timezone: string;
    dateFormat: PlatformDateFormat;
    timeFormat: PlatformTimeFormat;
    firstDayOfWeek: number;
  };

  registration: {
    publicRegistrationEnabled: boolean;
    googleRegistrationEnabled: boolean;
    selfServiceWorkspaceCreationEnabled: boolean;
  };

  security: {
    normalSessionHours: number;
    rememberMeDays: number;
    allowMultipleActiveSessions: boolean;
  };

  features: {
    samiAiEnabled: boolean;
    automationEnabled: boolean;
    developerApiEnabled: boolean;
  };

  operations: {
    maintenanceMode: boolean;
    maintenanceMessage: string;
  };
};

export type PlatformSettingsSnapshot = {
  settings: PlatformSettings;
  revision: number;
  ready: boolean;
  updatedAt: string | null;
  updatedByAdminId: string | null;
};

export type PlatformSettingsHistoryItem = {
  revision: number;
  changedKeys: string[];
  changedByAdminId: string | null;
  createdAt: string | null;
};

export const DEFAULT_PLATFORM_SETTINGS:
  Readonly<PlatformSettings> = {
    defaults: {
      locale:
        'en-KE',
      timezone:
        'Africa/Nairobi',
      dateFormat:
        'DD/MM/YYYY',
      timeFormat:
        '24h',
      firstDayOfWeek:
        1,
    },

    registration: {
      publicRegistrationEnabled:
        true,
      googleRegistrationEnabled:
        true,
      selfServiceWorkspaceCreationEnabled:
        true,
    },

    security: {
      normalSessionHours:
        24,
      rememberMeDays:
        30,
      allowMultipleActiveSessions:
        false,
    },

    features: {
      samiAiEnabled:
        true,
      automationEnabled:
        true,
      developerApiEnabled:
        true,
    },

    operations: {
      maintenanceMode:
        false,
      maintenanceMessage:
        'SaMi is temporarily unavailable while scheduled maintenance is in progress.',
    },
  };


const DATE_FORMATS =
  new Set<PlatformDateFormat>([
    'DD/MM/YYYY',
    'MM/DD/YYYY',
    'YYYY-MM-DD',
  ]);

const TIME_FORMATS =
  new Set<PlatformTimeFormat>([
    '12h',
    '24h',
  ]);

let runtimeCache:
  {
    settings:
      PlatformSettings;
    expiresAt:
      number;
  } |
  null =
  null;


export class PlatformSettingsValidationError
  extends Error {
  constructor(
    public readonly field:
      string,
    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'PlatformSettingsValidationError';
  }
}


export class PlatformSettingsConflictError
  extends Error {
  constructor(
    public readonly current:
      PlatformSettingsSnapshot,
  ) {
    super(
      'Platform settings changed before this update was saved.',
    );

    this.name =
      'PlatformSettingsConflictError';
  }
}


function cloneDefaults():
  PlatformSettings {
  return JSON.parse(
    JSON.stringify(
      DEFAULT_PLATFORM_SETTINGS,
    ),
  ) as
    PlatformSettings;
}


function plainObject(
  value:
    unknown,
):
  Record<string, unknown> {
  return (
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
  )
    ? value as
        Record<string, unknown>
    : {};
}


function bool(
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


function integer(
  value:
    unknown,
  fallback:
    number,
) {
  return Number.isInteger(
    value,
  )
    ? Number(
        value,
      )
    : fallback;
}


function text(
  value:
    unknown,
  fallback:
    string,
) {
  return typeof value ===
    'string'
    ? value
    : fallback;
}


function normalizeStoredSettings(
  value:
    unknown,
):
  PlatformSettings {
  const defaults =
    cloneDefaults();

  const root =
    plainObject(
      value,
    );

  const defaultInput =
    plainObject(
      root.defaults,
    );

  const registrationInput =
    plainObject(
      root.registration,
    );

  const securityInput =
    plainObject(
      root.security,
    );

  const featuresInput =
    plainObject(
      root.features,
    );

  const operationsInput =
    plainObject(
      root.operations,
    );

  return {
    defaults: {
      locale:
        text(
          defaultInput.locale,
          defaults.defaults.locale,
        ),
      timezone:
        text(
          defaultInput.timezone,
          defaults.defaults.timezone,
        ),
      dateFormat:
        DATE_FORMATS.has(
          defaultInput.dateFormat as
            PlatformDateFormat,
        )
          ? defaultInput.dateFormat as
              PlatformDateFormat
          : defaults.defaults.dateFormat,
      timeFormat:
        TIME_FORMATS.has(
          defaultInput.timeFormat as
            PlatformTimeFormat,
        )
          ? defaultInput.timeFormat as
              PlatformTimeFormat
          : defaults.defaults.timeFormat,
      firstDayOfWeek:
        integer(
          defaultInput.firstDayOfWeek,
          defaults.defaults.firstDayOfWeek,
        ),
    },

    registration: {
      publicRegistrationEnabled:
        bool(
          registrationInput.publicRegistrationEnabled,
          defaults.registration.publicRegistrationEnabled,
        ),
      googleRegistrationEnabled:
        bool(
          registrationInput.googleRegistrationEnabled,
          defaults.registration.googleRegistrationEnabled,
        ),
      selfServiceWorkspaceCreationEnabled:
        bool(
          registrationInput.selfServiceWorkspaceCreationEnabled,
          defaults.registration.selfServiceWorkspaceCreationEnabled,
        ),
    },

    security: {
      normalSessionHours:
        integer(
          securityInput.normalSessionHours,
          defaults.security.normalSessionHours,
        ),
      rememberMeDays:
        integer(
          securityInput.rememberMeDays,
          defaults.security.rememberMeDays,
        ),
      allowMultipleActiveSessions:
        bool(
          securityInput.allowMultipleActiveSessions,
          defaults.security.allowMultipleActiveSessions,
        ),
    },

    features: {
      samiAiEnabled:
        bool(
          featuresInput.samiAiEnabled,
          defaults.features.samiAiEnabled,
        ),
      automationEnabled:
        bool(
          featuresInput.automationEnabled,
          defaults.features.automationEnabled,
        ),
      developerApiEnabled:
        bool(
          featuresInput.developerApiEnabled,
          defaults.features.developerApiEnabled,
        ),
    },

    operations: {
      maintenanceMode:
        bool(
          operationsInput.maintenanceMode,
          defaults.operations.maintenanceMode,
        ),
      maintenanceMessage:
        text(
          operationsInput.maintenanceMessage,
          defaults.operations.maintenanceMessage,
        ),
    },
  };
}


function validLocale(
  value:
    string,
) {
  return (
    value.length <=
      20 &&
    /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(
      value,
    )
  );
}


function validTimezone(
  value:
    string,
) {
  if (
    !value ||
    value.length >
      100
  ) {
    return false;
  }

  try {
    new Intl.DateTimeFormat(
      'en',
      {
        timeZone:
          value,
      },
    ).format();

    return true;
  } catch {
    return false;
  }
}


export function validatePlatformSettings(
  input:
    unknown,
):
  PlatformSettings {
  const settings =
    normalizeStoredSettings(
      input,
    );

  settings.defaults.locale =
    settings.defaults.locale
      .trim()
      .replace(
        /_/g,
        '-',
      );

  settings.defaults.timezone =
    settings.defaults.timezone
      .trim();

  settings.operations.maintenanceMessage =
    settings.operations.maintenanceMessage
      .replace(
        /[\u0000-\u001f\u007f]/g,
        ' ',
      )
      .replace(
        /\s+/g,
        ' ',
      )
      .trim();

  if (
    !validLocale(
      settings.defaults.locale,
    )
  ) {
    throw new PlatformSettingsValidationError(
      'defaults.locale',
      'Choose a valid default locale.',
    );
  }

  if (
    !validTimezone(
      settings.defaults.timezone,
    )
  ) {
    throw new PlatformSettingsValidationError(
      'defaults.timezone',
      'Choose a valid default timezone.',
    );
  }

  if (
    !DATE_FORMATS.has(
      settings.defaults.dateFormat,
    )
  ) {
    throw new PlatformSettingsValidationError(
      'defaults.dateFormat',
      'Choose a valid default date format.',
    );
  }

  if (
    !TIME_FORMATS.has(
      settings.defaults.timeFormat,
    )
  ) {
    throw new PlatformSettingsValidationError(
      'defaults.timeFormat',
      'Choose a valid default time format.',
    );
  }

  if (
    settings.defaults.firstDayOfWeek <
      0 ||
    settings.defaults.firstDayOfWeek >
      6
  ) {
    throw new PlatformSettingsValidationError(
      'defaults.firstDayOfWeek',
      'First day of week must be between 0 and 6.',
    );
  }

  if (
    settings.security.normalSessionHours <
      1 ||
    settings.security.normalSessionHours >
      168
  ) {
    throw new PlatformSettingsValidationError(
      'security.normalSessionHours',
      'Normal user sessions must be between 1 and 168 hours.',
    );
  }

  if (
    settings.security.rememberMeDays <
      1 ||
    settings.security.rememberMeDays >
      90
  ) {
    throw new PlatformSettingsValidationError(
      'security.rememberMeDays',
      'Remember-me sessions must be between 1 and 90 days.',
    );
  }

  if (
    !settings.operations.maintenanceMessage ||
    settings.operations.maintenanceMessage.length >
      500
  ) {
    throw new PlatformSettingsValidationError(
      'operations.maintenanceMessage',
      'Maintenance message must contain between 1 and 500 characters.',
    );
  }

  return settings;
}


function toIso(
  value:
    unknown,
) {
  if (
    value instanceof Date
  ) {
    return value.toISOString();
  }

  if (
    typeof value ===
      'string' ||
    typeof value ===
      'number'
  ) {
    const date =
      new Date(
        value,
      );

    return Number.isNaN(
      date.getTime(),
    )
      ? null
      : date.toISOString();
  }

  return null;
}


function databaseCode(
  error:
    unknown,
) {
  if (
    error &&
    typeof error ===
      'object' &&
    'code' in
      error
  ) {
    return String(
      (
        error as {
          code?:
            unknown;
        }
      ).code ||
      '',
    );
  }

  return '';
}


export async function getPlatformSettingsSnapshot():
  Promise<PlatformSettingsSnapshot> {
  try {
    const result =
      await queryControl(
        `
          SELECT
            revision,
            settings,
            updated_by_admin_id,
            updated_at
          FROM platform_settings
          WHERE singleton_key = 1
          LIMIT 1
        `,
      );

    const row =
      result.rows[0];

    if (!row) {
      return {
        settings:
          cloneDefaults(),
        revision:
          1,
        ready:
          false,
        updatedAt:
          null,
        updatedByAdminId:
          null,
      };
    }

    return {
      settings:
        validatePlatformSettings(
          row.settings,
        ),
      revision:
        Math.max(
          1,
          Number(
            row.revision ||
            1,
          ),
        ),
      ready:
        true,
      updatedAt:
        toIso(
          row.updated_at,
        ),
      updatedByAdminId:
        row.updated_by_admin_id
          ? String(
              row.updated_by_admin_id,
            )
          : null,
    };
  } catch (
    error
  ) {
    const code =
      databaseCode(
        error,
      );

    if (
      code === '42P01' ||
      code === '42703'
    ) {
      return {
        settings:
          cloneDefaults(),
        revision:
          1,
        ready:
          false,
        updatedAt:
          null,
        updatedByAdminId:
          null,
      };
    }

    throw error;
  }
}


export async function getRuntimePlatformSettings():
  Promise<PlatformSettings> {
  const now =
    Date.now();

  if (
    runtimeCache &&
    runtimeCache.expiresAt >
      now
  ) {
    return runtimeCache.settings;
  }

  try {
    const snapshot =
      await getPlatformSettingsSnapshot();

    runtimeCache = {
      settings:
        snapshot.settings,
      expiresAt:
        now +
        5_000,
    };

    return snapshot.settings;
  } catch (
    error
  ) {
    console.error(
      '[SaMi Platform Settings] Runtime settings unavailable; safe defaults are active.',
      databaseCode(
        error,
      ) ||
      (
        error instanceof Error
          ? error.message
          : 'unknown_error'
      ),
    );

    return cloneDefaults();
  }
}


function changedKeys(
  before:
    PlatformSettings,
  after:
    PlatformSettings,
) {
  const keys:
    string[] =
    [];

  for (
    const section of [
      'defaults',
      'registration',
      'security',
      'features',
      'operations',
    ] as const
  ) {
    const beforeSection =
      before[
        section
      ] as
        Record<
          string,
          unknown
        >;

    const afterSection =
      after[
        section
      ] as
        Record<
          string,
          unknown
        >;

    for (
      const key of
      Object.keys(
        afterSection,
      )
    ) {
      if (
        JSON.stringify(
          beforeSection[
            key
          ],
        ) !==
        JSON.stringify(
          afterSection[
            key
          ],
        )
      ) {
        keys.push(
          `${section}.${key}`,
        );
      }
    }
  }

  return keys;
}


export async function updatePlatformSettings(
  input: {
    expectedRevision:
      number;
    settings:
      unknown;
    adminId:
      string;
  },
) {
  const next =
    validatePlatformSettings(
      input.settings,
    );

  const updated =
    await withControlTransaction(
      async client => {
        const currentResult =
          await client.query(
            `
              SELECT
                revision,
                settings,
                updated_by_admin_id,
                updated_at
              FROM platform_settings
              WHERE singleton_key = 1
              FOR UPDATE
            `,
          );

        const currentRow =
          currentResult.rows[0];

        const current:
          PlatformSettingsSnapshot =
          currentRow
            ? {
                settings:
                  validatePlatformSettings(
                    currentRow.settings,
                  ),
                revision:
                  Math.max(
                    1,
                    Number(
                      currentRow.revision ||
                      1,
                    ),
                  ),
                ready:
                  true,
                updatedAt:
                  toIso(
                    currentRow.updated_at,
                  ),
                updatedByAdminId:
                  currentRow.updated_by_admin_id
                    ? String(
                        currentRow.updated_by_admin_id,
                      )
                    : null,
              }
            : {
                settings:
                  cloneDefaults(),
                revision:
                  1,
                ready:
                  false,
                updatedAt:
                  null,
                updatedByAdminId:
                  null,
              };

        if (
          !current.ready ||
          current.revision !==
            input.expectedRevision
        ) {
          throw new PlatformSettingsConflictError(
            current,
          );
        }

        const keys =
          changedKeys(
            current.settings,
            next,
          );

        if (
          keys.length ===
            0
        ) {
          return {
            ...current,
            changedKeys:
              [] as string[],
          };
        }

        const result =
          await client.query(
            `
              UPDATE platform_settings
              SET
                revision =
                  revision + 1,
                settings =
                  $1::jsonb,
                updated_by_admin_id =
                  $2,
                updated_at =
                  NOW()
              WHERE singleton_key = 1
                AND revision = $3
              RETURNING
                revision,
                settings,
                updated_by_admin_id,
                updated_at
            `,
            [
              JSON.stringify(
                next,
              ),
              input.adminId,
              input.expectedRevision,
            ],
          );

        const row =
          result.rows[0];

        if (!row) {
          throw new PlatformSettingsConflictError(
            current,
          );
        }

        await client.query(
          `
            INSERT INTO platform_settings_history (
              revision,
              settings,
              changed_keys,
              changed_by_admin_id,
              created_at
            )
            VALUES (
              $1,
              $2::jsonb,
              $3::text[],
              $4,
              NOW()
            )
          `,
          [
            row.revision,
            JSON.stringify(
              next,
            ),
            keys,
            input.adminId,
          ],
        );

        return {
          settings:
            next,
          revision:
            Number(
              row.revision,
            ),
          ready:
            true,
          updatedAt:
            toIso(
              row.updated_at,
            ),
          updatedByAdminId:
            row.updated_by_admin_id
              ? String(
                  row.updated_by_admin_id,
                )
              : null,
          changedKeys:
            keys,
        };
      },
    );

  runtimeCache =
    null;

  return updated;
}

export async function listPlatformSettingsHistory(
  limit =
    20,
):
  Promise<PlatformSettingsHistoryItem[]> {
  try {
    const result =
      await queryControl(
        `
          SELECT
            revision,
            changed_keys,
            changed_by_admin_id,
            created_at
          FROM platform_settings_history
          ORDER BY revision DESC
          LIMIT $1
        `,
        [
          Math.max(
            1,
            Math.min(
              100,
              Math.trunc(
                limit,
              ),
            ),
          ),
        ],
      );

    return result.rows.map(
      row => ({
        revision:
          Number(
            row.revision,
          ),
        changedKeys:
          Array.isArray(
            row.changed_keys,
          )
            ? row.changed_keys
                .filter(
                  (
                    value:
                      unknown,
                  ):
                    value is string =>
                    typeof value ===
                      'string',
                )
            : [],
        changedByAdminId:
          row.changed_by_admin_id
            ? String(
                row.changed_by_admin_id,
              )
            : null,
        createdAt:
          toIso(
            row.created_at,
          ),
      }),
    );
  } catch (
    error
  ) {
    const code =
      databaseCode(
        error,
      );

    if (
      code === '42P01' ||
      code === '42703'
    ) {
      return [];
    }

    throw error;
  }
}
