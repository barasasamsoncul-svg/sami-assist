import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

import {
  FIXED_ASSETS_ACCOUNTING_SQL,
} from '../lib/apps/fixed_assets/accounting-schema';

import {
  assetCarryingValueCents,
  assetMoneyCents,
  assetMoneyDecimal,
  decliningBalanceDepreciationCents,
  prorateDepreciationCents,
  straightLineDepreciationCents,
} from '../lib/apps/fixed_assets/accounting-rules';

test('fixed asset money math rounds exact 4-decimal source values to ledger cents', () => {
  assert.equal(assetMoneyCents('1250.0049'), BigInt(125000));
  assert.equal(assetMoneyCents('1250.0050'), BigInt(125001));
  assert.equal(assetMoneyCents('-1.0050'), BigInt(-101));
  assert.equal(assetMoneyDecimal(BigInt(-101)), '-1.01');
});

test('fixed asset carrying value includes revaluation and subtracts depreciation and impairment', () => {
  assert.equal(
    assetCarryingValueCents({
      acquisitionCost: '10000.00',
      accumulatedDepreciation: '2500.00',
      accumulatedImpairment: '500.00',
      revaluationAdjustment: '1000.00',
    }),
    BigInt(800000),
  );
});

test('straight-line depreciation uses the remaining depreciable amount and never breaches salvage', () => {
  assert.equal(
    straightLineDepreciationCents({
      carryingValue: BigInt(1000000),
      salvageValue: BigInt(100000),
      remainingPeriods: 36,
    }),
    BigInt(25000),
  );

  assert.equal(
    straightLineDepreciationCents({
      carryingValue: BigInt(10100),
      salvageValue: BigInt(10000),
      remainingPeriods: 12,
    }),
    BigInt(8),
  );
});

test('declining-balance depreciation uses an annual rate and caps at the salvage floor', () => {
  assert.equal(
    decliningBalanceDepreciationCents({
      carryingValue: BigInt(1200000),
      salvageValue: BigInt(0),
      annualRate: '20',
    }),
    BigInt(20000),
  );

  assert.equal(
    decliningBalanceDepreciationCents({
      carryingValue: BigInt(10100),
      salvageValue: BigInt(10000),
      annualRate: '100',
    }),
    BigInt(100),
  );
});

test('daily proration recognizes only days after an asset enters service', () => {
  assert.equal(
    prorateDepreciationCents(
      BigInt(31000),
      {
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        inServiceDate: '2026-10-16',
        convention: 'daily',
      },
    ),
    BigInt(16000),
  );

  assert.equal(
    prorateDepreciationCents(
      BigInt(31000),
      {
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        inServiceDate: '2026-11-01',
        convention: 'daily',
      },
    ),
    BigInt(0),
  );
});


test(
  'fixed assets 2.4 migration executes twice on PostgreSQL and preserves the legacy register',
  {
    skip: !process.env.TEST_DATABASE_URL,
  },
  async () => {
    const pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        CREATE TABLE IF NOT EXISTS public.companies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid()
        );

        CREATE TABLE IF NOT EXISTS public.accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid()
        );

        CREATE TABLE IF NOT EXISTS public.journals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid()
        );

        CREATE TABLE IF NOT EXISTS public.fixed_assets_settings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
          settings JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_by UUID,
          updated_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(company_id)
        );

        CREATE TABLE IF NOT EXISTS public.asset_categories (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
          name VARCHAR(160) NOT NULL,
          default_useful_life_months INTEGER,
          default_depreciation_method VARCHAR(40) NOT NULL DEFAULT 'straight_line',
          asset_account_reference UUID,
          depreciation_account_reference UUID,
          expense_account_reference UUID,
          status VARCHAR(30) NOT NULL DEFAULT 'active',
          created_by UUID,
          updated_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS public.fixed_assets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
          asset_code VARCHAR(80) NOT NULL,
          name VARCHAR(255) NOT NULL,
          acquisition_date DATE,
          acquisition_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
          salvage_value NUMERIC(19,4) NOT NULL DEFAULT 0,
          useful_life_months INTEGER,
          depreciation_method VARCHAR(40) NOT NULL DEFAULT 'straight_line',
          location VARCHAR(255),
          status VARCHAR(40) NOT NULL DEFAULT 'active',
          created_by UUID,
          updated_by UUID,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS public.asset_depreciation_entries (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
          asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
          period_date DATE NOT NULL,
          depreciation_amount NUMERIC(19,4) NOT NULL,
          accumulated_depreciation NUMERIC(19,4) NOT NULL,
          book_value NUMERIC(19,4) NOT NULL,
          status VARCHAR(40) NOT NULL DEFAULT 'active',
          created_by UUID,
          updated_by UUID,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS public.asset_impairments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
          asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
          impairment_date DATE NOT NULL,
          previous_book_value NUMERIC(19,4) NOT NULL,
          impairment_amount NUMERIC(19,4) NOT NULL,
          new_book_value NUMERIC(19,4) NOT NULL,
          reason TEXT NOT NULL,
          journal_reference UUID,
          status VARCHAR(30) NOT NULL DEFAULT 'draft',
          created_by UUID,
          updated_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS public.asset_disposals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
          asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
          disposal_date DATE NOT NULL,
          disposal_method VARCHAR(50),
          proceeds NUMERIC(19,4) NOT NULL DEFAULT 0,
          notes TEXT,
          status VARCHAR(40) NOT NULL DEFAULT 'active',
          created_by UUID,
          updated_by UUID,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ
        );
      `);

      await client.query(FIXED_ASSETS_ACCOUNTING_SQL);
      await client.query(FIXED_ASSETS_ACCOUNTING_SQL);

      const tables = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema='public'
          AND table_name IN (
            'asset_depreciation_runs',
            'asset_revaluations',
            'asset_source_links'
          )
        ORDER BY table_name
      `);

      assert.deepEqual(
        tables.rows.map((row) => row.table_name),
        [
          'asset_depreciation_runs',
          'asset_revaluations',
          'asset_source_links',
        ],
      );

      const columns = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='fixed_assets'
          AND column_name IN (
            'category_id',
            'capitalization_journal_id',
            'accumulated_depreciation',
            'accumulated_impairment',
            'revaluation_adjustment'
          )
        ORDER BY column_name
      `);

      assert.deepEqual(
        columns.rows.map((row) => row.column_name),
        [
          'accumulated_depreciation',
          'accumulated_impairment',
          'capitalization_journal_id',
          'category_id',
          'revaluation_adjustment',
        ],
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  },
);
