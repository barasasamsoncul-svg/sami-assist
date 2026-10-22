import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales opportunity funnel is report-permission gated and scoped to the active company', async () => {
  const service = await source('lib/apps/sales/pipeline-funnel.ts');

  assert.match(service, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_VIEW\)/);
  assert.match(service, /hasSalesPermission/);
  assert.match(service, /SALES_PERMISSIONS\.REPORT_VIEW/);
  assert.match(service, /if \(!canViewReports\) \{\s*return \{\s*canViewReports: false,[\s\S]*?rows: \[\],/);
  assert.match(service, /WHERE s\.company_id = \$1/);
  assert.match(service, /o\.company_id = s\.company_id/);
  assert.match(service, /o\.company_id = \$1/);
  assert.match(service, /o\.deleted_at IS NULL/);
  assert.match(service, /s\.deleted_at IS NULL/);
  assert.match(service, /LEFT JOIN sales_opportunities o/);
  assert.match(service, /LEFT JOIN sales_opportunities o[\s\S]*ON o\.stage_id = s\.id[\s\S]*AND o\.company_id = \$1[\s\S]*AND o\.deleted_at IS NULL[\s\S]*LEFT JOIN LATERAL/);
  assert.match(service, /NULLIF\(BTRIM\(o\.currency\), ''\)[\s\S]*NULLIF\(BTRIM\(\$2::text\), ''\)/);
});

test('Sales opportunity funnel reports counts and correct value by open, won and lost stages', async () => {
  const service = await source('lib/apps/sales/pipeline-funnel.ts');
  const component = await source('app/apps/sales/SalesOpportunityFunnel.tsx');

  assert.match(service, /COUNT\(o\.id\)::int AS opportunity_count/);
  assert.match(service, /FILTER \(WHERE s\.stage_type = 'open'\)/);
  assert.match(service, /FILTER \(WHERE s\.stage_type = 'won'\)/);
  assert.match(service, /FILTER \(WHERE s\.stage_type = 'lost'\)/);
  assert.match(service, /weighted_pipeline_value/);
  assert.match(service, /GROUP BY\s+s\.id,\s*s\.name,\s*s\.sequence,\s*s\.stage_type,\s*s\.probability/);
  assert.match(service, /GROUP BY[\s\S]{0,500}UPPER\(COALESCE\(/);
  assert.match(service, /BTRIM\(o\.currency\)/);
  assert.match(service, /ORDER BY s\.sequence ASC/);
  assert.match(component, /if \(row\.stageType === 'open'\) return row\.pipelineValue/);
  assert.match(component, /Won value/);
  assert.match(component, /Lost value/);
  assert.match(component, /Weighted/);
  assert.match(component, /new Set\(rows\.map\(\(row\) => row\.currency\)\)/);
  assert.match(component, /const currencies = Array\.from\(new Set\(rows\.map\(\(row\) => row\.currency\)\)\)\.sort\(\)/);
});

test('Sales funnel highlights overdue closes and opportunities aging in their current stage', async () => {
  const service = await source('lib/apps/sales/pipeline-funnel.ts');
  const component = await source('app/apps/sales/SalesOpportunityFunnel.tsx');

  assert.match(service, /o\.expected_close_date < CURRENT_DATE/);
  assert.match(service, /AS overdue_opportunity_count/);
  assert.match(service, /AS overdue_value/);
  assert.match(service, /sales_opportunity_stage_history h/);
  assert.match(service, /h\.company_id = o\.company_id/);
  assert.match(service, /h\.to_stage_id = o\.stage_id/);
  assert.match(service, /const STALE_AFTER_DAYS = 30/);
  assert.match(service, /COALESCE\(stage_age\.last_stage_at, o\.created_at\)\s*< NOW\(\) - \(\$3::int \* INTERVAL '1 day'\)/);
  assert.match(service, /AS stale_opportunity_count/);
  assert.match(service, /AS stale_value/);
  assert.match(service, /overdueOpportunityCount: Number\(row\.overdue_opportunity_count \|\| 0\)/);
  assert.match(service, /staleOpportunityCount: Number\(row\.stale_opportunity_count \|\| 0\)/);
  assert.match(component, /Overdue close/);
  assert.match(component, /30\+ days in stage/);
  assert.match(component, /formatMoney\(row\.overdueValue,\s*currency\)/);
  assert.match(component, /formatMoney\(row\.staleValue,\s*currency\)/);
});

test('Sales Reports render stage funnel data without changing other Sales route views', async () => {
  const page = await source('app/apps/sales/SalesSectionPage.tsx');
  const packageJson = await source('package.json');

  assert.match(page, /getSalesOpportunityFunnelData/);
  assert.match(page, /reportsAvailable/);
  assert.match(page, /SalesOpportunityFunnel[\s\S]{0,180}rows=\{opportunityFunnel\.rows\}[\s\S]{0,180}riskRows=\{opportunityRiskQueue\.rows\}/);
  assert.match(page, /view === 'reports' && data\.capabilities\.canViewReports/);
  assert.match(packageJson, /tests\/sales-pipeline-funnel\.test\.mjs/);
});

test('Sales funnel retains configured stages with no current opportunities', async () => {
  const service = await source('lib/apps/sales/pipeline-funnel.ts');

  assert.match(service, /LEFT JOIN sales_opportunities o/);
  assert.match(service, /COUNT\(o\.id\)::int AS opportunity_count/);
  assert.match(service, /NULLIF\(BTRIM\(o\.currency\), ''\),[\s\S]*NULLIF\(BTRIM\(\$2::text\), ''\)/);
});

test('Sales opportunity risk queue is company and tenant scoped and prioritizes actionable risks', async () => {
  const service = await source('lib/apps/sales/pipeline-funnel.ts');
  const start = service.indexOf('export async function getSalesOpportunityRiskQueue');
  assert.notEqual(start, -1, 'risk queue query is exported');
  const riskService = service.slice(start);

  assert.match(riskService, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_VIEW\)/);
  assert.match(riskService, /SALES_PERMISSIONS\.REPORT_VIEW/);
  assert.match(riskService, /if \(!canViewReports\) \{\s*return \{\s*canViewReports: false,[\s\S]*?rows: \[\],\s*\};/);
  assert.match(riskService, /WHERE o\.company_id = \$1/);
  assert.match(riskService, /NULLIF\(BTRIM\(\$3::text\), ''\)/);
  assert.match(riskService, /context\.company\.currentCompany\.currency/);
  assert.match(riskService, /tu\.tenant_id = \$2/);
  assert.match(riskService, /o\.deleted_at IS NULL/);
  assert.match(riskService, /s\.deleted_at IS NULL/);
  assert.match(riskService, /s\.stage_type = 'open'/);
  assert.match(riskService, /o\.expected_close_date < CURRENT_DATE/);
  assert.match(riskService, /o\.expected_close_date IS NULL/);
  assert.match(riskService, /h\.company_id = o\.company_id/);
  assert.match(riskService, /h\.to_stage_id = o\.stage_id/);
  assert.match(riskService, /AS overdue/);
  assert.match(riskService, /AS missing_close_date/);
  assert.match(riskService, /AS stale/);
  assert.ok(riskService.includes('RISK_QUEUE_LIMIT'));
  assert.match(riskService, /LIMIT \$5/);
  assert.match(riskService, /ORDER BY[\s\S]*CASE[\s\S]*expected_close_date < CURRENT_DATE/);
});

test('Sales Reports render actionable risk records with reasons, owner, close date and currency', async () => {
  const page = await source('app/apps/sales/SalesSectionPage.tsx');
  const component = await source('app/apps/sales/SalesOpportunityFunnel.tsx');

  assert.match(page, /getSalesOpportunityRiskQueue/);
  assert.match(page, /opportunityRiskQueue/);
  assert.match(page, /SalesOpportunityFunnel[\s\S]{0,180}rows=\{opportunityFunnel\.rows\}[\s\S]{0,180}riskRows=\{opportunityRiskQueue\.rows\}/);
  assert.match(component, /Opportunities needing attention/);
  assert.match(component, /Overdue close/);
  assert.match(component, /No close date/);
  assert.match(component, /30\+ days in stage/);
  assert.match(component, /salespersonName/);
  assert.match(component, /expectedCloseDate/);
  assert.match(component, /formatMoney\(row\.expectedValue,\s*row\.currency\)/);
  assert.match(component, /Open opportunities/);
});
