import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

import { ACCOUNTING_TAX_SQL } from "../lib/apps/accounting/tax-schema.ts";
import { calculateAccountingTax } from "../lib/apps/accounting/tax-engine.ts";

const company=randomUUID();
const inputAccount=randomUUID();
const outputAccount=randomUUID();
const nonrecoverableAccount=randomUUID();

test("Accounting 2.16 tax engine calculates exact exclusive, inclusive, recoverable and compound tax", async () => {
  if (!process.env.TEST_DATABASE_URL) return;
  const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});
  const schema="tax_test_"+randomUUID().replaceAll("-","");
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new Pool({
    connectionString:process.env.TEST_DATABASE_URL,
    options:`-c search_path=${schema},public`,
  });
  try {
    for (const sql of [
      `CREATE TABLE companies(id uuid PRIMARY KEY)`,
      `CREATE TABLE accounts(id uuid PRIMARY KEY,company_id uuid NOT NULL)`,
      `CREATE TABLE journals(id uuid PRIMARY KEY DEFAULT gen_random_uuid())`,
      `CREATE TABLE accounting_vendor_documents(
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,
         document_number text,document_type text,document_date date,vendor_id uuid,
         currency text,exchange_rate numeric(19,8),base_currency text,status text,deleted_at timestamptz
       )`,
      `CREATE TABLE accounting_vendor_document_lines(
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,
         document_id uuid NOT NULL REFERENCES accounting_vendor_documents(id)
       )`,
    ]) await pool.query(sql);

    const sql=ACCOUNTING_TAX_SQL.replaceAll("public.",schema+".");
    await pool.query(sql);
    await pool.query(sql);

    await pool.query("INSERT INTO companies(id) VALUES($1)",[company]);
    await pool.query(
      "INSERT INTO accounts(id,company_id) VALUES($1,$4),($2,$4),($3,$4)",
      [inputAccount,outputAccount,nonrecoverableAccount,company],
    );

    const vat=randomUUID();
    const partial=randomUUID();
    const levy=randomUUID();
    const expired=randomUUID();
    await pool.query(
      `INSERT INTO accounting_tax_codes(
        id,company_id,code,name,tax_type,direction,rate,calculation,recoverable_rate,
        input_account_id,output_account_id,nonrecoverable_account_id,status
      ) VALUES
        ($1,$5,'VAT16','VAT 16%','vat','both',16,'exclusive',100,$6,$7,NULL,'active'),
        ($2,$5,'VAT16-50','VAT 16% half recoverable','vat','input',16,'exclusive',50,$6,NULL,$8,'active'),
        ($3,$5,'LEVY2','Levy 2%','levy','input',2,'exclusive',100,$6,NULL,NULL,'active'),
        ($4,$5,'OLD','Expired VAT','vat','input',10,'exclusive',100,$6,NULL,NULL,'active')`,
      [vat,partial,levy,expired,company,inputAccount,outputAccount,nonrecoverableAccount],
    );
    await pool.query("UPDATE accounting_tax_codes SET valid_to='2025-12-31' WHERE id=$1",[expired]);

    const client=await pool.connect();
    try {
      const exclusive=await calculateAccountingTax(client,{
        companyId:company,taxCodeId:vat,taxDate:"2026-06-15",direction:"input",amount:"100.00",
      });
      assert.equal(exclusive.netAmount,"100.00");
      assert.equal(exclusive.taxAmount,"16.00");
      assert.equal(exclusive.totalAmount,"116.00");
      assert.equal(exclusive.recoverableTaxAmount,"16.00");
      assert.equal(exclusive.nonrecoverableTaxAmount,"0.00");

      const inclusive=await calculateAccountingTax(client,{
        companyId:company,taxCodeId:vat,taxDate:"2026-06-15",direction:"input",amount:"116.00",calculation:"inclusive",
      });
      assert.equal(inclusive.netAmount,"100.00");
      assert.equal(inclusive.taxAmount,"16.00");
      assert.equal(inclusive.totalAmount,"116.00");

      const half=await calculateAccountingTax(client,{
        companyId:company,taxCodeId:partial,taxDate:"2026-06-15",direction:"input",amount:"100.00",
      });
      assert.equal(half.taxAmount,"16.00");
      assert.equal(half.recoverableTaxAmount,"8.00");
      assert.equal(half.nonrecoverableTaxAmount,"8.00");
      assert.equal(half.components[0].nonrecoverableAccountId,nonrecoverableAccount);

      const group=randomUUID();
      await pool.query(
        "INSERT INTO accounting_tax_groups(id,company_id,code,name,calculation,status) VALUES($1,$2,'VAT+LEVY','VAT plus levy','exclusive','active')",
        [group,company],
      );
      await pool.query(
        `INSERT INTO accounting_tax_group_components(company_id,group_id,tax_code_id,sequence_no,compound)
         VALUES($1,$2,$3,10,false),($1,$2,$4,20,true)`,
        [company,group,vat,levy],
      );
      const compound=await calculateAccountingTax(client,{
        companyId:company,taxGroupId:group,taxDate:"2026-06-15",direction:"input",amount:"100.00",
      });
      assert.equal(compound.taxAmount,"18.32");
      assert.equal(compound.totalAmount,"118.32");
      assert.equal(compound.components[0].taxAmount,"16.00");
      assert.equal(compound.components[1].taxableAmount,"116.00");
      assert.equal(compound.components[1].taxAmount,"2.32");

      await assert.rejects(
        ()=>calculateAccountingTax(client,{companyId:company,taxCodeId:expired,taxDate:"2026-06-15",direction:"input",amount:"100.00"}),
        /inactive, invalid|effective dates/,
      );
      await assert.rejects(
        ()=>calculateAccountingTax(client,{companyId:company,taxCodeId:partial,taxDate:"2026-06-15",direction:"output",amount:"100.00"}),
        /inactive, invalid/,
      );
    } finally {
      client.release();
    }

    await assert.rejects(
      ()=>pool.query(
        `INSERT INTO accounting_tax_codes(company_id,code,name,rate,status)
         VALUES($1,'BAD','Bad tax',101,'active')`,
        [company],
      ),
      /check constraint/i,
    );
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});

test("Accounting tax engine is migration-backed, first-class UI, and AP no longer asks users to type tax", async () => {
  const [manifest,migrations,migration,workspace,ui,payables,payablesUi,catalog,specialistCatalog,domainHooks]=await Promise.all([
    readFile("lib/modules/first-party.ts","utf8"),
    readFile("lib/apps/runtime-migrations.ts","utf8"),
    readFile("lib/apps/accounting/migrations/2.15.0-to-2.16.0.ts","utf8"),
    readFile("app/apps/accounting/AccountingWorkspace.tsx","utf8"),
    readFile("app/apps/accounting/AccountingTaxes.tsx","utf8"),
    readFile("lib/apps/accounting/payables.ts","utf8"),
    readFile("app/apps/accounting/AccountingPayables.tsx","utf8"),
    readFile("lib/apps/enterprise/catalog.ts","utf8"),
    readFile("lib/apps/enterprise/specialist-catalog.ts","utf8"),
    readFile("lib/apps/enterprise/domain-hooks.ts","utf8"),
  ]);

  assert.match(manifest,/key:\s*"accounting"[\s\S]*version:\s*'2\.16\.0'/);
  assert.match(migrations,/ACCOUNTING_2_15_0_TO_2_16_0/);
  assert.match(migration,/fromVersion:\s*'2\.15\.0'[\s\S]*toVersion:\s*'2\.16\.0'/);

  for (const marker of [
    "accounting_tax_codes",
    "accounting_tax_groups",
    "accounting_tax_group_components",
    "accounting_vendor_line_tax_components",
    "accounting_tax_adjustments",
  ]) {
    assert.match(catalog,new RegExp(marker));
    assert.match(specialistCatalog,new RegExp(marker));
    assert.match(domainHooks,new RegExp(marker));
  }

  assert.match(domainHooks,/validated Accounting tax engine/);
  assert.match(workspace,/Tax Engine[\s\S]*\/taxes/);
  assert.match(workspace,/dedicatedSection === 'taxes'[\s\S]*AccountingTaxes/);
  for (const marker of [
    "Tax control center",
    "Purchase tax register",
    "Sales tax register",
    "Tax adjustment register",
    "Non-recoverable purchase tax",
  ]) assert.match(ui,new RegExp(marker));

  assert.match(payables,/calculateAccountingTax/);
  assert.match(payables,/accounting_vendor_line_tax_components/);
  assert.match(payables,/recoverable_tax_amount/);
  assert.match(payables,/input_tax_account_id/);
  assert.match(payablesUi,/taxSelection/);
  assert.match(payablesUi,/Select a tax code or group per line/);
  assert.doesNotMatch(
    payablesUi,
    /value=\{row\.taxAmount\}/,
    "The AP UI must not let users type arbitrary tax amounts.",
  );
});
