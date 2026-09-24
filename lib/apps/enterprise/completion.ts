import 'server-only';

import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';

import {
  linkWorkspaceFileForAuthorizedCaller,
  listWorkspaceRecordFilesForAuthorizedCaller,
  unlinkWorkspaceFileForAuthorizedCaller,
} from '@/lib/services/workspace-file-links';

import {
  EnterpriseModuleError,
  requireEnterpriseModuleTableContext,
  type EnterpriseModuleOperation,
} from '@/lib/apps/enterprise/service';


const IDENTIFIER =
  /^[a-z_][a-z0-9_]*$/;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_NOTE_LENGTH =
  10000;

const MAX_TASK_TITLE =
  255;

const MAX_SAVED_VIEWS =
  50;

const MAX_CUSTOM_FIELDS =
  100;


function quoteIdentifier(
  value:
    string,
) {
  if (
    !IDENTIFIER.test(
      value,
    )
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'SaMi rejected an unsafe business identifier.',
    );
  }

  return (
    '"' +
    value +
    '"'
  );
}


function safeUuid(
  value:
    unknown,
  label:
    string,
) {
  const source =
    typeof value ===
      'string'
      ? value.trim()
      : '';

  if (
    !UUID_RE.test(
      source,
    )
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'Choose a valid ' +
      label +
      '.',
    );
  }

  return source;
}


function safeRecordKey(
  value:
    unknown,
) {
  const source =
    typeof value ===
      'string'
      ? value.trim()
      : '';

  if (
    !source ||
    source.length >
      200
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'Choose a valid record.',
    );
  }

  return source;
}


function safeText(
  value:
    unknown,
  maximum:
    number,
  label:
    string,
  required =
    false,
) {
  const source =
    typeof value ===
      'string'
      ? value
          .replace(
            /\u0000/g,
            '',
          )
          .trim()
      : '';

  if (
    required &&
    !source
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      label +
      ' is required.',
    );
  }

  if (
    source.length >
      maximum
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      label +
      ' is too long.',
    );
  }

  return source;
}


function safeKey(
  value:
    unknown,
  label:
    string,
) {
  const source =
    safeText(
      value,
      80,
      label,
      true,
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9_]+/g,
        '_',
      )
      .replace(
        /^_+|_+$/g,
        '',
      );

  if (
    !source ||
    !IDENTIFIER.test(
      source,
    )
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      label +
      ' is invalid.',
    );
  }

  return source;
}


function safeDateTime(
  value:
    unknown,
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  ) {
    return null;
  }

  const date =
    new Date(
      String(
        value,
      ),
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'Choose a valid date and time.',
    );
  }

  return date
    .toISOString();
}


function safeStringArray(
  value:
    unknown,
  maximumItems:
    number,
  maximumLength:
    number,
) {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(
          item =>
            typeof item ===
              'string'
              ? item
                  .trim()
                  .slice(
                    0,
                    maximumLength,
                  )
              : '',
        )
        .filter(
          Boolean,
        ),
    ),
  ].slice(
    0,
    maximumItems,
  );
}


function safeJsonObject(
  value:
    unknown,
) {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(
      value,
    )
  ) {
    return {};
  }

  return value as
    Record<
      string,
      unknown
    >;
}


function isUuid(
  value:
    string,
) {
  return UUID_RE.test(
    value,
  );
}


async function requireRecord(
  moduleKey:
    string,
  tableInput:
    unknown,
  recordInput:
    unknown,
  operation:
    EnterpriseModuleOperation,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      moduleKey,
      tableInput,
      operation,
    );

  const recordKey =
    safeRecordKey(
      recordInput,
    );

  const names =
    new Set(
      context.fields.map(
        field =>
          field.key,
      ),
    );

  if (
    !names.has(
      'id',
    )
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'This register does not expose record collaboration.',
    );
  }

  const result =
    await context.pool.query(
      'SELECT id::text AS id FROM ' +
      quoteIdentifier(
        context.table,
      ) +
      ' WHERE id::text = $1 AND company_id = $2 AND deleted_at IS NULL LIMIT 1',
      [
        recordKey,
        context.companyId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new EnterpriseModuleError(
      'RECORD_NOT_FOUND',
      'The selected record could not be found.',
    );
  }

  return {
    ...context,
    recordKey,
  };
}


async function recordCollaborationAudit(
  context:
    Awaited<
      ReturnType<
        typeof requireRecord
      >
    >,
  action:
    string,
  summary:
    string,
  metadata:
    Record<
      string,
      unknown
    > = {},
) {
  try {
    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      action,
      eventType:
        action,
      category:
        'business',
      severity:
        'info',
      result:
        'success',
      resourceType:
        context.table,
      resourceId:
        isUuid(
          context.recordKey,
        )
          ? context.recordKey
          : undefined,
      entityType:
        context.table,
      entityId:
        isUuid(
          context.recordKey,
        )
          ? context.recordKey
          : undefined,
      module:
        context.moduleKey,
      summary,
      metadata: {
        table:
          context.table,
        recordKey:
          context.recordKey,
        ...metadata,
      },
    });
  } catch (
    error
  ) {
    console.error(
      '[SaMi Enterprise] Collaboration audit failed:',
      error,
    );
  }
}


function normalizeCustomValue(
  definition:
    {
      field_key:
        string;
      field_type:
        string;
      required:
        boolean;
      options:
        unknown;
    },
  value:
    unknown,
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  ) {
    if (
      definition.required
    ) {
      throw new EnterpriseModuleError(
        'INVALID_INPUT',
        definition.field_key +
        ' is required.',
      );
    }

    return null;
  }

  switch (
    definition.field_type
  ) {
    case 'number': {
      const number =
        Number(
          value,
        );

      if (
        !Number.isFinite(
          number,
        )
      ) {
        throw new EnterpriseModuleError(
          'INVALID_INPUT',
          definition.field_key +
          ' must be a number.',
        );
      }

      return number;
    }

    case 'checkbox':
      return (
        value ===
          true ||
        value ===
          'true' ||
        value ===
          1 ||
        value ===
          '1'
      );

    case 'date':
    case 'datetime': {
      const date =
        new Date(
          String(
            value,
          ),
        );

      if (
        Number.isNaN(
          date.getTime(),
        )
      ) {
        throw new EnterpriseModuleError(
          'INVALID_INPUT',
          definition.field_key +
          ' must be a valid date.',
        );
      }

      return definition.field_type ===
        'date'
        ? date
            .toISOString()
            .slice(
              0,
              10,
            )
        : date
            .toISOString();
    }

    case 'select': {
      const source =
        String(
          value,
        );

      const options =
        Array.isArray(
          definition.options,
        )
          ? definition.options
              .map(
                option =>
                  String(
                    option,
                  ),
              )
          : [];

      if (
        options.length >
          0 &&
        !options.includes(
          source,
        )
      ) {
        throw new EnterpriseModuleError(
          'INVALID_INPUT',
          'Choose a valid option for ' +
          definition.field_key +
          '.',
        );
      }

      return source;
    }

    case 'textarea':
    case 'text':
    default:
      return safeText(
        value,
        definition.field_type ===
          'textarea'
          ? 10000
          : 1000,
        definition.field_key,
        definition.required,
      );
  }
}


export async function getEnterpriseRecordCompletion(
  moduleKey:
    string,
  input: {
    table?: unknown;
    recordId?: unknown;
  },
) {
  const context =
    await requireRecord(
      moduleKey,
      input.table,
      input.recordId,
      'view',
    );

  const [
    notes,
    tasks,
    customFields,
    extras,
    savedViews,
    timeline,
    files,
  ] =
    await Promise.all([
      context.pool.query(
        `
          SELECT
            id,
            note_type,
            body,
            pinned,
            created_by,
            updated_by,
            created_at,
            updated_at
          FROM sami_enterprise_record_notes
          WHERE company_id = $1
            AND module_key = $2
            AND table_key = $3
            AND record_key = $4
            AND deleted_at IS NULL
          ORDER BY pinned DESC, created_at DESC, id DESC
          LIMIT 100
        `,
        [
          context.companyId,
          context.moduleKey,
          context.table,
          context.recordKey,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id,
            title,
            details,
            assigned_user_id,
            due_at,
            priority,
            status,
            completed_at,
            created_by,
            updated_by,
            created_at,
            updated_at
          FROM sami_enterprise_record_tasks
          WHERE company_id = $1
            AND module_key = $2
            AND table_key = $3
            AND record_key = $4
            AND deleted_at IS NULL
          ORDER BY
            CASE status
              WHEN 'open' THEN 0
              WHEN 'in_progress' THEN 1
              WHEN 'completed' THEN 2
              ELSE 3
            END,
            due_at ASC NULLS LAST,
            created_at DESC
          LIMIT 100
        `,
        [
          context.companyId,
          context.moduleKey,
          context.table,
          context.recordKey,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id,
            field_key,
            label,
            field_type,
            options,
            required,
            active
          FROM sami_enterprise_custom_fields
          WHERE company_id = $1
            AND module_key = $2
            AND table_key = $3
            AND deleted_at IS NULL
            AND active = TRUE
          ORDER BY label, id
        `,
        [
          context.companyId,
          context.moduleKey,
          context.table,
        ],
      ),
      context.pool.query(
        `
          SELECT
            custom_values,
            tags,
            watchers,
            updated_at
          FROM sami_enterprise_record_extras
          WHERE company_id = $1
            AND module_key = $2
            AND table_key = $3
            AND record_key = $4
          LIMIT 1
        `,
        [
          context.companyId,
          context.moduleKey,
          context.table,
          context.recordKey,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id,
            name,
            layout,
            search_text,
            filters,
            sort,
            columns,
            is_default,
            updated_at
          FROM sami_enterprise_saved_views
          WHERE company_id = $1
            AND user_id = $2
            AND module_key = $3
            AND table_key = $4
            AND deleted_at IS NULL
          ORDER BY is_default DESC, updated_at DESC, id DESC
          LIMIT $5
        `,
        [
          context.companyId,
          context.userId,
          context.moduleKey,
          context.table,
          MAX_SAVED_VIEWS,
        ],
      ),
      isUuid(
        context.recordKey,
      )
        ? context.pool.query(
            `
              SELECT
                id,
                action,
                event_type,
                summary,
                result,
                user_id,
                created_at
              FROM audit_logs
              WHERE company_id = $1
                AND module = $2
                AND resource_type = $3
                AND resource_id = $4::uuid
              ORDER BY created_at DESC, id DESC
              LIMIT 50
            `,
            [
              context.companyId,
              context.moduleKey,
              context.table,
              context.recordKey,
            ],
          )
        : Promise.resolve({
            rows:
              [],
          }),
      isUuid(
        context.recordKey,
      )
        ? listWorkspaceRecordFilesForAuthorizedCaller({
            tenantId:
              context.tenantId,
            userId:
              context.userId,
            companyId:
              context.companyId,
            model:
              context.table,
            recordId:
              context.recordKey,
          })
        : Promise.resolve(
            [],
          ),
    ]);

  return {
    table:
      context.table,
    recordId:
      context.recordKey,
    notes:
      notes.rows,
    tasks:
      tasks.rows,
    customFields:
      customFields.rows,
    extras:
      extras.rows[0] || {
        custom_values:
          {},
        tags:
          [],
        watchers:
          [],
        updated_at:
          null,
      },
    savedViews:
      savedViews.rows,
    timeline:
      timeline.rows,
    files,
  };
}


export async function addEnterpriseRecordNote(
  moduleKey:
    string,
  input: {
    table?: unknown;
    recordId?: unknown;
    body?: unknown;
    noteType?: unknown;
    pinned?: unknown;
  },
) {
  const context =
    await requireRecord(
      moduleKey,
      input.table,
      input.recordId,
      'edit',
    );

  const body =
    safeText(
      input.body,
      MAX_NOTE_LENGTH,
      'Note',
      true,
    );

  const noteType =
    input.noteType ===
      'comment'
      ? 'comment'
      : 'note';

  const result =
    await context.pool.query(
      `
        INSERT INTO sami_enterprise_record_notes (
          company_id,
          module_key,
          table_key,
          record_key,
          note_type,
          body,
          pinned,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $8, NOW(), NOW()
        )
        RETURNING
          id,
          note_type,
          body,
          pinned,
          created_by,
          updated_by,
          created_at,
          updated_at
      `,
      [
        context.companyId,
        context.moduleKey,
        context.table,
        context.recordKey,
        noteType,
        body,
        input.pinned ===
          true,
        context.userId,
      ],
    );

  await recordCollaborationAudit(
    context,
    context.moduleKey +
    '.record.' +
    noteType +
    '.created',
    noteType ===
      'comment'
      ? 'Comment added to ' +
        context.table +
        '.'
      : 'Note added to ' +
        context.table +
        '.',
  );

  return result.rows[0];
}


export async function deleteEnterpriseRecordNote(
  moduleKey:
    string,
  input: {
    table?: unknown;
    recordId?: unknown;
    noteId?: unknown;
  },
) {
  const context =
    await requireRecord(
      moduleKey,
      input.table,
      input.recordId,
      'edit',
    );

  const noteId =
    safeUuid(
      input.noteId,
      'note',
    );

  const result =
    await context.pool.query(
      `
        UPDATE sami_enterprise_record_notes
        SET
          deleted_at = NOW(),
          updated_at = NOW(),
          updated_by = $5
        WHERE id = $1
          AND company_id = $2
          AND module_key = $3
          AND table_key = $4
          AND record_key = $6
          AND deleted_at IS NULL
          AND (
            created_by = $5
            OR $7::boolean = TRUE
          )
        RETURNING id
      `,
      [
        noteId,
        context.companyId,
        context.moduleKey,
        context.table,
        context.userId,
        context.recordKey,
        context.permissions
          .isOwner ===
          true,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new EnterpriseModuleError(
      'RECORD_NOT_FOUND',
      'The note could not be removed.',
    );
  }

  await recordCollaborationAudit(
    context,
    context.moduleKey +
    '.record.note.deleted',
    'Record note removed.',
  );

  return {
    removed:
      true,
  };
}


export async function saveEnterpriseRecordTask(
  moduleKey:
    string,
  input: {
    table?: unknown;
    recordId?: unknown;
    taskId?: unknown;
    title?: unknown;
    details?: unknown;
    assignedUserId?: unknown;
    dueAt?: unknown;
    priority?: unknown;
    status?: unknown;
  },
) {
  const context =
    await requireRecord(
      moduleKey,
      input.table,
      input.recordId,
      'edit',
    );

  const title =
    safeText(
      input.title,
      MAX_TASK_TITLE,
      'Task title',
      true,
    );

  const details =
    safeText(
      input.details,
      10000,
      'Task details',
    ) ||
    null;

  const assignedUserId =
    input.assignedUserId
      ? safeUuid(
          input.assignedUserId,
          'assignee',
        )
      : null;

  const priority =
    [
      'low',
      'normal',
      'high',
      'urgent',
    ].includes(
      String(
        input.priority ||
        '',
      ),
    )
      ? String(
          input.priority,
        )
      : 'normal';

  const status =
    [
      'open',
      'in_progress',
      'completed',
      'cancelled',
    ].includes(
      String(
        input.status ||
        '',
      ),
    )
      ? String(
          input.status,
        )
      : 'open';

  const dueAt =
    safeDateTime(
      input.dueAt,
    );

  const completedAt =
    status ===
      'completed'
      ? new Date()
          .toISOString()
      : null;

  const taskId =
    input.taskId
      ? safeUuid(
          input.taskId,
          'task',
        )
      : null;

  const result =
    taskId
      ? await context.pool.query(
          `
            UPDATE sami_enterprise_record_tasks
            SET
              title = $7,
              details = $8,
              assigned_user_id = $9,
              due_at = $10,
              priority = $11,
              status = $12,
              completed_at = $13,
              updated_by = $14,
              updated_at = NOW()
            WHERE id = $1
              AND company_id = $2
              AND module_key = $3
              AND table_key = $4
              AND record_key = $5
              AND deleted_at IS NULL
            RETURNING *
          `,
          [
            taskId,
            context.companyId,
            context.moduleKey,
            context.table,
            context.recordKey,
            null,
            title,
            details,
            assignedUserId,
            dueAt,
            priority,
            status,
            completedAt,
            context.userId,
          ],
        )
      : await context.pool.query(
          `
            INSERT INTO sami_enterprise_record_tasks (
              company_id,
              module_key,
              table_key,
              record_key,
              title,
              details,
              assigned_user_id,
              due_at,
              priority,
              status,
              completed_at,
              created_by,
              updated_by,
              created_at,
              updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, NOW(), NOW()
            )
            RETURNING *
          `,
          [
            context.companyId,
            context.moduleKey,
            context.table,
            context.recordKey,
            title,
            details,
            assignedUserId,
            dueAt,
            priority,
            status,
            completedAt,
            context.userId,
          ],
        );

  if (
    result.rows.length !==
      1
  ) {
    throw new EnterpriseModuleError(
      'RECORD_NOT_FOUND',
      'The activity task could not be saved.',
    );
  }

  await recordCollaborationAudit(
    context,
    context.moduleKey +
    '.record.task.' +
    (
      taskId
        ? 'updated'
        : 'created'
    ),
    taskId
      ? 'Record task updated.'
      : 'Record task created.',
  );

  return result.rows[0];
}


export async function saveEnterpriseSavedView(
  moduleKey:
    string,
  input: {
    table?: unknown;
    viewId?: unknown;
    name?: unknown;
    layout?: unknown;
    searchText?: unknown;
    filters?: unknown;
    sort?: unknown;
    columns?: unknown;
    isDefault?: unknown;
  },
) {
  const context =
    await requireEnterpriseModuleTableContext(
      moduleKey,
      input.table,
      'view',
    );

  const name =
    safeText(
      input.name,
      160,
      'View name',
      true,
    );

  const layout =
    [
      'list',
      'kanban',
      'calendar',
    ].includes(
      String(
        input.layout ||
        '',
      ),
    )
      ? String(
          input.layout,
        )
      : 'list';

  const searchText =
    safeText(
      input.searchText,
      300,
      'Saved search',
    );

  const columns =
    safeStringArray(
      input.columns,
      30,
      100,
    );

  const count =
    await context.pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM sami_enterprise_saved_views
        WHERE company_id = $1
          AND user_id = $2
          AND module_key = $3
          AND table_key = $4
          AND deleted_at IS NULL
      `,
      [
        context.companyId,
        context.userId,
        context.moduleKey,
        context.table,
      ],
    );

  if (
    Number(
      count.rows[0]
        ?.count ||
      0,
    ) >=
      MAX_SAVED_VIEWS &&
    !input.viewId
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'You have reached the saved-view limit for this register.',
    );
  }

  if (
    input.isDefault ===
      true
  ) {
    await context.pool.query(
      `
        UPDATE sami_enterprise_saved_views
        SET
          is_default = FALSE,
          updated_at = NOW()
        WHERE company_id = $1
          AND user_id = $2
          AND module_key = $3
          AND table_key = $4
          AND deleted_at IS NULL
      `,
      [
        context.companyId,
        context.userId,
        context.moduleKey,
        context.table,
      ],
    );
  }

  const viewId =
    input.viewId
      ? safeUuid(
          input.viewId,
          'saved view',
        )
      : null;

  const result =
    viewId
      ? await context.pool.query(
          `
            UPDATE sami_enterprise_saved_views
            SET
              name = $6,
              layout = $7,
              search_text = $8,
              filters = $9::jsonb,
              sort = $10::jsonb,
              columns = $11::jsonb,
              is_default = $12,
              updated_at = NOW()
            WHERE id = $1
              AND company_id = $2
              AND user_id = $3
              AND module_key = $4
              AND table_key = $5
              AND deleted_at IS NULL
            RETURNING *
          `,
          [
            viewId,
            context.companyId,
            context.userId,
            context.moduleKey,
            context.table,
            name,
            layout,
            searchText,
            JSON.stringify(
              safeJsonObject(
                input.filters,
              ),
            ),
            JSON.stringify(
              safeJsonObject(
                input.sort,
              ),
            ),
            JSON.stringify(
              columns,
            ),
            input.isDefault ===
              true,
          ],
        )
      : await context.pool.query(
          `
            INSERT INTO sami_enterprise_saved_views (
              company_id,
              user_id,
              module_key,
              table_key,
              name,
              layout,
              search_text,
              filters,
              sort,
              columns,
              is_default,
              created_at,
              updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, NOW(), NOW()
            )
            ON CONFLICT (
              company_id,
              user_id,
              module_key,
              table_key,
              lower(name)
            )
            WHERE deleted_at IS NULL
            DO UPDATE
            SET
              layout = EXCLUDED.layout,
              search_text = EXCLUDED.search_text,
              filters = EXCLUDED.filters,
              sort = EXCLUDED.sort,
              columns = EXCLUDED.columns,
              is_default = EXCLUDED.is_default,
              updated_at = NOW()
            RETURNING *
          `,
          [
            context.companyId,
            context.userId,
            context.moduleKey,
            context.table,
            name,
            layout,
            searchText,
            JSON.stringify(
              safeJsonObject(
                input.filters,
              ),
            ),
            JSON.stringify(
              safeJsonObject(
                input.sort,
              ),
            ),
            JSON.stringify(
              columns,
            ),
            input.isDefault ===
              true,
          ],
        );

  return result.rows[0];
}


export async function deleteEnterpriseSavedView(
  moduleKey:
    string,
  input: {
    table?: unknown;
    viewId?: unknown;
  },
) {
  const context =
    await requireEnterpriseModuleTableContext(
      moduleKey,
      input.table,
      'view',
    );

  const viewId =
    safeUuid(
      input.viewId,
      'saved view',
    );

  const result =
    await context.pool.query(
      `
        UPDATE sami_enterprise_saved_views
        SET
          deleted_at = NOW(),
          is_default = FALSE,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND user_id = $3
          AND module_key = $4
          AND table_key = $5
          AND deleted_at IS NULL
        RETURNING id
      `,
      [
        viewId,
        context.companyId,
        context.userId,
        context.moduleKey,
        context.table,
      ],
    );

  return {
    removed:
      result.rows.length ===
      1,
  };
}


export async function saveEnterpriseCustomField(
  moduleKey:
    string,
  input: {
    table?: unknown;
    fieldId?: unknown;
    fieldKey?: unknown;
    label?: unknown;
    fieldType?: unknown;
    options?: unknown;
    required?: unknown;
    active?: unknown;
  },
) {
  const context =
    await requireEnterpriseModuleTableContext(
      moduleKey,
      input.table,
      'settings',
    );

  const label =
    safeText(
      input.label,
      160,
      'Custom field label',
      true,
    );

  const fieldKey =
    safeKey(
      input.fieldKey ||
      label,
      'Custom field key',
    );

  const fieldType =
    [
      'text',
      'textarea',
      'number',
      'checkbox',
      'date',
      'datetime',
      'select',
    ].includes(
      String(
        input.fieldType ||
        '',
      ),
    )
      ? String(
          input.fieldType,
        )
      : 'text';

  const options =
    fieldType ===
      'select'
      ? safeStringArray(
          input.options,
          100,
          120,
        )
      : [];

  const count =
    await context.pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM sami_enterprise_custom_fields
        WHERE company_id = $1
          AND module_key = $2
          AND table_key = $3
          AND deleted_at IS NULL
      `,
      [
        context.companyId,
        context.moduleKey,
        context.table,
      ],
    );

  if (
    Number(
      count.rows[0]
        ?.count ||
      0,
    ) >=
      MAX_CUSTOM_FIELDS &&
    !input.fieldId
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'This register has reached the custom-field limit.',
    );
  }

  const fieldId =
    input.fieldId
      ? safeUuid(
          input.fieldId,
          'custom field',
        )
      : null;

  const result =
    fieldId
      ? await context.pool.query(
          `
            UPDATE sami_enterprise_custom_fields
            SET
              field_key = $5,
              label = $6,
              field_type = $7,
              options = $8::jsonb,
              required = $9,
              active = $10,
              updated_by = $11,
              updated_at = NOW()
            WHERE id = $1
              AND company_id = $2
              AND module_key = $3
              AND table_key = $4
              AND deleted_at IS NULL
            RETURNING *
          `,
          [
            fieldId,
            context.companyId,
            context.moduleKey,
            context.table,
            fieldKey,
            label,
            fieldType,
            JSON.stringify(
              options,
            ),
            input.required ===
              true,
            input.active !==
              false,
            context.userId,
          ],
        )
      : await context.pool.query(
          `
            INSERT INTO sami_enterprise_custom_fields (
              company_id,
              module_key,
              table_key,
              field_key,
              label,
              field_type,
              options,
              required,
              active,
              created_by,
              updated_by,
              created_at,
              updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $10, NOW(), NOW()
            )
            RETURNING *
          `,
          [
            context.companyId,
            context.moduleKey,
            context.table,
            fieldKey,
            label,
            fieldType,
            JSON.stringify(
              options,
            ),
            input.required ===
              true,
            input.active !==
              false,
            context.userId,
          ],
        );

  if (
    result.rows.length !==
      1
  ) {
    throw new EnterpriseModuleError(
      'RECORD_NOT_FOUND',
      'The custom field could not be saved.',
    );
  }

  return result.rows[0];
}


export async function deleteEnterpriseCustomField(
  moduleKey:
    string,
  input: {
    table?: unknown;
    fieldId?: unknown;
  },
) {
  const context =
    await requireEnterpriseModuleTableContext(
      moduleKey,
      input.table,
      'settings',
    );

  const fieldId =
    safeUuid(
      input.fieldId,
      'custom field',
    );

  const result =
    await context.pool.query(
      `
        UPDATE sami_enterprise_custom_fields
        SET
          active = FALSE,
          deleted_at = NOW(),
          updated_by = $5,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND module_key = $3
          AND table_key = $4
          AND deleted_at IS NULL
        RETURNING id
      `,
      [
        fieldId,
        context.companyId,
        context.moduleKey,
        context.table,
        context.userId,
      ],
    );

  return {
    removed:
      result.rows.length ===
      1,
  };
}


export async function updateEnterpriseRecordExtras(
  moduleKey:
    string,
  input: {
    table?: unknown;
    recordId?: unknown;
    customValues?: unknown;
    tags?: unknown;
    watchers?: unknown;
  },
) {
  const context =
    await requireRecord(
      moduleKey,
      input.table,
      input.recordId,
      'edit',
    );

  const definitions =
    await context.pool.query(
      `
        SELECT
          field_key,
          field_type,
          required,
          options
        FROM sami_enterprise_custom_fields
        WHERE company_id = $1
          AND module_key = $2
          AND table_key = $3
          AND active = TRUE
          AND deleted_at IS NULL
      `,
      [
        context.companyId,
        context.moduleKey,
        context.table,
      ],
    );

  const byKey =
    new Map(
      definitions.rows.map(
        row => [
          String(
            row.field_key,
          ),
          row as {
            field_key:
              string;
            field_type:
              string;
            required:
              boolean;
            options:
              unknown;
          },
        ],
      ),
    );

  const current =
    await context.pool.query(
      `
        SELECT
          custom_values,
          tags,
          watchers
        FROM sami_enterprise_record_extras
        WHERE company_id = $1
          AND module_key = $2
          AND table_key = $3
          AND record_key = $4
        LIMIT 1
      `,
      [
        context.companyId,
        context.moduleKey,
        context.table,
        context.recordKey,
      ],
    );

  const existingValues =
    safeJsonObject(
      current.rows[0]
        ?.custom_values,
    );

  const requestedValues =
    safeJsonObject(
      input.customValues,
    );

  const nextValues: {
    [key: string]:
      unknown;
  } = {
    ...existingValues,
  };

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      requestedValues,
    )
  ) {
    const definition =
      byKey.get(
        key,
      );

    if (
      !definition
    ) {
      continue;
    }

    nextValues[
      key
    ] =
      normalizeCustomValue(
        definition,
        value,
      );
  }

  for (
    const definition
    of byKey.values()
  ) {
    if (
      definition.required
    ) {
      const value =
        nextValues[
          definition
            .field_key
        ];

      if (
        value ===
          null ||
        value ===
          undefined ||
        value ===
          ''
      ) {
        throw new EnterpriseModuleError(
          'INVALID_INPUT',
          definition.field_key +
          ' is required.',
        );
      }
    }
  }

  const tags =
    input.tags ===
      undefined
      ? safeStringArray(
          current.rows[0]
            ?.tags,
          20,
          40,
        )
      : safeStringArray(
          input.tags,
          20,
          40,
        );

  const watchers =
    input.watchers ===
      undefined
      ? safeStringArray(
          current.rows[0]
            ?.watchers,
          50,
          64,
        )
          .filter(
            isUuid,
          )
      : safeStringArray(
          input.watchers,
          50,
          64,
        )
          .filter(
            isUuid,
          );

  const result =
    await context.pool.query(
      `
        INSERT INTO sami_enterprise_record_extras (
          company_id,
          module_key,
          table_key,
          record_key,
          custom_values,
          tags,
          watchers,
          updated_by,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, NOW()
        )
        ON CONFLICT (
          company_id,
          module_key,
          table_key,
          record_key
        )
        DO UPDATE
        SET
          custom_values = EXCLUDED.custom_values,
          tags = EXCLUDED.tags,
          watchers = EXCLUDED.watchers,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING *
      `,
      [
        context.companyId,
        context.moduleKey,
        context.table,
        context.recordKey,
        JSON.stringify(
          nextValues,
        ),
        JSON.stringify(
          tags,
        ),
        JSON.stringify(
          watchers,
        ),
        context.userId,
      ],
    );

  await recordCollaborationAudit(
    context,
    context.moduleKey +
    '.record.extras.updated',
    'Record tags, watchers or custom fields updated.',
  );

  return result.rows[0];
}


export async function linkEnterpriseRecordFile(
  moduleKey:
    string,
  input: {
    table?: unknown;
    recordId?: unknown;
    fileId?: unknown;
  },
) {
  const context =
    await requireRecord(
      moduleKey,
      input.table,
      input.recordId,
      'edit',
    );

  if (
    !isUuid(
      context.recordKey,
    )
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'Attachments require a UUID-backed record.',
    );
  }

  const fileId =
    safeUuid(
      input.fileId,
      'file',
    );

  const result =
    await linkWorkspaceFileForAuthorizedCaller({
      tenantId:
        context.tenantId,
      userId:
        context.userId,
      companyId:
        context.companyId,
      fileId,
      moduleKey:
        context.moduleKey,
      model:
        context.table,
      recordId:
        context.recordKey,
      purpose:
        'attachment',
    });

  await recordCollaborationAudit(
    context,
    context.moduleKey +
    '.record.file.linked',
    'File attached to business record.',
    {
      fileId,
    },
  );

  return result;
}


export async function unlinkEnterpriseRecordFile(
  moduleKey:
    string,
  input: {
    table?: unknown;
    recordId?: unknown;
    fileId?: unknown;
  },
) {
  const context =
    await requireRecord(
      moduleKey,
      input.table,
      input.recordId,
      'edit',
    );

  if (
    !isUuid(
      context.recordKey,
    )
  ) {
    throw new EnterpriseModuleError(
      'INVALID_INPUT',
      'Attachments require a UUID-backed record.',
    );
  }

  const fileId =
    safeUuid(
      input.fileId,
      'file',
    );

  const result =
    await unlinkWorkspaceFileForAuthorizedCaller({
      tenantId:
        context.tenantId,
      userId:
        context.userId,
      companyId:
        context.companyId,
      fileId,
      moduleKey:
        context.moduleKey,
      model:
        context.table,
      recordId:
        context.recordKey,
      purpose:
        'attachment',
    });

  await recordCollaborationAudit(
    context,
    context.moduleKey +
    '.record.file.unlinked',
    'File removed from business record.',
    {
      fileId,
    },
  );

  return result;
}
