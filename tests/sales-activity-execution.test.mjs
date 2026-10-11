import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales activity execution combines lead and opportunity activities inside the active company', async () => {
  const service = await source('lib/apps/sales/activity-execution.ts');
  assert.match(service, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_VIEW\)/);
  assert.match(service, /SALES_PERMISSIONS\.REPORT_VIEW/);
  assert.match(service, /FROM sales_lead_activities a/);
  assert.match(service, /FROM sales_opportunity_activities a/);
  assert.match(service, /a\.company_id = \$1/);
  assert.match(service, /l\.company_id = a\.company_id/);
  assert.match(service, /o\.company_id = a\.company_id/);
  assert.match(service, /a\.deleted_at IS NULL/);
  assert.match(service, /l\.deleted_at IS NULL/);
  assert.match(service, /o\.deleted_at IS NULL/);
});

test('Sales activity execution tracks overdue, unscheduled, upcoming, and recent completed work', async () => {
  const service = await source('lib/apps/sales/activity-execution.ts');
  assert.match(service, /due_date < CURRENT_DATE/);
  assert.match(service, /due_date IS NULL/);
  assert.match(service, /due_date BETWEEN CURRENT_DATE AND CURRENT_DATE \+ 7/);
  assert.match(service, /completed_at >= NOW\(\) - INTERVAL '30 days'/);
  assert.match(service, /completed_at::date <= due_date/);
  assert.match(service, /AS completed_on_time_last_30_count/);
  assert.match(service, /AS days_overdue/);
  assert.match(service, /LIMIT 25/);
});

test('Sales activity report resolves assignees only from active internal tenant users', async () => {
  const service = await source('lib/apps/sales/activity-execution.ts');
  assert.match(service, /tu\.tenant_id = \$1/);
  assert.match(service, /tu\.user_id = ANY\(\$2::uuid\[\]\)/);
  assert.match(service, /tu\.status = 'active'/);
  assert.match(service, /tu\.member_type = 'internal'/);
  assert.match(service, /tu\.deleted_at IS NULL/);
  assert.match(service, /u\.deleted_at IS NULL/);
  assert.match(service, /Inactive or unavailable user/);
});

test('Sales Reports renders activity performance and prioritized follow-ups', async () => {
  const page = await source('app/apps/sales/SalesSectionPage.tsx');
  const component = await source('app/apps/sales/SalesActivityExecution.tsx');
  const packageJson = await source('package.json');
  assert.match(page, /getSalesActivityExecutionReport/);
  assert.match(page, /reportsAvailable = view === 'reports' && data\.capabilities\.canViewReports/);
  assert.match(page, /activityExecutionReport/);
  assert.match(page, /<SalesActivityExecution report=\{activityExecutionReport\} \/>/);
  assert.match(component, /Follow-up workload by salesperson/);
  assert.match(component, /Overdue and upcoming follow-ups/);
  assert.match(component, /On-time rate/);
  assert.match(packageJson, /tests\/sales-activity-execution\.test\.mjs/);
});
