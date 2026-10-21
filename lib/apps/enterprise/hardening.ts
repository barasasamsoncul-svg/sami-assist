import 'server-only';

import type {
  Pool,
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
} from '@/lib/modules/migration-types';

import {
  SPECIALIST_ENTERPRISE_TABLES,
  isSpecialistEnterpriseModuleKey,
  specialistEnterpriseTables,
  type SpecialistEnterpriseModuleKey,
} from '@/lib/apps/enterprise/specialist-catalog';

import {
  specialistDepthSql,
} from '@/lib/apps/enterprise/specialist-depth';



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
    name
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
    COUNT(*)::int
  INTO
    company_count
  FROM public.companies;

  IF company_count = 1 THEN
    SELECT
      id
    INTO
      only_company
    FROM public.companies
    LIMIT 1;

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


function inventoryLedgerIntegritySql() {
  return `
-- The generic enterprise workspace must not create a second path for posting stock.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE public.warehouses DROP CONSTRAINT IF EXISTS warehouses_code_key;

ALTER TABLE public.stock_levels
  ALTER COLUMN quantity TYPE NUMERIC(19,4) USING quantity::NUMERIC(19,4),
  ALTER COLUMN reorder_level TYPE NUMERIC(19,4) USING reorder_level::NUMERIC(19,4);
ALTER TABLE public.stock_movements
  ALTER COLUMN quantity TYPE NUMERIC(19,4) USING quantity::NUMERIC(19,4);

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_company_id_id ON public.products(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_company_id_id ON public.warehouses(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_lots_company_id_id ON public.inventory_lots(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_company_sku
  ON public.products(company_id, sku)
  WHERE company_id IS NOT NULL AND sku IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_company_barcode
  ON public.products(company_id, barcode)
  WHERE company_id IS NOT NULL AND barcode IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_company_code
  ON public.warehouses(company_id, code)
  WHERE company_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_one_default_per_company
  ON public.warehouses(company_id)
  WHERE company_id IS NOT NULL AND is_default = TRUE AND is_active = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_levels_company_product_warehouse
  ON public.stock_levels(company_id, product_id, warehouse_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_company_created
  ON public.stock_movements(company_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_company_product_created
  ON public.stock_movements(company_id, product_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_lots_company_expiry
  ON public.inventory_lots(company_id, expires_on, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_reservations_company_active
  ON public.stock_reservations(company_id, product_id, warehouse_id, status)
  WHERE deleted_at IS NULL AND status IN ('active', 'allocated');
CREATE INDEX IF NOT EXISTS idx_inventory_reorder_company_status
  ON public.inventory_reorder_rules(company_id, status, product_id, warehouse_id) WHERE deleted_at IS NULL;

DO $sami_inventory_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_products_company_required' AND conrelid='public.products'::regclass) THEN
    ALTER TABLE public.products ADD CONSTRAINT ck_products_company_required CHECK (company_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_warehouses_company_required' AND conrelid='public.warehouses'::regclass) THEN
    ALTER TABLE public.warehouses ADD CONSTRAINT ck_warehouses_company_required CHECK (company_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_stock_levels_company_required' AND conrelid='public.stock_levels'::regclass) THEN
    ALTER TABLE public.stock_levels ADD CONSTRAINT ck_stock_levels_company_required CHECK (company_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_stock_movements_company_required' AND conrelid='public.stock_movements'::regclass) THEN
    ALTER TABLE public.stock_movements ADD CONSTRAINT ck_stock_movements_company_required CHECK (company_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_stock_levels_quantity_nonnegative' AND conrelid='public.stock_levels'::regclass) THEN
    ALTER TABLE public.stock_levels ADD CONSTRAINT ck_stock_levels_quantity_nonnegative CHECK (quantity >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_stock_levels_reorder_nonnegative' AND conrelid='public.stock_levels'::regclass) THEN
    ALTER TABLE public.stock_levels ADD CONSTRAINT ck_stock_levels_reorder_nonnegative CHECK (reorder_level >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_stock_movements_quantity_positive' AND conrelid='public.stock_movements'::regclass) THEN
    ALTER TABLE public.stock_movements ADD CONSTRAINT ck_stock_movements_quantity_positive CHECK (quantity > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_stock_levels_company_product' AND conrelid='public.stock_levels'::regclass) THEN
    ALTER TABLE public.stock_levels ADD CONSTRAINT fk_stock_levels_company_product FOREIGN KEY (company_id,product_id) REFERENCES public.products(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_stock_levels_company_warehouse' AND conrelid='public.stock_levels'::regclass) THEN
    ALTER TABLE public.stock_levels ADD CONSTRAINT fk_stock_levels_company_warehouse FOREIGN KEY (company_id,warehouse_id) REFERENCES public.warehouses(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_stock_movements_company_product' AND conrelid='public.stock_movements'::regclass) THEN
    ALTER TABLE public.stock_movements ADD CONSTRAINT fk_stock_movements_company_product FOREIGN KEY (company_id,product_id) REFERENCES public.products(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_stock_movements_company_warehouse' AND conrelid='public.stock_movements'::regclass) THEN
    ALTER TABLE public.stock_movements ADD CONSTRAINT fk_stock_movements_company_warehouse FOREIGN KEY (company_id,warehouse_id) REFERENCES public.warehouses(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_stock_reservations_company_product' AND conrelid='public.stock_reservations'::regclass) THEN
    ALTER TABLE public.stock_reservations ADD CONSTRAINT fk_stock_reservations_company_product FOREIGN KEY (company_id,product_id) REFERENCES public.products(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_stock_reservations_company_warehouse' AND conrelid='public.stock_reservations'::regclass) THEN
    ALTER TABLE public.stock_reservations ADD CONSTRAINT fk_stock_reservations_company_warehouse FOREIGN KEY (company_id,warehouse_id) REFERENCES public.warehouses(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_stock_reservations_company_lot' AND conrelid='public.stock_reservations'::regclass) THEN
    ALTER TABLE public.stock_reservations ADD CONSTRAINT fk_stock_reservations_company_lot FOREIGN KEY (company_id,lot_id) REFERENCES public.inventory_lots(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_inventory_lots_company_product' AND conrelid='public.inventory_lots'::regclass) THEN
    ALTER TABLE public.inventory_lots ADD CONSTRAINT fk_inventory_lots_company_product FOREIGN KEY (company_id,product_id) REFERENCES public.products(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_inventory_reorder_company_product' AND conrelid='public.inventory_reorder_rules'::regclass) THEN
    ALTER TABLE public.inventory_reorder_rules ADD CONSTRAINT fk_inventory_reorder_company_product FOREIGN KEY (company_id,product_id) REFERENCES public.products(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_inventory_reorder_company_warehouse' AND conrelid='public.inventory_reorder_rules'::regclass) THEN
    ALTER TABLE public.inventory_reorder_rules ADD CONSTRAINT fk_inventory_reorder_company_warehouse FOREIGN KEY (company_id,warehouse_id) REFERENCES public.warehouses(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_inventory_adjustments_company_product' AND conrelid='public.inventory_adjustments'::regclass) THEN
    ALTER TABLE public.inventory_adjustments ADD CONSTRAINT fk_inventory_adjustments_company_product FOREIGN KEY (company_id,product_id) REFERENCES public.products(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_inventory_adjustments_company_warehouse' AND conrelid='public.inventory_adjustments'::regclass) THEN
    ALTER TABLE public.inventory_adjustments ADD CONSTRAINT fk_inventory_adjustments_company_warehouse FOREIGN KEY (company_id,warehouse_id) REFERENCES public.warehouses(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
END
$sami_inventory_constraints$;
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
    (
      specialistDepthSql(
        moduleKey,
      )
        ? (
            '\n\n-- SaMi specialist ERP depth\n' +
            specialistDepthSql(
              moduleKey,
            )
          )
        : ''
    ) +
    '\n\n-- SaMi enterprise company/audit boundary hardening\n' +
    tables
      .map(
        hardeningSqlForTable,
      )
      .join(
        '\n'
      ) +
    (
      moduleKey === 'inventory'
        ? '\n\n-- SaMi Inventory ledger integrity\n' + inventoryLedgerIntegritySql()
        : ''
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


async function deepenSpecialistModule(
  client:
    PoolClient,
  moduleKey:
    SpecialistEnterpriseModuleKey,
) {
  const depthSql =
    specialistDepthSql(
      moduleKey,
    );

  if (
    depthSql.trim()
  ) {
    await client.query(
      depthSql,
    );
  }

  for (
    const table
    of specialistEnterpriseTables(
      moduleKey,
    )
  ) {
    await hardenExistingTable(
      client,
      table,
    );
  }
}


export async function ensureEnterpriseModuleRuntimeSchema(
  pool:
    Pool,
  moduleKeyInput:
    string,
) {
  const moduleKey =
    moduleKeyInput
      .trim()
      .toLowerCase();

  if (
    !isEnterpriseModuleKey(
      moduleKey,
    )
  ) {
    return;
  }

  const client =
    await pool.connect();

  const lockKey =
    'sami:enterprise-runtime-schema:' +
    moduleKey;

  try {
    await client.query(
      `
        SELECT
          pg_advisory_lock(
            hashtext(
              $1
            )
          )
      `,
      [
        lockKey,
      ],
    );

    await client.query(
      'BEGIN',
    );

    await hardenModule(
      client,
      moduleKey,
    );

    await completeModule(
      client,
    );

    if (
      isSpecialistEnterpriseModuleKey(
        moduleKey,
      )
    ) {
      await deepenSpecialistModule(
        client,
        moduleKey,
      );
    }

    await client.query(
      'COMMIT',
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {
      // Preserve the schema repair error.
    }

    throw error;
  } finally {
    try {
      await client.query(
        `
          SELECT
            pg_advisory_unlock(
              hashtext(
                $1
              )
            )
        `,
        [
          lockKey,
        ],
      );
    } catch {
      // Releasing the pooled connection also releases session locks.
    }

    client.release();
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


export const ENTERPRISE_SPECIALIST_DEPTH_MIGRATIONS:
  readonly SamiModuleMigrationDefinition[] =
  (
    Object.keys(
      SPECIALIST_ENTERPRISE_TABLES,
    ) as
      SpecialistEnterpriseModuleKey[]
  ).map(
    moduleKey => ({
      key:
        moduleKey +
        '-2.1.0-to-2.2.0',
      moduleKey,
      namespace:
        moduleKey,
      fromVersion:
        '2.1.0',
      toVersion:
        '2.2.0',
      run:
        async client => {
          await deepenSpecialistModule(
            client,
            moduleKey,
          );
        },
    }),
  );


export const ENTERPRISE_STRICT_PARITY_MIGRATIONS:
  readonly SamiModuleMigrationDefinition[] =
  (
    Object.keys(
      SPECIALIST_ENTERPRISE_TABLES,
    ) as
      SpecialistEnterpriseModuleKey[]
  ).map(
    moduleKey => ({
      key:
        moduleKey +
        '-2.2.0-to-2.3.0',
      moduleKey,
      namespace:
        moduleKey,
      fromVersion:
        '2.2.0',
      toVersion:
        '2.3.0',
      run:
        async client => {
          await deepenSpecialistModule(
            client,
            moduleKey,
          );
        },
    }),
  );
