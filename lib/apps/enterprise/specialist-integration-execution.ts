import 'server-only';

import type {
  PoolClient,
} from 'pg';


type MutationOperation =
  | 'create'
  | 'update'
  | 'delete';


const APPEND_ONLY =
  new Set([
    'barcode_scan_events',
    'chat_reactions',
    'email_campaign_events',
    'landing_page_submissions',
    'lead_capture_events',
    'mail_messages',
    'portal_messages',
    'sales_messages',
    'sms_delivery_events',
    'social_post_metrics',
    'team_inbox_messages',
    'vendor_portal_messages',
  ]);


function textValue(
  value:
    unknown,
) {
  return typeof value ===
    'string'
      ? value.trim()
      : '';
}


function objectValue(
  value:
    unknown,
): Record<string, unknown> {
  return value &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
      ? value as
          Record<
            string,
            unknown
          >
      : {};
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


async function createCrmLead(
  client:
    PoolClient,
  input: {
    companyId:
      string;
    name:
      string;
    email?:
      string;
    phone?:
      string;
    companyName?:
      string;
    source:
      string;
    sourceMarker:
      string;
    assignedUserId?:
      string;
  },
) {
  if (
    !(await tableExists(
      client,
      'leads',
    ))
  ) {
    return;
  }

  const existing =
    await client.query(
      `
        SELECT id
        FROM leads
        WHERE company_id = $1
          AND deleted_at IS NULL
          AND notes = $2
        LIMIT 1
      `,
      [
        input.companyId,
        input.sourceMarker,
      ],
    );

  if (
    existing.rows.length >
      0
  ) {
    return;
  }

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
        $8,
        $8
      )
    `,
    [
      input.companyId,
      input.name ||
        input.email ||
        'Captured lead',
      input.email ||
        null,
      input.phone ||
        null,
      input.companyName ||
        null,
      input.source,
      input.sourceMarker,
      input.assignedUserId ||
        null,
    ],
  );
}


export function assertIntegratedSpecialistMutationAllowed(
  moduleKey:
    string,
  table:
    string,
  operation:
    MutationOperation,
  row:
    Record<
      string,
      unknown
    >,
) {
  if (
    operation !==
      'create' &&
    APPEND_ONLY.has(
      table,
    )
  ) {
    throw new Error(
      'This communication or evidence record is append-only. Create a new event instead of rewriting history.',
    );
  }

  if (
    moduleKey ===
      'employees' &&
    table ===
      'employee_lifecycle_events' &&
    operation !==
      'create' &&
    textValue(
      row.status,
    ) ===
      'effective'
  ) {
    throw new Error(
      'Effective employee lifecycle events are immutable. Create a correcting lifecycle event.',
    );
  }

  if (
    moduleKey ===
      'quality' &&
    table ===
      'quality_corrective_actions' &&
    operation !==
      'create' &&
    textValue(
      row.status,
    ) ===
      'verified'
  ) {
    throw new Error(
      'Verified corrective actions are immutable. Reopen through workflow before changing the quality record.',
    );
  }
}


export async function applyIntegratedSpecialistRecordSideEffects(
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
      Record<
        string,
        unknown
      >;
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
    operation ===
      'delete'
  ) {
    return;
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

    await createCrmLead(
      client,
      {
        companyId,
        name:
          textValue(
            values.name,
          ) ||
          textValue(
            values.full_name,
          ) ||
          textValue(
            values.email,
          ),
        email:
          textValue(
            values.email,
          ),
        phone:
          textValue(
            values.phone,
          ),
        companyName:
          textValue(
            values.company,
          ) ||
          textValue(
            values.company_name,
          ),
        source:
          textValue(
            row.campaign,
          ) ||
          'lead_capture',
        sourceMarker:
          '[lead_capture:' +
          String(
            row.id,
          ) +
          ']',
        assignedUserId:
          textValue(
            row.assigned_user_id,
          ) ||
          userId,
      },
    );
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

    await createCrmLead(
      client,
      {
        companyId,
        name:
          textValue(
            values.name,
          ) ||
          textValue(
            values.full_name,
          ) ||
          textValue(
            values.email,
          ),
        email:
          textValue(
            values.email,
          ),
        phone:
          textValue(
            values.phone,
          ),
        companyName:
          textValue(
            values.company,
          ) ||
          textValue(
            values.company_name,
          ),
        source:
          'landing_page',
        sourceMarker:
          '[landing_page_submission:' +
          String(
            row.id,
          ) +
          ']',
        assignedUserId:
          userId,
      },
    );
  }

  if (
    moduleKey ===
      'sales_inbox' &&
    table ===
      'sales_conversations' &&
    operation ===
      'create'
  ) {
    await createCrmLead(
      client,
      {
        companyId,
        name:
          textValue(
            row.customer_name,
          ) ||
          textValue(
            row.customer_email,
          ),
        email:
          textValue(
            row.customer_email,
          ),
        source:
          'sales_inbox',
        sourceMarker:
          '[sales_inbox:' +
          String(
            row.id,
          ) +
          ']',
        assignedUserId:
          textValue(
            row.assigned_user_id,
          ) ||
          userId,
      },
    );
  }

  if (
    moduleKey ===
      'mail' &&
    table ===
      'mail_messages' &&
    row.thread_id
  ) {
    await client.query(
      `
        UPDATE mail_threads
        SET
          last_message_at =
            COALESCE(
              $3::timestamptz,
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
      'team_inbox' &&
    table ===
      'team_inbox_messages' &&
    row.thread_id
  ) {
    await client.query(
      `
        UPDATE team_inbox_threads
        SET
          last_message_at =
            COALESCE(
              $3::timestamptz,
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
      'sales_inbox' &&
    table ===
      'sales_messages' &&
    row.conversation_id
  ) {
    await client.query(
      `
        UPDATE sales_conversations
        SET
          last_message_at =
            COALESCE(
              $3::timestamptz,
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
      'chat' &&
    table ===
      'chat_messages' &&
    row.channel_id
  ) {
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
      'assets' &&
    table ===
      'operational_asset_events' &&
    operation ===
      'create' &&
    row.asset_id
  ) {
    const eventType =
      textValue(
        row.event_type,
      )
        .toLowerCase();

    const status =
      eventType.includes(
        'maintenance',
      )
        ? (
            eventType.includes(
              'complete',
            )
              ? 'active'
              : 'maintenance'
          )
        : eventType.includes(
              'retir',
            )
          ? 'retired'
          : eventType.includes(
                'inactive',
              )
            ? 'inactive'
            : '';

    if (
      status
    ) {
      await client.query(
        `
          UPDATE operational_assets
          SET
            status = $3,
            updated_by = $4,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          row.asset_id,
          companyId,
          status,
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
      'create' &&
    textValue(
      row.operation,
    ) ===
      'inventory_count'
  ) {
    const payload =
      objectValue(
        row.payload,
      );

    const productId =
      textValue(
        payload.product_id,
      );

    const warehouseId =
      textValue(
        payload.warehouse_id,
      );

    const counted =
      Number(
        payload.counted_quantity,
      );

    if (
      productId &&
      warehouseId &&
      Number.isFinite(
        counted,
      ) &&
      counted >=
        0 &&
      await tableExists(
        client,
        'inventory_adjustments',
      )
    ) {
      const current =
        await client.query(
          `
            SELECT
              COALESCE(
                quantity,
                0
              )::numeric AS quantity
            FROM stock_levels
            WHERE company_id = $1
              AND product_id = $2
              AND warehouse_id = $3
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [
            companyId,
            productId,
            warehouseId,
          ],
        );

      const system =
        Number(
          current.rows[0]
            ?.quantity ||
          0,
        );

      await client.query(
        `
          INSERT INTO inventory_adjustments (
            company_id,
            adjustment_number,
            warehouse_id,
            product_id,
            counted_quantity,
            system_quantity,
            difference_quantity,
            reason,
            status,
            created_by,
            updated_by
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $5 - $6,
            $7,
            'draft',
            $8,
            $8
          )
          ON CONFLICT (
            company_id,
            adjustment_number
          )
          WHERE deleted_at IS NULL
          DO NOTHING
        `,
        [
          companyId,
          'BC-' +
          String(
            row.id,
          )
            .slice(
              0,
              12,
            ),
          warehouseId,
          productId,
          counted,
          system,
          'Barcode inventory count',
          userId,
        ],
      );
    }
  }

  if (
    moduleKey ===
      'customer_portal' &&
    table ===
      'portal_messages' &&
    operation ===
      'create' &&
    textValue(
      row.direction,
    )
      .toLowerCase() ===
      'inbound' &&
    await tableExists(
      client,
      'support_tickets',
    )
  ) {
    const customer =
      row.portal_customer_id
        ? await client.query(
            `
              SELECT
                display_name,
                email
              FROM portal_customers
              WHERE id = $1
                AND company_id = $2
                AND deleted_at IS NULL
              LIMIT 1
            `,
            [
              row.portal_customer_id,
              companyId,
            ],
          )
        : {
            rows: [],
          };

    await client.query(
      `
        INSERT INTO support_tickets (
          company_id,
          ticket_number,
          requester_name,
          requester_email,
          subject,
          description,
          priority,
          status,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,
          'normal',
          'open',
          $7,
          $7
        )
        ON CONFLICT (
          ticket_number
        )
        DO NOTHING
      `,
      [
        companyId,
        'PORTAL-' +
        String(
          row.id,
        )
          .slice(
            0,
            8,
          )
          .toUpperCase(),
        customer.rows[0]
          ?.display_name ||
        'Portal customer',
        customer.rows[0]
          ?.email ||
        null,
        textValue(
          row.subject,
        ) ||
        'Customer portal request',
        textValue(
          row.body,
        ),
        userId,
      ],
    );
  }

  if (
    moduleKey ===
      'email_marketing' &&
    table ===
      'email_campaign_events' &&
    row.recipient_id
  ) {
    const eventType =
      textValue(
        row.event_type,
      )
        .toLowerCase();

    if (
      [
        'sent',
        'delivered',
        'bounced',
        'complained',
        'unsubscribed',
      ].includes(
        eventType,
      )
    ) {
      await client.query(
        `
          UPDATE email_recipients
          SET
            status = $3,
            sent_at =
              CASE
                WHEN $3 IN (
                  'sent',
                  'delivered'
                )
                  THEN COALESCE(
                    sent_at,
                    NOW()
                  )
                ELSE sent_at
              END,
            updated_by = $4,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          row.recipient_id,
          companyId,
          eventType,
          userId,
        ],
      );
    }
  }

  if (
    moduleKey ===
      'sms_marketing' &&
    table ===
      'sms_delivery_events' &&
    row.recipient_id
  ) {
    const eventType =
      textValue(
        row.event_type,
      )
        .toLowerCase();

    if (
      [
        'sent',
        'delivered',
        'failed',
        'opted_out',
      ].includes(
        eventType,
      )
    ) {
      await client.query(
        `
          UPDATE sms_recipients
          SET
            status = $3,
            sent_at =
              CASE
                WHEN $3 IN (
                  'sent',
                  'delivered'
                )
                  THEN COALESCE(
                    sent_at,
                    NOW()
                  )
                ELSE sent_at
              END,
            updated_by = $4,
            updated_at = NOW()
          WHERE id = $1
            AND company_id = $2
            AND deleted_at IS NULL
        `,
        [
          row.recipient_id,
          companyId,
          eventType,
          userId,
        ],
      );
    }
  }

  if (
    moduleKey ===
      'employees' &&
    table ===
      'employee_lifecycle_events' &&
    textValue(
      row.status,
    ) ===
      'effective' &&
    row.employee_id
  ) {
    const toValue =
      objectValue(
        row.to_value,
      );

    const jobTitle =
      textValue(
        toValue.job_title,
      );

    const department =
      textValue(
        toValue.department,
      );

    const employmentStatus =
      textValue(
        toValue.employment_status,
      );

    const salary =
      Number(
        toValue.salary,
      );

    await client.query(
      `
        UPDATE employees
        SET
          job_title =
            COALESCE(
              NULLIF(
                $3,
                ''
              ),
              job_title
            ),
          department =
            COALESCE(
              NULLIF(
                $4,
                ''
              ),
              department
            ),
          employment_status =
            COALESCE(
              NULLIF(
                $5,
                ''
              ),
              employment_status
            ),
          salary =
            CASE
              WHEN $6::numeric >= 0
                THEN $6::numeric
              ELSE salary
            END,
          updated_by = $7,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        row.employee_id,
        companyId,
        jobTitle,
        department,
        employmentStatus,
        Number.isFinite(
          salary,
        )
          ? salary
          : -1,
        userId,
      ],
    );

    if (
      await tableExists(
        client,
        'payroll_employees',
      )
    ) {
      await client.query(
        `
          INSERT INTO payroll_employees (
            company_id,
            employee_reference,
            basic_salary,
            status,
            created_by,
            updated_by
          )
          VALUES (
            $1,
            $2,
            GREATEST(
              $3::numeric,
              0
            ),
            CASE
              WHEN $4 IN (
                'terminated',
                'inactive'
              )
                THEN 'inactive'
              ELSE 'active'
            END,
            $5,
            $5
          )
          ON CONFLICT DO NOTHING
        `,
        [
          companyId,
          row.employee_id,
          Number.isFinite(
            salary,
          )
            ? salary
            : 0,
          employmentStatus,
          userId,
        ],
      );
    }
  }

  if (
    moduleKey ===
      'quality' &&
    table ===
      'quality_corrective_actions' &&
    textValue(
      row.status,
    ) ===
      'verified' &&
    row.quality_issue_id
  ) {
    await client.query(
      `
        UPDATE quality_issues
        SET
          root_cause =
            COALESCE(
              NULLIF(
                $3,
                ''
              ),
              root_cause
            ),
          corrective_action =
            COALESCE(
              NULLIF(
                $4,
                ''
              ),
              corrective_action
            ),
          status = 'closed',
          closed_at =
            COALESCE(
              closed_at,
              NOW()
            ),
          updated_by = $5,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        row.quality_issue_id,
        companyId,
        textValue(
          row.root_cause,
        ),
        textValue(
          row.action_plan,
        ),
        userId,
      ],
    );
  }
}


export async function applyIntegratedSpecialistTransition(
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
      'email_marketing' &&
    table ===
      'email_campaigns' &&
    nextStatus ===
      'sent'
  ) {
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
      'sms_marketing' &&
    table ===
      'sms_campaigns' &&
    nextStatus ===
      'sent'
  ) {
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
      'social_posts' &&
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
  }

  if (
    moduleKey ===
      'landing_pages' &&
    table ===
      'landing_pages' &&
    nextStatus ===
      'published'
  ) {
    await client.query(
      `
        UPDATE landing_pages
        SET
          published = TRUE,
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
  }
}
