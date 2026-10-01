import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  accountingDate,
  minorUnits,
  decimalAmount,
  formatAccountingAmount,
  reportFilters,
  validateJournal,
  validateAccountingSetup,
} from "../lib/apps/accounting/validation.ts";
import {
  ACCOUNT_BALANCES_SQL,
  LEDGER_SQL,
} from "../lib/apps/accounting/queries.ts";
import { saveBalancedJournalDraft } from "../lib/apps/accounting/journal-command.ts";
import {
  postApprovedManualLedgerJournal,
  postBalancedLedgerJournal,
  reversePostedLedgerJournal,
} from "../lib/apps/accounting/ledger-engine.ts";
const company = randomUUID(),
  otherCompany = randomUUID(),
  user = randomUUID();
const cash = randomUUID(),
  revenue = randomUUID(),
  foreign = randomUUID(),
  inactive = randomUUID();
const draft = () => ({
  idempotencyKey: randomUUID(),
  journalDate: "2026-06-15",
  description: "Opening balance",
  reference: "REF-1",
  lines: [
    { accountId: cash, debit: "100.10", credit: "0", description: "Cash" },
    { accountId: revenue, debit: "0", credit: "100.10", description: "Income" },
  ],
});
test("exact decimal arithmetic and negative sub-unit display", () => {
  assert.equal(decimalAmount(minorUnits("0.10") + minorUnits("0.20")), "0.30");
  assert.equal(
    decimalAmount(minorUnits("9999999999999.99")),
    "9999999999999.99",
  );
  assert.equal(formatAccountingAmount("-0.50", "KES"), "KES -0.50");
  for (const value of [
    "0.001",
    "-1",
    "1e2",
    "NaN",
    "Infinity",
    "1,000",
    true,
    {},
    "10000000000000",
  ])
    assert.throws(() => minorUnits(value));
});
test("dates, date ranges and pagination cannot silently normalize invalid inputs", () => {
  assert.equal(accountingDate("2024-02-29"), "2024-02-29");
  for (const value of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "not-a-date",
    [],
  ])
    assert.throws(() => accountingDate(value));
  assert.throws(() => reportFilters({ from: "2026-08-01", to: "2026-01-01" }));
  for (const page of ["0", "-1", "1e3", "1.2", "9999999"])
    assert.throws(() => reportFilters({ page }));
});
test("accounting setup validates fiscal policy, mappings and lock controls", () => {
  const input = {
    expectedCompanyId: company,
    fiscalYearStartMonth: 7,
    fiscalYearStartDay: 1,
    defaultReceivableAccountId: cash,
    defaultPayableAccountId: null,
    retainedEarningsAccountId: null,
    outputTaxAccountId: null,
    inputTaxAccountId: null,
    defaultCashAccountId: cash,
    fxGainAccountId: revenue,
    fxLossAccountId: null,
    writeOffAccountId: null,
    roundingAccountId: revenue,
    roundingMethod: "half_up",
    globalLockDate: "2026-06-30",
    lockPostedEntries: true,
    requireOpenPeriod: true,
  };
  const result = validateAccountingSetup(input);
  assert.equal(result.fiscalYearStartMonth, 7);
  assert.equal(result.globalLockDate, "2026-06-30");
  assert.equal(result.requireOpenPeriod, true);

  for (const mutate of [
    (body) => (body.fiscalYearStartMonth = 13),
    (body) => {
      body.fiscalYearStartMonth = 2;
      body.fiscalYearStartDay = 30;
    },
    (body) => (body.roundingMethod = "silent_round"),
    (body) => (body.globalLockDate = "2026-02-30"),
    (body) => (body.lockPostedEntries = "yes"),
    (body) => (body.defaultCashAccountId = "not-a-uuid"),
  ]) {
    const body = structuredClone(input);
    mutate(body);
    assert.throws(() => validateAccountingSetup(body));
  }
});

test("journal validation rejects imbalance, negative amounts, two-sided and empty lines", () => {
  assert.equal(validateJournal(draft()).lines[0].debit, "100.10");
  for (const mutate of [
    (body) => body.lines.pop(),
    (body) => (body.lines[1].credit = "100.09"),
    (body) => (body.lines[0].credit = "1"),
    (body) => (body.lines[0].debit = "-1"),
    (body) => (body.lines[0].debit = "0"),
    (body) => (body.lines[0].accountId = foreign + "bad"),
    (body) => (body.description = ""),
  ]) {
    const body = draft();
    mutate(body);
    assert.throws(() => validateJournal(body));
  }
});
const databaseEnabled = Boolean(
  process.env.TEST_DATABASE_URL || process.env.PGLITE_TEST_MODULE,
);
test(
  "PostgreSQL accounting transactions, isolation, rollback, replay and reports",
  { skip: !databaseEnabled },
  async () => {
    let pool, embedded;
    const schema = "accounting_test_" + randomUUID().replaceAll("-", "");
    let admin;
    if (process.env.PGLITE_TEST_MODULE) {
      const { PGlite } = await import(process.env.PGLITE_TEST_MODULE);
      embedded = new PGlite();
      pool = {
        query: (...args) => embedded.query(...args),
        connect: async () => ({
          query: (...args) => embedded.query(...args),
          release: () => {},
        }),
      };
    } else {
      admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      await admin.query(`CREATE SCHEMA ${schema}`);
      pool = new Pool({
        connectionString: process.env.TEST_DATABASE_URL,
        options: `-c search_path=${schema},public`,
      });
    }
    try {
      const statements = [
        `CREATE TABLE accounts (id uuid PRIMARY KEY,company_id uuid NOT NULL,code text NOT NULL,name text NOT NULL,account_type text NOT NULL,is_active boolean DEFAULT true,allow_manual_posting boolean NOT NULL DEFAULT true,deleted_at timestamptz)`,
        `CREATE TABLE journals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,journal_number varchar(100) NOT NULL,journal_date date,reference text,description text,status text,source_module text,source_type text,source_id text,source_event_key text,posting_kind text DEFAULT 'manual',posted_at timestamptz,posted_by uuid,approved_by uuid,approved_at timestamptz,approval_note text,reversal_of_journal_id uuid,reversed_by_journal_id uuid,created_by uuid,updated_by uuid,updated_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),deleted_at timestamptz)`,
        `CREATE TABLE journal_lines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,journal_id uuid REFERENCES journals(id),account_id uuid REFERENCES accounts(id),description text CHECK(description <> 'FAIL'),debit numeric(15,2),credit numeric(15,2),created_by uuid,updated_by uuid,updated_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),deleted_at timestamptz,CHECK(debit >= 0 AND credit >= 0),CHECK((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)))`,
        `CREATE TABLE accounting_fiscal_periods(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,name text,starts_on date,ends_on date,lock_date date,status text,deleted_at timestamptz)`,
        `CREATE TABLE accounting_settings(company_id uuid PRIMARY KEY,global_lock_date date,require_open_period boolean NOT NULL DEFAULT true,deleted_at timestamptz)`,
        `CREATE UNIQUE INDEX uq_test_journals_company_number ON journals(company_id,journal_number) WHERE deleted_at IS NULL`,
        `CREATE UNIQUE INDEX uq_test_journals_source_event ON journals(company_id,source_module,source_event_key) WHERE deleted_at IS NULL AND source_module IS NOT NULL AND source_event_key IS NOT NULL`,
        `CREATE TABLE sami_enterprise_idempotency(company_id uuid,idempotency_key uuid,module_key text,table_key text,request_hash text,created_by uuid,created_at timestamptz,updated_at timestamptz,record_key text,response_json jsonb,PRIMARY KEY(company_id,idempotency_key))`,
      ];
      for (const sql of statements) await pool.query(sql);
      for (const [id, c, code, type, active] of [
        [cash, company, "1000", "asset_cash", true],
        [revenue, company, "4000", "income", true],
        [foreign, otherCompany, "2000", "income", true],
        [inactive, company, "5000", "expense", false],
      ])
        await pool.query(
          "INSERT INTO accounts (id,company_id,code,name,account_type,is_active,allow_manual_posting,deleted_at) VALUES($1,$2,$3,$3,$4,$5,true,NULL)",
          [id, c, code, type, active],
        );
      await pool.query(
        `INSERT INTO accounting_fiscal_periods(company_id,name,starts_on,ends_on,status) VALUES($1,'2026','2026-01-01','2026-12-31','open')`,
        [company],
      );

      const input = validateJournal(draft());
      const first = await saveBalancedJournalDraft(
        pool,
        { companyId: company, userId: user },
        input,
      );
      assert.equal(first.status, "draft");
      assert.equal(
        (await pool.query("SELECT COUNT(*)::int AS n FROM journal_lines"))
          .rows[0].n,
        2,
      );
      const replay = await saveBalancedJournalDraft(
        pool,
        { companyId: company, userId: user },
        input,
      );
      assert.equal(replay.id, first.id);
      assert.equal(replay.replayed, true);
      await assert.rejects(() =>
        saveBalancedJournalDraft(
          pool,
          { companyId: company, userId: user },
          { ...input, description: "Different request" },
        ),
      );
      for (const accountId of [foreign, inactive]) {
        const bad = draft();
        bad.lines[0].accountId = accountId;
        await assert.rejects(
          () =>
            saveBalancedJournalDraft(
              pool,
              { companyId: company, userId: user },
              validateJournal(bad),
            ),
          /active account/,
        );
      }
      await pool.query(
        `UPDATE accounts SET allow_manual_posting=false WHERE id=$1`,
        [cash],
      );
      await assert.rejects(
        () =>
          saveBalancedJournalDraft(
            pool,
            { companyId: company, userId: user },
            validateJournal(draft()),
          ),
        /only accepts trusted subsystem postings/,
      );
      await pool.query(
        `UPDATE accounts SET allow_manual_posting=true WHERE id=$1`,
        [cash],
      );

      await pool.query(
        `UPDATE accounting_fiscal_periods SET lock_date='2026-06-30'`,
      );
      await assert.rejects(
        () =>
          saveBalancedJournalDraft(
            pool,
            { companyId: company, userId: user },
            validateJournal(draft()),
          ),
        /locked/,
      );
      await pool.query(
        `UPDATE accounting_fiscal_periods SET lock_date=NULL,status='closing'`,
      );
      await assert.rejects(
        () =>
          saveBalancedJournalDraft(
            pool,
            { companyId: company, userId: user },
            validateJournal(draft()),
          ),
        /closing/,
      );
      await pool.query(`UPDATE accounting_fiscal_periods SET status='open'`);
      const bad = draft();
      bad.lines[1].description = "FAIL";
      await assert.rejects(() =>
        saveBalancedJournalDraft(
          pool,
          { companyId: company, userId: user },
          validateJournal(bad),
        ),
      );
      assert.equal(
        (await pool.query("SELECT COUNT(*)::int AS n FROM journals")).rows[0].n,
        1,
        "failed line rolls back its parent and previous lines",
      );
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM sami_enterprise_idempotency",
          )
        ).rows[0].n,
        1,
        "failed requests roll back reservations",
      );
      let balances = (
        await pool.query(ACCOUNT_BALANCES_SQL, [
          company,
          "2026-01-01",
          "2026-12-31",
        ])
      ).rows;
      assert.equal(
        balances.find((row) => row.id === cash).balance,
        "0",
        "drafts excluded",
      );
      await pool.query(
        `UPDATE journals
         SET status='approved',approved_by=$2,approved_at=NOW()
         WHERE id=$1`,
        [first.id, user],
      );
      const firstPosted = await (async () => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await postApprovedManualLedgerJournal(client, {
            companyId: company,
            userId: user,
            journalId: first.id,
          });
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      })();
      assert.equal(firstPosted.journalId, first.id);
      assert.equal(firstPosted.reused, false);
      assert.equal(
        (
          await pool.query(
            "SELECT COUNT(*)::int AS n FROM journals WHERE id=$1",
            [first.id],
          )
        ).rows[0].n,
        1,
        "posting promotes the approved draft instead of duplicating it",
      );
      assert.equal(
        (
          await pool.query(
            "SELECT status,posted_at IS NOT NULL AS posted,posted_by::text FROM journals WHERE id=$1",
            [first.id],
          )
        ).rows[0].status,
        "posted",
      );
      const next = draft();
      next.journalDate = "2026-07-01";
      const second = await saveBalancedJournalDraft(
        pool,
        { companyId: company, userId: user },
        validateJournal(next),
      );
      await pool.query(
        `UPDATE journals SET status='approved',approved_by=$2,approved_at=NOW() WHERE id=$1`,
        [second.id, user],
      );
      await (async () => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await postApprovedManualLedgerJournal(client, {
            companyId: company,
            userId: user,
            journalId: second.id,
          });
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      })();
      balances = (
        await pool.query(ACCOUNT_BALANCES_SQL, [
          company,
          "2026-07-01",
          "2026-07-31",
        ])
      ).rows;
      const balance = balances.find((row) => row.id === cash);
      assert.equal(balance.opening, "100.10");
      assert.equal(balance.debit, "100.10");
      assert.equal(balance.balance, "200.20");
      assert.equal(
        balances.some((row) => row.id === foreign),
        false,
        "other-company accounts never returned",
      );
      const lines = (
        await pool.query(LEDGER_SQL, [
          company,
          "2026-07-01",
          "2026-07-31",
          cash,
          0,
          balance.opening,
        ])
      ).rows;
      assert.equal(lines.length, 1);
      assert.equal(lines[0].running_balance, "200.20");
      assert.equal(
        (
          await pool.query(LEDGER_SQL, [
            otherCompany,
            "2026-01-01",
            "2026-12-31",
            cash,
            0,
            "0",
          ])
        ).rows.length,
        0,
      );
      if (!embedded) {
        const concurrent = validateJournal(draft());
        const results = await Promise.all([
          saveBalancedJournalDraft(
            pool,
            { companyId: company, userId: user },
            concurrent,
          ),
          saveBalancedJournalDraft(
            pool,
            { companyId: company, userId: user },
            concurrent,
          ),
        ]);
        assert.equal(
          results[0].id,
          results[1].id,
          "concurrent retries create one journal",
        );
      }

      await pool.query(
        `INSERT INTO accounting_settings(company_id,global_lock_date,require_open_period)
         VALUES($1,'2026-06-30',true)`,
        [company],
      );
      await assert.rejects(
        () =>
          saveBalancedJournalDraft(
            pool,
            { companyId: company, userId: user },
            validateJournal(draft()),
          ),
        /company Accounting lock date/,
      );

      await pool.query(
        `UPDATE accounting_settings
         SET global_lock_date=NULL,require_open_period=false
         WHERE company_id=$1`,
        [company],
      );
      await pool.query(
        `DELETE FROM accounting_fiscal_periods WHERE company_id=$1`,
        [company],
      );
      const noPeriod = draft();
      noPeriod.journalDate = "2026-08-01";
      const noPeriodJournal = await saveBalancedJournalDraft(
        pool,
        { companyId: company, userId: user },
        validateJournal(noPeriod),
      );
      assert.equal(
        noPeriodJournal.status,
        "draft",
        "setup can explicitly allow drafting outside a fiscal period",
      );

      const systemPosting = await (async () => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const posted = await postBalancedLedgerJournal(client, {
            companyId: company,
            userId: user,
            journalDate: "2026-05-15",
            description: "System posting proof",
            sourceModule: "test",
            sourceType: "proof",
            sourceId: "proof-1",
            sourceEventKey: "proof:event:1",
            postingKind: "system",
            lines: [
              { accountId: cash, description: "Cash", debit: "75.25", credit: "0" },
              { accountId: revenue, description: "Revenue", debit: "0", credit: "75.25" },
            ],
          });
          const replay = await postBalancedLedgerJournal(client, {
            companyId: company,
            userId: user,
            journalDate: "2026-05-15",
            description: "System posting proof",
            sourceModule: "test",
            sourceType: "proof",
            sourceId: "proof-1",
            sourceEventKey: "proof:event:1",
            postingKind: "system",
            lines: [
              { accountId: cash, debit: "75.25", credit: "0" },
              { accountId: revenue, debit: "0", credit: "75.25" },
            ],
          });
          assert.equal(replay.journalId, posted.journalId);
          assert.equal(replay.reused, true);

          await assert.rejects(
            () =>
              postBalancedLedgerJournal(client, {
                companyId: company,
                userId: user,
                journalDate: "2026-05-15",
                description: "Unbalanced system posting",
                sourceModule: "test",
                sourceType: "proof",
                sourceId: "proof-bad",
                sourceEventKey: "proof:event:bad",
                lines: [
                  { accountId: cash, debit: "10.00", credit: "0" },
                  { accountId: revenue, debit: "0", credit: "9.99" },
                ],
              }),
            /unbalanced accounting posting/,
          );

          const proof = (
            await client.query(
              `SELECT status,source_module,source_event_key,posting_kind,
                      posted_at IS NOT NULL AS posted,
                      (SELECT SUM(debit) FROM journal_lines WHERE journal_id=j.id) AS debit,
                      (SELECT SUM(credit) FROM journal_lines WHERE journal_id=j.id) AS credit
               FROM journals j WHERE id=$1`,
              [posted.journalId],
            )
          ).rows[0];
          assert.equal(proof.status, "posted");
          assert.equal(proof.source_module, "test");
          assert.equal(proof.source_event_key, "proof:event:1");
          assert.equal(proof.posting_kind, "system");
          assert.equal(proof.posted, true);
          assert.equal(String(proof.debit), "75.25");
          assert.equal(String(proof.credit), "75.25");

          const reversal = await reversePostedLedgerJournal(client, {
            companyId: company,
            userId: user,
            originalJournalId: posted.journalId,
            journalDate: "2026-05-16",
            description: "Reverse system posting proof",
            sourceModule: "test",
            sourceType: "proof_reversal",
            sourceId: "proof-1",
            sourceEventKey: "proof:event:1:reverse",
          });
          const reversalAgain = await reversePostedLedgerJournal(client, {
            companyId: company,
            userId: user,
            originalJournalId: posted.journalId,
            journalDate: "2026-05-16",
            description: "Reverse system posting proof",
            sourceModule: "test",
            sourceType: "proof_reversal",
            sourceId: "proof-1",
            sourceEventKey: "proof:event:1:reverse",
          });
          assert.equal(reversalAgain.journalId, reversal.journalId);
          assert.equal(reversalAgain.reused, true);

          const linked = (
            await client.query(
              "SELECT reversed_by_journal_id::text AS reversal FROM journals WHERE id=$1",
              [posted.journalId],
            )
          ).rows[0];
          assert.equal(linked.reversal, reversal.journalId);

          const reversalTotals = (
            await client.query(
              "SELECT SUM(debit)::text AS debit,SUM(credit)::text AS credit FROM journal_lines WHERE journal_id=$1",
              [reversal.journalId],
            )
          ).rows[0];
          assert.equal(reversalTotals.debit, "75.25");
          assert.equal(reversalTotals.credit, "75.25");

          await client.query("COMMIT");
          return posted;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      })();
      assert.ok(systemPosting.journalId);
    } finally {
      if (embedded) await embedded.close();
      else {
        await pool.end();
        await admin.query(`DROP SCHEMA ${schema} CASCADE`);
        await admin.end();
      }
    }
  },
);
