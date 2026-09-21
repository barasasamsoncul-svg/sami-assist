import 'server-only';

import crypto from 'node:crypto';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

export type SamiAiScope = {
  tenantId: string;
  userId: string;
  companyId: string;
};

export type SamiAiPreferences = {
  memoryEnabled: boolean;
  useAccountPreferences: boolean;
  responseStyle:
    | 'balanced'
    | 'concise'
    | 'detailed';
};

export type SamiAiMemoryItem = {
  id: string;
  key: string | null;
  type: string;
  content: string;
  importance: number;
  createdByAi: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastUsedAt: string | null;
};

const MAX_MEMORY_CONTENT =
  2_000;

const MAX_MEMORY_KEY =
  120;

const MAX_MEMORY_TYPE =
  60;

const MAX_MEMORY_ITEMS =
  200;

const SAFE_RESPONSE_STYLES =
  new Set([
    'balanced',
    'concise',
    'detailed',
  ]);

const SENSITIVE_PATTERNS = [
  /\bpassword\b/i,
  /\bpasscode\b/i,
  /\bapi[ _-]?key\b/i,
  /\bsecret\b/i,
  /\baccess[ _-]?token\b/i,
  /\brefresh[ _-]?token\b/i,
  /\bprivate[ _-]?key\b/i,
  /\bcredit[ _-]?card\b/i,
  /\bcvv\b/i,
  /\bsecurity[ _-]?code\b/i,
  /\bone[ _-]?time[ _-]?password\b/i,
];

function toIso(
  value:
    Date | string | null | undefined,
) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}

function normalizeText(
  value: unknown,
  maxLength: number,
) {
  return typeof value ===
    'string'
    ? value
        .replace(
          /[\u0000-\u001f\u007f]/g,
          ' ',
        )
        .replace(
          /\s+/g,
          ' ',
        )
        .trim()
        .slice(
          0,
          maxLength,
        )
    : '';
}

function normalizeKey(
  value: unknown,
  fallbackFromContent?: string,
) {
  const provided =
    normalizeText(
      value,
      MAX_MEMORY_KEY,
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9._-]+/g,
        '-',
      )
      .replace(
        /^-+|-+$/g,
        '',
      );

  if (provided) {
    return provided;
  }

  if (!fallbackFromContent) {
    return null;
  }

  return (
    'memory-' +
    crypto
      .createHash(
        'sha256',
      )
      .update(
        fallbackFromContent,
      )
      .digest(
        'hex',
      )
      .slice(
        0,
        24,
      )
  );
}

function normalizeImportance(
  value: unknown,
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number,
    )
  ) {
    return 5;
  }

  return Math.min(
    10,
    Math.max(
      1,
      Math.round(
        number,
      ),
    ),
  );
}

function assertSafeMemory(
  content: string,
) {
  if (
    SENSITIVE_PATTERNS.some(
      pattern =>
        pattern.test(
          content,
        ),
    )
  ) {
    throw new Error(
      'SaMi AI will not save credentials, secrets or authentication material as memory.',
    );
  }

  if (
    /\b\d{13,19}\b/.test(
      content,
    )
  ) {
    throw new Error(
      'SaMi AI will not save payment-card-like numbers as memory.',
    );
  }
}

function mapMemory(
  row:
    Record<
      string,
      unknown
    >,
): SamiAiMemoryItem {
  return {
    id:
      String(
        row.id ||
        '',
      ),
    key:
      typeof row
        .memory_key ===
      'string'
        ? row.memory_key
        : null,
    type:
      typeof row
        .memory_type ===
      'string'
        ? row.memory_type
        : 'context',
    content:
      typeof row
        .content ===
      'string'
        ? row.content
        : '',
    importance:
      Number(
        row.importance ||
        5,
      ),
    createdByAi:
      row.created_by_ai ===
      true,
    createdAt:
      toIso(
        row.created_at as
          | Date
          | string
          | null,
      ),
    updatedAt:
      toIso(
        row.updated_at as
          | Date
          | string
          | null,
      ),
    lastUsedAt:
      toIso(
        row.last_used_at as
          | Date
          | string
          | null,
      ),
  };
}

export async function getSamiAiPreferences(
  scope: SamiAiScope,
): Promise<SamiAiPreferences> {
  const pool =
    await getTenantPoolByTenantId(
      scope.tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          memory_enabled,
          use_account_preferences,
          response_style
        FROM ai_preferences
        WHERE user_id = $1
          AND company_id = $2
        LIMIT 1
      `,
      [
        scope.userId,
        scope.companyId,
      ],
    );

  const row =
    result.rows[0];

  const style =
    typeof row
      ?.response_style ===
    'string' &&
    SAFE_RESPONSE_STYLES.has(
      row.response_style,
    )
      ? row.response_style
      : 'balanced';

  return {
    memoryEnabled:
      row?.memory_enabled !==
      false,
    useAccountPreferences:
      row
        ?.use_account_preferences !==
      false,
    responseStyle:
      style as
        SamiAiPreferences[
          'responseStyle'
        ],
  };
}

export async function updateSamiAiPreferences(
  scope: SamiAiScope,
  input: {
    memoryEnabled?: unknown;
    useAccountPreferences?: unknown;
    responseStyle?: unknown;
  },
): Promise<SamiAiPreferences> {
  const current =
    await getSamiAiPreferences(
      scope,
    );

  const memoryEnabled =
    typeof input
      .memoryEnabled ===
    'boolean'
      ? input.memoryEnabled
      : current.memoryEnabled;

  const useAccountPreferences =
    typeof input
      .useAccountPreferences ===
    'boolean'
      ? input
          .useAccountPreferences
      : current
          .useAccountPreferences;

  const responseStyleRaw =
    typeof input
      .responseStyle ===
    'string'
      ? input
          .responseStyle
          .trim()
          .toLowerCase()
      : current
          .responseStyle;

  if (
    !SAFE_RESPONSE_STYLES.has(
      responseStyleRaw,
    )
  ) {
    throw new Error(
      'Choose a valid SaMi AI response style.',
    );
  }

  const pool =
    await getTenantPoolByTenantId(
      scope.tenantId,
    );

  await pool.query(
    `
      INSERT INTO ai_preferences (
        user_id,
        company_id,
        memory_enabled,
        use_account_preferences,
        response_style,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        NOW(),
        NOW()
      )
      ON CONFLICT (
        user_id,
        company_id
      )
      DO UPDATE SET
        memory_enabled =
          EXCLUDED.memory_enabled,
        use_account_preferences =
          EXCLUDED.use_account_preferences,
        response_style =
          EXCLUDED.response_style,
        updated_at =
          NOW()
    `,
    [
      scope.userId,
      scope.companyId,
      memoryEnabled,
      useAccountPreferences,
      responseStyleRaw,
    ],
  );

  return {
    memoryEnabled,
    useAccountPreferences,
    responseStyle:
      responseStyleRaw as
        SamiAiPreferences[
          'responseStyle'
        ],
  };
}

export async function listSamiAiMemories(
  scope: SamiAiScope,
  limit = 100,
): Promise<SamiAiMemoryItem[]> {
  const safeLimit =
    Math.min(
      Math.max(
        Number.isFinite(
          Number(
            limit,
          ),
        )
          ? Math.floor(
              Number(
                limit,
              ),
            )
          : 100,
        1,
      ),
      MAX_MEMORY_ITEMS,
    );

  const pool =
    await getTenantPoolByTenantId(
      scope.tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          id,
          memory_key,
          memory_type,
          content,
          importance,
          created_by_ai,
          created_at,
          updated_at,
          last_used_at
        FROM ai_memory
        WHERE scope = 'personal'
          AND user_id = $1
          AND company_id = $2
          AND status = 'active'
          AND archived_at IS NULL
          AND (
            expires_at IS NULL
            OR expires_at > NOW()
          )
        ORDER BY
          importance DESC,
          COALESCE(
            last_used_at,
            updated_at,
            created_at
          ) DESC,
          id DESC
        LIMIT $3
      `,
      [
        scope.userId,
        scope.companyId,
        safeLimit,
      ],
    );

  return result.rows.map(
    row =>
      mapMemory(
        row,
      ),
  );
}

export async function loadSamiAiMemoryContext(
  scope: SamiAiScope,
  limit = 24,
): Promise<SamiAiMemoryItem[]> {
  const preferences =
    await getSamiAiPreferences(
      scope,
    );

  if (
    !preferences
      .memoryEnabled
  ) {
    return [];
  }

  const memories =
    await listSamiAiMemories(
      scope,
      Math.min(
        Math.max(
          limit,
          1,
        ),
        40,
      ),
    );

  if (
    memories.length >
    0
  ) {
    const pool =
      await getTenantPoolByTenantId(
        scope.tenantId,
      );

    await pool.query(
      `
        UPDATE ai_memory
        SET last_used_at = NOW()
        WHERE user_id = $1
          AND company_id = $2
          AND id = ANY($3::uuid[])
      `,
      [
        scope.userId,
        scope.companyId,
        memories.map(
          item =>
            item.id,
        ),
      ],
    );
  }

  return memories;
}

export async function rememberSamiAiPersonalContext(
  scope: SamiAiScope,
  input: {
    key?: unknown;
    type?: unknown;
    content?: unknown;
    importance?: unknown;
  },
): Promise<SamiAiMemoryItem> {
  const preferences =
    await getSamiAiPreferences(
      scope,
    );

  if (
    !preferences
      .memoryEnabled
  ) {
    throw new Error(
      'SaMi AI memory is disabled for this user in the current company.',
    );
  }

  const content =
    normalizeText(
      input.content,
      MAX_MEMORY_CONTENT,
    );

  if (!content) {
    throw new Error(
      'Memory content is required.',
    );
  }

  assertSafeMemory(
    content,
  );

  const memoryType =
    normalizeText(
      input.type,
      MAX_MEMORY_TYPE,
    ) ||
    'preference';

  const memoryKey =
    normalizeKey(
      input.key,
      content,
    );

  const importance =
    normalizeImportance(
      input.importance,
    );

  const pool =
    await getTenantPoolByTenantId(
      scope.tenantId,
    );

  const result =
    await pool.query(
      `
        INSERT INTO ai_memory (
          user_id,
          company_id,
          scope,
          memory_key,
          memory_type,
          content,
          source_type,
          source_module,
          status,
          sensitivity,
          importance,
          created_by_ai,
          metadata,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          'personal',
          $3,
          $4,
          $5,
          'conversation',
          'core.ai',
          'active',
          'normal',
          $6,
          TRUE,
          '{}'::jsonb,
          NOW(),
          NOW()
        )
        ON CONFLICT (
          user_id,
          company_id,
          memory_key
        )
        WHERE scope = 'personal'
          AND memory_key IS NOT NULL
          AND archived_at IS NULL
        DO UPDATE SET
          memory_type =
            EXCLUDED.memory_type,
          content =
            EXCLUDED.content,
          importance =
            EXCLUDED.importance,
          created_by_ai =
            TRUE,
          status =
            'active',
          updated_at =
            NOW()
        RETURNING
          id,
          memory_key,
          memory_type,
          content,
          importance,
          created_by_ai,
          created_at,
          updated_at,
          last_used_at
      `,
      [
        scope.userId,
        scope.companyId,
        memoryKey,
        memoryType,
        content,
        importance,
      ],
    );

  return mapMemory(
    result.rows[0],
  );
}

export async function forgetSamiAiMemory(
  scope: SamiAiScope,
  memoryId: string,
) {
  const pool =
    await getTenantPoolByTenantId(
      scope.tenantId,
    );

  const result =
    await pool.query(
      `
        UPDATE ai_memory
        SET
          status = 'archived',
          archived_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
          AND scope = 'personal'
          AND user_id = $2
          AND company_id = $3
          AND archived_at IS NULL
        RETURNING id
      `,
      [
        memoryId,
        scope.userId,
        scope.companyId,
      ],
    );

  return (
    result.rows.length >
    0
  );
}

export async function clearSamiAiMemories(
  scope: SamiAiScope,
) {
  const pool =
    await getTenantPoolByTenantId(
      scope.tenantId,
    );

  const result =
    await pool.query(
      `
        UPDATE ai_memory
        SET
          status = 'archived',
          archived_at = NOW(),
          updated_at = NOW()
        WHERE scope = 'personal'
          AND user_id = $1
          AND company_id = $2
          AND archived_at IS NULL
        RETURNING id
      `,
      [
        scope.userId,
        scope.companyId,
      ],
    );

  return {
    cleared:
      result.rows.length,
  };
}
