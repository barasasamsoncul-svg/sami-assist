import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  ENTERPRISE_MODULE_TABLES,
  enterpriseModuleTables,
  isEnterpriseModuleKey,
  type EnterpriseModuleKey,
} from '@/lib/apps/enterprise/catalog';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migrations';


const IDENTIFIER =
  /^[a-z_][a-z0-9_]*$/;


function q(
  value:
    string,
) {
  if (
    !IDENTIFIER.test(
      value,
    )
  ) {
    throw new Error(
      'Unsafe enterprise schema identifier.',
    );
  }

  return (
    '"' +
    value +
    '"'
  );
}


function enterpriseInfrastructureSql() {
  return `
CREATE TABLE IF NOT EXISTS public.sami_enterprise_idempotency (
  company_id UUID NOT NULL
    REFERENCES public.companies(id)
    ON DELETE CASCADE,

  idempotency_key UUID NOT NULL,
  module_key VARCHAR(120) NOT NULL,
  table_key VARCHAR(160) NOT NULL,
  request_hash CHAR(64) NOT NULL,

  record_key TEXT,
  response_json JSONB,

  created_by UUID NOT NULL,

  created_at TIMESTAMPTZ
    NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
    NOT NULL DEFAULT NOW(),

  PRIMARY KEY (
    company_id,
    idempotency_key
  )
);

CREATE INDEX IF NOT EXISTS idx_sami_enterprise_idempotency_created
  ON public.sami_enterprise_idempotency(
    company_id,
    created_at
  );
`;
}


function enterpriseCompletionSql() {
  return `
CREATE TABLE IF NOT EXISTS public.sami_enterprise_record_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL
    REFERENCES public.companies(id)
    ON DELETE CASCADE,
  module_key VARCHAR(120) NOT NULL,
  table_key VARCHAR(160) NOT NULL,
  record_key TEXT NOT NULL,
  note_type VARCHAR(30) NOT NULL DEFAULT 'note',
  body TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (note_type IN ('note', 'comment'))
);

CREATE INDEX IF NOT EXISTS idx_sami_enterprise_notes_record
  ON public.sami_enterprise_record_notes(
    company_id,
    module_key,
    table_key,
    record_key,
    created_at DESC
  )
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.sami_enterprise_record_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL
    REFERENCES public.companies(id)
    ON DELETE CASCADE,
  module_key VARCHAR(120) NOT NULL,
  table_key VARCHAR(160) NOT NULL,
  record_key TEXT NOT NULL,
  title VARCHAR(255) NOT NULL,
  details TEXT,
  assigned_user_id UUID,
  due_at TIMESTAMPTZ,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  completed_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_sami_enterprise_tasks_record
  ON public.sami_enterprise_record_tasks(
    company_id,
    module_key,
    table_key,
    record_key,
    status,
    due_at
  )
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.sami_enterprise_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL
    REFERENCES public.companies(id)
    ON DELETE CASCADE,
  user_id UUID NOT NULL,
  module_key VARCHAR(120) NOT NULL,
  table_key VARCHAR(160) NOT NULL,
  name VARCHAR(160) NOT NULL,
  layout VARCHAR(20) NOT NULL DEFAULT 'list',
  search_text VARCHAR(300) NOT NULL DEFAULT '',
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort JSONB NOT NULL DEFAULT '{}'::jsonb,
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (layout IN ('list', 'kanban', 'calendar'))
);

CREATE INDEX IF NOT EXISTS idx_sami_enterprise_saved_views_user
  ON public.sami_enterprise_saved_views(
    company_id,
    user_id,
    module_key,
    table_key,
    updated_at DESC
  )
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sami_enterprise_saved_view_name
  ON public.sami_enterprise_saved_views(
    company_id,
    user_id,
    module_key,
    table_key,
    lower(name)
  )
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.sami_enterprise_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL
    REFERENCES public.companies(id)
    ON DELETE CASCADE,
  module_key VARCHAR(120) NOT NULL,
  table_key VARCHAR(160) NOT NULL,
  field_key VARCHAR(80) NOT NULL,
  label VARCHAR(160) NOT NULL,
  field_type VARCHAR(30) NOT NULL DEFAULT 'text',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (
    field_type IN (
      'text',
      'textarea',
      'number',
      'checkbox',
      'date',
      'datetime',
      'select'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sami_enterprise_custom_field_key
  ON public.sami_enterprise_custom_fields(
    company_id,
    module_key,
    table_key,
    field_key
  )
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.sami_enterprise_record_extras (
  company_id UUID NOT NULL
    REFERENCES public.companies(id)
    ON DELETE CASCADE,
  module_key VARCHAR(120) NOT NULL,
  table_key VARCHAR(160) NOT NULL,
  record_key TEXT NOT NULL,
  custom_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  watchers JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (
    company_id,
    module_key,
    table_key,
    record_key
  )
);

CREATE INDEX IF NOT EXISTS idx_sami_enterprise_record_extras_lookup
  ON public.sami_enterprise_record_extras(
    company_id,
    module_key,
    table_key,
    record_key
  );
`;
}


function hardeningSqlForTable(
  table:
    string,
) {
  const quoted =
    q(
      table,
    );

  const indexName =
    q(
      (
        'idx_' +
        table +
        '_company_active'
      ).slice(
        0,
        60,
      ),
    );

  return `
ALTER TABLE public.${quoted}
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES public.companies(id)
    ON DELETE CASCADE;

ALTER TABLE public.${quoted}
  ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE public.${quoted}
  ADD COLUMN IF NOT EXISTS updated_by UUID;

ALTER TABLE public.${quoted}
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
    NOT NULL DEFAULT NOW();

ALTER TABLE public.${quoted}
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ${indexName}
  ON public.${quoted}(company_id)
  WHERE deleted_at IS NULL;

DO $sami$
DECLARE
  company_count INTEGER;
  only_company UUID;
BEGIN
  SELECT
    COUNT(*)::int,
    MIN(id)
  INTO
    company_count,
    only_company
  FROM public.companies;

  IF company_count = 1 THEN
    UPDATE public.${quoted}
    SET
      company_id =
        only_company
    WHERE company_id IS NULL;
  END IF;
END
$sami$;
`;
}


export function appendEnterpriseSchemaHardening(
  moduleKey:
    string,
  schema:
    string,
) {
  if (
    !isEnterpriseModuleKey(
      moduleKey,
    )
  ) {
    return schema;
  }

  const tables =
    enterpriseModuleTables(
      moduleKey,
    );

  if (
    tables.length ===
      0
  ) {
    return schema;
  }

  return (
    schema.trimEnd() +
    '\n\n-- SaMi enterprise shared runtime infrastructure\n' +
    enterpriseInfrastructureSql() +
    '\n\n-- SaMi enterprise completion collaboration infrastructure\n' +
    enterpriseCompletionSql() +
    '\n\n-- SaMi enterprise company/audit boundary hardening\n' +
    tables
      .map(
        hardeningSqlForTable,
      )
      .join(
        '\n'
      ) +
    '\n'
  );
}


async function hardenExistingTable(
  client:
    PoolClient,
  table:
    string,
) {
  const exists =
    await client.query(
      `
        SELECT
          to_regclass(
            $1
          ) AS relation
      `,
      [
        'public.' +
        table,
      ],
    );

  if (
    !exists.rows[0]
      ?.relation
  ) {
    return;
  }

  await client.query(
    hardeningSqlForTable(
      table,
    ),
  );
}


async function hardenModule(
  client:
    PoolClient,
  moduleKey:
    EnterpriseModuleKey,
) {
  await client.query(
    enterpriseInfrastructureSql(),
  );

  for (
    const table
    of enterpriseModuleTables(
      moduleKey,
    )
  ) {
    await hardenExistingTable(
      client,
      table,
    );
  }
}


async function completeModule(
  client:
    PoolClient,
) {
  await client.query(
    enterpriseCompletionSql(),
  );
}


export const ENTERPRISE_SUITE_MIGRATIONS:
  readonly SamiModuleMigrationDefinition[] =
  (
    Object.keys(
      ENTERPRISE_MODULE_TABLES,
    ) as
      EnterpriseModuleKey[]
  ).map(
    moduleKey => ({
      key:
        moduleKey +
        '-1.0.0-to-2.0.0',
      moduleKey,
      namespace:
        moduleKey,
      fromVersion:
        '1.0.0',
      toVersion:
        '2.0.0',
      run:
        async client => {
          await hardenModule(
            client,
            moduleKey,
          );
        },
    }),
  );


export const ENTERPRISE_SUITE_COMPLETION_MIGRATIONS:
  readonly SamiModuleMigrationDefinition[] =
  (
    Object.keys(
      ENTERPRISE_MODULE_TABLES,
    ) as
      EnterpriseModuleKey[]
  ).map(
    moduleKey => ({
      key:
        moduleKey +
        '-2.0.0-to-2.1.0',
      moduleKey,
      namespace:
        moduleKey,
      fromVersion:
        '2.0.0',
      toVersion:
        '2.1.0',
      run:
        async client => {
          await completeModule(
            client,
          );
        },
    }),
  );
