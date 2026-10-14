import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const source = async file => (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');

test('Opportunity Pipeline Board reads and moves real CRM opportunities, not quotations', async () => {
  const [board, pipeline, route, service] = await Promise.all([
    source('app/apps/sales/SalesPipelineBoard.tsx'),
    source('lib/apps/sales/pipeline.ts'),
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/service.ts'),
  ]);
  assert.match(board, /\/api\/apps\/sales\?pipeline=1/);
  assert.match(board, /opportunitiesByStage/);
  assert.match(board, /action: 'move_opportunity'/);
  assert.match(board, /action: 'create_pipeline_stage'/);
  assert.match(board, /action: 'update_pipeline_stage'/);
  assert.match(board, /action: 'archive_pipeline_stage'/);
  assert.match(board, /action: 'reorder_pipeline_stages'/);
  assert.doesNotMatch(board, /move_quote_stage/);
  assert.match(pipeline, /export async function moveSalesOpportunity/);
  for (const [action, handler] of [
    ['create_pipeline_stage', 'createSalesPipelineStage'],
    ['update_pipeline_stage', 'updateSalesPipelineStage'],
    ['archive_pipeline_stage', 'archiveSalesPipelineStage'],
    ['reorder_pipeline_stages', 'reorderSalesPipelineStages'],
  ]) {
    assert.match(route, new RegExp(action + ':\\s*' + handler));
    assert.ok(service.includes(handler), handler + ' must be exported by the Sales service');
  }
});

test('Pipeline stage mutations are company-scoped, transactional, and keep Won/Lost terminal stages protected', async () => {
  const [pipeline, schema] = await Promise.all([
    source('lib/apps/sales/pipeline.ts'),
    source('lib/apps/sales/schema.sql'),
  ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS public\.sales_pipeline_stages/);
  for (const name of [
    'createSalesPipelineStage',
    'updateSalesPipelineStage',
    'archiveSalesPipelineStage',
    'reorderSalesPipelineStages',
  ]) {
    const start = pipeline.indexOf('export async function ' + name);
    assert.ok(start >= 0, name + ' is implemented');
    const next = pipeline.indexOf('export async function ', start + 30);
    const body = pipeline.slice(start, next < 0 ? pipeline.length : next);
    assert.match(body, /requireSalesContext\(SALES_PERMISSIONS\.PIPELINE_MANAGE\)/, name + ' must enforce pipeline permissions');
    assert.match(body, /context\.companyId/, name + ' must scope database operations to the active company');
    assert.match(body, /BEGIN/);
    assert.match(body, /COMMIT/);
    assert.match(body, /ROLLBACK/);
  }
  assert.match(pipeline, /Won and Lost are reserved terminal stage names/);
  assert.match(pipeline, /Won and Lost are terminal stages and cannot be archived/);
  assert.match(pipeline, /Stage order must include every active open stage in this pipeline exactly once/);
  assert.match(pipeline, /INSERT INTO sales_opportunity_stage_history/);
  assert.match(pipeline, /MAX\(s\.sequence\)\+10/);
  assert.match(pipeline, /MAX\(s\.sequence\)\+20/);
});
