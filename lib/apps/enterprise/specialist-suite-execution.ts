import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  isEnterpriseModuleKey,
} from '@/lib/apps/enterprise/catalog';


type MutationOperation =
  | 'create'
  | 'update'
  | 'delete';


const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


function objectValue(
  value:
    unknown,
): Record<string, unknown> {
  if (
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
  ) {
    return value as
      Record<string, unknown>;
  }

  if (
    typeof value ===
      'string'
  ) {
    try {
      const parsed =
        JSON.parse(
          value,
        );

      if (
        parsed &&
        typeof parsed ===
          'object' &&
        !Array.isArray(
          parsed,
        )
      ) {
        return parsed as
          Record<string, unknown>;
      }
    } catch {}
  }

  return {};
}


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
  const parsed =
    Number(
      value ??
      0,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
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
    'barcode_scan_events',
    'lead_routing_decisions',
    'team_inbox_assignment_events',
    'vendor_portal_acknowledgements',
  ]);


export function assertSuiteSpecialistMutationAllowed(
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
      'This operational evidence record is append-only. Create a correcting event instead of editing history.',
    );
  }

  if (
    moduleKey ===
      'spreadsheet' &&
    table ===
      'cells'
  ) {
    const rowNumber =
      numberValue(
        row.row_number,
      );

    const columnNumber =
      numberValue(
        row.column_number,
      );

    if (
      rowNumber <=
        0 ||
      columnNumber <=
        0
    ) {
      throw new Error(
        'Spreadsheet rows and columns must be positive numbers.',
      );
    }

    const formula =
      textValue(
        row.formula,
      );

    if (
      formula &&
      !formula.startsWith(
        '=',
      )
    ) {
      throw new Error(
        'Spreadsheet formulas must start with "=".',
      );
    }
  }

  if (
    moduleKey ===
      'customer_portal' &&
    table ===
      'portal_access_grants'
  ) {
    const permission =
      textValue(
        row.permission,
      )
        .toLowerCase();

    if (
      ![
        'view',
        'download',
        'comment',
        'approve',
        'pay',
      ].includes(
        permission,
      )
    ) {
      throw new Error(
        'Choose a supported customer-portal permission.',
      );
    }
  }

  if (
    moduleKey ===
      'vendor_portal' &&
    table ===
      'vendor_portal_acknowledgements'
  ) {
    if (
      !textValue(
        row.resource_type,
      ) ||
      !UUID_RE.test(
        textValue(
          row.resource_id,
        ),
      )
    ) {
      throw new Error(
        'Vendor acknowledgement requires a valid linked business record.',
      );
    }
  }
}


async function ensureCrmLead(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    values:
      Record<string, unknown>;
    source:
      string;
  },
) {
  if (
    !await tableExists(
      client,
      'leads',
    )
  ) {
    return null;
  }

  const email =
    textValue(
      input.values.email ||
      input.values.email_address,
    )
      .toLowerCase();

  if (
    email
  ) {
    const existing =
      await client.query(
        `
          SELECT id
          FROM leads
          WHERE company_id = $1
            AND LOWER(
                  COALESCE(
                    email,
                    ''
                  )
                ) = $2
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [
          input.companyId,
          email,
        ],
      );

    if (
      existing.rows[0]
        ?.id
    ) {
      return String(
        existing.rows[0]
          .id,
      );
    }
  }

  const name =
    textValue(
      input.values.name ||
      input.values.full_name ||
      input.values.customer_name,
    ) ||
    email ||
    'Captured lead';

  const inserted =
    await client.query(
      `
        INSERT INTO leads (
          company_id,
          name,
          email,
          phone,
          company_name,
          source,
          stage,
          estimated_value,
          notes,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,
          'new',
          0,
          $7,
          $8,$8
        )
        RETURNING id
      `,
      [
        input.companyId,
        name,
        email ||
          null,
        textValue(
          input.values.phone,
        ) ||
          null,
        textValue(
          input.values.company_name ||
          input.values.company,
        ) ||
          null,
        input.source,
        textValue(
          input.values.message ||
          input.values.notes,
        ) ||
          null,
        input.userId,
      ],
    );

  return String(
    inserted.rows[0]
      .id,
  );
}


async function validatePortalResource(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    resourceType:
      string;
    resourceId:
      string;
  },
) {
  const tableByType:
    Record<
      string,
      string
    > = {
    invoice:
      'invoicing_invoices',
    sales_quote:
      'sales_quotes',
    quote:
      'sales_quotes',
    sales_order:
      'sales_orders_v2',
    order:
      'sales_orders_v2',
    document:
      'documents',
    ticket:
      'support_tickets',
    subscription:
      'subscriptions',
    project:
      'projects',
  };

  const table =
    tableByType[
      input.resourceType
        .toLowerCase()
    ];

  if (
    !table
  ) {
    throw new Error(
      'This customer-portal resource type is not supported.',
    );
  }

  if (
    !await tableExists(
      client,
      table,
    )
  ) {
    throw new Error(
      'The app that owns this customer-portal resource is not installed.',
    );
  }

  const result =
    await client.query(
      `
        SELECT 1
        FROM ${table}
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        input.resourceId,
        input.companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new Error(
      'The linked customer-portal record does not exist in the current company.',
    );
  }
}


async function applyBarcodeInventoryScan(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    userId:
      string;
    row:
      Record<string, unknown>;
  },
) {
  const barcode =
    textValue(
      input.row.barcode,
    );

  if (
    !barcode
  ) {
    return;
  }

  const identifier =
    await client.query(
      `
        SELECT
          entity_type,
          entity_id
        FROM barcode_identifiers
        WHERE company_id = $1
          AND barcode = $2
          AND status = 'active'
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [
        input.companyId,
        barcode,
      ],
    );

  const resolved =
    identifier.rows[0];

  if (
    !resolved
  ) {
    return;
  }

  await client.query(
    `
      UPDATE barcode_scan_events
      SET
        payload =
          COALESCE(
            payload,
            '{}'::jsonb
          ) ||
          jsonb_build_object(
            'resolved_entity_type',
            $3::text,
            'resolved_entity_id',
            $4::text
          ),
        updated_at = NOW()
      WHERE id = $1
        AND company_id = $2
        AND deleted_at IS NULL
    `,
    [
      input.row.id,
      input.companyId,
      resolved.entity_type,
      resolved.entity_id,
    ],
  );

  if (
    textValue(
      resolved.entity_type,
    )
      .toLowerCase() !==
      'product' ||
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

  const operation =
    textValue(
      input.row.operation,
    )
      .toLowerCase();

  const inbound =
    [
      'receive',
      'receipt',
      'stock_in',
      'return_in',
    ].includes(
      operation,
    );

  const outbound =
    [
      'issue',
      'pick',
      'stock_out',
      'sale',
      'return_out',
    ].includes(
      operation,
    );

  if (
    !inbound &&
    !outbound
  ) {
    return;
  }

  const payload =
    objectValue(
      input.row.payload,
    );

  const quantity =
    numberValue(
      payload.quantity,
    );

  const warehouseId =
    textValue(
      payload.warehouse_id ||
      payload.warehouseId,
    );

  if (
    quantity <=
      0 ||
    !UUID_RE.test(
      warehouseId,
    )
  ) {
    throw new Error(
      'Inventory barcode scans require a positive quantity and valid warehouse.',
    );
  }

  const stock =
    await client.query(
      `
        SELECT
          id,
          quantity
        FROM stock_levels
        WHERE company_id = $1
          AND product_id = $2
          AND warehouse_id = $3
          AND deleted_at IS NULL
        FOR UPDATE
      `,
      [
        input.companyId,
        resolved.entity_id,
        warehouseId,
      ],
    );

  const current =
    numberValue(
      stock.rows[0]
        ?.quantity,
    );

  if (
    outbound &&
    current <
      quantity
  ) {
    throw new Error(
      'The barcode operation would make inventory negative.',
    );
  }

  const next =
    inbound
      ? current +
        quantity
      : current -
        quantity;

  if (
    stock.rows[0]
      ?.id
  ) {
    await client.query(
      `
        UPDATE stock_levels
        SET
          quantity = $4,
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
        next,
        input.userId,
      ],
    );
  } else {
    await client.query(
      `
        INSERT INTO stock_levels (
          company_id,
          product_id,
          warehouse_id,
          quantity,
          reorder_level,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,0,$5,$5
        )
      `,
      [
        input.companyId,
        resolved.entity_id,
        warehouseId,
        next,
        input.userId,
      ],
    );
  }

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
      resolved.entity_id,
      warehouseId,
      inbound
        ? 'receipt'
        : 'issue',
      quantity,
      'barcode-scan:' +
        String(
          input.row.id,
        ),
      input.userId,
    ],
  );
}


export async function applySuiteSpecialistRecordSideEffects(
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
      'assets' &&
    table ===
      'operational_asset_assignments' &&
    operation !==
      'delete'
  ) {
    const status =
      textValue(
        row.status,
      )
        .toLowerCase();

    if (
      status ===
        'active'
    ) {
      await client.query(
        `
          UPDATE operational_assets
          SET
            assigned_user_id = $3,
            updated_by = $4,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          row.asset_id,
          companyId,
          row.assigned_user_id ||
            null,
          userId,
        ],
      );
    } else if (
      [
        'returned',
        'lost',
        'cancelled',
      ].includes(
        status,
      )
    ) {
      await client.query(
        `
          UPDATE operational_assets
          SET
            assigned_user_id = NULL,
            updated_by = $3,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          row.asset_id,
          companyId,
          userId,
        ],
      );
    }
  }

  if (
    moduleKey ===
      'barcode' &&
    table ===
      'barcode_scan_events' &&
    operation ===
      'create'
  ) {
    await applyBarcodeInventoryScan(
      client,
      {
        companyId,
        userId,
        row,
      },
    );
  }

  if (
    moduleKey ===
      'chat' &&
    table ===
      'chat_messages' &&
    operation ===
      'create'
  ) {
    const channel =
      await client.query(
        `
          SELECT is_private
          FROM chat_channels
          WHERE id = $1
            AND company_id = $2
            AND status = 'active'
            AND deleted_at IS NULL
        `,
        [
          row.channel_id,
          companyId,
        ],
      );

    if (
      channel.rows.length !==
        1
    ) {
      throw new Error(
        'The chat channel is not active in the current company.',
      );
    }

    if (
      channel.rows[0]
        .is_private
    ) {
      const membership =
        await client.query(
          `
            SELECT 1
            FROM chat_channel_members
            WHERE company_id = $1
              AND channel_id = $2
              AND user_id = $3
              AND status = 'active'
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [
            companyId,
            row.channel_id,
            row.sender_user_id,
          ],
        );

      if (
        membership.rows.length !==
          1
      ) {
        throw new Error(
          'Only active channel members can post in a private channel.',
        );
      }
    }

    await client.query(
      `
        UPDATE chat_channels
        SET
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        row.channel_id,
        companyId,
        userId,
      ],
    );
  }

  if (
    moduleKey ===
      'customer_portal' &&
    table ===
      'portal_access_grants' &&
    operation !==
      'delete'
  ) {
    const customer =
      await client.query(
        `
          SELECT 1
          FROM portal_customers
          WHERE id = $1
            AND company_id = $2
            AND status = 'active'
            AND (
              access_expires_at IS NULL OR
              access_expires_at > NOW()
            )
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          row.portal_customer_id,
          companyId,
        ],
      );

    if (
      customer.rows.length !==
        1
    ) {
      throw new Error(
        'Portal access can only be granted to an active customer portal account.',
      );
    }

    const resourceId =
      textValue(
        row.resource_id,
      );

    if (
      resourceId
    ) {
      if (
        !UUID_RE.test(
          resourceId,
        )
      ) {
        throw new Error(
          'Customer-portal resource ID is invalid.',
        );
      }

      await validatePortalResource(
        client,
        {
          companyId,
          resourceType:
            textValue(
              row.resource_type,
            ),
          resourceId,
        },
      );
    }
  }

  if (
    moduleKey ===
      'landing_pages' &&
    table ===
      'landing_page_submissions' &&
    operation ===
      'create'
  ) {
    const values =
      objectValue(
        row.values,
      );

    const crmLeadId =
      await ensureCrmLead(
        client,
        {
          companyId,
          userId,
          values,
          source:
            'landing_page',
        },
      );

    if (
      await tableExists(
        client,
        'lead_capture_entries',
      )
    ) {
      const form =
        await client.query(
          `
            SELECT metadata
            FROM landing_page_forms
            WHERE id = $1
              AND company_id = $2
              AND deleted_at IS NULL
          `,
          [
            row.form_id,
            companyId,
          ],
        );

      const metadata =
        objectValue(
          form.rows[0]
            ?.metadata,
        );

      const leadCaptureFormId =
        textValue(
          metadata
            .lead_capture_form_id,
        );

      if (
        UUID_RE.test(
          leadCaptureFormId,
        )
      ) {
        await client.query(
          `
            INSERT INTO lead_capture_entries (
              company_id,
              form_id,
              values,
              source_url,
              campaign,
              captured_at,
              assigned_user_id,
              status,
              created_by,
              updated_by,
              metadata
            )
            VALUES (
              $1,$2,$3::jsonb,$4,$5,NOW(),NULL,
              'active',$6,$6,
              jsonb_build_object(
                'landing_page_submission_id',
                $7::text,
                'crm_lead_id',
                $8::text
              )
            )
          `,
          [
            companyId,
            leadCaptureFormId,
            JSON.stringify(
              values,
            ),
            row.source_url ||
              null,
            textValue(
              values.campaign,
            ) ||
              null,
            userId,
            row.id,
            crmLeadId ||
              '',
          ],
        );
      }
    }
  }

  if (
    moduleKey ===
      'lead_capture' &&
    table ===
      'lead_capture_entries' &&
    operation ===
      'create'
  ) {
    const values =
      objectValue(
        row.values,
      );

    const crmLeadId =
      await ensureCrmLead(
        client,
        {
          companyId,
          userId,
          values,
          source:
            textValue(
              row.campaign,
            ) ||
            'lead_capture',
        },
      );

    await client.query(
      `
        INSERT INTO lead_capture_events (
          company_id,
          entry_id,
          event_type,
          details,
          occurred_at,
          status,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,'routed',
          jsonb_build_object(
            'crm_lead_id',
            $3::text
          ),
          NOW(),'active',$4,$4
        )
      `,
      [
        companyId,
        row.id,
        crmLeadId ||
          '',
        userId,
      ],
    );

    await client.query(
      `
        INSERT INTO lead_routing_decisions (
          company_id,
          entry_id,
          assigned_user_id,
          rule_reference,
          score,
          reason,
          crm_lead_id,
          status,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,'default',NULL,
          'SaMi routed the captured lead through the CRM integration.',
          $4,'applied',$5,$5
        )
      `,
      [
        companyId,
        row.id,
        row.assigned_user_id ||
          null,
        crmLeadId ||
          null,
        userId,
      ],
    );
  }

  if (
    moduleKey ===
      'mail' &&
    table ===
      'mail_messages' &&
    operation ===
      'create'
  ) {
    await client.query(
      `
        UPDATE mail_threads
        SET
          last_message_at =
            COALESCE(
              $3,
              NOW()
            ),
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        row.thread_id,
        companyId,
        row.sent_at ||
          null,
        userId,
      ],
    );

    const sender =
      textValue(
        row.sender,
      )
        .toLowerCase();

    if (
      sender &&
      await tableExists(
        client,
        'crm_activities',
      ) &&
      textValue(
        row.direction,
      )
        .toLowerCase() ===
        'inbound'
    ) {
      const lead =
        await client.query(
          `
            SELECT id
            FROM leads
            WHERE company_id = $1
              AND LOWER(
                    COALESCE(
                      email,
                      ''
                    )
                  ) = $2
              AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [
            companyId,
            sender,
          ],
        );

      if (
        lead.rows[0]
          ?.id
      ) {
        await client.query(
          `
            INSERT INTO crm_activities (
              company_id,
              lead_id,
              activity_type,
              subject,
              notes,
              completed_at,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,'email',$3,$4,
              COALESCE($5,NOW()),
              $6,$6
            )
          `,
          [
            companyId,
            lead.rows[0]
              .id,
            row.subject ||
              'Inbound email',
            row.body_text ||
              null,
            row.sent_at ||
              null,
            userId,
          ],
        );
      }
    }
  }

  if (
    moduleKey ===
      'sales_inbox' &&
    table ===
      'sales_conversations' &&
    operation ===
      'create'
  ) {
    const crmLeadId =
      await ensureCrmLead(
        client,
        {
          companyId,
          userId,
          values: {
            customer_name:
              row.customer_name,
            email:
              row.customer_email,
          },
          source:
            'sales_inbox',
        },
      );

    await client.query(
      `
        INSERT INTO sales_conversation_links (
          company_id,
          conversation_id,
          lead_id,
          status,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,'active',$4,$4
        )
        ON CONFLICT DO NOTHING
      `,
      [
        companyId,
        row.id,
        crmLeadId ||
          null,
        userId,
      ],
    );
  }

  if (
    moduleKey ===
      'sales_inbox' &&
    table ===
      'sales_messages' &&
    operation ===
      'create'
  ) {
    await client.query(
      `
        UPDATE sales_conversations
        SET
          last_message_at =
            COALESCE(
              $3,
              NOW()
            ),
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        row.conversation_id,
        companyId,
        row.sent_at ||
          null,
        userId,
      ],
    );
  }

  if (
    moduleKey ===
      'spreadsheet' &&
    table ===
      'spreadsheet_data_sources' &&
    operation !==
      'delete'
  ) {
    const sourceModule =
      textValue(
        row.source_module,
      )
        .toLowerCase();

    if (
      sourceModule !==
        'sales' &&
      sourceModule !==
        'invoicing' &&
      !isEnterpriseModuleKey(
        sourceModule,
      )
    ) {
      throw new Error(
        'Spreadsheet data source must point to a registered SaMi business app.',
      );
    }
  }

  if (
    moduleKey ===
      'team_inbox' &&
    table ===
      'team_inbox_messages' &&
    operation ===
      'create'
  ) {
    await client.query(
      `
        UPDATE team_inbox_threads
        SET
          last_message_at =
            COALESCE(
              $3,
              NOW()
            ),
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        row.thread_id,
        companyId,
        row.sent_at ||
          null,
        userId,
      ],
    );
  }

  if (
    moduleKey ===
      'vendor_portal' &&
    table ===
      'vendor_portal_accounts' &&
    operation !==
      'delete' &&
    row.vendor_reference &&
    await tableExists(
      client,
      'suppliers',
    )
  ) {
    const supplier =
      await client.query(
        `
          SELECT 1
          FROM suppliers
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          row.vendor_reference,
          companyId,
        ],
      );

    if (
      supplier.rows.length !==
        1
    ) {
      throw new Error(
        'Vendor portal account must reference a supplier in the current company.',
      );
    }
  }
}


export async function applySuiteSpecialistTransition(
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
      'assets' &&
    table ===
      'operational_assets'
  ) {
    await client.query(
      `
        INSERT INTO operational_asset_events (
          company_id,
          asset_id,
          event_type,
          description,
          occurred_at,
          performed_by,
          status,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,'status_changed',$3,
          NOW(),$4,'active',$4,$4
        )
      `,
      [
        companyId,
        recordId,
        'Asset status changed to ' +
          nextStatus +
          '.',
        userId,
      ],
    );

    if (
      [
        'retired',
        'inactive',
      ].includes(
        nextStatus,
      )
    ) {
      await client.query(
        `
          UPDATE operational_asset_assignments
          SET
            returned_at =
              COALESCE(
                returned_at,
                NOW()
              ),
            status =
              CASE
                WHEN status = 'active'
                THEN 'returned'
                ELSE status
              END,
            updated_by = $3,
            updated_at = NOW()
          WHERE asset_id = $1
            AND company_id = $2
            AND status = 'active'
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
      'barcode' &&
    table ===
      'barcode_scan_sessions' &&
    nextStatus ===
      'completed'
  ) {
    await client.query(
      `
        UPDATE barcode_scan_sessions
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
      'chat' &&
    table ===
      'chat_channels' &&
    nextStatus ===
      'closed'
  ) {
    await client.query(
      `
        UPDATE chat_channel_members
        SET
          status = 'inactive',
          updated_by = $3,
          updated_at = NOW()
        WHERE channel_id = $1
          AND company_id = $2
          AND status = 'active'
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
      'customer_portal' &&
    table ===
      'portal_customers' &&
    [
      'closed',
      'expired',
      'inactive',
    ].includes(
      nextStatus,
    )
  ) {
    await client.query(
      `
        UPDATE portal_access_grants
        SET
          status = 'inactive',
          updated_by = $3,
          updated_at = NOW()
        WHERE portal_customer_id = $1
          AND company_id = $2
          AND status = 'active'
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
      'customer_portal' &&
    table ===
      'portal_requests' &&
    [
      'resolved',
      'closed',
    ].includes(
      nextStatus,
    )
  ) {
    await client.query(
      `
        UPDATE portal_requests
        SET
          resolved_at =
            COALESCE(
              resolved_at,
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
      'email_marketing' &&
    table ===
      'email_campaigns' &&
    nextStatus ===
      'sent'
  ) {
    await client.query(
      `
        UPDATE email_recipients r
        SET
          status =
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM email_suppressions s
                WHERE s.company_id = r.company_id
                  AND LOWER(BTRIM(s.email)) =
                      LOWER(BTRIM(r.email))
                  AND s.status = 'active'
                  AND s.deleted_at IS NULL
              )
              THEN 'suppressed'
              ELSE 'sent'
            END,
          sent_at =
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM email_suppressions s
                WHERE s.company_id = r.company_id
                  AND LOWER(BTRIM(s.email)) =
                      LOWER(BTRIM(r.email))
                  AND s.status = 'active'
                  AND s.deleted_at IS NULL
              )
              THEN sent_at
              ELSE COALESCE(sent_at,NOW())
            END,
          updated_by = $3,
          updated_at = NOW()
        WHERE campaign_id = $1
          AND company_id = $2
          AND status = 'pending'
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
        INSERT INTO email_campaign_events (
          company_id,
          campaign_id,
          recipient_id,
          event_type,
          occurred_at,
          status,
          created_by,
          updated_by
        )
        SELECT
          company_id,
          campaign_id,
          id,
          CASE
            WHEN status = 'suppressed'
            THEN 'unsubscribed'
            ELSE 'sent'
          END,
          NOW(),
          'recorded',
          $3,$3
        FROM email_recipients
        WHERE campaign_id = $1
          AND company_id = $2
          AND deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM email_campaign_events e
            WHERE e.company_id = email_recipients.company_id
              AND e.campaign_id = email_recipients.campaign_id
              AND e.recipient_id = email_recipients.id
              AND e.event_type IN ('sent','unsubscribed')
              AND e.deleted_at IS NULL
          )
      `,
      [
        recordId,
        companyId,
        userId,
      ],
    );

    await client.query(
      `
        UPDATE email_campaigns
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
      'employees' &&
    table ===
      'employees'
  ) {
    const current =
      await client.query(
        `
          SELECT employment_status
          FROM employees
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

    const fromStatus =
      textValue(
        current.rows[0]
          ?.employment_status,
      )
        .toLowerCase();

    const eventType =
      nextStatus ===
        'terminated'
        ? 'termination'
        : nextStatus ===
              'active' &&
            [
              'inactive',
              'terminated',
            ].includes(
              fromStatus,
            )
          ? 'rehire'
          : 'other';

    await client.query(
      `
        INSERT INTO employee_lifecycle_events (
          company_id,
          employee_id,
          event_type,
          effective_date,
          from_value,
          to_value,
          reason,
          approved_by,
          status,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,CURRENT_DATE,
          jsonb_build_object(
            'employment_status',
            $4::text
          ),
          jsonb_build_object(
            'employment_status',
            $5::text
          ),
          'Employment status workflow transition',
          $6,'effective',$6,$6
        )
      `,
      [
        companyId,
        recordId,
        eventType,
        fromStatus,
        nextStatus,
        userId,
      ],
    );

    if (
      nextStatus ===
        'terminated'
    ) {
      await client.query(
        `
          UPDATE employee_contracts
          SET
            status = 'terminated',
            end_date =
              COALESCE(
                end_date,
                CURRENT_DATE
              ),
            updated_by = $3,
            updated_at = NOW()
          WHERE employee_id = $1
            AND company_id = $2
            AND status = 'active'
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
      'quality' &&
    table ===
      'quality_checks' &&
    nextStatus ===
      'completed'
  ) {
    const incomplete =
      await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM quality_check_items
          WHERE check_id = $1
            AND company_id = $2
            AND deleted_at IS NULL
            AND passed IS NULL
        `,
        [
          recordId,
          companyId,
        ],
      );

    if (
      Number(
        incomplete.rows[0]
          ?.count ||
        0,
      ) >
        0
    ) {
      throw new Error(
        'Complete every quality criterion before closing the quality check.',
      );
    }

    await client.query(
      `
        UPDATE quality_checks
        SET
          checked_at =
            COALESCE(
              checked_at,
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
      'quality' &&
    table ===
      'quality_issues' &&
    nextStatus ===
      'closed'
  ) {
    const openActions =
      await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM quality_corrective_actions
          WHERE quality_issue_id = $1
            AND company_id = $2
            AND status NOT IN (
              'verified',
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
        openActions.rows[0]
          ?.count ||
        0,
      ) >
        0
    ) {
      throw new Error(
        'Verify or cancel every corrective action before closing the quality issue.',
      );
    }

    await client.query(
      `
        UPDATE quality_issues
        SET
          closed_at =
            COALESCE(
              closed_at,
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
      'sms_marketing' &&
    table ===
      'sms_campaigns' &&
    nextStatus ===
      'sent'
  ) {
    await client.query(
      `
        UPDATE sms_recipients r
        SET
          status =
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM sms_suppressions s
                WHERE s.company_id = r.company_id
                  AND BTRIM(s.phone) =
                      BTRIM(r.phone)
                  AND s.status = 'active'
                  AND s.deleted_at IS NULL
              )
              THEN 'suppressed'
              ELSE 'sent'
            END,
          sent_at =
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM sms_suppressions s
                WHERE s.company_id = r.company_id
                  AND BTRIM(s.phone) =
                      BTRIM(r.phone)
                  AND s.status = 'active'
                  AND s.deleted_at IS NULL
              )
              THEN sent_at
              ELSE COALESCE(sent_at,NOW())
            END,
          updated_by = $3,
          updated_at = NOW()
        WHERE campaign_id = $1
          AND company_id = $2
          AND status = 'pending'
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
        INSERT INTO sms_delivery_events (
          company_id,
          campaign_id,
          recipient_id,
          event_type,
          occurred_at,
          status,
          created_by,
          updated_by
        )
        SELECT
          company_id,
          campaign_id,
          id,
          CASE
            WHEN status = 'suppressed'
            THEN 'opted_out'
            ELSE 'sent'
          END,
          NOW(),'recorded',$3,$3
        FROM sms_recipients
        WHERE campaign_id = $1
          AND company_id = $2
          AND deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM sms_delivery_events e
            WHERE e.company_id = sms_recipients.company_id
              AND e.campaign_id = sms_recipients.campaign_id
              AND e.recipient_id = sms_recipients.id
              AND e.event_type IN ('sent','opted_out')
              AND e.deleted_at IS NULL
          )
      `,
      [
        recordId,
        companyId,
        userId,
      ],
    );

    await client.query(
      `
        UPDATE sms_campaigns
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
      'social_marketing' &&
    table ===
      'social_posts'
  ) {
    if (
      nextStatus ===
        'scheduled'
    ) {
      const post =
        await client.query(
          `
            SELECT scheduled_at
            FROM social_posts
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
        !post.rows[0]
          ?.scheduled_at
      ) {
        throw new Error(
          'Choose a publish time before scheduling a social post.',
        );
      }

      await client.query(
        `
          INSERT INTO social_publish_queue (
            company_id,
            post_id,
            scheduled_at,
            status,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,'queued',$4,$4
          )
        `,
        [
          companyId,
          recordId,
          post.rows[0]
            .scheduled_at,
          userId,
        ],
      );
    }

    if (
      nextStatus ===
        'published'
    ) {
      await client.query(
        `
          UPDATE social_posts
          SET
            published_at =
              COALESCE(
                published_at,
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
          UPDATE social_publish_queue
          SET
            published_at =
              COALESCE(
                published_at,
                NOW()
              ),
            status = 'published',
            updated_by = $3,
            updated_at = NOW()
          WHERE post_id = $1
            AND company_id = $2
            AND status IN (
              'queued',
              'processing'
            )
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
      'spreadsheet_data_sources' &&
    nextStatus ===
      'active'
  ) {
    await client.query(
      `
        UPDATE spreadsheet_data_sources
        SET
          refresh_error = NULL,
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
      'team_inbox' &&
    table ===
      'team_inbox_threads' &&
    nextStatus ===
      'closed'
  ) {
    await client.query(
      `
        INSERT INTO team_inbox_assignment_events (
          company_id,
          thread_id,
          from_user_id,
          to_user_id,
          reason,
          status,
          created_by,
          updated_by
        )
        SELECT
          company_id,
          id,
          assigned_user_id,
          assigned_user_id,
          'Thread closed',
          'recorded',
          $3,$3
        FROM team_inbox_threads
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
      'vendor_portal' &&
    table ===
      'vendor_portal_accounts' &&
    [
      'suspended',
      'expired',
      'closed',
    ].includes(
      nextStatus,
    )
  ) {
    await client.query(
      `
        UPDATE vendor_portal_documents
        SET
          status =
            CASE
              WHEN status = 'active'
              THEN 'inactive'
              ELSE status
            END,
          updated_by = $3,
          updated_at = NOW()
        WHERE vendor_account_id = $1
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
