import 'server-only';

import type {
  PoolClient,
} from 'pg';


type MutationOperation =
  | 'create'
  | 'update'
  | 'delete';


function textValue(
  value:
    unknown,
) {
  return String(
    value ??
    '',
  ).trim();
}


function numberValue(
  value:
    unknown,
) {
  const valueNumber =
    Number(
      value ??
      0,
    );

  return Number.isFinite(
    valueNumber,
  )
    ? valueNumber
    : 0;
}


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


const APPEND_ONLY =
  new Set([
    'signature_audit_events',
    'signature_completion_certificates',
    'shop_inventory_postings',
    'restaurant_inventory_postings',
    'spreadsheet_snapshots',
    'spreadsheet_refresh_runs',
  ]);


export function assertProductSpecialistMutationAllowed(
  moduleKey:
    string,
  table:
    string,
  operation:
    MutationOperation,
  row:
    Record<string, unknown>,
) {
  if (
    operation !==
      'create' &&
    APPEND_ONLY.has(
      table,
    )
  ) {
    throw new Error(
      'This product evidence record is append-only. Create a compensating record instead of rewriting history.',
    );
  }

  if (
    moduleKey ===
      'documents' &&
    table ===
      'document_share_links'
  ) {
    const expiresAt =
      row.expires_at
        ? new Date(
            String(
              row.expires_at,
            ),
          )
        : null;

    if (
      expiresAt &&
      Number.isNaN(
        expiresAt.getTime(),
      )
    ) {
      throw new Error(
        'Document share expiry is invalid.',
      );
    }
  }

  if (
    moduleKey ===
      'sign' &&
    table ===
      'signature_fields'
  ) {
    for (
      const [
        key,
        label,
      ]
      of [
        [
          'width',
          'Signature field width',
        ],
        [
          'height',
          'Signature field height',
        ],
      ] as const
    ) {
      if (
        numberValue(
          row[
            key
          ],
        ) <=
          0
      ) {
        throw new Error(
          label +
          ' must be greater than zero.',
        );
      }
    }
  }
}


async function mirrorPayment(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    paymentId:
      string;
    resourceType:
      string;
    resourceId:
      string;
    amount:
      number;
    currency:
      string;
    paidAt:
      unknown;
    providerReference:
      unknown;
    counterpartyName?:
      unknown;
  },
) {
  if (
    !await tableExists(
      client,
      'business_payments',
    )
  ) {
    return;
  }

  const externalReference =
    textValue(
      input
        .providerReference,
    ) ||
    input.resourceType +
    ':' +
    input.paymentId;

  const existing =
    await client.query(
      `
        SELECT id
        FROM business_payments
        WHERE company_id = $1
          AND external_reference = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.companyId,
        externalReference,
      ],
    );

  let businessPaymentId =
    existing.rows[0]
      ?.id
      ? String(
          existing.rows[0]
            .id,
        )
      : '';

  if (
    !businessPaymentId
  ) {
    const inserted =
      await client.query(
        `
          INSERT INTO business_payments (
            company_id,
            direction,
            amount,
            currency,
            paid_at,
            external_reference,
            counterparty_name,
            status,
            created_by,
            updated_by,
            metadata
          )
          VALUES (
            $1,'inbound',$2,$3,
            COALESCE($4,NOW()),
            $5,$6,'active',$7,$7,
            jsonb_build_object(
              'source',
              $8::text,
              'source_payment_id',
              $9::text
            )
          )
          RETURNING id
        `,
        [
          input.companyId,
          input.amount,
          input.currency,
          input.paidAt ||
            null,
          externalReference,
          textValue(
            input
              .counterpartyName,
          ) ||
            null,
          input.userId,
          input.resourceType,
          input.paymentId,
        ],
      );

    businessPaymentId =
      String(
        inserted.rows[0]
          .id,
      );
  }

  if (
    await tableExists(
      client,
      'payment_allocations',
    )
  ) {
    const allocation =
      await client.query(
        `
          SELECT 1
          FROM payment_allocations
          WHERE company_id = $1
            AND payment_id = $2
            AND resource_type = $3
            AND resource_id = $4
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          input.companyId,
          businessPaymentId,
          input.resourceType,
          input.resourceId,
        ],
      );

    if (
      allocation.rows.length ===
        0
    ) {
      await client.query(
        `
          INSERT INTO payment_allocations (
            company_id,
            payment_id,
            resource_type,
            resource_id,
            amount,
            status,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,
            'active',$6,$6
          )
        `,
        [
          input.companyId,
          businessPaymentId,
          input.resourceType,
          input.resourceId,
          input.amount,
          input.userId,
        ],
      );
    }
  }
}


async function capturedTotal(
  client:
    PoolClient,
  input: {
    table:
      'shop_payments' |
      'restaurant_payments';
    orderId:
      string;
    companyId:
      string;
  },
) {
  const result =
    await client.query(
      `
        SELECT
          COALESCE(
            SUM(amount),
            0
          ) AS total
        FROM ${input.table}
        WHERE order_id = $1
          AND company_id = $2
          AND status = 'captured'
          AND deleted_at IS NULL
      `,
      [
        input.orderId,
        input.companyId,
      ],
    );

  return numberValue(
    result.rows[0]
      ?.total,
  );
}


async function postPosInventory(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    orderId:
      string;
    orderTable:
      'shop_orders' |
      'restaurant_orders';
    itemTable:
      'shop_order_items' |
      'restaurant_order_items';
    catalogTable:
      'shop_products' |
      'menu_items';
    itemForeignKey:
      'product_id' |
      'menu_item_id';
    postingTable:
      'shop_inventory_postings' |
      'restaurant_inventory_postings';
    movementType:
      'pos_shop_sale' |
      'pos_restaurant_sale';
  },
) {
  if (
    !await tableExists(
      client,
      'stock_levels',
    ) ||
    !await tableExists(
      client,
      'stock_movements',
    )
  ) {
    return;
  }

  const posted =
    await client.query(
      `
        SELECT 1
        FROM ${input.postingTable}
        WHERE company_id = $1
          AND order_id = $2
          AND status = 'posted'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.companyId,
        input.orderId,
      ],
    );

  if (
    posted.rows.length >
      0
  ) {
    return;
  }

  const order =
    await client.query(
      `
        SELECT inventory_warehouse_id
        FROM ${input.orderTable}
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        FOR UPDATE
      `,
      [
        input.orderId,
        input.companyId,
      ],
    );

  if (
    order.rows.length !==
      1
  ) {
    throw new Error(
      'POS order was not found in the current company.',
    );
  }

  const items =
    await client.query(
      `
        SELECT
          i.id,
          i.quantity,
          c.inventory_product_id
        FROM ${input.itemTable} i
        JOIN ${input.catalogTable} c
          ON c.id =
             i.${input.itemForeignKey}
         AND c.company_id =
             i.company_id
         AND c.deleted_at IS NULL
        WHERE i.order_id = $1
          AND i.company_id = $2
          AND i.deleted_at IS NULL
          AND c.inventory_product_id IS NOT NULL
      `,
      [
        input.orderId,
        input.companyId,
      ],
    );

  if (
    items.rows.length ===
      0
  ) {
    return;
  }

  const warehouseId =
    textValue(
      order.rows[0]
        .inventory_warehouse_id,
    );

  if (
    !warehouseId
  ) {
    throw new Error(
      'Choose an inventory warehouse before completing a stock-tracked POS order.',
    );
  }

  for (
    const item
    of items.rows
  ) {
    const quantity =
      numberValue(
        item.quantity,
      );

    const stock =
      await client.query(
        `
          SELECT id,quantity
          FROM stock_levels
          WHERE company_id = $1
            AND product_id = $2
            AND warehouse_id = $3
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          input.companyId,
          item.inventory_product_id,
          warehouseId,
        ],
      );

    if (
      stock.rows.length !==
        1 ||
      numberValue(
        stock.rows[0]
          .quantity,
      ) <
        quantity
    ) {
      throw new Error(
        'Insufficient inventory to complete this POS order.',
      );
    }

    await client.query(
      `
        UPDATE stock_levels
        SET
          quantity =
            quantity -
            $4,
          updated_by = $5,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND warehouse_id = $3
          AND deleted_at IS NULL
      `,
      [
        stock.rows[0]
          .id,
        input.companyId,
        warehouseId,
        quantity,
        input.userId,
      ],
    );

    await client.query(
      `
        INSERT INTO stock_movements (
          company_id,
          product_id,
          warehouse_id,
          movement_type,
          quantity,
          reference,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$7
        )
      `,
      [
        input.companyId,
        item.inventory_product_id,
        warehouseId,
        input.movementType,
        quantity,
        input.movementType +
        ':' +
        input.orderId,
        input.userId,
      ],
    );
  }

  await client.query(
    `
      INSERT INTO ${input.postingTable} (
        company_id,
        order_id,
        warehouse_id,
        status,
        created_by,
        updated_by
      )
      VALUES (
        $1,$2,$3,'posted',$4,$4
      )
    `,
    [
      input.companyId,
      input.orderId,
      warehouseId,
      input.userId,
    ],
  );
}


async function issueSignatureCertificate(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    requestId:
      string;
  },
) {
  const unsigned =
    await client.query(
      `
        SELECT COUNT(*)::int AS count
        FROM signers
        WHERE request_id = $1
          AND company_id = $2
          AND status <> 'signed'
          AND deleted_at IS NULL
      `,
      [
        input.requestId,
        input.companyId,
      ],
    );

  if (
    Number(
      unsigned.rows[0]
        ?.count ||
      0,
    ) >
      0
  ) {
    throw new Error(
      'Every signer must sign before the request can be completed.',
    );
  }

  const incompleteFields =
    await client.query(
      `
        SELECT COUNT(*)::int AS count
        FROM signature_fields
        WHERE signature_request_id = $1
          AND company_id = $2
          AND required = TRUE
          AND status <> 'completed'
          AND deleted_at IS NULL
      `,
      [
        input.requestId,
        input.companyId,
      ],
    );

  if (
    Number(
      incompleteFields.rows[0]
        ?.count ||
      0,
    ) >
      0
  ) {
    throw new Error(
      'Every required signature field must be completed before issuing a completion certificate.',
    );
  }

  const evidence =
    await client.query(
      `
        SELECT
          id,
          name,
          email,
          signing_order,
          signed_at
        FROM signers
        WHERE request_id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        ORDER BY signing_order,id
      `,
      [
        input.requestId,
        input.companyId,
      ],
    );

  const existing =
    await client.query(
      `
        SELECT 1
        FROM signature_completion_certificates
        WHERE signature_request_id = $1
          AND company_id = $2
          AND status = 'issued'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.requestId,
        input.companyId,
      ],
    );

  if (
    existing.rows.length ===
      0
  ) {
    await client.query(
      `
        INSERT INTO signature_completion_certificates (
          company_id,
          signature_request_id,
          certificate_reference,
          evidence_hash,
          completed_at,
          signer_evidence,
          status,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,
          gen_random_uuid()::text,
          encode(
            digest(
              $2::text ||
              $3::text,
              'sha256'
            ),
            'hex'
          ),
          NOW(),
          $3::jsonb,
          'issued',
          $4,$4
        )
      `,
      [
        input.companyId,
        input.requestId,
        JSON.stringify(
          evidence.rows,
        ),
        input.userId,
      ],
    );
  }

  await client.query(
    `
      UPDATE signature_requests
      SET
        status = 'completed',
        completed_at =
          COALESCE(
            completed_at,
            NOW()
          ),
        updated_by = $3,
        updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
        AND deleted_at IS NULL
    `,
    [
      input.requestId,
      input.companyId,
      input.userId,
    ],
  );
}


export async function applyProductSpecialistRecordSideEffects(
  client:
    PoolClient,
  input: {
    moduleKey:
      string;
    table:
      string;
    companyId:
      string;
    userId:
      string;
    operation:
      MutationOperation;
    row:
      Record<string, unknown>;
  },
) {
  const {
    moduleKey,
    table,
    companyId,
    userId,
    operation,
    row,
  } =
    input;

  if (
    moduleKey ===
      'pos_shop' &&
    table ===
      'shop_payments' &&
    operation !==
      'delete' &&
    textValue(
      row.status,
    ) ===
      'captured'
  ) {
    await mirrorPayment(
      client,
      {
        companyId,
        userId,
        paymentId:
          textValue(
            row.id,
          ),
        resourceType:
          'pos_shop_order',
        resourceId:
          textValue(
            row.order_id,
          ),
        amount:
          numberValue(
            row.amount,
          ),
        currency:
          textValue(
            row.currency,
          ) ||
          'KES',
        paidAt:
          row.paid_at,
        providerReference:
          row.provider_reference,
      },
    );
  }

  if (
    moduleKey ===
      'pos_restaurant' &&
    table ===
      'restaurant_payments' &&
    operation !==
      'delete' &&
    textValue(
      row.status,
    ) ===
      'captured'
  ) {
    await mirrorPayment(
      client,
      {
        companyId,
        userId,
        paymentId:
          textValue(
            row.id,
          ),
        resourceType:
          'pos_restaurant_order',
        resourceId:
          textValue(
            row.order_id,
          ),
        amount:
          numberValue(
            row.amount,
          ),
        currency:
          textValue(
            row.currency,
          ) ||
          'KES',
        paidAt:
          row.paid_at,
        providerReference:
          row.provider_reference,
      },
    );
  }

  if (
    moduleKey ===
      'appointments' &&
    table ===
      'appointment_resource_assignments' &&
    operation ===
      'create'
  ) {
    const appointment =
      await client.query(
        `
          SELECT start_at,end_at
          FROM appointments
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          row.appointment_id,
          companyId,
        ],
      );

    const resource =
      await client.query(
        `
          SELECT capacity
          FROM appointment_resources
          WHERE id = $1
            AND company_id = $2
            AND status = 'active'
            AND deleted_at IS NULL
        `,
        [
          row.resource_id,
          companyId,
        ],
      );

    if (
      appointment.rows.length !==
        1 ||
      resource.rows.length !==
        1
    ) {
      throw new Error(
        'Appointment resource assignment must reference an active resource and appointment in the current company.',
      );
    }

    const overlaps =
      await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM appointment_resource_assignments a
          JOIN appointments ap
            ON ap.id = a.appointment_id
           AND ap.company_id = a.company_id
           AND ap.deleted_at IS NULL
          WHERE a.company_id = $1
            AND a.resource_id = $2
            AND a.status = 'reserved'
            AND a.deleted_at IS NULL
            AND a.id <> $3
            AND tstzrange(
                  ap.start_at,
                  COALESCE(
                    ap.end_at,
                    ap.start_at +
                    INTERVAL '30 minutes'
                  ),
                  '[)'
                ) &&
                tstzrange(
                  $4,
                  COALESCE(
                    $5,
                    $4 +
                    INTERVAL '30 minutes'
                  ),
                  '[)'
                )
        `,
        [
          companyId,
          row.resource_id,
          row.id,
          appointment.rows[0]
            .start_at,
          appointment.rows[0]
            .end_at,
        ],
      );

    if (
      Number(
        overlaps.rows[0]
          ?.count ||
        0,
      ) >=
        Number(
          resource.rows[0]
            .capacity ||
          1,
        )
    ) {
      throw new Error(
        'This appointment resource has reached its capacity for the selected time.',
      );
    }
  }

  if (
    moduleKey ===
      'appointments' &&
    table ===
      'appointment_answers' &&
    operation !==
      'delete'
  ) {
    const relation =
      await client.query(
        `
          SELECT
            a.service_id AS appointment_service_id,
            q.service_id AS question_service_id
          FROM appointments a
          JOIN appointment_questions q
            ON q.id = $3
           AND q.company_id = a.company_id
           AND q.deleted_at IS NULL
          WHERE a.id = $1
            AND a.company_id = $2
            AND a.deleted_at IS NULL
        `,
        [
          row.appointment_id,
          companyId,
          row.question_id,
        ],
      );

    if (
      relation.rows.length !==
        1 ||
      (
        relation.rows[0]
          .question_service_id &&
        String(
          relation.rows[0]
            .question_service_id,
        ) !==
          String(
            relation.rows[0]
              .appointment_service_id,
          )
      )
    ) {
      throw new Error(
        'Appointment answer must belong to a question for the selected service.',
      );
    }
  }

  if (
    moduleKey ===
      'surveys' &&
    table ===
      'survey_answers' &&
    operation !==
      'delete'
  ) {
    const valid =
      await client.query(
        `
          SELECT 1
          FROM survey_responses r
          JOIN survey_questions q
            ON q.id = $3
           AND q.company_id = r.company_id
           AND q.deleted_at IS NULL
          WHERE r.id = $1
            AND r.company_id = $2
            AND r.survey_id = q.survey_id
            AND r.deleted_at IS NULL
          LIMIT 1
        `,
        [
          row.response_id,
          companyId,
          row.question_id,
        ],
      );

    if (
      valid.rows.length !==
        1
    ) {
      throw new Error(
        'Survey answer question must belong to the response survey.',
      );
    }
  }
}


export async function applyProductSpecialistTransition(
  client:
    PoolClient,
  input: {
    moduleKey:
      string;
    table:
      string;
    companyId:
      string;
    userId:
      string;
    recordId:
      string;
    nextStatus:
      string;
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
      'pos_shop' &&
    table ===
      'shop_orders' &&
    [
      'paid',
      'completed',
    ].includes(
      nextStatus,
    )
  ) {
    const order =
      await client.query(
        `
          SELECT total_amount
          FROM shop_orders
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          recordId,
          companyId,
        ],
      );

    const paid =
      await capturedTotal(
        client,
        {
          table:
            'shop_payments',
          orderId:
            recordId,
          companyId,
        },
      );

    if (
      paid <
        numberValue(
          order.rows[0]
            ?.total_amount,
        )
    ) {
      throw new Error(
        'Capture the full POS payment before marking this order paid or complete.',
      );
    }

    await postPosInventory(
      client,
      {
        companyId,
        userId,
        orderId:
          recordId,
        orderTable:
          'shop_orders',
        itemTable:
          'shop_order_items',
        catalogTable:
          'shop_products',
        itemForeignKey:
          'product_id',
        postingTable:
          'shop_inventory_postings',
        movementType:
          'pos_shop_sale',
      },
    );
  }

  if (
    moduleKey ===
      'pos_restaurant' &&
    table ===
      'restaurant_orders' &&
    nextStatus ===
      'completed'
  ) {
    const order =
      await client.query(
        `
          SELECT total_amount
          FROM restaurant_orders
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          recordId,
          companyId,
        ],
      );

    const paid =
      await capturedTotal(
        client,
        {
          table:
            'restaurant_payments',
          orderId:
            recordId,
          companyId,
        },
      );

    if (
      paid <
        numberValue(
          order.rows[0]
            ?.total_amount,
        )
    ) {
      throw new Error(
        'Capture the full restaurant payment before completing the order.',
      );
    }

    const kitchen =
      await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM restaurant_kitchen_tickets
          WHERE order_id = $1
            AND company_id = $2
            AND status NOT IN (
              'served',
              'cancelled'
            )
            AND deleted_at IS NULL
        `,
        [
          recordId,
          companyId,
        ],
      );

    if (
      Number(
        kitchen.rows[0]
          ?.count ||
        0,
      ) >
        0
    ) {
      throw new Error(
        'Serve or cancel every kitchen ticket before completing the restaurant order.',
      );
    }

    await postPosInventory(
      client,
      {
        companyId,
        userId,
        orderId:
          recordId,
        orderTable:
          'restaurant_orders',
        itemTable:
          'restaurant_order_items',
        catalogTable:
          'menu_items',
        itemForeignKey:
          'menu_item_id',
        postingTable:
          'restaurant_inventory_postings',
        movementType:
          'pos_restaurant_sale',
      },
    );
  }

  if (
    moduleKey ===
      'sign' &&
    table ===
      'signature_requests' &&
    nextStatus ===
      'sent'
  ) {
    const signers =
      await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM signers
          WHERE request_id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          recordId,
          companyId,
        ],
      );

    if (
      Number(
        signers.rows[0]
          ?.count ||
        0,
      ) <
        1
    ) {
      throw new Error(
        'Add at least one signer before sending a signature request.',
      );
    }

    await client.query(
      `
        UPDATE signature_requests
        SET
          sent_at =
            COALESCE(
              sent_at,
              NOW()
            ),
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        recordId,
        companyId,
        userId,
      ],
    );
  }

  if (
    moduleKey ===
      'sign' &&
    table ===
      'signers' &&
    nextStatus ===
      'signed'
  ) {
    const signer =
      await client.query(
        `
          SELECT request_id
          FROM signers
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          FOR UPDATE
        `,
        [
          recordId,
          companyId,
        ],
      );

    if (
      signer.rows.length !==
        1
    ) {
      throw new Error(
        'Signer was not found in the current company.',
      );
    }

    const pendingAuth =
      await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM signature_auth_challenges
          WHERE signer_id = $1
            AND company_id = $2
            AND method <> 'none'
            AND status <> 'verified'
            AND deleted_at IS NULL
        `,
        [
          recordId,
          companyId,
        ],
      );

    if (
      Number(
        pendingAuth.rows[0]
          ?.count ||
        0,
      ) >
        0
    ) {
      throw new Error(
        'Complete the required signer authentication before signing.',
      );
    }

    const pendingFields =
      await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM signature_fields
          WHERE signer_id = $1
            AND company_id = $2
            AND required = TRUE
            AND status <> 'completed'
            AND deleted_at IS NULL
        `,
        [
          recordId,
          companyId,
        ],
      );

    if (
      Number(
        pendingFields.rows[0]
          ?.count ||
        0,
      ) >
        0
    ) {
      throw new Error(
        'Complete every required signer field before signing.',
      );
    }

    await client.query(
      `
        UPDATE signers
        SET
          signed_at =
            COALESCE(
              signed_at,
              NOW()
            ),
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        recordId,
        companyId,
        userId,
      ],
    );

    await client.query(
      `
        INSERT INTO signature_audit_events (
          company_id,
          signature_request_id,
          signer_id,
          event_type,
          occurred_at,
          status,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,'signed',
          NOW(),'recorded',$4,$4
        )
      `,
      [
        companyId,
        signer.rows[0]
          .request_id,
        recordId,
        userId,
      ],
    );
  }

  if (
    moduleKey ===
      'sign' &&
    table ===
      'signature_requests' &&
    nextStatus ===
      'completed'
  ) {
    await issueSignatureCertificate(
      client,
      {
        companyId,
        userId,
        requestId:
          recordId,
      },
    );
  }

  if (
    moduleKey ===
      'sign' &&
    table ===
      'signature_envelopes' &&
    nextStatus ===
      'completed'
  ) {
    const pending =
      await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM signature_envelope_requests er
          JOIN signature_requests r
            ON r.id = er.signature_request_id
           AND r.company_id = er.company_id
           AND r.deleted_at IS NULL
          WHERE er.envelope_id = $1
            AND er.company_id = $2
            AND er.deleted_at IS NULL
            AND r.status <> 'completed'
        `,
        [
          recordId,
          companyId,
        ],
      );

    if (
      Number(
        pending.rows[0]
          ?.count ||
        0,
      ) >
        0
    ) {
      throw new Error(
        'Every request in the envelope must be completed first.',
      );
    }

    await client.query(
      `
        UPDATE signature_envelopes
        SET
          completed_at =
            COALESCE(
              completed_at,
              NOW()
            ),
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        recordId,
        companyId,
        userId,
      ],
    );
  }

  if (
    moduleKey ===
      'appointments' &&
    table ===
      'appointments' &&
    nextStatus ===
      'confirmed'
  ) {
    const missing =
      await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM appointment_questions q
          JOIN appointments a
            ON a.id = $1
           AND a.company_id = q.company_id
           AND a.deleted_at IS NULL
          WHERE q.company_id = $2
            AND q.required = TRUE
            AND q.status = 'active'
            AND q.deleted_at IS NULL
            AND (
              q.service_id IS NULL OR
              q.service_id = a.service_id
            )
            AND NOT EXISTS (
              SELECT 1
              FROM appointment_answers ans
              WHERE ans.company_id = q.company_id
                AND ans.appointment_id = a.id
                AND ans.question_id = q.id
                AND ans.deleted_at IS NULL
            )
        `,
        [
          recordId,
          companyId,
        ],
      );

    if (
      Number(
        missing.rows[0]
          ?.count ||
        0,
      ) >
        0
    ) {
      throw new Error(
        'Answer every required booking question before confirming the appointment.',
      );
    }
  }

  if (
    moduleKey ===
      'calendar' &&
    table ===
      'calendar_event_reminders' &&
    nextStatus ===
      'sent'
  ) {
    await client.query(
      `
        UPDATE calendar_event_reminders
        SET
          sent_at =
            COALESCE(
              sent_at,
              NOW()
            ),
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        recordId,
        companyId,
        userId,
      ],
    );
  }

  if (
    moduleKey ===
      'documents' &&
    table ===
      'document_share_links' &&
    [
      'expired',
      'revoked',
    ].includes(
      nextStatus,
    )
  ) {
    await client.query(
      `
        UPDATE document_share_links
        SET
          revoked_at =
            CASE
              WHEN $3 = 'revoked'
              THEN COALESCE(
                revoked_at,
                NOW()
              )
              ELSE revoked_at
            END,
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        recordId,
        companyId,
        nextStatus,
        userId,
      ],
    );
  }

  if (
    moduleKey ===
      'surveys' &&
    table ===
      'survey_invitations'
  ) {
    const column =
      nextStatus ===
        'sent'
        ? 'sent_at'
        : nextStatus ===
            'opened'
          ? 'opened_at'
          : nextStatus ===
              'completed'
            ? 'completed_at'
            : '';

    if (
      column
    ) {
      await client.query(
        `
          UPDATE survey_invitations
          SET
            ${column} =
              COALESCE(
                ${column},
                NOW()
              ),
            updated_by = $3,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          recordId,
          companyId,
          userId,
        ],
      );
    }
  }

  if (
    moduleKey ===
      'spreadsheet' &&
    table ===
      'spreadsheet_refresh_runs' &&
    [
      'completed',
      'failed',
    ].includes(
      nextStatus,
    )
  ) {
    const run =
      await client.query(
        `
          SELECT
            data_source_id,
            error
          FROM spreadsheet_refresh_runs
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          recordId,
          companyId,
        ],
      );

    if (
      run.rows.length ===
        1
    ) {
      await client.query(
        `
          UPDATE spreadsheet_refresh_runs
          SET
            completed_at =
              COALESCE(
                completed_at,
                NOW()
              ),
            updated_by = $3,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          recordId,
          companyId,
          userId,
        ],
      );

      await client.query(
        `
          UPDATE spreadsheet_data_sources
          SET
            last_refreshed_at =
              CASE
                WHEN $3 = 'completed'
                THEN NOW()
                ELSE last_refreshed_at
              END,
            refresh_error =
              CASE
                WHEN $3 = 'completed'
                THEN NULL
                ELSE $4
              END,
            status =
              CASE
                WHEN $3 = 'completed'
                THEN 'active'
                ELSE 'error'
              END,
            updated_by = $5,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          run.rows[0]
            .data_source_id,
          companyId,
          nextStatus,
          run.rows[0]
            .error ||
            'Refresh failed.',
          userId,
        ],
      );
    }
  }
}
