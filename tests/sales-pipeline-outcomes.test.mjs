import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales win/loss analytics is report-permission gated and scoped to the active company', async () => {
  const service = await source('lib/apps/sales/pipeline-outcomes.ts');

  assert.match(service, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_VIEW\)/);
  assert.match(service, /SALES_PERMISSIONS\.REPORT_VIEW/);
  assert.match(service, /if \(!canViewReports\) \{\s*return \{\s*canViewReports: false,[\s\S]*?summaries: \[\],[\s\S]*?lossReasons: \[\]/);
  assert.match(service, /o\.company_id = \$1/);
  assert.match(service, /o\.deleted_at IS NULL/);
  assert.match(service, /s\.deleted_at IS NULL/);
  assert.match(service, /s\.company_id = o\.company_id/);
  assert.match(service, /context\.company\.currentCompany\.currency/);
});

test('Sales win/loss analytics includes trailing 90-day closures and avoids mixing currencies', async () => {
  const service = await source('lib/apps/sales/pipeline-outcomes.ts');
  const component = await source('app/apps/sales/SalesPipelineOutcomes.tsx');

  assert.match(service, /const REPORT_WINDOW_DAYS = 90/);
  assert.match(service, /o\.won_at >= NOW\(\) - \(\$3::int \* INTERVAL '1 day'\)/);
  assert.match(service, /o\.lost_at >= NOW\(\) - \(\$3::int \* INTERVAL '1 day'\)/);
  assert.match(service, /o\.lost_at >= NOW\(\) - INTERVAL '90 days'/);
  assert.match(service, /GROUP BY 1/);
  assert.match(service, /AS won_value/);
  assert.match(service, /AS lost_value/);
  assert.match(service, /100\.0 \* COUNT\(\*\) FILTER/);
  assert.match(service, /NULLIF\(COUNT\(\*\) FILTER/);
  assert.match(service, /AVG\([\s\S]*o\.won_at - o\.created_at/);
  assert.match(service, /percentile_cont\(0\.5\) WITHIN GROUP/);
  assert.match(service, /AS average_days_to_lose/);
  assert.match(component, /new Set\(\[/);
  assert.match(component, /row\.currency/);
  assert.match(component, /Figures remain separated by currency/);
  assert.match(component, /row\.winRate == null \? '—'/);
});

test('Sales loss-reason report groups and ranks common recorded reasons per currency', async () => {
  const service = await source('lib/apps/sales/pipeline-outcomes.ts');

  assert.match(service, /COALESCE\(NULLIF\(BTRIM\(o\.lost_reason\), ''\), 'Reason not recorded'\)/);
  assert.match(service, /s\.stage_type = 'lost'/);
  assert.match(service, /PARTITION BY currency/);
  assert.match(service, /ROW_NUMBER\(\) OVER/);
  assert.match(service, /const LOSS_REASON_LIMIT = 5/);
  assert.match(service, /WHERE reason_rank <= \$3/);
  assert.match(service, /COUNT\(\*\)::int AS opportunity_count/);
  assert.match(service, /SUM\(expected_value\) DESC/);
});

test('Sales Reports loads and renders win/loss analytics only within the Reports workspace', async () => {
  const page = await source('app/apps/sales/SalesSectionPage.tsx');
  const packageJson = await source('package.json');

  assert.match(page, /getSalesPipelineOutcomeReport/);
  assert.match(page, /reportsAvailable = view === 'reports' && data\.capabilities\.canViewReports/);
  assert.match(page, /pipelineOutcomeReport/);
  assert.match(page, /<SalesPipelineOutcomes/);
  assert.match(page, /summaries=\{pipelineOutcomeReport\.summaries\}/);
  assert.match(page, /lossReasons=\{pipelineOutcomeReport\.lossReasons\}/);
  assert.match(packageJson, /tests\/sales-pipeline-outcomes\.test\.mjs/);
});


test('opportunity stage transitions keep terminal win/loss probabilities canonical', async () => {
  const [pipeline, rules] = await Promise.all([
    source('lib/apps/sales/pipeline.ts'),
    source('lib/apps/sales/pipeline-stage-rules.ts'),
  ]);
  const start = pipeline.indexOf('export async function moveSalesOpportunityTransaction(');
  const end = pipeline.indexOf('export async function moveSalesOpportunity(', start);
  assert.ok(start >= 0 && end > start, 'opportunity transition transaction core must have a bounded implementation');
  const move = pipeline.slice(start, end);
  assert.match(move, /terminalSalesOpportunityProbability\(targetStageType\)/);
  assert.match(move, /terminalProbability !== null[\s\S]*?\? terminalProbability/);
  assert.match(move, /won_at=CASE WHEN \$5='won'/);
  assert.match(move, /lost_at=CASE WHEN \$5='lost'/);
  assert.match(rules, /type === 'won'\) return 100/);
  assert.match(rules, /type === 'lost'\) return 0/);
});
