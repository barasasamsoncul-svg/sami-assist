-- ============================================================
-- SaMi Tenant Core Migration
-- 1.0.0 -> 1.1.0
-- Category 10: Organization / Company Profile
-- ============================================================

ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS company_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS postal_code VARCHAR(30),
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(2),
    ADD COLUMN IF NOT EXISTS locale VARCHAR(20) NOT NULL DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS fiscal_country VARCHAR(2),
    ADD COLUMN IF NOT EXISTS fiscal_year_start_month SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS fiscal_year_start_day SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE companies
    DROP CONSTRAINT IF EXISTS companies_fiscal_year_start_month_check;

ALTER TABLE companies
    ADD CONSTRAINT companies_fiscal_year_start_month_check
    CHECK (fiscal_year_start_month BETWEEN 1 AND 12);

ALTER TABLE companies
    DROP CONSTRAINT IF EXISTS companies_fiscal_year_start_day_check;

ALTER TABLE companies
    ADD CONSTRAINT companies_fiscal_year_start_day_check
    CHECK (fiscal_year_start_day BETWEEN 1 AND 31);

UPDATE companies
SET address_line1 = address
WHERE address_line1 IS NULL
  AND NULLIF(BTRIM(address), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_code_unique
    ON companies(LOWER(company_code))
    WHERE company_code IS NOT NULL;

ALTER TABLE branches
    ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS postal_code VARCHAR(30),
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

UPDATE branches
SET address_line1 = address
WHERE address_line1 IS NULL
  AND NULLIF(BTRIM(address), '') IS NOT NULL;
