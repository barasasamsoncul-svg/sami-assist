import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';

import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';

import {
  ACCOUNTING_CHART_TEMPLATES,
  ACCOUNT_TYPE_BY_KEY,
  type AccountingChartTemplate,
  type AccountTypeKey,
} from './chart-config';

import {
  AccountingInputError,
  accountingId,
} from './validation';


/* definitions live in chart-config.ts so server and UI share one source */
const TYPE_MAP =
  ACCOUNT_TYPE_BY_KEY;


const SETTING_ROLE_COLUMNS:
  Record<
    string,
    string
  > = {
    receivable_control:
      'default_receivable_account_id',
    payable_control:
      'default_payable_account_id',
    retained_earnings:
      'retained_earnings_account_id',
    output_tax:
      'output_tax_account_id',
    input_tax:
      'input_tax_account_id',
    cash_default:
      'default_cash_account_id',
    fx_gain:
      'fx_gain_account_id',
    fx_loss:
      'fx_loss_account_id',
    write_off:
      'write_off_account_id',
    rounding:
      'rounding_account_id',
  };


export type ChartAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  normalBalance: 'debit' | 'credit';
  parentAccountId: string | null;
  parentCode: string | null;
  parentName: string | null;
  isActive: boolean;
  reconcile: boolean;
  allowManualPosting: boolean;
  isControlAccount: boolean;
  systemRole: string | null;
  description: string;
  sequence: number;
  templateKey: string | null;
  childCount: number;
  journalLineCount: number;
  postedBalance: string;
  usedBySetup: boolean;
};


export type ChartOfAccountsData = {
  companyId: string;
  currency: string;
  accounts: ChartAccount[];
  templates: Array<
    Pick<
      AccountingChartTemplate,
      'key' |
      'name' |
      'description' |
      'country' |
      'industry'
    >
  >;
};


function textValue(
  value:
    unknown,
  max:
    number,
  label:
    string,
  required =
    false,
) {
  if (
    value !==
      null &&
    value !==
      undefined &&
    typeof value !==
      'string'
  ) {
    throw new AccountingInputError(
      label +
      ' must contain text.',
    );
  }

  const text =
    String(
      value ||
      '',
    ).trim();

  if (
    (
      required &&
      !text
    ) ||
    text.length >
      max
  ) {
    throw new AccountingInputError(
      required
        ? `Enter ${label.toLowerCase()} using at most ${max} characters.`
        : `${label} cannot exceed ${max} characters.`,
    );
  }

  return text;
}


function booleanValue(
  value:
    unknown,
  label:
    string,
) {
  if (
    value !==
      true &&
    value !==
      false
  ) {
    throw new AccountingInputError(
      label +
      ' must be enabled or disabled.',
    );
  }

  return value;
}


function sequenceValue(
  value:
    unknown,
) {
  const number =
    typeof value ===
      'number'
      ? value
      : Number(
          value,
        );

  if (
    !Number.isInteger(
      number,
    ) ||
    number <
      0 ||
    number >
      999999
  ) {
    throw new AccountingInputError(
      'Account sequence must be a whole number between 0 and 999999.',
    );
  }

  return number;
}


function accountCode(
  value:
    unknown,
) {
  const code =
    textValue(
      value,
      50,
      'Account code',
      true,
    )
      .toUpperCase();

  if (
    !/^[A-Z0-9][A-Z0-9._-]{0,49}$/.test(
      code,
    )
  ) {
    throw new AccountingInputError(
      'Account code can use letters, numbers, dots, hyphens and underscores.',
    );
  }

  return code;
}


function accountType(
  value:
    unknown,
) {
  const type =
    String(
      value ||
      '',
    ) as
      AccountTypeKey;

  const definition =
    TYPE_MAP.get(
      type,
    );

  if (
    !definition
  ) {
    throw new AccountingInputError(
      'Choose a supported Accounting account type.',
    );
  }

  return definition;
}


function optionalId(
  value:
    unknown,
) {
  return value
    ? accountingId(
        value,
      )
    : null;
}


function parseAccountInput(
  input:
    unknown,
  mode:
    'create' |
    'update',
) {
  if (
    !input ||
    typeof input !==
      'object' ||
    Array.isArray(
      input,
    )
  ) {
    throw new AccountingInputError(
      'Enter a valid account.',
    );
  }

  const body =
    input as
      Record<
        string,
        unknown
      >;

  const type =
    accountType(
      body.accountType,
    );

  return {
    expectedCompanyId:
      accountingId(
        body.expectedCompanyId,
      ),
    accountId:
      mode ===
        'update'
        ? accountingId(
            body.accountId,
          )
        : null,
    code:
      accountCode(
        body.code,
      ),
    name:
      textValue(
        body.name,
        255,
        'Account name',
        true,
      ),
    accountType:
      type.key,
    normalBalance:
      type.normalBalance,
    parentAccountId:
      optionalId(
        body.parentAccountId,
      ),
    reconcile:
      body.reconcile ===
        undefined
        ? type.reconcileDefault
        : booleanValue(
            body.reconcile,
            'Reconciliation',
          ),
    allowManualPosting:
      body.allowManualPosting ===
        undefined
        ? true
        : booleanValue(
            body.allowManualPosting,
            'Manual posting',
          ),
    description:
      textValue(
        body.description,
        2000,
        'Description',
      ),
    sequence:
      body.sequence ===
        undefined
        ? 100
        : sequenceValue(
            body.sequence,
          ),
  };
}


async function assertParentAllowed(
  client:
    PoolClient,
  companyId:
    string,
  parentAccountId:
    string | null,
  accountId:
    string | null,
) {
  if (
    !parentAccountId
  ) {
    return;
  }

  if (
    accountId &&
    parentAccountId ===
      accountId
  ) {
    throw new AccountingInputError(
      'An account cannot be its own parent.',
    );
  }

  const parent =
    await client.query(
      `
        SELECT id
        FROM accounts
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
          AND is_active = TRUE
        LIMIT 1
      `,
      [
        parentAccountId,
        companyId,
      ],
    );

  if (
    !parent.rows[0]
  ) {
    throw new AccountingInputError(
      'Choose an active parent account from this company.',
    );
  }

  if (
    accountId
  ) {
    const descendants =
      await client.query(
        `
          WITH RECURSIVE tree AS (
            SELECT id
            FROM accounts
            WHERE parent_account_id = $1
              AND company_id = $2
              AND deleted_at IS NULL
            UNION ALL
            SELECT child.id
            FROM accounts child
            INNER JOIN tree parent
              ON child.parent_account_id =
                 parent.id
            WHERE child.company_id = $2
              AND child.deleted_at IS NULL
          )
          SELECT 1
          FROM tree
          WHERE id = $3
          LIMIT 1
        `,
        [
          accountId,
          companyId,
          parentAccountId,
        ],
      );

    if (
      descendants.rows[0]
    ) {
      throw new AccountingInputError(
        'An account cannot be moved beneath one of its descendants.',
      );
    }
  }
}


async function ensureUniqueCode(
  client:
    PoolClient,
  companyId:
    string,
  code:
    string,
  accountId:
    string | null,
) {
  const duplicate =
    await client.query(
      `
        SELECT id
        FROM accounts
        WHERE company_id = $1
          AND code = $2
          AND deleted_at IS NULL
          AND (
            $3::uuid IS NULL
            OR id <> $3::uuid
          )
        LIMIT 1
      `,
      [
        companyId,
        code,
        accountId,
      ],
    );

  if (
    duplicate.rows[0]
  ) {
    throw new AccountingInputError(
      'That account code is already in use for this company.',
    );
  }
}


async function loadAccountForUpdate(
  client:
    PoolClient,
  companyId:
    string,
  accountId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          a.*,
          (
            SELECT COUNT(*)::int
            FROM journal_lines l
            WHERE l.company_id = a.company_id
              AND l.account_id = a.id
              AND l.deleted_at IS NULL
          ) AS journal_line_count
        FROM accounts a
        WHERE a.id = $1
          AND a.company_id = $2
          AND a.deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [
        accountId,
        companyId,
      ],
    );

  const row =
    result.rows[0];

  if (!row) {
    throw new AccountingInputError(
      'Accounting account was not found in this company.',
    );
  }

  return row;
}


export async function getChartOfAccounts():
  Promise<ChartOfAccountsData> {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounts',
      'view',
    );

  const result =
    await context.pool.query(
      `
        SELECT
          a.id::text,
          a.code,
          a.name,
          a.account_type,
          a.normal_balance,
          a.parent_account_id::text,
          parent.code AS parent_code,
          parent.name AS parent_name,
          a.is_active,
          a.reconcile,
          a.allow_manual_posting,
          a.is_control_account,
          a.system_role,
          COALESCE(a.description, '') AS description,
          a.sequence,
          a.template_key,
          (
            SELECT COUNT(*)::int
            FROM accounts child
            WHERE child.company_id = a.company_id
              AND child.parent_account_id = a.id
              AND child.deleted_at IS NULL
          ) AS child_count,
          (
            SELECT COUNT(*)::int
            FROM journal_lines l
            WHERE l.company_id = a.company_id
              AND l.account_id = a.id
              AND l.deleted_at IS NULL
          ) AS journal_line_count,
          COALESCE(
            (
              SELECT
                SUM(l.debit - l.credit)
              FROM journal_lines l
              INNER JOIN journals j
                ON j.id = l.journal_id
               AND j.company_id = l.company_id
               AND j.deleted_at IS NULL
               AND j.status = 'posted'
              WHERE l.company_id = a.company_id
                AND l.account_id = a.id
                AND l.deleted_at IS NULL
            ),
            0
          )::text AS posted_balance,
          (
            SELECT
              (
                s.default_receivable_account_id = a.id
                OR s.default_payable_account_id = a.id
                OR s.retained_earnings_account_id = a.id
                OR s.output_tax_account_id = a.id
                OR s.input_tax_account_id = a.id
                OR s.default_cash_account_id = a.id
                OR s.fx_gain_account_id = a.id
                OR s.fx_loss_account_id = a.id
                OR s.write_off_account_id = a.id
                OR s.rounding_account_id = a.id
              )
            FROM accounting_settings s
            WHERE s.company_id = a.company_id
              AND s.deleted_at IS NULL
            LIMIT 1
          ) IS TRUE AS used_by_setup
        FROM accounts a
        LEFT JOIN accounts parent
          ON parent.id =
             a.parent_account_id
         AND parent.company_id =
             a.company_id
         AND parent.deleted_at
             IS NULL
        WHERE a.company_id = $1
          AND a.deleted_at IS NULL
        ORDER BY
          a.sequence,
          a.code,
          a.id
      `,
      [
        context.companyId,
      ],
    );

  return {
    companyId:
      context.companyId,
    currency:
      context.company
        .currentCompany
        .currency,
    accounts:
      result.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          code:
            String(
              row.code,
            ),
          name:
            String(
              row.name,
            ),
          accountType:
            String(
              row.account_type,
            ),
          normalBalance:
            row.normal_balance ===
              'credit'
              ? 'credit'
              : 'debit',
          parentAccountId:
            row.parent_account_id
              ? String(
                  row.parent_account_id,
                )
              : null,
          parentCode:
            row.parent_code
              ? String(
                  row.parent_code,
                )
              : null,
          parentName:
            row.parent_name
              ? String(
                  row.parent_name,
                )
              : null,
          isActive:
            row.is_active ===
            true,
          reconcile:
            row.reconcile ===
            true,
          allowManualPosting:
            row.allow_manual_posting !==
            false,
          isControlAccount:
            row.is_control_account ===
            true,
          systemRole:
            row.system_role
              ? String(
                  row.system_role,
                )
              : null,
          description:
            String(
              row.description ||
              '',
            ),
          sequence:
            Number(
              row.sequence ||
              0,
            ),
          templateKey:
            row.template_key
              ? String(
                  row.template_key,
                )
              : null,
          childCount:
            Number(
              row.child_count ||
              0,
            ),
          journalLineCount:
            Number(
              row.journal_line_count ||
              0,
            ),
          postedBalance:
            String(
              row.posted_balance ||
              '0',
            ),
          usedBySetup:
            row.used_by_setup ===
            true,
        }),
      ),
    templates:
      ACCOUNTING_CHART_TEMPLATES.map(
        ({
          accounts:
            _accounts,
          ...template
        }) =>
          template,
      ),
  };
}


export async function createAccountingAccount(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounts',
      'create',
    );

  const payload =
    parseAccountInput(
      input,
      'create',
    );

  if (
    payload.expectedCompanyId !==
      context.companyId
  ) {
    throw new AccountingInputError(
      'Your company changed. Reload Chart of Accounts before saving.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await ensureUniqueCode(
      client,
      context.companyId,
      payload.code,
      null,
    );

    await assertParentAllowed(
      client,
      context.companyId,
      payload.parentAccountId,
      null,
    );

    const created =
      await client.query(
        `
          INSERT INTO accounts (
            company_id,
            code,
            name,
            account_type,
            normal_balance,
            parent_account_id,
            is_active,
            reconcile,
            allow_manual_posting,
            is_control_account,
            system_role,
            description,
            sequence,
            created_by,
            updated_by,
            created_at,
            updated_at,
            deleted_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,TRUE,$7,$8,FALSE,NULL,$9,$10,$11,$11,NOW(),NOW(),NULL
          )
          RETURNING id::text
        `,
        [
          context.companyId,
          payload.code,
          payload.name,
          payload.accountType,
          payload.normalBalance,
          payload.parentAccountId,
          payload.reconcile,
          payload.allowManualPosting,
          payload.description ||
            null,
          payload.sequence,
          context.userId,
        ],
      );

    await client.query(
      'COMMIT',
    );

    const id =
      String(
        created.rows[0].id,
      );

    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      action:
        'accounting.account.created',
      module:
        'accounting',
      resourceType:
        'accounts',
      resourceId:
        id,
      summary:
        `Account ${payload.code} · ${payload.name} created`,
      result:
        'success',
      metadata: {
        accountType:
          payload.accountType,
        parentAccountId:
          payload.parentAccountId,
      },
    }).catch(
      error =>
        console.error(
          '[Accounting] Account audit delivery failed',
          error,
        ),
    );

    return {
      id,
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


export async function updateAccountingAccount(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounts',
      'edit',
    );

  const payload =
    parseAccountInput(
      input,
      'update',
    );

  if (
    payload.expectedCompanyId !==
      context.companyId ||
    !payload.accountId
  ) {
    throw new AccountingInputError(
      'Your company or account changed. Reload Chart of Accounts before saving.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const current =
      await loadAccountForUpdate(
        client,
        context.companyId,
        payload.accountId,
      );

    await ensureUniqueCode(
      client,
      context.companyId,
      payload.code,
      payload.accountId,
    );

    await assertParentAllowed(
      client,
      context.companyId,
      payload.parentAccountId,
      payload.accountId,
    );

    const used =
      Number(
        current.journal_line_count ||
        0,
      ) >
      0;

    if (
      used &&
      (
        String(
          current.account_type,
        ) !==
          payload.accountType ||
        String(
          current.normal_balance,
        ) !==
          payload.normalBalance
      )
    ) {
      throw new AccountingInputError(
        'An account already used by journal entries cannot change account type or normal balance.',
      );
    }

    if (
      current.system_role &&
      String(
        current.account_type,
      ) !==
        payload.accountType
    ) {
      throw new AccountingInputError(
        'A system control account cannot change account type. Change the Accounting Setup mapping first.',
      );
    }

    await client.query(
      `
        UPDATE accounts
        SET
          code = $3,
          name = $4,
          account_type = $5,
          normal_balance = $6,
          parent_account_id = $7,
          reconcile = $8,
          allow_manual_posting = $9,
          description = $10,
          sequence = $11,
          updated_by = $12,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        payload.accountId,
        context.companyId,
        payload.code,
        payload.name,
        payload.accountType,
        payload.normalBalance,
        payload.parentAccountId,
        payload.reconcile,
        payload.allowManualPosting,
        payload.description ||
          null,
        payload.sequence,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      action:
        'accounting.account.updated',
      module:
        'accounting',
      resourceType:
        'accounts',
      resourceId:
        payload.accountId,
      summary:
        `Account ${payload.code} · ${payload.name} updated`,
      result:
        'success',
    }).catch(
      error =>
        console.error(
          '[Accounting] Account update audit delivery failed',
          error,
        ),
    );

    return {
      id:
        payload.accountId,
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


export async function setAccountingAccountActive(
  input:
    unknown,
  active:
    boolean,
) {
  if (
    !input ||
    typeof input !==
      'object' ||
    Array.isArray(
      input,
    )
  ) {
    throw new AccountingInputError(
      'Choose an Accounting account.',
    );
  }

  const body =
    input as
      Record<
        string,
        unknown
      >;

  const expectedCompanyId =
    accountingId(
      body.expectedCompanyId,
    );

  const accountId =
    accountingId(
      body.accountId,
    );

  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounts',
      'edit',
    );

  if (
    expectedCompanyId !==
      context.companyId
  ) {
    throw new AccountingInputError(
      'Your company changed. Reload Chart of Accounts before continuing.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const current =
      await loadAccountForUpdate(
        client,
        context.companyId,
        accountId,
      );

    if (
      !active
    ) {
      if (
        current.system_role ||
        current.is_control_account
      ) {
        throw new AccountingInputError(
          'A system or control account cannot be archived while it owns an Accounting role.',
        );
      }

      const references =
        await client.query(
          `
            SELECT
              (
                default_receivable_account_id = $1
                OR default_payable_account_id = $1
                OR retained_earnings_account_id = $1
                OR output_tax_account_id = $1
                OR input_tax_account_id = $1
                OR default_cash_account_id = $1
                OR fx_gain_account_id = $1
                OR fx_loss_account_id = $1
                OR write_off_account_id = $1
                OR rounding_account_id = $1
              ) AS referenced
            FROM accounting_settings
            WHERE company_id = $2
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [
            accountId,
            context.companyId,
          ],
        );

      if (
        references.rows[0]
          ?.referenced ===
        true
      ) {
        throw new AccountingInputError(
          'This account is used by Accounting Setup. Map that role to another account before archiving it.',
        );
      }

      const children =
        await client.query(
          `
            SELECT 1
            FROM accounts
            WHERE company_id = $1
              AND parent_account_id = $2
              AND deleted_at IS NULL
              AND is_active = TRUE
            LIMIT 1
          `,
          [
            context.companyId,
            accountId,
          ],
        );

      if (
        children.rows[0]
      ) {
        throw new AccountingInputError(
          'Archive or move active child accounts before archiving their parent.',
        );
      }

      const balance =
        await client.query(
          `
            SELECT
              COALESCE(
                SUM(
                  l.debit -
                  l.credit
                ),
                0
              )::numeric
                AS balance
            FROM journal_lines l
            INNER JOIN journals j
              ON j.id =
                 l.journal_id
             AND j.company_id =
                 l.company_id
             AND j.deleted_at
                 IS NULL
             AND j.status =
                 'posted'
            WHERE l.company_id =
                  $1
              AND l.account_id =
                  $2
              AND l.deleted_at
                  IS NULL
          `,
          [
            context.companyId,
            accountId,
          ],
        );

      if (
        Number(
          balance.rows[0]
            ?.balance ||
          0,
        ) !==
        0
      ) {
        throw new AccountingInputError(
          'Bring this account to a zero posted balance before archiving it.',
        );
      }
    }

    await client.query(
      `
        UPDATE accounts
        SET
          is_active = $3,
          updated_by = $4,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND deleted_at IS NULL
      `,
      [
        accountId,
        context.companyId,
        active,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      action:
        active
          ? 'accounting.account.restored'
          : 'accounting.account.archived',
      module:
        'accounting',
      resourceType:
        'accounts',
      resourceId:
        accountId,
      summary:
        active
          ? `Account ${String(current.code)} restored`
          : `Account ${String(current.code)} archived`,
      result:
        'success',
    }).catch(
      error =>
        console.error(
          '[Accounting] Account status audit delivery failed',
          error,
        ),
    );

    return {
      id:
        accountId,
      active,
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


export async function applyAccountingChartTemplate(
  input:
    unknown,
) {
  if (
    !input ||
    typeof input !==
      'object' ||
    Array.isArray(
      input,
    )
  ) {
    throw new AccountingInputError(
      'Choose an Accounting chart template.',
    );
  }

  const body =
    input as
      Record<
        string,
        unknown
      >;

  const expectedCompanyId =
    accountingId(
      body.expectedCompanyId,
    );

  const templateKey =
    textValue(
      body.templateKey,
      80,
      'Template',
      true,
    );

  const template =
    ACCOUNTING_CHART_TEMPLATES.find(
      item =>
        item.key ===
        templateKey,
    );

  if (!template) {
    throw new AccountingInputError(
      'Choose a supported Accounting chart template.',
    );
  }

  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounts',
      'settings',
    );

  if (
    expectedCompanyId !==
      context.companyId
  ) {
    throw new AccountingInputError(
      'Your company changed. Reload Chart of Accounts before applying a template.',
    );
  }

  const client =
    await context.pool.connect();

  let created =
    0;

  let reused =
    0;

  const conflicts:
    string[] = [];

  try {
    await client.query(
      'BEGIN',
    );

    const idsByCode =
      new Map<
        string,
        string
      >();

    const idsByRole =
      new Map<
        string,
        string
      >();

    for (
      const entry
      of template.accounts
    ) {
      const definition =
        TYPE_MAP.get(
          entry.accountType,
        )!;

      const existing =
        await client.query(
          `
            SELECT
              id::text,
              name,
              account_type,
              system_role
            FROM accounts
            WHERE company_id = $1
              AND code = $2
              AND deleted_at IS NULL
            LIMIT 1
            FOR UPDATE
          `,
          [
            context.companyId,
            entry.code,
          ],
        );

      let id:
        string;

      if (
        existing.rows[0]
      ) {
        const row =
          existing.rows[0];

        if (
          String(
            row.account_type,
          ) !==
            entry.accountType
        ) {
          conflicts.push(
            entry.code +
            ' · ' +
            entry.name,
          );

          continue;
        }

        id =
          String(
            row.id,
          );

        reused +=
          1;
      } else {
        const inserted =
          await client.query(
            `
              INSERT INTO accounts (
                company_id,
                code,
                name,
                account_type,
                normal_balance,
                is_active,
                reconcile,
                allow_manual_posting,
                is_control_account,
                system_role,
                description,
                sequence,
                template_key,
                created_by,
                updated_by,
                created_at,
                updated_at,
                deleted_at
              )
              VALUES (
                $1,$2,$3,$4,$5,TRUE,$6,$7,$8,$9,$10,$11,$12,$13,$13,NOW(),NOW(),NULL
              )
              RETURNING id::text
            `,
            [
              context.companyId,
              entry.code,
              entry.name,
              entry.accountType,
              definition.normalBalance,
              definition.reconcileDefault,
              entry.manualPosting !==
                false,
              FALSE,
              NULL,
              entry.description ||
                null,
              Number(
                entry.code.replace(
                  /\D/g,
                  '',
                )
                .slice(
                  0,
                  6,
                ) ||
                100,
              ),
              template.key,
              context.userId,
            ],
          );

        id =
          String(
            inserted.rows[0].id,
          );

        created +=
          1;
      }

      idsByCode.set(
        entry.code,
        id,
      );

      if (
        entry.systemRole
      ) {
        const occupied =
          await client.query(
            `
              SELECT id::text
              FROM accounts
              WHERE company_id = $1
                AND system_role = $2
                AND deleted_at IS NULL
              LIMIT 1
            `,
            [
              context.companyId,
              entry.systemRole,
            ],
          );

        if (
          !occupied.rows[0] ||
          String(
            occupied.rows[0].id,
          ) ===
            id
        ) {
          await client.query(
            `
              UPDATE accounts
              SET
                system_role =
                  COALESCE(
                    system_role,
                    $3
                  ),
                is_control_account =
                  TRUE,
                updated_by =
                  $4,
                updated_at =
                  NOW()
              WHERE id = $1
                AND company_id = $2
                AND deleted_at IS NULL
            `,
            [
              id,
              context.companyId,
              entry.systemRole,
              context.userId,
            ],
          );

          idsByRole.set(
            entry.systemRole,
            id,
          );
        }
      }
    }

    for (
      const entry
      of template.accounts
    ) {
      if (
        !entry.parentCode
      ) {
        continue;
      }

      const id =
        idsByCode.get(
          entry.code,
        );

      const parentId =
        idsByCode.get(
          entry.parentCode,
        );

      if (
        id &&
        parentId
      ) {
        await client.query(
          `
            UPDATE accounts
            SET
              parent_account_id =
                COALESCE(
                  parent_account_id,
                  $3
                ),
              updated_by =
                $4,
              updated_at =
                NOW()
            WHERE id = $1
              AND company_id = $2
              AND deleted_at IS NULL
          `,
          [
            id,
            context.companyId,
            parentId,
            context.userId,
          ],
        );
      }
    }

    await client.query(
      `
        INSERT INTO accounting_settings (
          company_id,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        VALUES (
          $1,$2,$2,NOW(),NOW()
        )
        ON CONFLICT (
          company_id
        )
        DO UPDATE
        SET
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW(),
          deleted_at =
            NULL
      `,
      [
        context.companyId,
        context.userId,
      ],
    );

    const mappingValues:
      Record<
        string,
        string | null
      > = {};

    for (
      const [
        role,
        column,
      ]
      of Object.entries(
        SETTING_ROLE_COLUMNS,
      )
    ) {
      mappingValues[
        column
      ] =
        idsByRole.get(
          role,
        ) ||
        null;
    }

    await client.query(
      `
        UPDATE accounting_settings
        SET
          default_receivable_account_id =
            COALESCE(
              default_receivable_account_id,
              $2::uuid
            ),
          default_payable_account_id =
            COALESCE(
              default_payable_account_id,
              $3::uuid
            ),
          retained_earnings_account_id =
            COALESCE(
              retained_earnings_account_id,
              $4::uuid
            ),
          output_tax_account_id =
            COALESCE(
              output_tax_account_id,
              $5::uuid
            ),
          input_tax_account_id =
            COALESCE(
              input_tax_account_id,
              $6::uuid
            ),
          default_cash_account_id =
            COALESCE(
              default_cash_account_id,
              $7::uuid
            ),
          fx_gain_account_id =
            COALESCE(
              fx_gain_account_id,
              $8::uuid
            ),
          fx_loss_account_id =
            COALESCE(
              fx_loss_account_id,
              $9::uuid
            ),
          write_off_account_id =
            COALESCE(
              write_off_account_id,
              $10::uuid
            ),
          rounding_account_id =
            COALESCE(
              rounding_account_id,
              $11::uuid
            ),
          updated_by =
            $12,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND deleted_at
              IS NULL
      `,
      [
        context.companyId,
        mappingValues.default_receivable_account_id,
        mappingValues.default_payable_account_id,
        mappingValues.retained_earnings_account_id,
        mappingValues.output_tax_account_id,
        mappingValues.input_tax_account_id,
        mappingValues.default_cash_account_id,
        mappingValues.fx_gain_account_id,
        mappingValues.fx_loss_account_id,
        mappingValues.write_off_account_id,
        mappingValues.rounding_account_id,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      action:
        'accounting.chart.template_applied',
      module:
        'accounting',
      resourceType:
        'accounts',
      resourceId:
        template.key,
      summary:
        `Accounting chart template applied: ${template.name}`,
      result:
        'success',
      metadata: {
        created,
        reused,
        conflicts:
          conflicts.length,
      },
    }).catch(
      error =>
        console.error(
          '[Accounting] Chart template audit delivery failed',
          error,
        ),
    );

    return {
      template:
        template.name,
      created,
      reused,
      conflicts,
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
