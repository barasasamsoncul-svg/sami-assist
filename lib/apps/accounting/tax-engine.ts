import 'server-only';

import type { PoolClient } from 'pg';

import { requireEnterpriseModuleTableContext } from '@/lib/apps/enterprise/service';
import { postBalancedLedgerJournal, reversePostedLedgerJournal } from '@/lib/apps/accounting/ledger-engine';
import {
  accountingDate,
  accountingId,
  AccountingInputError,
  decimalAmount,
  minorUnits,
} from '@/lib/apps/accounting/validation';
import { recordWorkspaceAuditEvent } from '@/lib/services/workspace-activity';

const RATE_SCALE = BigInt(10000);
const PERCENT_SCALE = BigInt(1000000);

type TaxDefinition = {
  id: string;
  code: string;
  name: string;
  rate: string;
  rateUnits: bigint;
  recoverableRate: string;
  recoverableRateUnits: bigint;
  calculation: 'exclusive' | 'inclusive';
  inputAccountId: string | null;
  outputAccountId: string | null;
  nonrecoverableAccountId: string | null;
  sequenceNo: number;
  compound: boolean;
};

export type AccountingTaxComponent = {
  taxCodeId: string;
  taxCode: string;
  taxName: string;
  rate: string;
  recoverableRate: string;
  taxableAmount: string;
  taxAmount: string;
  recoverableTaxAmount: string;
  nonrecoverableTaxAmount: string;
  calculation: 'exclusive' | 'inclusive';
  sequenceNo: number;
  compound: boolean;
  inputAccountId: string | null;
  outputAccountId: string | null;
  nonrecoverableAccountId: string | null;
};

export type AccountingTaxCalculation = {
  calculation: 'exclusive' | 'inclusive';
  netAmount: string;
  taxAmount: string;
  totalAmount: string;
  recoverableTaxAmount: string;
  nonrecoverableTaxAmount: string;
  components: AccountingTaxComponent[];
};

function bodyOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AccountingInputError('Enter valid tax data.');
  }
  return value as Record<string, unknown>;
}

function optionalId(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  return accountingId(value);
}

function shortText(value: unknown, max: number, label: string, required = false) {
  if (value != null && typeof value !== 'string') {
    throw new AccountingInputError(label + ' must contain text.');
  }
  const result = typeof value === 'string' ? value.trim() : '';
  if ((required && !result) || result.length > max) {
    throw new AccountingInputError(
      required
        ? label + ' is required and must be at most ' + max + ' characters.'
        : label + ' must be at most ' + max + ' characters.',
    );
  }
  return result;
}

function rateText(value: unknown, label: string) {
  const raw = value === '' || value == null ? '0' : String(value).trim();
  if (!/^\d{1,3}(?:\.\d{1,4})?$/.test(raw)) {
    throw new AccountingInputError(label + ' must be between 0 and 100 with at most four decimal places.');
  }
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new AccountingInputError(label + ' must be between 0 and 100.');
  }
  return number.toFixed(4);
}

function rateUnits(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * RATE_SCALE + BigInt(fraction.padEnd(4, '0').slice(0, 4));
}

function roundDivide(numerator: bigint, denominator: bigint) {
  if (denominator <= BigInt(0)) throw new Error('Invalid accounting denominator.');
  return (numerator + denominator / BigInt(2)) / denominator;
}

function taxForBase(base: bigint, definition: TaxDefinition) {
  return roundDivide(base * definition.rateUnits, PERCENT_SCALE);
}

function recoverableForTax(tax: bigint, definition: TaxDefinition) {
  return roundDivide(tax * definition.recoverableRateUnits, PERCENT_SCALE);
}

function computeExclusive(net: bigint, definitions: TaxDefinition[]) {
  let accumulated = BigInt(0);
  const components: Array<{
    definition: TaxDefinition;
    taxable: bigint;
    tax: bigint;
    recoverable: bigint;
    nonrecoverable: bigint;
  }> = [];

  for (const definition of definitions) {
    const taxable = definition.compound ? net + accumulated : net;
    const tax = taxForBase(taxable, definition);
    const recoverable = recoverableForTax(tax, definition);
    components.push({
      definition,
      taxable,
      tax,
      recoverable,
      nonrecoverable: tax - recoverable,
    });
    accumulated += tax;
  }

  return { net, totalTax: accumulated, total: net + accumulated, components };
}

function computeInclusive(gross: bigint, definitions: TaxDefinition[]) {
  let low = BigInt(0);
  let high = gross;
  let best = computeExclusive(gross, definitions);

  while (low <= high) {
    const mid = (low + high) / BigInt(2);
    const current = computeExclusive(mid, definitions);
    const currentDistance = current.total > gross ? current.total - gross : gross - current.total;
    const bestDistance = best.total > gross ? best.total - gross : gross - best.total;
    if (currentDistance < bestDistance) best = current;
    if (current.total === gross) {
      best = current;
      break;
    }
    if (current.total < gross) low = mid + BigInt(1);
    else high = mid - BigInt(1);
  }

  if (best.total !== gross && best.components.length) {
    const difference = gross - best.total;
    const last = best.components[best.components.length - 1];
    const nextTax = last.tax + difference;
    if (nextTax < BigInt(0)) {
      throw new AccountingInputError('This inclusive tax combination cannot be represented at ledger precision.');
    }
    const nextRecoverable = recoverableForTax(nextTax, last.definition);
    last.tax = nextTax;
    last.recoverable = nextRecoverable;
    last.nonrecoverable = nextTax - nextRecoverable;
    best.totalTax += difference;
    best.total = gross;
  }

  return best;
}

async function taxDefinitions(
  client: PoolClient,
  input: {
    companyId: string;
    taxCodeId?: string | null;
    taxGroupId?: string | null;
    taxDate: string;
    direction: 'input' | 'output';
  },
) {
  if (Boolean(input.taxCodeId) === Boolean(input.taxGroupId)) {
    throw new AccountingInputError('Choose one tax code or one tax group.');
  }

  if (input.taxCodeId) {
    const result = await client.query(
      `SELECT id::text,code,name,rate::text,recoverable_rate::text,calculation,
              input_account_id::text,output_account_id::text,nonrecoverable_account_id::text
       FROM accounting_tax_codes
       WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL AND status='active'
         AND direction IN ($3,'both')
         AND (valid_from IS NULL OR valid_from <= $4::date)
         AND (valid_to IS NULL OR valid_to >= $4::date)
       LIMIT 1`,
      [input.companyId, input.taxCodeId, input.direction, input.taxDate],
    );
    if (!result.rows[0]) {
      throw new AccountingInputError('The selected tax code is inactive, invalid for this transaction, or outside its effective dates.');
    }
    const row = result.rows[0];
    const rate = rateText(row.rate, 'Tax rate');
    const recoverableRate = input.direction === 'input'
      ? rateText(row.recoverable_rate, 'Recoverable rate')
      : '100.0000';
    return [{
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      rate,
      rateUnits: rateUnits(rate),
      recoverableRate,
      recoverableRateUnits: rateUnits(recoverableRate),
      calculation: String(row.calculation) === 'inclusive' ? 'inclusive' as const : 'exclusive' as const,
      inputAccountId: row.input_account_id ? String(row.input_account_id) : null,
      outputAccountId: row.output_account_id ? String(row.output_account_id) : null,
      nonrecoverableAccountId: row.nonrecoverable_account_id ? String(row.nonrecoverable_account_id) : null,
      sequenceNo: 10,
      compound: false,
    }];
  }

  const group = await client.query(
    `SELECT id::text,calculation
     FROM accounting_tax_groups
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL AND status='active'
     LIMIT 1`,
    [input.companyId, input.taxGroupId],
  );
  if (!group.rows[0]) throw new AccountingInputError('Choose an active tax group.');

  const members = await client.query(
    `SELECT c.id::text,c.code,c.name,c.rate::text,c.recoverable_rate::text,
            c.input_account_id::text,c.output_account_id::text,c.nonrecoverable_account_id::text,
            m.sequence_no,m.compound
     FROM accounting_tax_group_components m
     JOIN accounting_tax_codes c
       ON c.company_id=m.company_id AND c.id=m.tax_code_id
     WHERE m.company_id=$1 AND m.group_id=$2
       AND m.deleted_at IS NULL AND c.deleted_at IS NULL AND c.status='active'
       AND c.direction IN ($3,'both')
       AND (c.valid_from IS NULL OR c.valid_from <= $4::date)
       AND (c.valid_to IS NULL OR c.valid_to >= $4::date)
     ORDER BY m.sequence_no,m.id`,
    [input.companyId, input.taxGroupId, input.direction, input.taxDate],
  );
  if (!members.rows.length) {
    throw new AccountingInputError('The selected tax group has no active tax components for this transaction.');
  }

  const calculation = String(group.rows[0].calculation) === 'inclusive'
    ? 'inclusive' as const
    : 'exclusive' as const;

  return members.rows.map(row => {
    const rate = rateText(row.rate, 'Tax rate');
    const recoverableRate = input.direction === 'input'
      ? rateText(row.recoverable_rate, 'Recoverable rate')
      : '100.0000';
    return {
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      rate,
      rateUnits: rateUnits(rate),
      recoverableRate,
      recoverableRateUnits: rateUnits(recoverableRate),
      calculation,
      inputAccountId: row.input_account_id ? String(row.input_account_id) : null,
      outputAccountId: row.output_account_id ? String(row.output_account_id) : null,
      nonrecoverableAccountId: row.nonrecoverable_account_id ? String(row.nonrecoverable_account_id) : null,
      sequenceNo: Number(row.sequence_no || 10),
      compound: row.compound === true,
    } satisfies TaxDefinition;
  });
}

export async function calculateAccountingTax(
  client: PoolClient,
  input: {
    companyId: string;
    taxCodeId?: string | null;
    taxGroupId?: string | null;
    taxDate: string;
    direction: 'input' | 'output';
    amount: string;
    calculation?: 'exclusive' | 'inclusive' | null;
  },
): Promise<AccountingTaxCalculation> {
  const amount = minorUnits(input.amount);
  if (amount <= BigInt(0)) throw new AccountingInputError('Taxable amount must be greater than zero.');

  const definitions = await taxDefinitions(client, input);
  const calculation = input.calculation || definitions[0].calculation;
  if (calculation !== 'exclusive' && calculation !== 'inclusive') {
    throw new AccountingInputError('Choose exclusive or inclusive tax calculation.');
  }

  const computed = calculation === 'inclusive'
    ? computeInclusive(amount, definitions)
    : computeExclusive(amount, definitions);

  const recoverable = computed.components.reduce((sum, item) => sum + item.recoverable, BigInt(0));
  const nonrecoverable = computed.totalTax - recoverable;

  return {
    calculation,
    netAmount: decimalAmount(computed.net),
    taxAmount: decimalAmount(computed.totalTax),
    totalAmount: decimalAmount(computed.total),
    recoverableTaxAmount: decimalAmount(recoverable),
    nonrecoverableTaxAmount: decimalAmount(nonrecoverable),
    components: computed.components.map(item => ({
      taxCodeId: item.definition.id,
      taxCode: item.definition.code,
      taxName: item.definition.name,
      rate: item.definition.rate,
      recoverableRate: item.definition.recoverableRate,
      taxableAmount: decimalAmount(item.taxable),
      taxAmount: decimalAmount(item.tax),
      recoverableTaxAmount: decimalAmount(item.recoverable),
      nonrecoverableTaxAmount: decimalAmount(item.nonrecoverable),
      calculation,
      sequenceNo: item.definition.sequenceNo,
      compound: item.definition.compound,
      inputAccountId: item.definition.inputAccountId,
      outputAccountId: item.definition.outputAccountId,
      nonrecoverableAccountId: item.definition.nonrecoverableAccountId,
    })),
  };
}

async function validateTaxAccounts(
  client: PoolClient,
  companyId: string,
  accountIds: Array<string | null>,
) {
  const ids = [...new Set(accountIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  const result = await client.query(
    `SELECT id::text FROM accounts
     WHERE company_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL AND is_active=TRUE`,
    [companyId, ids],
  );
  if (result.rows.length !== ids.length) {
    throw new AccountingInputError('Every tax account must be an active account in the current company.');
  }
}

export async function saveAccountingTaxCode(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting', 'accounting_tax_codes', 'settings');
  const body = bodyOf(input);
  if (accountingId(body.expectedCompanyId) !== context.companyId) {
    throw new AccountingInputError('Your active company changed. Reload Accounting before saving.');
  }
  const id = optionalId(body.id);
  const code = shortText(body.code, 80, 'Tax code', true).toUpperCase();
  const name = shortText(body.name, 160, 'Tax name', true);
  const taxType = ['vat','sales_tax','withholding','excise','levy','other'].includes(String(body.taxType))
    ? String(body.taxType)
    : 'vat';
  const direction = ['input','output','both'].includes(String(body.direction))
    ? String(body.direction)
    : 'both';
  const calculation = body.calculation === 'inclusive' ? 'inclusive' : 'exclusive';
  const rate = rateText(body.rate, 'Tax rate');
  const recoverableRate = rateText(body.recoverableRate ?? '100', 'Recoverable rate');
  const inputAccountId = optionalId(body.inputAccountId);
  const outputAccountId = optionalId(body.outputAccountId);
  const nonrecoverableAccountId = optionalId(body.nonrecoverableAccountId);
  const country = shortText(body.countryCode, 2, 'Country code').toUpperCase() || null;
  if (country && !/^[A-Z]{2}$/.test(country)) {
    throw new AccountingInputError('Country code must use two letters.');
  }
  const jurisdiction = shortText(body.jurisdictionCode, 80, 'Jurisdiction') || null;
  const validFrom = body.validFrom ? accountingDate(body.validFrom) : null;
  const validTo = body.validTo ? accountingDate(body.validTo) : null;
  if (validFrom && validTo && validFrom > validTo) {
    throw new AccountingInputError('Tax validity end date cannot be before the start date.');
  }

  await validateTaxAccounts(context.pool as unknown as PoolClient, context.companyId, [
    inputAccountId, outputAccountId, nonrecoverableAccountId,
  ]);

  const result = id
    ? await context.pool.query(
        `UPDATE accounting_tax_codes
         SET code=$3,name=$4,tax_type=$5,direction=$6,rate=$7,calculation=$8,recoverable_rate=$9,
             input_account_id=$10,output_account_id=$11,nonrecoverable_account_id=$12,
             country_code=$13,jurisdiction_code=$14,valid_from=$15,valid_to=$16,updated_by=$17,updated_at=NOW()
         WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL
         RETURNING id::text`,
        [context.companyId,id,code,name,taxType,direction,rate,calculation,recoverableRate,inputAccountId,
          outputAccountId,nonrecoverableAccountId,country,jurisdiction,validFrom,validTo,context.userId],
      )
    : await context.pool.query(
        `INSERT INTO accounting_tax_codes (
           company_id,code,name,tax_type,direction,rate,calculation,recoverable_rate,
           input_account_id,output_account_id,nonrecoverable_account_id,country_code,jurisdiction_code,
           valid_from,valid_to,status,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'active',$16,$16)
         RETURNING id::text`,
        [context.companyId,code,name,taxType,direction,rate,calculation,recoverableRate,inputAccountId,
          outputAccountId,nonrecoverableAccountId,country,jurisdiction,validFrom,validTo,context.userId],
      );

  if (!result.rows[0]) throw new AccountingInputError('Tax code could not be saved.');
  return { id: String(result.rows[0].id) };
}

export async function saveAccountingTaxGroup(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting', 'accounting_tax_groups', 'settings');
  const body = bodyOf(input);
  if (accountingId(body.expectedCompanyId) !== context.companyId) {
    throw new AccountingInputError('Your active company changed. Reload Accounting before saving.');
  }
  const code = shortText(body.code, 80, 'Tax group code', true).toUpperCase();
  const name = shortText(body.name, 160, 'Tax group name', true);
  const calculation = body.calculation === 'inclusive' ? 'inclusive' : 'exclusive';
  const result = await context.pool.query(
    `INSERT INTO accounting_tax_groups (company_id,code,name,calculation,status,created_by,updated_by)
     VALUES ($1,$2,$3,$4,'active',$5,$5)
     RETURNING id::text`,
    [context.companyId,code,name,calculation,context.userId],
  );
  return { id: String(result.rows[0].id) };
}

export async function saveAccountingTaxGroupComponent(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting', 'accounting_tax_group_components', 'settings');
  const body = bodyOf(input);
  if (accountingId(body.expectedCompanyId) !== context.companyId) {
    throw new AccountingInputError('Your active company changed. Reload Accounting before saving.');
  }
  const groupId = accountingId(body.groupId);
  const taxCodeId = accountingId(body.taxCodeId);
  const sequence = Number(body.sequenceNo ?? 10);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 10000) {
    throw new AccountingInputError('Tax component sequence must be between 1 and 10000.');
  }
  const pair = await context.pool.query(
    `SELECT
       EXISTS(SELECT 1 FROM accounting_tax_groups WHERE company_id=$1 AND id=$2 AND status='active' AND deleted_at IS NULL) AS valid_group,
       EXISTS(SELECT 1 FROM accounting_tax_codes WHERE company_id=$1 AND id=$3 AND status='active' AND deleted_at IS NULL) AS valid_code`,
    [context.companyId,groupId,taxCodeId],
  );
  if (!pair.rows[0]?.valid_group || !pair.rows[0]?.valid_code) {
    throw new AccountingInputError('Choose an active tax group and tax code in this company.');
  }
  const result = await context.pool.query(
    `INSERT INTO accounting_tax_group_components (
       company_id,group_id,tax_code_id,sequence_no,compound,created_by,updated_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$6)
     ON CONFLICT (company_id,group_id,tax_code_id) WHERE deleted_at IS NULL
     DO UPDATE SET sequence_no=EXCLUDED.sequence_no,compound=EXCLUDED.compound,updated_by=EXCLUDED.updated_by,updated_at=NOW()
     RETURNING id::text`,
    [context.companyId,groupId,taxCodeId,sequence,body.compound === true,context.userId],
  );
  return { id: String(result.rows[0].id) };
}

function filters(input: { from?: string; to?: string; page?: string } = {}) {
  const to = accountingDate(input.to || new Date().toISOString().slice(0,10));
  const from = accountingDate(input.from || to.slice(0,4) + '-01-01');
  if (from > to) throw new AccountingInputError('Tax report start date cannot be after the end date.');
  if (input.page && !/^[1-9]\d{0,5}$/.test(input.page)) throw new AccountingInputError('Choose a valid tax register page.');
  return { from, to, page: Number(input.page || 1) };
}

export async function getAccountingTaxes(input: { from?: string; to?: string; page?: string } = {}) {
  const context = await requireEnterpriseModuleTableContext('accounting', 'accounting_tax_codes', 'report');
  const selected = filters(input);
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const [codes, groups, purchase, purchaseCount, settings, adjustments] = await Promise.all([
      client.query(
        `SELECT id::text,code,name,tax_type,direction,rate::text,calculation,recoverable_rate::text,
                input_account_id::text,output_account_id::text,nonrecoverable_account_id::text,
                country_code,jurisdiction_code,valid_from::text,valid_to::text,status
         FROM accounting_tax_codes
         WHERE company_id=$1 AND deleted_at IS NULL
         ORDER BY status,code`,
        [context.companyId],
      ),
      client.query(
        `SELECT g.id::text,g.code,g.name,g.calculation,g.status,
                COALESCE(json_agg(json_build_object(
                  'id',m.id::text,'taxCodeId',c.id::text,'taxCode',c.code,'taxName',c.name,
                  'rate',c.rate::text,'sequenceNo',m.sequence_no,'compound',m.compound
                ) ORDER BY m.sequence_no,m.id) FILTER (WHERE m.id IS NOT NULL),'[]'::json) AS components
         FROM accounting_tax_groups g
         LEFT JOIN accounting_tax_group_components m
           ON m.company_id=g.company_id AND m.group_id=g.id AND m.deleted_at IS NULL
         LEFT JOIN accounting_tax_codes c
           ON c.company_id=m.company_id AND c.id=m.tax_code_id AND c.deleted_at IS NULL
         WHERE g.company_id=$1 AND g.deleted_at IS NULL
         GROUP BY g.id,g.code,g.name,g.calculation,g.status
         ORDER BY g.status,g.code`,
        [context.companyId],
      ),
      client.query(
        `SELECT r.document_id::text,r.document_number,r.document_type,r.document_date::text,
                v.name AS vendor,r.tax_code_id::text,r.tax_code_snapshot,r.tax_name_snapshot,
                r.rate_snapshot::text,r.recoverable_rate_snapshot::text,r.taxable_amount::text,
                r.tax_amount::text,r.recoverable_tax_amount::text,r.nonrecoverable_tax_amount::text,
                r.currency,r.exchange_rate::text
         FROM accounting_purchase_tax_register r
         JOIN accounting_vendors v ON v.company_id=r.company_id AND v.id=r.vendor_id
         WHERE r.company_id=$1 AND r.document_date BETWEEN $2::date AND $3::date
         ORDER BY r.document_date DESC,r.document_number,r.tax_code_snapshot
         LIMIT 51 OFFSET $4`,
        [context.companyId,selected.from,selected.to,(selected.page-1)*50],
      ),
      client.query(
        `SELECT COUNT(*)::int AS count FROM accounting_purchase_tax_register
         WHERE company_id=$1 AND document_date BETWEEN $2::date AND $3::date`,
        [context.companyId,selected.from,selected.to],
      ),
      client.query(
        `SELECT input_tax_account_id::text,output_tax_account_id::text
         FROM accounting_settings WHERE company_id=$1 LIMIT 1`,
        [context.companyId],
      ),
      client.query(
        `SELECT id::text,tax_code_id::text,adjustment_date::text,direction,amount::text,reason,reference,status,
                posted_journal_id::text,reversed_journal_id::text
         FROM accounting_tax_adjustments
         WHERE company_id=$1 AND deleted_at IS NULL
           AND adjustment_date BETWEEN $2::date AND $3::date
         ORDER BY adjustment_date DESC,created_at DESC LIMIT 100`,
        [context.companyId,selected.from,selected.to],
      ),
    ]);

    const inputIds = new Set<string>();
    const outputIds = new Set<string>();
    for (const row of codes.rows) {
      if (row.input_account_id) inputIds.add(String(row.input_account_id));
      if (row.output_account_id) outputIds.add(String(row.output_account_id));
    }
    if (settings.rows[0]?.input_tax_account_id) inputIds.add(String(settings.rows[0].input_tax_account_id));
    if (settings.rows[0]?.output_tax_account_id) outputIds.add(String(settings.rows[0].output_tax_account_id));

    const accountIds = [...new Set([...inputIds,...outputIds])];
    const gl = accountIds.length
      ? await client.query(
          `SELECT l.account_id::text,
                  COALESCE(SUM(l.debit),0)::text AS debit,
                  COALESCE(SUM(l.credit),0)::text AS credit
           FROM journal_lines l
           JOIN journals j ON j.company_id=l.company_id AND j.id=l.journal_id
           WHERE l.company_id=$1 AND l.account_id=ANY($2::uuid[])
             AND l.deleted_at IS NULL AND j.deleted_at IS NULL AND j.status='posted'
             AND j.journal_date BETWEEN $3::date AND $4::date
           GROUP BY l.account_id`,
          [context.companyId,accountIds,selected.from,selected.to],
        )
      : { rows: [] as Array<Record<string,unknown>> };

    const glByAccount = new Map(gl.rows.map(row => [String(row.account_id), row]));
    const inputGl = [...inputIds].reduce((sum,id) => {
      const row = glByAccount.get(id);
      return sum + minorUnits(String(row?.debit || '0')) - minorUnits(String(row?.credit || '0'));
    },BigInt(0));
    const outputGl = [...outputIds].reduce((sum,id) => {
      const row = glByAccount.get(id);
      return sum + minorUnits(String(row?.credit || '0')) - minorUnits(String(row?.debit || '0'));
    },BigInt(0));

    const purchaseTotals = await client.query(
      `SELECT
         COALESCE(SUM(ROUND(recoverable_tax_amount * exchange_rate,2)),0)::text AS recoverable,
         COALESCE(SUM(ROUND(nonrecoverable_tax_amount * exchange_rate,2)),0)::text AS nonrecoverable,
         COALESCE(SUM(ROUND(tax_amount * exchange_rate,2)),0)::text AS total
       FROM accounting_purchase_tax_register
       WHERE company_id=$1 AND document_date BETWEEN $2::date AND $3::date`,
      [context.companyId,selected.from,selected.to],
    );

    const hasInvoices = await client.query(
      `SELECT to_regclass('public.invoicing_invoices') IS NOT NULL
          AND to_regclass('public.invoicing_invoice_items') IS NOT NULL AS available`,
    );
    let salesTax = BigInt(0);
    let salesSourceAvailable = false;
    if (hasInvoices.rows[0]?.available) {
      salesSourceAvailable = true;
      const sales = await client.query(
        `SELECT COALESCE(SUM(ROUND(i.tax_total * i.exchange_rate,2)),0)::text AS tax
         FROM invoicing_invoices i
         WHERE i.company_id=$1 AND i.deleted_at IS NULL
           AND i.invoice_date BETWEEN $2::date AND $3::date
           AND i.status IN ('confirmed','sent','viewed','partially_paid','paid','overdue')`,
        [context.companyId,selected.from,selected.to],
      );
      salesTax = minorUnits(String(sales.rows[0]?.tax || '0'));
    }

    const sourceInput = minorUnits(String(purchaseTotals.rows[0]?.recoverable || '0'));
    await client.query('COMMIT');

    return {
      companyId: context.companyId,
      currency: context.company.currentCompany.currency,
      filters: selected,
      codes: codes.rows,
      groups: groups.rows,
      purchaseRegister: purchase.rows.slice(0,50),
      purchaseCount: Number(purchaseCount.rows[0]?.count || 0),
      hasMore: purchase.rows.length > 50,
      adjustments: adjustments.rows,
      metrics: {
        sourceInputTax: decimalAmount(sourceInput),
        sourceOutputTax: decimalAmount(salesTax),
        inputTaxGl: decimalAmount(inputGl),
        outputTaxGl: decimalAmount(outputGl),
        inputDifference: decimalAmount(inputGl-sourceInput),
        outputDifference: decimalAmount(outputGl-salesTax),
        nonrecoverablePurchaseTax: String(purchaseTotals.rows[0]?.nonrecoverable || '0.00'),
        netTaxPosition: decimalAmount(outputGl-inputGl),
        salesSourceAvailable,
      },
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function createAccountingTaxAdjustment(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting', 'accounting_tax_adjustments', 'create');
  const body = bodyOf(input);
  if (accountingId(body.expectedCompanyId) !== context.companyId) {
    throw new AccountingInputError('Your active company changed. Reload Accounting before saving.');
  }
  const taxCodeId = accountingId(body.taxCodeId);
  const date = accountingDate(body.adjustmentDate);
  const direction = body.direction === 'output' ? 'output' : body.direction === 'input' ? 'input' : null;
  if (!direction) throw new AccountingInputError('Choose input or output tax.');
  const amount = minorUnits(body.amount);
  if (amount <= BigInt(0)) throw new AccountingInputError('Tax adjustment amount must be greater than zero.');
  const offsetAccountId = accountingId(body.offsetAccountId);
  const reason = shortText(body.reason,500,'Adjustment reason',true);
  const reference = shortText(body.reference,160,'Reference') || null;
  await validateTaxAccounts(context.pool as unknown as PoolClient,context.companyId,[offsetAccountId]);

  const validCode = await context.pool.query(
    `SELECT 1 FROM accounting_tax_codes
     WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL AND status='active' AND direction IN ($3,'both')`,
    [context.companyId,taxCodeId,direction],
  );
  if (!validCode.rows[0]) throw new AccountingInputError('Choose an active tax code for this adjustment.');

  const result = await context.pool.query(
    `INSERT INTO accounting_tax_adjustments (
       company_id,tax_code_id,adjustment_date,direction,amount,offset_account_id,reason,reference,status,created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9)
     RETURNING id::text`,
    [context.companyId,taxCodeId,date,direction,decimalAmount(amount),offsetAccountId,reason,reference,context.userId],
  );
  return { id: String(result.rows[0].id), status:'draft' };
}

export async function transitionAccountingTaxAdjustment(input: unknown) {
  const context = await requireEnterpriseModuleTableContext('accounting', 'accounting_tax_adjustments', 'transition');
  const body = bodyOf(input);
  const id = accountingId(body.adjustmentId);
  const action = String(body.action || '');
  if (!['approve','post','reverse','cancel'].includes(action)) {
    throw new AccountingInputError('Choose a valid tax adjustment action.');
  }

  if (action === 'approve' || action === 'cancel') {
    const target = action === 'approve' ? 'approved' : 'cancelled';
    const allowed = action === 'approve' ? ['draft'] : ['draft','approved'];
    const result = await context.pool.query(
      `UPDATE accounting_tax_adjustments
       SET status=$3,
           approved_by=CASE WHEN $3='approved' THEN $4 ELSE approved_by END,
           approved_at=CASE WHEN $3='approved' THEN NOW() ELSE approved_at END,
           updated_at=NOW()
       WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL AND status=ANY($5::text[])
       RETURNING id::text`,
      [context.companyId,id,target,context.userId,allowed],
    );
    if (!result.rows[0]) throw new AccountingInputError('This tax adjustment cannot make that transition.');
    return { id, status: target };
  }

  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT a.*,c.code,c.name,c.input_account_id::text,c.output_account_id::text,
              s.input_tax_account_id::text AS default_input,s.output_tax_account_id::text AS default_output
       FROM accounting_tax_adjustments a
       JOIN accounting_tax_codes c ON c.company_id=a.company_id AND c.id=a.tax_code_id
       LEFT JOIN accounting_settings s ON s.company_id=a.company_id
       WHERE a.company_id=$1 AND a.id=$2 AND a.deleted_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [context.companyId,id],
    );
    const row = result.rows[0];
    if (!row) throw new AccountingInputError('Tax adjustment not found.');

    if (action === 'post') {
      if (row.status === 'posted' && row.posted_journal_id) {
        await client.query('COMMIT');
        return { id, status:'posted', journalId:String(row.posted_journal_id), replayed:true };
      }
      if (row.status !== 'approved') throw new AccountingInputError('Approve this tax adjustment before posting.');
      const taxAccountId = row.direction === 'input'
        ? (row.input_account_id || row.default_input)
        : (row.output_account_id || row.default_output);
      if (!taxAccountId) throw new AccountingInputError('Map the required input/output tax control account before posting.');
      await validateTaxAccounts(client,context.companyId,[String(taxAccountId),String(row.offset_account_id)]);
      const amount = String(row.amount);
      const lines = row.direction === 'input'
        ? [
            {accountId:String(taxAccountId),description:String(row.reason),debit:amount,credit:'0.00'},
            {accountId:String(row.offset_account_id),description:String(row.reason),debit:'0.00',credit:amount},
          ]
        : [
            {accountId:String(row.offset_account_id),description:String(row.reason),debit:amount,credit:'0.00'},
            {accountId:String(taxAccountId),description:String(row.reason),debit:'0.00',credit:amount},
          ];
      const posted = await postBalancedLedgerJournal(client,{
        companyId:context.companyId,userId:context.userId,journalDate:String(row.adjustment_date).slice(0,10),
        description:'Tax adjustment · '+String(row.code),reference:row.reference || String(row.code),
        sourceModule:'accounting',sourceType:'tax_adjustment',sourceId:id,
        sourceEventKey:'accounting:tax-adjustment:'+id,postingKind:'system',lines,
      });
      await client.query(
        `UPDATE accounting_tax_adjustments
         SET status='posted',posted_journal_id=$3,posted_by=$4,posted_at=NOW(),updated_at=NOW()
         WHERE company_id=$1 AND id=$2`,
        [context.companyId,id,posted.journalId,context.userId],
      );
      await client.query('COMMIT');
      await recordWorkspaceAuditEvent({
        tenantId:context.tenantId,companyId:context.companyId,userId:context.userId,
        action:'accounting.tax.adjustment_posted',module:'accounting',
        resourceType:'accounting_tax_adjustments',resourceId:id,
        summary:'Tax adjustment posted',result:'success',metadata:{journalId:posted.journalId},
      }).catch(()=>{});
      return { id,status:'posted',journalId:posted.journalId,replayed:posted.reused };
    }

    if (!row.posted_journal_id) throw new AccountingInputError('Only a posted tax adjustment can be reversed.');
    if (row.reversed_journal_id) {
      await client.query('COMMIT');
      return { id,status:'reversed',journalId:String(row.reversed_journal_id),replayed:true };
    }
    const reversalDate = accountingDate(body.reversalDate);
    const reversed = await reversePostedLedgerJournal(client,{
      companyId:context.companyId,userId:context.userId,
      originalJournalId:String(row.posted_journal_id),journalDate:reversalDate,
      description:'Reversal · tax adjustment '+String(row.code),
      sourceModule:'accounting',sourceType:'tax_adjustment_reversal',sourceId:id,
      sourceEventKey:'accounting:tax-adjustment-reversal:'+id,
    });
    await client.query(
      `UPDATE accounting_tax_adjustments
       SET status='reversed',reversed_journal_id=$3,reversed_by=$4,reversed_at=NOW(),updated_at=NOW()
       WHERE company_id=$1 AND id=$2`,
      [context.companyId,id,reversed.journalId,context.userId],
    );
    await client.query('COMMIT');
    return { id,status:'reversed',journalId:reversed.journalId,replayed:reversed.reused };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}
