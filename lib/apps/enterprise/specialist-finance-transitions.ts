import type {
  PoolClient,
} from 'pg';


async function tableExists(
  client:
    PoolClient,
  table:
    string,
) {
  const result =
    await client.query(
      'SELECT to_regclass($1) AS relation',
      [
        'public.' +
        table,
      ],
    );

  return Boolean(
    result.rows[0]
      ?.relation,
  );
}


async function validatePurchaseRequisitionForSubmission(
  client: PoolClient,
  companyId: string,
  requisitionId: string,
) {
  const lines = await client.query(
    `
      SELECT
        id::text,
        quantity::text,
        estimated_unit_cost::text,
        preferred_supplier_id::text
      FROM purchase_requisition_lines
      WHERE company_id = $1
        AND requisition_id = $2
        AND deleted_at IS NULL
      ORDER BY id
      FOR UPDATE
    `,
    [companyId, requisitionId],
  );

  if (lines.rows.length === 0) {
    throw new Error('Add at least one line before submitting a purchase requisition.');
  }

  const supplierIds = new Set<string>();
  for (const line of lines.rows) {
    const quantity = Number(line.quantity);
    const estimatedCost = Number(line.estimated_unit_cost);
    const supplierId = String(line.preferred_supplier_id || '').trim();

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Every requisition line must have a positive requested quantity.');
    }
    if (!Number.isFinite(estimatedCost) || estimatedCost < 0) {
      throw new Error('Every requisition line must have a nonnegative estimated unit cost.');
    }
    if (!supplierId) {
      throw new Error('Assign a preferred supplier to every requisition line before submitting.');
    }
    supplierIds.add(supplierId);
  }

  const suppliers = await client.query(
    `
      SELECT id::text
      FROM suppliers
      WHERE company_id = $1
        AND id = ANY($2::uuid[])
        AND deleted_at IS NULL
        AND LOWER(BTRIM(COALESCE(status, ''))) = 'active'
      ORDER BY id
      FOR SHARE
    `,
    [companyId, Array.from(supplierIds)],
  );

  if (suppliers.rows.length !== supplierIds.size) {
    throw new Error('Every requisition line must reference an active supplier in the current company.');
  }
}

async function approvePurchaseRequisition(
  client: PoolClient,
  companyId: string,
  userId: string,
  requisitionId: string,
) {
  const result = await client.query(
    `
      UPDATE purchase_requisitions
      SET approved_by = $3,
          approved_at = NOW(),
          updated_by = $3,
          updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
        AND status = 'submitted'
        AND deleted_at IS NULL
      RETURNING id
    `,
    [requisitionId, companyId, userId],
  );

  if (result.rows.length !== 1) {
    throw new Error('Only a submitted purchase requisition can be approved.');
  }
}

async function convertPurchaseRequisitionToOrders(
  client: PoolClient,
  companyId: string,
  userId: string,
  requisitionId: string,
) {
  const requisitionResult = await client.query(
    `
      SELECT id::text, requisition_number, needed_by::text, status
      FROM purchase_requisitions
      WHERE id = $1
        AND company_id = $2
        AND deleted_at IS NULL
      FOR UPDATE
    `,
    [requisitionId, companyId],
  );
  const requisition = requisitionResult.rows[0];

  if (!requisition || String(requisition.status || '').toLowerCase() !== 'approved') {
    throw new Error('Only an approved purchase requisition can be converted to purchase orders.');
  }

  const lineResult = await client.query(
    `
      SELECT
        id::text,
        product_reference::text,
        description,
        quantity::text,
        estimated_unit_cost::text,
        preferred_supplier_id::text
      FROM purchase_requisition_lines
      WHERE company_id = $1
        AND requisition_id = $2
        AND deleted_at IS NULL
      ORDER BY preferred_supplier_id, id
      FOR UPDATE
    `,
    [companyId, requisitionId],
  );

  if (lineResult.rows.length === 0) {
    throw new Error('The requisition has no lines to convert.');
  }

  type RequisitionLine = {
    id: string;
    productReference: string | null;
    description: string;
    quantity: string;
    estimatedUnitCost: string;
    supplierId: string;
  };
  const lines: RequisitionLine[] = lineResult.rows.map((row) => ({
    id: String(row.id),
    productReference: row.product_reference ? String(row.product_reference) : null,
    description: String(row.description || '').trim(),
    quantity: String(row.quantity),
    estimatedUnitCost: String(row.estimated_unit_cost),
    supplierId: String(row.preferred_supplier_id || '').trim(),
  }));

  const groups = new Map<string, RequisitionLine[]>();
  for (const line of lines) {
    const quantity = Number(line.quantity);
    const estimatedCost = Number(line.estimatedUnitCost);
    if (!line.supplierId) {
      throw new Error('Assign a preferred supplier to every requisition line before conversion.');
    }
    if (!line.description || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Every requisition line must have a description and a positive requested quantity.');
    }
    if (!Number.isFinite(estimatedCost) || estimatedCost < 0) {
      throw new Error('Every requisition line must have a nonnegative estimated unit cost.');
    }
    const bucket = groups.get(line.supplierId) || [];
    bucket.push(line);
    groups.set(line.supplierId, bucket);
  }

  const supplierIds = Array.from(groups.keys()).sort();
  const activeSuppliers = await client.query(
    `
      SELECT id::text
      FROM suppliers
      WHERE company_id = $1
        AND id = ANY($2::uuid[])
        AND deleted_at IS NULL
        AND LOWER(BTRIM(COALESCE(status, ''))) = 'active'
      ORDER BY id
      FOR SHARE
    `,
    [companyId, supplierIds],
  );
  if (activeSuppliers.rows.length !== supplierIds.length) {
    throw new Error('Every requisition line must reference an active supplier in the current company.');
  }

  const label = String(requisition.requisition_number || 'REQUEST')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 20) || 'REQUEST';
  const requisitionKey = requisitionId.replace(/-/g, '');

  const generatedOrderIds: string[] = [];
  for (const supplierId of supplierIds) {
    const supplierLines = groups.get(supplierId) || [];
    const supplierKey = supplierId.replace(/-/g, '');
    const orderNumber = 'PO-' + label + '-' + requisitionKey + '-' + supplierKey;

    const createdOrder = await client.query(
      `
        INSERT INTO purchase_orders (
          company_id,
          order_number,
          supplier_id,
          order_date,
          expected_date,
          status,
          total_amount,
          requisition_id,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, CURRENT_DATE, $4, 'draft', 0, $5, $6, $6, NOW(), NOW())
        ON CONFLICT (company_id, requisition_id, supplier_id)
          WHERE requisition_id IS NOT NULL AND deleted_at IS NULL
        DO NOTHING
        RETURNING id::text, status
      `,
      [companyId, orderNumber, supplierId, requisition.needed_by || null, requisitionId, userId],
    );

    let purchaseOrderId = createdOrder.rows[0]?.id ? String(createdOrder.rows[0].id) : '';
    let orderStatus = createdOrder.rows[0]?.status ? String(createdOrder.rows[0].status) : '';

    if (!purchaseOrderId) {
      const existingOrder = await client.query(
        `
          SELECT id::text, status
          FROM purchase_orders
          WHERE company_id = $1
            AND requisition_id = $2
            AND supplier_id = $3
            AND deleted_at IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [companyId, requisitionId, supplierId],
      );
      purchaseOrderId = existingOrder.rows[0]?.id ? String(existingOrder.rows[0].id) : '';
      orderStatus = existingOrder.rows[0]?.status ? String(existingOrder.rows[0].status) : '';
    }

    if (!purchaseOrderId || orderStatus !== 'draft') {
      throw new Error('An existing purchase order from this requisition is not an editable draft. Resolve it before retrying conversion.');
    }

    for (const line of supplierLines) {
      const insertedLine = await client.query(
        `
          INSERT INTO purchase_order_items (
            company_id,
            purchase_order_id,
            source_requisition_line_id,
            product_reference,
            description,
            quantity,
            unit_cost,
            line_total,
            created_by,
            updated_by,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            ROUND($6::numeric * $7::numeric, 2),
            $8, $8, NOW(), NOW()
          )
          ON CONFLICT (company_id, source_requisition_line_id)
            WHERE source_requisition_line_id IS NOT NULL AND deleted_at IS NULL
          DO NOTHING
          RETURNING id::text
        `,
        [
          companyId,
          purchaseOrderId,
          line.id,
          line.productReference,
          line.description,
          line.quantity,
          line.estimatedUnitCost,
          userId,
        ],
      );

      if (insertedLine.rows.length === 0) {
        const existingLine = await client.query(
          `
            SELECT purchase_order_id::text
            FROM purchase_order_items
            WHERE company_id = $1
              AND source_requisition_line_id = $2
              AND deleted_at IS NULL
            LIMIT 1
            FOR UPDATE
          `,
          [companyId, line.id],
        );
        if (String(existingLine.rows[0]?.purchase_order_id || '') !== purchaseOrderId) {
          throw new Error('A requisition line is already linked to a different purchase order.');
        }
      }
    }

    const updatedOrder = await client.query(
      `
        UPDATE purchase_orders po
        SET
          total_amount = COALESCE((
            SELECT SUM(item.quantity * item.unit_cost)
            FROM purchase_order_items item
            WHERE item.company_id = po.company_id
              AND item.purchase_order_id = po.id
              AND item.deleted_at IS NULL
          ), 0),
          updated_by = $3,
          updated_at = NOW()
        WHERE po.id = $1
          AND po.company_id = $2
          AND po.status = 'draft'
          AND po.deleted_at IS NULL
        RETURNING id::text
      `,
      [purchaseOrderId, companyId, userId],
    );
    if (updatedOrder.rows.length !== 1) {
      throw new Error('The generated purchase order could not be recalculated.');
    }
    generatedOrderIds.push(purchaseOrderId);
  }
  return generatedOrderIds;
}

export async function postPurchaseReceiptToInventory(
  client:
    PoolClient,
  companyId:
    string,
  userId:
    string,
  receiptId:
    string,
) {
  const requiredInventoryTables = [
    'products',
    'warehouses',
    'stock_movements',
    'stock_levels',
  ];

  for (const table of requiredInventoryTables) {
    if (!(await tableExists(client, table))) {
      throw new Error(
        'Inventory must be installed and ready before this purchase receipt can be posted.',
      );
    }
  }

  const receiptResult = await client.query(
    `
      SELECT
        id::text,
        receipt_number,
        purchase_order_id::text,
        warehouse_reference::text,
        status
      FROM purchase_receipts
      WHERE id = $1
        AND company_id = $2
        AND deleted_at IS NULL
      FOR UPDATE
    `,
    [receiptId, companyId],
  );
  const receipt = receiptResult.rows[0];

  if (!receipt) {
    throw new Error('Purchase receipt was not found in the current company.');
  }

  const receiptStatus = String(receipt.status || '').toLowerCase();
  if (receiptStatus !== 'received' && receiptStatus !== 'inspected') {
    throw new Error('Record and inspect the supplier delivery before posting this receipt.');
  }

  const warehouseId = receipt.warehouse_reference
    ? String(receipt.warehouse_reference)
    : '';
  if (!warehouseId) {
    throw new Error('Choose a warehouse before posting a stock-bearing purchase receipt.');
  }

  const orderResult = await client.query(
    `
      SELECT id::text, status
      FROM purchase_orders
      WHERE id = $1
        AND company_id = $2
        AND deleted_at IS NULL
      FOR UPDATE
    `,
    [String(receipt.purchase_order_id), companyId],
  );
  const order = orderResult.rows[0];

  if (!order) {
    throw new Error('The purchase order linked to this receipt was not found.');
  }
  if (String(order.status || '').toLowerCase() !== 'confirmed') {
    throw new Error('Confirm the purchase order before receiving goods into Inventory.');
  }

  const linesResult = await client.query(
    `
      SELECT
        id::text,
        purchase_order_item_id::text,
        product_reference::text,
        quantity_received::text,
        quantity_rejected::text,
        (quantity_received - quantity_rejected)::text AS accepted_quantity
      FROM purchase_receipt_lines
      WHERE receipt_id = $1
        AND company_id = $2
        AND deleted_at IS NULL
      ORDER BY created_at, id
      FOR UPDATE
    `,
    [receiptId, companyId],
  );

  if (!linesResult.rows.length) {
    throw new Error('Add at least one receipt line before posting this receipt.');
  }

  const seenOrderItems = new Set<string>();
  const stockLines: Array<{ id: string; productId: string; quantity: string }> = [];

  for (const line of linesResult.rows) {
    const lineId = String(line.id);
    const orderItemId = line.purchase_order_item_id
      ? String(line.purchase_order_item_id)
      : '';
    const productId = line.product_reference
      ? String(line.product_reference)
      : '';
    const receivedQuantity = Number(line.quantity_received);
    const rejectedQuantity = Number(line.quantity_rejected);
    const acceptedQuantity = Number(line.accepted_quantity);

    if (
      !orderItemId ||
      !Number.isFinite(receivedQuantity) ||
      receivedQuantity <= 0 ||
      !Number.isFinite(rejectedQuantity) ||
      rejectedQuantity < 0 ||
      rejectedQuantity > receivedQuantity ||
      !Number.isFinite(acceptedQuantity) ||
      acceptedQuantity < 0
    ) {
      throw new Error('Every receipt line must contain a valid purchase-order line and nonnegative quantities.');
    }

    if (seenOrderItems.has(orderItemId)) {
      throw new Error('A purchase-order line can appear only once on a receipt.');
    }
    seenOrderItems.add(orderItemId);

    const orderItemResult = await client.query(
      `
        SELECT id::text, product_reference::text, quantity::text
        FROM purchase_order_items
        WHERE id = $1
          AND company_id = $2
          AND purchase_order_id = $3
          AND deleted_at IS NULL
        FOR UPDATE
      `,
      [orderItemId, companyId, String(receipt.purchase_order_id)],
    );
    const orderItem = orderItemResult.rows[0];

    if (!orderItem) {
      throw new Error('A receipt line references a purchase-order item outside this order or company.');
    }

    const orderProductId = orderItem.product_reference
      ? String(orderItem.product_reference)
      : '';
    if (!productId || !orderProductId || productId !== orderProductId) {
      throw new Error('Link each purchase-order line and receipt line to the same Inventory product before posting.');
    }

    const orderedQuantity = Number(orderItem.quantity);
    if (!Number.isFinite(orderedQuantity) || orderedQuantity <= 0) {
      throw new Error('A purchase-order line must have a positive ordered quantity before receipt.');
    }

    const previouslyAccepted = await client.query(
      `
        SELECT COALESCE(
          SUM(receipt_line.quantity_received - receipt_line.quantity_rejected),
          0
        )::text AS accepted_quantity
        FROM purchase_receipt_lines receipt_line
        INNER JOIN purchase_receipts prior_receipt
          ON prior_receipt.id = receipt_line.receipt_id
         AND prior_receipt.company_id = receipt_line.company_id
         AND prior_receipt.deleted_at IS NULL
        WHERE receipt_line.company_id = $1
          AND receipt_line.purchase_order_item_id = $2
          AND receipt_line.deleted_at IS NULL
          AND prior_receipt.status = 'posted'
      `,
      [companyId, orderItemId],
    );
    const priorQuantity = Number(previouslyAccepted.rows[0]?.accepted_quantity || 0);

    if (
      acceptedQuantity + priorQuantity >
      orderedQuantity + 0.0000001
    ) {
      throw new Error('The accepted receipt quantity would exceed the remaining quantity on the purchase order.');
    }

    if (acceptedQuantity > 0) {
      const validProductAndWarehouse = await client.query(
        `
          SELECT product.id
          FROM products product
          INNER JOIN warehouses warehouse
            ON warehouse.id = $3
           AND warehouse.company_id = $1
           AND warehouse.deleted_at IS NULL
           AND warehouse.is_active = TRUE
          WHERE product.id = $2
            AND product.company_id = $1
            AND product.deleted_at IS NULL
            AND product.is_active = TRUE
            AND product.track_inventory = TRUE
            AND product.product_type = 'stockable'
          FOR SHARE OF product, warehouse
        `,
        [companyId, productId, warehouseId],
      );
      if (validProductAndWarehouse.rows.length !== 1) {
        throw new Error('Every accepted receipt line must use an active stock-tracked product and warehouse in the current company.');
      }

      stockLines.push({
        id: lineId,
        productId,
        quantity: String(line.accepted_quantity),
      });
    }
  }

  for (const line of stockLines) {
    const movementReference = 'purchase_receipt:' + receiptId + ':' + line.id;
    const existingResult = await client.query(
      `
        SELECT
          id::text,
          product_id::text,
          warehouse_id::text,
          movement_type,
          quantity::text
        FROM stock_movements
        WHERE company_id = $1
          AND reference = $2
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [companyId, movementReference],
    );
    const existing = existingResult.rows[0];

    if (existing) {
      const sameMovement =
        String(existing.product_id) === line.productId &&
        String(existing.warehouse_id) === warehouseId &&
        ['receipt', 'purchase_receipt'].includes(String(existing.movement_type)) &&
        Math.abs(Number(existing.quantity) - Number(line.quantity)) <= 0.0000001;

      if (!sameMovement) {
        throw new Error('An existing Inventory movement conflicts with this purchase receipt line. Contact an administrator.');
      }
      continue;
    }

    await client.query(
      `
        INSERT INTO stock_movements (
          product_id,
          warehouse_id,
          movement_type,
          quantity,
          reference,
          company_id,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, 'purchase_receipt', $3, $4, $5, $6, $6, NOW(), NOW()
        )
      `,
      [line.productId, warehouseId, line.quantity, movementReference, companyId, userId],
    );

    const balance = await client.query(
      `
        INSERT INTO stock_levels (
          product_id,
          warehouse_id,
          quantity,
          reorder_level,
          company_id,
          created_by,
          updated_by,
          updated_at
        )
        VALUES ($1, $2, $3, 0, $4, $5, $5, NOW())
        ON CONFLICT (product_id, warehouse_id)
        DO UPDATE SET
          quantity = stock_levels.quantity + EXCLUDED.quantity,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        WHERE stock_levels.company_id = EXCLUDED.company_id
          AND stock_levels.deleted_at IS NULL
        RETURNING id
      `,
      [line.productId, warehouseId, line.quantity, companyId, userId],
    );

    if (balance.rows.length !== 1) {
      throw new Error('The stock balance is unavailable in this company or requires administrator review.');
    }
  }

  const orderTotals = await client.query(
    `
      SELECT
        item.id::text,
        item.quantity::text AS ordered_quantity,
        COALESCE(
          SUM(receipt_line.quantity_received - receipt_line.quantity_rejected)
            FILTER (
              WHERE prior_receipt.status = 'posted'
                 OR prior_receipt.id = $3
            ),
          0
        )::text AS accepted_quantity
      FROM purchase_order_items item
      LEFT JOIN purchase_receipt_lines receipt_line
        ON receipt_line.purchase_order_item_id = item.id
       AND receipt_line.company_id = item.company_id
       AND receipt_line.deleted_at IS NULL
      LEFT JOIN purchase_receipts prior_receipt
        ON prior_receipt.id = receipt_line.receipt_id
       AND prior_receipt.company_id = receipt_line.company_id
       AND prior_receipt.deleted_at IS NULL
      WHERE item.company_id = $1
        AND item.purchase_order_id = $2
        AND item.deleted_at IS NULL
      GROUP BY item.id
      ORDER BY item.id
    `,
    [companyId, String(receipt.purchase_order_id), receiptId],
  );

  const fullyReceived =
    orderTotals.rows.length > 0 &&
    orderTotals.rows.every((row) => {
      const ordered = Number(row.ordered_quantity);
      const accepted = Number(row.accepted_quantity);
      return Number.isFinite(ordered) &&
        ordered > 0 &&
        Number.isFinite(accepted) &&
        accepted + 0.0000001 >= ordered;
    });

  if (fullyReceived) {
    await client.query(
      `
        UPDATE purchase_orders
        SET status = 'received',
            updated_by = $3,
            updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND status = 'confirmed'
          AND deleted_at IS NULL
      `,
      [String(receipt.purchase_order_id), companyId, userId],
    );
  }
}

async function reimburseExpenseReport(
  client:
    PoolClient,
  companyId:
    string,
  reportId:
    string,
) {
  const accountingEnabled =
    await tableExists(
      client,
      'accounting_expense_report_postings',
    );

  if (
    accountingEnabled
  ) {
    const financial =
      await client.query(
        `
          SELECT
            p.status,
            p.settlement_mode,
            COALESCE(
              b.outstanding_amount,
              0
            )::text AS outstanding_amount
          FROM accounting_expense_report_postings p
          LEFT JOIN accounting_expense_reimbursement_balances b
            ON b.company_id =
               p.company_id
           AND b.expense_report_id =
               p.expense_report_id
          WHERE p.company_id =
                $1
            AND p.expense_report_id =
                $2
            AND p.deleted_at
                IS NULL
          LIMIT 1
          FOR SHARE OF p
        `,
        [
          companyId,
          reportId,
        ],
      );

    const posting =
      financial.rows[0];

    if (
      !posting ||
      String(
        posting.status ||
        '',
      ) !==
        'posted'
    ) {
      throw new Error(
        'Post this approved expense report through Accounting before marking it reimbursed.',
      );
    }

    if (
      String(
        posting.settlement_mode ||
        '',
      ) ===
        'employee_reimbursement' &&
      Number(
        posting.outstanding_amount ||
        0,
      ) >
        0.000001
    ) {
      throw new Error(
        'This expense report still has an outstanding employee reimbursement in Accounting.',
      );
    }
  }

  await client.query(
    `
      UPDATE expenses e
      SET
        status = 'paid',
        updated_at = NOW()
      WHERE e.company_id = $1
        AND e.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM expense_report_lines l
          WHERE l.report_id = $2
            AND l.expense_id = e.id
            AND l.company_id = e.company_id
            AND l.deleted_at IS NULL
        )
    `,
    [
      companyId,
      reportId,
    ],
  );
}


async function applySubscriptionChange(
  client:
    PoolClient,
  companyId:
    string,
  changeId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          subscription_id,
          change_type,
          to_plan_id,
          effective_date
        FROM subscription_changes
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        FOR UPDATE
      `,
      [
        changeId,
        companyId,
      ],
    );

  const change =
    result.rows[0];

  if (
    !change
  ) {
    throw new Error(
      'Subscription change was not found.',
    );
  }

  const type =
    String(
      change.change_type ||
      '',
    )
      .trim()
      .toLowerCase();

  if (
    (
      type ===
        'upgrade' ||
      type ===
        'downgrade'
    ) &&
    !change.to_plan_id
  ) {
    throw new Error(
      'Choose the target plan before applying this subscription change.',
    );
  }

  if (
    type ===
      'upgrade' ||
    type ===
      'downgrade'
  ) {
    await client.query(
      `
        UPDATE subscriptions
        SET
          plan_id = $1,
          status = 'active'
        WHERE id = $2
          AND company_id = $3
          AND deleted_at IS NULL
      `,
      [
        change.to_plan_id,
        change.subscription_id,
        companyId,
      ],
    );
    return;
  }

  if (
    type ===
      'pause'
  ) {
    await client.query(
      `
        UPDATE subscriptions
        SET status = 'paused'
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        change.subscription_id,
        companyId,
      ],
    );
    return;
  }

  if (
    type ===
      'cancel'
  ) {
    await client.query(
      `
        UPDATE subscriptions
        SET
          status = 'cancelled',
          end_date =
            COALESCE(
              end_date,
              $1
            )
        WHERE id = $2
          AND company_id = $3
          AND deleted_at IS NULL
      `,
      [
        change.effective_date,
        change.subscription_id,
        companyId,
      ],
    );
    return;
  }

  if (
    type ===
      'resume' ||
    type ===
      'renew'
  ) {
    await client.query(
      `
        UPDATE subscriptions
        SET
          status = 'active',
          end_date =
            CASE
              WHEN $1 = 'renew'
                THEN NULL
              ELSE end_date
            END
        WHERE id = $2
          AND company_id = $3
          AND deleted_at IS NULL
      `,
      [
        type,
        change.subscription_id,
        companyId,
      ],
    );
  }
}


async function completeRefund(
  client:
    PoolClient,
  companyId:
    string,
  userId:
    string,
  refundId:
    string,
) {
  const refund =
    await client.query(
      `
        SELECT
          r.id,
          r.amount,
          r.refund_reference,
          p.payment_account_id,
          p.currency,
          p.counterparty_name
        FROM payment_refunds r
        INNER JOIN business_payments p
          ON p.id = r.payment_id
         AND p.company_id = r.company_id
         AND p.deleted_at IS NULL
        WHERE r.id = $1
          AND r.company_id = $2
          AND r.deleted_at IS NULL
        FOR UPDATE
      `,
      [
        refundId,
        companyId,
      ],
    );

  const row =
    refund.rows[0];

  if (
    !row
  ) {
    throw new Error(
      'Refund payment was not found.',
    );
  }

  const reference =
    'refund:' +
    refundId;

  await client.query(
    `
      INSERT INTO business_payments (
        payment_account_id,
        direction,
        amount,
        currency,
        paid_at,
        external_reference,
        counterparty_name,
        status,
        company_id,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      SELECT
        $1,
        'outbound',
        $2,
        $3,
        NOW(),
        $4,
        $5,
        'completed',
        $6,
        $7,
        $7,
        NOW(),
        NOW()
      WHERE NOT EXISTS (
        SELECT 1
        FROM business_payments
        WHERE company_id = $6
          AND external_reference = $4
          AND deleted_at IS NULL
      )
    `,
    [
      row.payment_account_id,
      row.amount,
      row.currency,
      reference,
      row.counterparty_name,
      companyId,
      userId,
    ],
  );
}


async function closeCommissionEntries(
  client:
    PoolClient,
  companyId:
    string,
  payoutId:
    string,
) {
  await client.query(
    `
      UPDATE commission_entries e
      SET
        status = 'paid',
        updated_at = NOW()
      WHERE e.company_id = $1
        AND e.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM commission_payout_lines l
          WHERE l.payout_id = $2
            AND l.commission_entry_id = e.id
            AND l.company_id = e.company_id
            AND l.deleted_at IS NULL
        )
    `,
    [
      companyId,
      payoutId,
    ],
  );
}


async function approveBudget(
  client:
    PoolClient,
  companyId:
    string,
  approvalId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          budget_id,
          approver_user_id
        FROM budget_approvals
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        FOR UPDATE
      `,
      [
        approvalId,
        companyId,
      ],
    );

  const row =
    result.rows[0];

  if (
    !row
  ) {
    return;
  }

  await client.query(
    `
      UPDATE budgets
      SET
        approved_at = NOW(),
        approved_by =
          COALESCE(
            $1,
            approved_by
          ),
        status = 'active',
        updated_at = NOW()
      WHERE id = $2
        AND company_id = $3
        AND deleted_at IS NULL
    `,
    [
      row.approver_user_id,
      row.budget_id,
      companyId,
    ],
  );
}


export async function applyFinanceSpecialistTransition(
  client:
    PoolClient,
  input: {
    moduleKey: string;
    table: string;
    companyId: string;
    userId: string;
    recordId: string;
    nextStatus: string;
  },
) {
  const {
    moduleKey,
    table,
    companyId,
    userId,
    recordId,
    nextStatus,
  } =
    input;

  if (
    moduleKey ===
      'purchase' &&
    table ===
      'purchase_requisitions' &&
    nextStatus ===
      'submitted'
  ) {
    await validatePurchaseRequisitionForSubmission(client, companyId, recordId);
  }

  if (
    moduleKey ===
      'purchase' &&
    table ===
      'purchase_requisitions' &&
    nextStatus ===
      'approved'
  ) {
    await approvePurchaseRequisition(client, companyId, userId, recordId);
  }

  if (
    moduleKey ===
      'purchase' &&
    table ===
      'purchase_requisitions' &&
    nextStatus ===
      'converted'
  ) {
    await convertPurchaseRequisitionToOrders(client, companyId, userId, recordId);
  }

  if (
    moduleKey ===
      'purchase' &&
    table ===
      'purchase_receipts' &&
    nextStatus ===
      'posted'
  ) {
    await postPurchaseReceiptToInventory(
      client,
      companyId,
      userId,
      recordId,
    );
  }

  if (
    moduleKey ===
      'expenses' &&
    table ===
      'expense_reports' &&
    nextStatus ===
      'reimbursed'
  ) {
    await reimburseExpenseReport(
      client,
      companyId,
      recordId,
    );
  }

  if (
    moduleKey ===
      'subscriptions' &&
    table ===
      'subscription_changes' &&
    nextStatus ===
      'applied'
  ) {
    await applySubscriptionChange(
      client,
      companyId,
      recordId,
    );
  }

  if (
    moduleKey ===
      'payments' &&
    table ===
      'payment_refunds' &&
    nextStatus ===
      'completed'
  ) {
    await completeRefund(
      client,
      companyId,
      userId,
      recordId,
    );
  }

  if (
    moduleKey ===
      'commissions' &&
    table ===
      'commission_payouts' &&
    nextStatus ===
      'paid'
  ) {
    await closeCommissionEntries(
      client,
      companyId,
      recordId,
    );
  }

  if (
    moduleKey ===
      'budgeting' &&
    table ===
      'budget_approvals' &&
    nextStatus ===
      'approved'
  ) {
    await approveBudget(
      client,
      companyId,
      recordId,
    );
  }
}
