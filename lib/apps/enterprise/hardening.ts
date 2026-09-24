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
  FROM public.companies
  WHERE deleted_at IS NULL;

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
