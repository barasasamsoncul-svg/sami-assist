import 'server-only';

import type { PoolClient } from 'pg';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';

import {
  postBalancedLedgerJournal,
  reversePostedLedgerJournal,
} from './ledger-engine';
import {
  AccountingInputError,
  accountingDate,
  accountingId,
} from './validation';
import {
  classifyInventoryEvent,
  inventoryMoneyCents,
  inventoryQuantityUnits,
  moneyDecimal,
  quantityDecimal,
  standardCostValue,
} from './inventory-valuation-rules';

type Context =
  Awaited<
    ReturnType<
      typeof requireEnterpriseModuleTableContext
    >
  >;

type Treatment =
  | 'issue_cogs'
  | 'return_cogs'
  | 'adjustment_gain'
  | 'adjustment_loss'
  | 'ignore'
  | 'review';

function bodyOf(
  input: unknown,
) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(
      input,
    )
  ) {
    throw new AccountingInputError(
      'Enter valid inventory valuation data.',
    );
  }

  return input as
    Record<
      string,
      unknown
    >;
}

function text(
  value: unknown,
  max: number,
  label: string,
  required = false,
) {
  if (
    value != null &&
    typeof value !==
      'string'
  ) {
    throw new AccountingInputError(
      label +
      ' must contain text.',
    );
  }

  const result =
    typeof value ===
      'string'
      ? value.trim()
      : '';

  if (
    required &&
    !result
  ) {
    throw new AccountingInputError(
      label +
      ' is required.',
    );
  }

  if (
    result.length >
      max
  ) {
    throw new AccountingInputError(
      label +
      ' must be at most ' +
      max +
      ' characters.',
    );
  }

  return result;
}

function bool(
  value: unknown,
  fallback = false,
) {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  return (
    value === true ||
    value === 'true' ||
    value === '1' ||
    value === 1
  );
}

function today() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    );
}

async function tableReady(
  client:
    Pick<
      PoolClient,
      'query'
    >,
  name:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          to_regclass(
            $1
          ) IS NOT NULL
            AS present
      `,
      [
        'public.' +
        name,
      ],
    );

  return Boolean(
    result.rows[0]
      ?.present,
  );
}

async function inventoryRuntime(
  client:
    Pick<
      PoolClient,
      'query'
    >,
) {
  const [
    products,
    warehouses,
    levels,
    movements,
    adjustments,
  ] =
    await Promise.all([
      tableReady(
        client,
        'products',
      ),
      tableReady(
        client,
        'warehouses',
      ),
      tableReady(
        client,
        'stock_levels',
      ),
      tableReady(
        client,
        'stock_movements',
      ),
      tableReady(
        client,
        'inventory_adjustments',
      ),
    ]);

  return {
    products,
    warehouses,
    levels,
    movements,
    adjustments,
    available:
      products &&
      levels,
  };
}

async function audit(
  context:
    Context,
  action:
    string,
  resourceType:
    string,
  resourceId:
    string,
  summary:
    string,
  metadata:
    Record<
      string,
      unknown
    > = {},
) {
  await recordWorkspaceAuditEvent({
    tenantId:
      context.tenantId,
    companyId:
      context.companyId,
    userId:
      context.userId,
    action:
      'accounting.inventory.' +
      action,
    module:
      'accounting',
    resourceType,
    resourceId,
    summary,
    result:
      'success',
    metadata,
  }).catch(
    error =>
      console.error(
        '[Accounting] Inventory valuation audit failed',
        error,
      ),
  );
}

async function activeAccount(
  client:
    PoolClient,
  companyId:
    string,
  id:
    string,
  label:
    string,
  accepts:
    (
      type:
        string,
    ) => boolean,
) {
  const result =
    await client.query(
      `
        SELECT
          id::text,
          code,
          name,
          account_type
        FROM accounts
        WHERE company_id =
              $1
          AND id =
              $2
          AND deleted_at
              IS NULL
          AND is_active =
              TRUE
        LIMIT 1
        FOR SHARE
      `,
      [
        companyId,
        id,
      ],
    );

  const row =
    result.rows[0];

  if (
    !row ||
    !accepts(
      String(
        row.account_type ||
        '',
      ),
    )
  ) {
    throw new AccountingInputError(
      label +
      ' must use a compatible active account in this company.',
    );
  }

  return row;
}

function assetAccount(
  type:
    string,
) {
  return (
    type ===
      'asset' ||
    type.startsWith(
      'asset_',
    )
  );
}

function expenseAccount(
  type:
    string,
) {
  return (
    type ===
      'expense' ||
    type.startsWith(
      'expense_',
    )
  );
}

function incomeAccount(
  type:
    string,
) {
  return (
    type ===
      'income' ||
    type.startsWith(
      'income_',
    )
  );
}

async function settingsForUpdate(
  client:
    PoolClient,
  companyId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          company_id::text,
          enabled,
          valuation_method,
          valuation_start_date::text,
          inventory_asset_account_id::text,
          cogs_account_id::text,
          inventory_gain_account_id::text,
          inventory_loss_account_id::text,
          sync_sales_movements,
          sync_adjustments,
          status
        FROM accounting_inventory_settings
        WHERE company_id =
              $1
          AND deleted_at
              IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [
        companyId,
      ],
    );

  return result.rows[0] ||
    null;
}

async function backfillSourceEvents(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    settings:
      Record<
        string,
        unknown
      >;
    runtime:
      Awaited<
        ReturnType<
          typeof inventoryRuntime
        >
      >;
  },
) {
  let count =
    0;

  if (
    input.runtime
      .movements &&
    input.settings
      .sync_sales_movements
  ) {
    const movementResult =
      await client.query(
        `
          INSERT INTO accounting_inventory_source_events (
            company_id,
            source_type,
            source_id,
            source_event_key,
            event_date,
            movement_type,
            product_id,
            warehouse_id,
            source_quantity,
            quantity_effect,
            unit_cost,
            value_amount,
            cost_source,
            cost_estimated,
            status,
            metadata,
            created_by,
            updated_by
          )
          SELECT
            movement.company_id,
            'stock_movement',
            movement.id,
            'inventory:stock-movement:' ||
              movement.id::text,
            movement.created_at::date,
            movement.movement_type,
            movement.product_id,
            movement.warehouse_id,
            ABS(
              movement.quantity
            )::numeric(19,4),
            CASE
              WHEN movement.movement_type =
                   'sales_delivery'
                THEN -ABS(
                  movement.quantity
                )
              WHEN movement.movement_type =
                   'sales_return'
                THEN ABS(
                  movement.quantity
                )
              ELSE 0
            END::numeric(19,4),
            COALESCE(
              product.cost_price,
              0
            )::numeric(19,4),
            ROUND(
              ABS(
                movement.quantity
              ) *
              COALESCE(
                product.cost_price,
                0
              ),
              2
            )::numeric(19,2),
            'backfill_current_standard_cost',
            TRUE,
            CASE
              WHEN movement.movement_type
                   IN (
                     'sales_delivery',
                     'sales_return'
                   )
                THEN 'pending'
              ELSE 'review'
            END,
            jsonb_build_object(
              'reference',
              movement.reference,
              'backfilled',
              TRUE
            ),
            $3,
            $3
          FROM stock_movements movement
          INNER JOIN products product
            ON product.id =
               movement.product_id
           AND product.company_id =
               movement.company_id
           AND product.deleted_at
               IS NULL
          WHERE movement.company_id =
                $1
            AND movement.deleted_at
                IS NULL
            AND movement.created_at::date >=
                $2::date
          ON CONFLICT (
            company_id,
            source_event_key
          )
          WHERE deleted_at
                IS NULL
          DO NOTHING
          RETURNING id
        `,
        [
          input.companyId,
          String(
            input.settings
              .valuation_start_date,
          ).slice(
            0,
            10,
          ),
          input.userId,
        ],
      );

    count +=
      movementResult
        .rowCount ||
      0;
  }

  if (
    input.runtime
      .adjustments &&
    input.settings
      .sync_adjustments
  ) {
    const adjustmentResult =
      await client.query(
        `
          INSERT INTO accounting_inventory_source_events (
            company_id,
            source_type,
            source_id,
            source_event_key,
            event_date,
            movement_type,
            product_id,
            warehouse_id,
            source_quantity,
            quantity_effect,
            unit_cost,
            value_amount,
            cost_source,
            cost_estimated,
            status,
            metadata,
            created_by,
            updated_by
          )
          SELECT
            adjustment.company_id,
            'inventory_adjustment',
            adjustment.id,
            'inventory:adjustment:' ||
              adjustment.id::text,
            COALESCE(
              adjustment.posted_at,
              adjustment.updated_at,
              adjustment.created_at
            )::date,
            CASE
              WHEN adjustment.difference_quantity >=
                   0
                THEN 'inventory_adjustment_gain'
              ELSE 'inventory_adjustment_loss'
            END,
            adjustment.product_id,
            adjustment.warehouse_id,
            ABS(
              adjustment.difference_quantity
            )::numeric(19,4),
            adjustment.difference_quantity::numeric(19,4),
            COALESCE(
              product.cost_price,
              0
            )::numeric(19,4),
            ROUND(
              ABS(
                adjustment.difference_quantity
              ) *
              COALESCE(
                product.cost_price,
                0
              ),
              2
            )::numeric(19,2),
            'backfill_current_standard_cost',
            TRUE,
            CASE
              WHEN adjustment.difference_quantity =
                   0
                THEN 'ignored'
              ELSE 'pending'
            END,
            jsonb_build_object(
              'adjustmentNumber',
              adjustment.adjustment_number,
              'reason',
              adjustment.reason,
              'backfilled',
              TRUE
            ),
            $3,
            $3
          FROM inventory_adjustments adjustment
          INNER JOIN products product
            ON product.id =
               adjustment.product_id
           AND product.company_id =
               adjustment.company_id
           AND product.deleted_at
               IS NULL
          WHERE adjustment.company_id =
                $1
            AND adjustment.deleted_at
                IS NULL
            AND adjustment.status =
                'posted'
            AND COALESCE(
                  adjustment.posted_at,
                  adjustment.updated_at,
                  adjustment.created_at
                )::date >=
                $2::date
          ON CONFLICT (
            company_id,
            source_event_key
          )
          WHERE deleted_at
                IS NULL
          DO NOTHING
          RETURNING id
        `,
        [
          input.companyId,
          String(
            input.settings
              .valuation_start_date,
          ).slice(
            0,
            10,
          ),
          input.userId,
        ],
      );

    count +=
      adjustmentResult
        .rowCount ||
      0;
  }

  return count;
}

function builtInTreatment(
  movementType:
    string,
  quantityEffect:
    string,
): Treatment {
  const classified =
    classifyInventoryEvent({
      movementType,
      quantityEffect,
    });

  if (
    classified ===
      'cogs_issue'
  ) {
    return 'issue_cogs';
  }

  if (
    classified ===
      'cogs_return'
  ) {
    return 'return_cogs';
  }

  if (
    classified ===
      'adjustment_gain'
  ) {
    return 'adjustment_gain';
  }

  if (
    classified ===
      'adjustment_loss'
  ) {
    return 'adjustment_loss';
  }

  return 'review';
}

async function eventTreatment(
  client:
    PoolClient,
  companyId:
    string,
  event:
    Record<
      string,
      unknown
    >,
) {
  const builtin =
    builtInTreatment(
      String(
        event.movement_type,
      ),
      String(
        event.quantity_effect,
      ),
    );

  if (
    builtin !==
      'review'
  ) {
    return builtin;
  }

  const rule =
    await client.query(
      `
        SELECT treatment
        FROM accounting_inventory_movement_rules
        WHERE company_id =
              $1
          AND movement_type =
              $2
          AND active =
              TRUE
          AND deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        companyId,
        String(
          event.movement_type,
        ),
      ],
    );

  return (
    rule.rows[0]
      ?.treatment ||
    'review'
  ) as Treatment;
}

async function postingAccounts(
  client:
    PoolClient,
  companyId:
    string,
  settings:
    Record<
      string,
      unknown
    >,
  productId:
    string,
) {
  const mapping =
    await client.query(
      `
        SELECT
          inventory_asset_account_id::text,
          cogs_account_id::text
        FROM accounting_inventory_product_mappings
        WHERE company_id =
              $1
          AND product_id =
              $2
          AND active =
              TRUE
          AND deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        companyId,
        productId,
      ],
    );

  return {
    asset:
      mapping.rows[0]
        ?.inventory_asset_account_id
        ? String(
            mapping.rows[0]
              .inventory_asset_account_id,
          )
        : settings
            .inventory_asset_account_id
          ? String(
              settings
                .inventory_asset_account_id,
            )
          : null,
    cogs:
      mapping.rows[0]
        ?.cogs_account_id
        ? String(
            mapping.rows[0]
              .cogs_account_id,
          )
        : settings
            .cogs_account_id
          ? String(
              settings
                .cogs_account_id,
            )
          : null,
    gain:
      settings
        .inventory_gain_account_id
        ? String(
            settings
              .inventory_gain_account_id,
          )
        : null,
    loss:
      settings
        .inventory_loss_account_id
        ? String(
            settings
              .inventory_loss_account_id,
          )
        : null,
  };
}

function treatmentEffect(
  treatment:
    Treatment,
  sourceQuantity:
    string,
) {
  const q =
    inventoryQuantityUnits(
      sourceQuantity,
    );

  if (
    treatment ===
      'issue_cogs' ||
    treatment ===
      'adjustment_loss'
  ) {
    return -q;
  }

  if (
    treatment ===
      'return_cogs' ||
    treatment ===
      'adjustment_gain'
  ) {
    return q;
  }

  return BigInt(
    0,
  );
}

async function currentReconciliation(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    asOf:
      string;
    settings:
      Record<
        string,
        unknown
      >;
    runtime:
      Awaited<
        ReturnType<
          typeof inventoryRuntime
        >
      >;
  },
) {
  if (
    !input.runtime
      .available
  ) {
    return {
      lines:
        [] as Array<
          Record<
            string,
            unknown
          >
        >,
      stockValue:
        '0.00',
      glValue:
        '0.00',
      difference:
        '0.00',
    };
  }

  const stock =
    await client.query(
      `
        SELECT
          COALESCE(
            mapping.inventory_asset_account_id,
            $2::uuid
          )::text
            AS inventory_asset_account_id,
          ROUND(
            COALESCE(
              SUM(
                level.quantity *
                product.cost_price
              ),
              0
            ),
            2
          )::text
            AS stock_value,
          COUNT(
            DISTINCT product.id
          )::int
            AS product_count
        FROM stock_levels level
        INNER JOIN products product
          ON product.id =
             level.product_id
         AND product.company_id =
             level.company_id
         AND product.deleted_at
             IS NULL
        LEFT JOIN accounting_inventory_product_mappings mapping
          ON mapping.company_id =
             level.company_id
         AND mapping.product_id =
             level.product_id
         AND mapping.active =
             TRUE
         AND mapping.deleted_at
             IS NULL
        WHERE level.company_id =
              $1
          AND level.deleted_at
              IS NULL
          AND product.product_type =
              'stockable'
          AND product.is_active =
              TRUE
        GROUP BY
          COALESCE(
            mapping.inventory_asset_account_id,
            $2::uuid
          )
        ORDER BY 1
      `,
      [
        input.companyId,
        input.settings
          .inventory_asset_account_id ||
          null,
      ],
    );

  const lines:
    Array<
      Record<
        string,
        unknown
      >
    > = [];

  let totalStock =
    BigInt(
      0,
    );
  let totalGl =
    BigInt(
      0,
    );

  for (
    const row
    of stock.rows
  ) {
    const accountId =
      row.inventory_asset_account_id
        ? String(
            row.inventory_asset_account_id,
          )
        : '';

    const stockCents =
      inventoryMoneyCents(
        row.stock_value ||
        '0',
      );

    let glCents =
      BigInt(
        0,
      );

    let accountCode =
      null;
    let accountName =
      'Unmapped inventory';

    if (
      accountId
    ) {
      const gl =
        await client.query(
          `
            SELECT
              account.code,
              account.name,
              COALESCE(
                SUM(
                  line.debit -
                  line.credit
                ),
                0
              )::numeric(19,2)::text
                AS balance
            FROM accounts account
            LEFT JOIN journal_lines line
              ON line.company_id =
                 account.company_id
             AND line.account_id =
                 account.id
             AND line.deleted_at
                 IS NULL
            LEFT JOIN journals journal
              ON journal.company_id =
                 line.company_id
             AND journal.id =
                 line.journal_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
             AND journal.journal_date <=
                 $3::date
            WHERE account.company_id =
                  $1
              AND account.id =
                  $2
              AND account.deleted_at
                  IS NULL
            GROUP BY
              account.id
          `,
          [
            input.companyId,
            accountId,
            input.asOf,
          ],
        );

      glCents =
        inventoryMoneyCents(
          gl.rows[0]
            ?.balance ||
          '0',
        );
      accountCode =
        gl.rows[0]
          ?.code ||
        null;
      accountName =
        gl.rows[0]
          ?.name ||
        'Inventory asset';
    }

    totalStock +=
      stockCents;
    totalGl +=
      glCents;

    lines.push({
      accountId:
        accountId ||
        null,
      accountCode,
      accountName,
      stockValue:
        moneyDecimal(
          stockCents,
        ),
      glValue:
        moneyDecimal(
          glCents,
        ),
      difference:
        moneyDecimal(
          stockCents -
          glCents,
        ),
      productCount:
        Number(
          row.product_count ||
          0,
        ),
    });
  }

  return {
    lines,
    stockValue:
      moneyDecimal(
        totalStock,
      ),
    glValue:
      moneyDecimal(
        totalGl,
      ),
    difference:
      moneyDecimal(
        totalStock -
        totalGl,
      ),
  };
}

export async function getAccountingInventoryValuation() {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_inventory_settings',
      'view',
    );

  const runtime =
    await inventoryRuntime(
      context.pool,
    );

  const [
    settingsResult,
    rules,
    events,
    syncRuns,
    reconciliationRuns,
    ledgerAccounts,
  ] =
    await Promise.all([
      context.pool.query(
        `
          SELECT
            company_id::text,
            enabled,
            valuation_method,
            valuation_start_date::text,
            inventory_asset_account_id::text,
            cogs_account_id::text,
            inventory_gain_account_id::text,
            inventory_loss_account_id::text,
            sync_sales_movements,
            sync_adjustments,
            status
          FROM accounting_inventory_settings
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
          LIMIT 1
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id::text,
            movement_type,
            treatment,
            active
          FROM accounting_inventory_movement_rules
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
          ORDER BY
            movement_type
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            event.id::text,
            event.source_type,
            event.source_id::text,
            event.event_date::text,
            event.movement_type,
            event.product_id::text,
            event.warehouse_id::text,
            event.source_quantity::text,
            event.quantity_effect::text,
            event.unit_cost::text,
            event.value_amount::text,
            event.cost_source,
            event.cost_estimated,
            event.status,
            event.posted_journal_id::text,
            event.metadata,
            product.name AS product_name,
            product.sku,
            warehouse.name AS warehouse_name
          FROM accounting_inventory_source_events event
          LEFT JOIN products product
            ON product.id =
               event.product_id
           AND product.company_id =
               event.company_id
          LEFT JOIN warehouses warehouse
            ON warehouse.id =
               event.warehouse_id
           AND warehouse.company_id =
               event.company_id
          WHERE event.company_id =
                $1
            AND event.deleted_at
                IS NULL
          ORDER BY
            event.event_date DESC,
            event.created_at DESC
          LIMIT 150
        `,
        [
          context.companyId,
        ],
      ).catch(
        () => ({
          rows:
            [] as Array<
              Record<
                string,
                unknown
              >
            >,
        }),
      ),
      context.pool.query(
        `
          SELECT
            id::text,
            started_at::text,
            completed_at::text,
            status,
            backfilled_count,
            posted_count,
            review_count,
            failed_count
          FROM accounting_inventory_sync_runs
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
          ORDER BY
            started_at DESC
          LIMIT 30
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id::text,
            as_of_date::text,
            stock_value::text,
            gl_value::text,
            difference_amount::text,
            status,
            adjustment_journal_id::text,
            reversal_journal_id::text,
            generated_at::text,
            posted_at::text
          FROM accounting_inventory_reconciliation_runs
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
          ORDER BY
            generated_at DESC
          LIMIT 30
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id::text,
            code,
            name,
            account_type
          FROM accounts
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
            AND is_active =
                TRUE
            AND (
              account_type =
                'asset'
              OR account_type LIKE
                 'asset_%'
              OR account_type =
                 'expense'
              OR account_type LIKE
                 'expense_%'
              OR account_type =
                 'income'
              OR account_type LIKE
                 'income_%'
            )
          ORDER BY
            account_type,
            code
        `,
        [
          context.companyId,
        ],
      ),
    ]);

  const settings =
    settingsResult
      .rows[0] ||
    {
      enabled:
        false,
      valuation_method:
        'standard_cost',
      valuation_start_date:
        today(),
      inventory_asset_account_id:
        null,
      cogs_account_id:
        null,
      inventory_gain_account_id:
        null,
      inventory_loss_account_id:
        null,
      sync_sales_movements:
        true,
      sync_adjustments:
        true,
      status:
        'active',
    };

  const preview =
    await currentReconciliation(
      context.pool as
        PoolClient,
      {
        companyId:
          context.companyId,
        asOf:
          today(),
        settings,
        runtime,
      },
    );

  let products:
    Array<
      Record<
        string,
        unknown
      >
    > = [];

  if (
    runtime.products
  ) {
    products =
      (
        await context.pool.query(
          `
            SELECT
              product.id::text,
              product.name,
              product.sku,
              product.product_type,
              product.cost_price::text,
              product.is_active,
              COALESCE(
                SUM(
                  level.quantity
                ),
                0
              )::numeric(19,4)::text
                AS stock_quantity,
              mapping.inventory_asset_account_id::text,
              mapping.cogs_account_id::text,
              mapping.active AS mapping_active
            FROM products product
            LEFT JOIN stock_levels level
              ON level.company_id =
                 product.company_id
             AND level.product_id =
                 product.id
             AND level.deleted_at
                 IS NULL
            LEFT JOIN accounting_inventory_product_mappings mapping
              ON mapping.company_id =
                 product.company_id
             AND mapping.product_id =
                 product.id
             AND mapping.deleted_at
                 IS NULL
            WHERE product.company_id =
                  $1
              AND product.deleted_at
                  IS NULL
            GROUP BY
              product.id,
              mapping.inventory_asset_account_id,
              mapping.cogs_account_id,
              mapping.active
            ORDER BY
              product.is_active DESC,
              product.name,
              product.id
            LIMIT 500
          `,
          [
            context.companyId,
          ],
        )
      ).rows;
  }

  const diagnostics:
    Array<{
      level:
        'info' |
        'warning' |
        'error';
      code:
        string;
      message:
        string;
    }> = [];

  if (
    !runtime.available
  ) {
    diagnostics.push({
      level:
        'warning',
      code:
        'INVENTORY_APP_UNAVAILABLE',
      message:
        'Inventory quantity tables are not installed for this workspace. Accounting remains available and valuation will activate when Inventory is installed.',
    });
  }

  if (
    settings.enabled &&
    (
      !settings
        .inventory_asset_account_id ||
      !settings
        .cogs_account_id ||
      !settings
        .inventory_gain_account_id ||
      !settings
        .inventory_loss_account_id
    )
  ) {
    diagnostics.push({
      level:
        'error',
      code:
        'VALUATION_ACCOUNTS_INCOMPLETE',
      message:
        'Map Inventory Asset, Cost of Goods Sold, Inventory Gain and Inventory Loss accounts before syncing valuation.',
    });
  }

  const estimatedCount =
    events.rows.filter(
      (
        row:
          Record<
            string,
            unknown
          >,
      ) =>
        row.cost_estimated ===
        true &&
        row.status !==
          'ignored',
    ).length;

  if (
    estimatedCount
  ) {
    diagnostics.push({
      level:
        'warning',
      code:
        'BACKFILLED_COSTS_ESTIMATED',
      message:
        String(
          estimatedCount,
        ) +
        ' historical event(s) use the current product standard cost because no event-time cost snapshot existed before Part 18.',
    });
  }

  const reviewCount =
    events.rows.filter(
      (
        row:
          Record<
            string,
            unknown
          >,
      ) =>
        row.status ===
        'review',
    ).length;

  if (
    reviewCount
  ) {
    diagnostics.push({
      level:
        'warning',
      code:
        'MOVEMENT_TYPES_NEED_RULES',
      message:
        String(
          reviewCount,
        ) +
        ' inventory event(s) need an explicit movement treatment rule before Accounting can post them.',
    });
  }

  if (
    inventoryMoneyCents(
      preview.difference,
    ) !==
      BigInt(
        0,
      )
  ) {
    diagnostics.push({
      level:
        'warning',
      code:
        'INVENTORY_GL_DIFFERENCE',
      message:
        'Current standard-cost stock valuation differs from the mapped Inventory Asset ledger balance by ' +
        preview.difference +
        ' ' +
        context.company
          .currentCompany
          .currency +
        '.',
    });
  }

  return {
    companyId:
      context.companyId,
    currency:
      context.company
        .currentCompany
        .currency,
    snapshotDate:
      today(),
    runtime,
    settings,
    rules:
      rules.rows,
    products,
    events:
      events.rows,
    syncRuns:
      syncRuns.rows,
    reconciliationRuns:
      reconciliationRuns.rows,
    ledgerAccounts:
      ledgerAccounts.rows,
    preview,
    diagnostics,
  };
}

export type AccountingInventoryValuationWorkspace =
  Awaited<
    ReturnType<
      typeof getAccountingInventoryValuation
    >
  >;

export async function saveInventoryValuationSettings(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_inventory_settings',
      'edit',
    );

  const body =
    bodyOf(
      input,
    );

  if (
    accountingId(
      body.expectedCompanyId,
    ) !==
      context.companyId
  ) {
    throw new AccountingInputError(
      'Your active company changed. Reload Accounting before saving inventory valuation settings.',
    );
  }

  const enabled =
    bool(
      body.enabled,
      false,
    );
  const startDate =
    accountingDate(
      body.valuationStartDate ||
      today(),
    );
  const asset =
    accountingId(
      body.inventoryAssetAccountId,
    );
  const cogs =
    accountingId(
      body.cogsAccountId,
    );
  const gain =
    accountingId(
      body.inventoryGainAccountId,
    );
  const loss =
    accountingId(
      body.inventoryLossAccountId,
    );

  if (
    new Set([
      asset,
      cogs,
      gain,
      loss,
    ]).size !==
      4
  ) {
    throw new AccountingInputError(
      'Inventory Asset, COGS, Inventory Gain and Inventory Loss must use distinct ledger accounts.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await activeAccount(
      client,
      context.companyId,
      asset,
      'Inventory Asset',
      assetAccount,
    );
    await activeAccount(
      client,
      context.companyId,
      cogs,
      'Cost of Goods Sold',
      expenseAccount,
    );
    await activeAccount(
      client,
      context.companyId,
      gain,
      'Inventory Gain',
      incomeAccount,
    );
    await activeAccount(
      client,
      context.companyId,
      loss,
      'Inventory Loss',
      expenseAccount,
    );

    await client.query(
      `
        INSERT INTO accounting_inventory_settings (
          company_id,
          enabled,
          valuation_method,
          valuation_start_date,
          inventory_asset_account_id,
          cogs_account_id,
          inventory_gain_account_id,
          inventory_loss_account_id,
          sync_sales_movements,
          sync_adjustments,
          status,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,
          'standard_cost',
          $3,$4,$5,$6,$7,$8,$9,
          'active',$10,$10
        )
        ON CONFLICT (
          company_id
        )
        DO UPDATE
        SET
          enabled =
            EXCLUDED.enabled,
          valuation_method =
            'standard_cost',
          valuation_start_date =
            EXCLUDED.valuation_start_date,
          inventory_asset_account_id =
            EXCLUDED.inventory_asset_account_id,
          cogs_account_id =
            EXCLUDED.cogs_account_id,
          inventory_gain_account_id =
            EXCLUDED.inventory_gain_account_id,
          inventory_loss_account_id =
            EXCLUDED.inventory_loss_account_id,
          sync_sales_movements =
            EXCLUDED.sync_sales_movements,
          sync_adjustments =
            EXCLUDED.sync_adjustments,
          status =
            'active',
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW(),
          deleted_at =
            NULL
      `,
      [
        context.companyId,
        enabled,
        startDate,
        asset,
        cogs,
        gain,
        loss,
        bool(
          body.syncSalesMovements,
          true,
        ),
        bool(
          body.syncAdjustments,
          true,
        ),
        context.userId,
      ],
    );

    await client.query(
      `
        UPDATE accounting_settings
        SET
          inventory_asset_account_id =
            $2,
          cogs_account_id =
            $3,
          inventory_gain_account_id =
            $4,
          inventory_loss_account_id =
            $5,
          updated_by =
            $6,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND deleted_at
              IS NULL
      `,
      [
        context.companyId,
        asset,
        cogs,
        gain,
        loss,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'settings_saved',
      'accounting_inventory_settings',
      context.companyId,
      'Inventory valuation settings updated',
      {
        enabled,
        valuationMethod:
          'standard_cost',
        startDate,
      },
    );

    return {
      enabled,
      startDate,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}

export async function saveInventoryProductMapping(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_inventory_product_mappings',
      'edit',
    );

  const body =
    bodyOf(
      input,
    );
  const productId =
    accountingId(
      body.productId,
    );
  const asset =
    body.inventoryAssetAccountId
      ? accountingId(
          body.inventoryAssetAccountId,
        )
      : null;
  const cogs =
    body.cogsAccountId
      ? accountingId(
          body.cogsAccountId,
        )
      : null;

  const runtime =
    await inventoryRuntime(
      context.pool,
    );

  if (
    !runtime.products
  ) {
    throw new AccountingInputError(
      'Inventory products are not installed in this workspace.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const product =
      await client.query(
        `
          SELECT id
          FROM products
          WHERE company_id =
                $1
            AND id =
                $2
            AND deleted_at
                IS NULL
          LIMIT 1
          FOR SHARE
        `,
        [
          context.companyId,
          productId,
        ],
      );

    if (
      !product.rows[0]
    ) {
      throw new AccountingInputError(
        'Inventory product not found.',
      );
    }

    if (
      asset
    ) {
      await activeAccount(
        client,
        context.companyId,
        asset,
        'Product Inventory Asset',
        assetAccount,
      );
    }

    if (
      cogs
    ) {
      await activeAccount(
        client,
        context.companyId,
        cogs,
        'Product COGS',
        expenseAccount,
      );
    }

    const result =
      await client.query(
        `
          INSERT INTO accounting_inventory_product_mappings (
            company_id,
            product_id,
            inventory_asset_account_id,
            cogs_account_id,
            active,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,TRUE,$5,$5
          )
          ON CONFLICT (
            company_id,
            product_id
          )
          WHERE deleted_at
                IS NULL
          DO UPDATE
          SET
            inventory_asset_account_id =
              EXCLUDED.inventory_asset_account_id,
            cogs_account_id =
              EXCLUDED.cogs_account_id,
            active =
              TRUE,
            updated_by =
              EXCLUDED.updated_by,
            updated_at =
              NOW()
          RETURNING id::text
        `,
        [
          context.companyId,
          productId,
          asset,
          cogs,
          context.userId,
        ],
      );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'product_mapping_saved',
      'accounting_inventory_product_mappings',
      String(
        result.rows[0].id,
      ),
      'Inventory product ledger mapping saved',
      {
        productId,
        asset,
        cogs,
      },
    );

    return {
      id:
        String(
          result.rows[0].id,
        ),
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}

export async function saveInventoryMovementRule(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_inventory_movement_rules',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );
  const movementType =
    text(
      body.movementType,
      80,
      'Movement type',
      true,
    );
  const allowed:
    Treatment[] = [
      'issue_cogs',
      'return_cogs',
      'adjustment_gain',
      'adjustment_loss',
      'ignore',
    ];
  const treatment =
    typeof body.treatment ===
      'string' &&
    allowed.includes(
      body.treatment as
        Treatment,
    )
      ? body.treatment as
          Treatment
      : null;

  if (
    !treatment
  ) {
    throw new AccountingInputError(
      'Choose a valid inventory movement treatment.',
    );
  }

  const result =
    await context.pool.query(
      `
        INSERT INTO accounting_inventory_movement_rules (
          company_id,
          movement_type,
          treatment,
          active,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,TRUE,$4,$4
        )
        ON CONFLICT (
          company_id,
          movement_type
        )
        WHERE deleted_at
              IS NULL
        DO UPDATE
        SET
          treatment =
            EXCLUDED.treatment,
          active =
            TRUE,
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW()
        RETURNING id::text
      `,
      [
        context.companyId,
        movementType,
        treatment,
        context.userId,
      ],
    );

  await audit(
    context,
    'movement_rule_saved',
    'accounting_inventory_movement_rules',
    String(
      result.rows[0].id,
    ),
    'Inventory movement accounting rule saved',
    {
      movementType,
      treatment,
    },
  );

  return {
    id:
      String(
        result.rows[0].id,
      ),
  };
}

export async function syncInventoryValuation() {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_inventory_sync_runs',
      'edit',
    );
  const runtime =
    await inventoryRuntime(
      context.pool,
    );

  if (
    !runtime.available
  ) {
    throw new AccountingInputError(
      'Inventory quantity tables are not installed in this workspace.',
    );
  }

  const client =
    await context.pool.connect();

  let runId =
    '';

  try {
    await client.query(
      'BEGIN',
    );

    const settings =
      await settingsForUpdate(
        client,
        context.companyId,
      );

    if (
      !settings ||
      settings.enabled !==
        true
    ) {
      throw new AccountingInputError(
        'Enable Inventory Valuation before syncing stock movements.',
      );
    }

    if (
      !settings
        .inventory_asset_account_id ||
      !settings
        .cogs_account_id ||
      !settings
        .inventory_gain_account_id ||
      !settings
        .inventory_loss_account_id
    ) {
      throw new AccountingInputError(
        'Complete the Inventory Asset, COGS, Inventory Gain and Inventory Loss mappings before syncing.',
      );
    }

    const run =
      await client.query(
        `
          INSERT INTO accounting_inventory_sync_runs (
            company_id,
            status,
            generated_by,
            created_by,
            updated_by
          )
          VALUES (
            $1,'running',$2,$2,$2
          )
          RETURNING id::text
        `,
        [
          context.companyId,
          context.userId,
        ],
      );

    runId =
      String(
        run.rows[0].id,
      );

    const backfilled =
      await backfillSourceEvents(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          settings,
          runtime,
        },
      );

    const events =
      await client.query(
        `
          SELECT
            id::text,
            source_type,
            source_id::text,
            event_date::text,
            movement_type,
            product_id::text,
            warehouse_id::text,
            source_quantity::text,
            quantity_effect::text,
            unit_cost::text,
            value_amount::text,
            cost_estimated,
            status,
            metadata
          FROM accounting_inventory_source_events
          WHERE company_id =
                $1
            AND status IN (
              'pending',
              'review'
            )
            AND deleted_at
                IS NULL
          ORDER BY
            event_date,
            created_at,
            id
          LIMIT 250
          FOR UPDATE
          SKIP LOCKED
        `,
        [
          context.companyId,
        ],
      );

    let posted =
      0;
    let review =
      0;
    let failed =
      0;

    for (
      const event
      of events.rows
    ) {
      const savepoint =
        'inventory_event';

      await client.query(
        'SAVEPOINT ' +
        savepoint,
      );

      try {
        const treatment =
          await eventTreatment(
            client,
            context.companyId,
            event,
          );

        if (
          treatment ===
            'review'
        ) {
          await client.query(
            `
              UPDATE accounting_inventory_source_events
              SET
                status =
                  'review',
                sync_run_id =
                  $3,
                updated_by =
                  $4,
                updated_at =
                  NOW()
              WHERE company_id =
                    $1
                AND id =
                    $2
            `,
            [
              context.companyId,
              event.id,
              runId,
              context.userId,
            ],
          );
          review +=
            1;
          await client.query(
            'RELEASE SAVEPOINT ' +
            savepoint,
          );
          continue;
        }

        if (
          treatment ===
            'ignore'
        ) {
          await client.query(
            `
              UPDATE accounting_inventory_source_events
              SET
                status =
                  'ignored',
                sync_run_id =
                  $3,
                updated_by =
                  $4,
                updated_at =
                  NOW()
              WHERE company_id =
                    $1
                AND id =
                    $2
            `,
            [
              context.companyId,
              event.id,
              runId,
              context.userId,
            ],
          );
          await client.query(
            'RELEASE SAVEPOINT ' +
            savepoint,
          );
          continue;
        }

        const effect =
          treatmentEffect(
            treatment,
            String(
              event.source_quantity ||
              '0',
            ),
          );
        const value =
          standardCostValue(
            quantityDecimal(
              effect,
            ),
            String(
              event.unit_cost ||
              '0',
            ),
          );
        const valueCents =
          inventoryMoneyCents(
            value,
          );

        if (
          valueCents ===
            BigInt(
              0,
            )
        ) {
          await client.query(
            `
              UPDATE accounting_inventory_source_events
              SET
                status =
                  'review',
                quantity_effect =
                  $3,
                value_amount =
                  0,
                sync_run_id =
                  $4,
                metadata =
                  COALESCE(
                    metadata,
                    '{}'::jsonb
                  ) ||
                  jsonb_build_object(
                    'syncError',
                    'ZERO_STANDARD_COST'
                  ),
                updated_by =
                  $5,
                updated_at =
                  NOW()
              WHERE company_id =
                    $1
                AND id =
                    $2
            `,
            [
              context.companyId,
              event.id,
              quantityDecimal(
                effect,
              ),
              runId,
              context.userId,
            ],
          );
          review +=
            1;
          await client.query(
            'RELEASE SAVEPOINT ' +
            savepoint,
          );
          continue;
        }

        const accounts =
          await postingAccounts(
            client,
            context.companyId,
            settings,
            String(
              event.product_id,
            ),
          );

        if (
          !accounts.asset
        ) {
          throw new AccountingInputError(
            'No Inventory Asset account is mapped for this product.',
          );
        }

        const description =
          'Inventory valuation · ' +
          String(
            event.movement_type,
          );

        let debitAccount =
          '';
        let creditAccount =
          '';

        if (
          treatment ===
            'issue_cogs'
        ) {
          if (
            !accounts.cogs
          ) {
            throw new AccountingInputError(
              'No Cost of Goods Sold account is mapped for this product.',
            );
          }
          debitAccount =
            accounts.cogs;
          creditAccount =
            accounts.asset;
        } else if (
          treatment ===
            'return_cogs'
        ) {
          if (
            !accounts.cogs
          ) {
            throw new AccountingInputError(
              'No Cost of Goods Sold account is mapped for this product.',
            );
          }
          debitAccount =
            accounts.asset;
          creditAccount =
            accounts.cogs;
        } else if (
          treatment ===
            'adjustment_gain'
        ) {
          if (
            !accounts.gain
          ) {
            throw new AccountingInputError(
              'Map an Inventory Gain account before posting positive stock adjustments.',
            );
          }
          debitAccount =
            accounts.asset;
          creditAccount =
            accounts.gain;
        } else {
          if (
            !accounts.loss
          ) {
            throw new AccountingInputError(
              'Map an Inventory Loss account before posting negative stock adjustments.',
            );
          }
          debitAccount =
            accounts.loss;
          creditAccount =
            accounts.asset;
        }

        const journal =
          await postBalancedLedgerJournal(
            client,
            {
              companyId:
                context.companyId,
              userId:
                context.userId,
              journalDate:
                String(
                  event.event_date,
                ).slice(
                  0,
                  10,
                ),
              description,
              reference:
                String(
                  event.source_type,
                ) +
                ':' +
                String(
                  event.source_id,
                ),
              sourceModule:
                'accounting',
              sourceType:
                'inventory_valuation',
              sourceId:
                String(
                  event.id,
                ),
              sourceEventKey:
                'accounting:inventory-valuation:' +
                String(
                  event.id,
                ),
              postingKind:
                'system',
              lines: [
                {
                  accountId:
                    debitAccount,
                  description,
                  debit:
                    value,
                  credit:
                    '0.00',
                },
                {
                  accountId:
                    creditAccount,
                  description,
                  debit:
                    '0.00',
                  credit:
                    value,
                },
              ],
            },
          );

        await client.query(
          `
            UPDATE accounting_inventory_source_events
            SET
              status =
                'posted',
              quantity_effect =
                $3,
              value_amount =
                $4,
              posted_journal_id =
                $5,
              sync_run_id =
                $6,
              metadata =
                COALESCE(
                  metadata,
                  '{}'::jsonb
                ) -
                'syncError',
              updated_by =
                $7,
              updated_at =
                NOW()
            WHERE company_id =
                  $1
              AND id =
                  $2
          `,
          [
            context.companyId,
            event.id,
            quantityDecimal(
              effect,
            ),
            value,
            journal.journalId,
            runId,
            context.userId,
          ],
        );

        posted +=
          1;

        await client.query(
          'RELEASE SAVEPOINT ' +
          savepoint,
        );
      } catch (
        error
      ) {
        await client.query(
          'ROLLBACK TO SAVEPOINT ' +
          savepoint,
        );

        await client.query(
          `
            UPDATE accounting_inventory_source_events
            SET
              status =
                'pending',
              sync_run_id =
                $3,
              metadata =
                COALESCE(
                  metadata,
                  '{}'::jsonb
                ) ||
                jsonb_build_object(
                  'syncError',
                  $4
                ),
              updated_by =
                $5,
              updated_at =
                NOW()
            WHERE company_id =
                  $1
              AND id =
                  $2
          `,
          [
            context.companyId,
            event.id,
            runId,
            error instanceof
              Error
              ? error.message.slice(
                  0,
                  800,
                )
              : 'Inventory valuation posting failed.',
            context.userId,
          ],
        );

        failed +=
          1;

        await client.query(
          'RELEASE SAVEPOINT ' +
          savepoint,
        );
      }
    }

    await client.query(
      `
        UPDATE accounting_inventory_sync_runs
        SET
          completed_at =
            NOW(),
          status =
            $3,
          backfilled_count =
            $4,
          posted_count =
            $5,
          review_count =
            $6,
          failed_count =
            $7,
          updated_by =
            $8,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND id =
              $2
      `,
      [
        context.companyId,
        runId,
        failed
          ? 'completed_with_errors'
          : 'completed',
        backfilled,
        posted,
        review,
        failed,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'sync_completed',
      'accounting_inventory_sync_runs',
      runId,
      'Inventory valuation synchronization completed',
      {
        backfilled,
        posted,
        review,
        failed,
      },
    );

    return {
      id:
        runId,
      backfilled,
      posted,
      review,
      failed,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}

export async function createInventoryReconciliationRun() {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_inventory_reconciliation_runs',
      'create',
    );
  const runtime =
    await inventoryRuntime(
      context.pool,
    );

  if (
    !runtime.available
  ) {
    throw new AccountingInputError(
      'Inventory quantity tables are not installed in this workspace.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN ISOLATION LEVEL REPEATABLE READ',
    );

    const settings =
      await settingsForUpdate(
        client,
        context.companyId,
      );

    if (
      !settings ||
      settings.enabled !==
        true
    ) {
      throw new AccountingInputError(
        'Enable Inventory Valuation before creating a reconciliation.',
      );
    }

    if (
      !settings
        .inventory_asset_account_id
    ) {
      throw new AccountingInputError(
        'Map an Inventory Asset account before reconciling stock to the ledger.',
      );
    }

    const asOf =
      today();
    const preview =
      await currentReconciliation(
        client,
        {
          companyId:
            context.companyId,
          asOf,
          settings,
          runtime,
        },
      );

    const difference =
      inventoryMoneyCents(
        preview.difference,
      );
    const status =
      difference ===
        BigInt(
          0,
        )
        ? 'balanced'
        : 'draft';

    const run =
      await client.query(
        `
          INSERT INTO accounting_inventory_reconciliation_runs (
            company_id,
            as_of_date,
            valuation_method,
            stock_value,
            gl_value,
            difference_amount,
            status,
            generated_by,
            created_by,
            updated_by,
            metadata
          )
          VALUES (
            $1,$2,
            'standard_cost',
            $3,$4,$5,$6,$7,$7,$7,
            $8::jsonb
          )
          RETURNING id::text
        `,
        [
          context.companyId,
          asOf,
          preview.stockValue,
          preview.glValue,
          preview.difference,
          status,
          context.userId,
          JSON.stringify({
            source:
              'current_stock_levels_x_product_standard_cost',
          }),
        ],
      );

    const runId =
      String(
        run.rows[0].id,
      );

    for (
      const line
      of preview.lines
    ) {
      if (
        !line.accountId
      ) {
        throw new AccountingInputError(
          'Every stockable product must resolve to an Inventory Asset account before reconciliation can be saved.',
        );
      }

      await client.query(
        `
          INSERT INTO accounting_inventory_reconciliation_lines (
            company_id,
            run_id,
            inventory_asset_account_id,
            stock_value,
            gl_value,
            difference_amount,
            product_count,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$8
          )
        `,
        [
          context.companyId,
          runId,
          line.accountId,
          line.stockValue,
          line.glValue,
          line.difference,
          line.productCount,
          context.userId,
        ],
      );
    }

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'reconciliation_created',
      'accounting_inventory_reconciliation_runs',
      runId,
      'Inventory-to-ledger reconciliation snapshot created',
      {
        stockValue:
          preview.stockValue,
        glValue:
          preview.glValue,
        difference:
          preview.difference,
        status,
      },
    );

    return {
      id:
        runId,
      status,
      ...preview,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}

export async function postInventoryReconciliationAdjustment(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_inventory_reconciliation_runs',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );
  const runId =
    accountingId(
      body.runId,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const runResult =
      await client.query(
        `
          SELECT
            id::text,
            as_of_date::text,
            status,
            difference_amount::text,
            adjustment_journal_id::text,
            reversal_journal_id::text
          FROM accounting_inventory_reconciliation_runs
          WHERE company_id =
                $1
            AND id =
                $2
            AND deleted_at
                IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [
          context.companyId,
          runId,
        ],
      );

    const run =
      runResult.rows[0];

    if (
      !run
    ) {
      throw new AccountingInputError(
        'Inventory reconciliation run not found.',
      );
    }

    if (
      run.status ===
        'posted' &&
      run.adjustment_journal_id
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        journalId:
          String(
            run.adjustment_journal_id,
          ),
        replayed:
          true,
      };
    }

    if (
      run.status !==
        'draft'
    ) {
      throw new AccountingInputError(
        'Only an unbalanced draft inventory reconciliation can post an adjustment.',
      );
    }

    const settings =
      await settingsForUpdate(
        client,
        context.companyId,
      );

    if (
      !settings ||
      !settings
        .inventory_gain_account_id ||
      !settings
        .inventory_loss_account_id
    ) {
      throw new AccountingInputError(
        'Map Inventory Gain and Inventory Loss accounts before posting a reconciliation adjustment.',
      );
    }

    const linesResult =
      await client.query(
        `
          SELECT
            inventory_asset_account_id::text,
            difference_amount::text
          FROM accounting_inventory_reconciliation_lines
          WHERE company_id =
                $1
            AND run_id =
                $2
            AND deleted_at
                IS NULL
          ORDER BY
            inventory_asset_account_id
          FOR SHARE
        `,
        [
          context.companyId,
          runId,
        ],
      );

    const journalLines:
      Array<{
        accountId:
          string;
        description:
          string;
        debit:
          string;
        credit:
          string;
      }> = [];

    let gains =
      BigInt(
        0,
      );
    let losses =
      BigInt(
        0,
      );

    for (
      const line
      of linesResult.rows
    ) {
      const difference =
        inventoryMoneyCents(
          line.difference_amount,
        );

      if (
        difference ===
          BigInt(
            0,
          )
      ) {
        continue;
      }

      const absolute =
        difference <
          BigInt(
            0,
          )
          ? -difference
          : difference;

      journalLines.push({
        accountId:
          String(
            line.inventory_asset_account_id,
          ),
        description:
          'Inventory valuation reconciliation',
        debit:
          difference >
            BigInt(
              0,
            )
            ? moneyDecimal(
                absolute,
              )
            : '0.00',
        credit:
          difference <
            BigInt(
              0,
            )
            ? moneyDecimal(
                absolute,
              )
            : '0.00',
      });

      if (
        difference >
          BigInt(
            0,
          )
      ) {
        gains +=
          absolute;
      } else {
        losses +=
          absolute;
      }
    }

    if (
      gains >
        BigInt(
          0,
        )
    ) {
      journalLines.push({
        accountId:
          String(
            settings
              .inventory_gain_account_id,
          ),
        description:
          'Inventory valuation reconciliation gain',
        debit:
          '0.00',
        credit:
          moneyDecimal(
            gains,
          ),
      });
    }

    if (
      losses >
        BigInt(
          0,
        )
    ) {
      journalLines.push({
        accountId:
          String(
            settings
              .inventory_loss_account_id,
          ),
        description:
          'Inventory valuation reconciliation loss',
        debit:
          moneyDecimal(
            losses,
          ),
        credit:
          '0.00',
      });
    }

    if (
      journalLines.length <
        2
    ) {
      throw new AccountingInputError(
        'This inventory reconciliation no longer requires an adjustment.',
      );
    }

    const journal =
      await postBalancedLedgerJournal(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          journalDate:
            String(
              run.as_of_date,
            ).slice(
              0,
              10,
            ),
          description:
            'Inventory valuation reconciliation · ' +
            String(
              run.as_of_date,
            ).slice(
              0,
              10,
            ),
          reference:
            'INV-RECON-' +
            runId.slice(
              0,
              8,
            ),
          sourceModule:
            'accounting',
          sourceType:
            'inventory_reconciliation',
          sourceId:
            runId,
          sourceEventKey:
            'accounting:inventory-reconciliation:' +
            runId,
          postingKind:
            'system',
          lines:
            journalLines,
        },
      );

    await client.query(
      `
        UPDATE accounting_inventory_reconciliation_runs
        SET
          status =
            'posted',
          adjustment_journal_id =
            $3,
          posted_by =
            $4,
          posted_at =
            NOW(),
          updated_by =
            $4,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND id =
              $2
      `,
      [
        context.companyId,
        runId,
        journal.journalId,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'reconciliation_posted',
      'accounting_inventory_reconciliation_runs',
      runId,
      'Inventory reconciliation adjustment posted',
      {
        journalId:
          journal.journalId,
        gain:
          moneyDecimal(
            gains,
          ),
        loss:
          moneyDecimal(
            losses,
          ),
      },
    );

    return {
      journalId:
        journal.journalId,
      replayed:
        journal.reused,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}

export async function reverseInventoryReconciliationAdjustment(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_inventory_reconciliation_runs',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );
  const runId =
    accountingId(
      body.runId,
    );
  const reversalDate =
    accountingDate(
      body.reversalDate ||
      today(),
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          SELECT
            id::text,
            status,
            adjustment_journal_id::text,
            reversal_journal_id::text,
            as_of_date::text
          FROM accounting_inventory_reconciliation_runs
          WHERE company_id =
                $1
            AND id =
                $2
            AND deleted_at
                IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [
          context.companyId,
          runId,
        ],
      );

    const run =
      result.rows[0];

    if (
      !run ||
      !run.adjustment_journal_id
    ) {
      throw new AccountingInputError(
        'Only a posted inventory reconciliation adjustment can be reversed.',
      );
    }

    if (
      run.reversal_journal_id
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        journalId:
          String(
            run.reversal_journal_id,
          ),
        replayed:
          true,
      };
    }

    const reversal =
      await reversePostedLedgerJournal(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          originalJournalId:
            String(
              run.adjustment_journal_id,
            ),
          journalDate:
            reversalDate,
          description:
            'Reverse inventory valuation reconciliation · ' +
            String(
              run.as_of_date,
            ).slice(
              0,
              10,
            ),
          sourceModule:
            'accounting',
          sourceType:
            'inventory_reconciliation_reversal',
          sourceId:
            runId,
          sourceEventKey:
            'accounting:inventory-reconciliation-reversal:' +
            runId,
        },
      );

    await client.query(
      `
        UPDATE accounting_inventory_reconciliation_runs
        SET
          status =
            'reversed',
          reversal_journal_id =
            $3,
          reversed_by =
            $4,
          reversed_at =
            NOW(),
          updated_by =
            $4,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND id =
              $2
      `,
      [
        context.companyId,
        runId,
        reversal.journalId,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'reconciliation_reversed',
      'accounting_inventory_reconciliation_runs',
      runId,
      'Inventory reconciliation adjustment reversed',
      {
        journalId:
          reversal.journalId,
        reversalDate,
      },
    );

    return {
      journalId:
        reversal.journalId,
      replayed:
        reversal.reused,
    };
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}
