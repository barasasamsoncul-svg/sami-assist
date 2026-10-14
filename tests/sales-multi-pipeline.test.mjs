import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales multiple-pipeline migration preserves existing stages and isolates stage names by pipeline', async () => {
  const [schema, migration, runtime, manifest] = await Promise.all([
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/sales/migrations/3.4.17-to-3.4.18.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);

  assert.match(schema, /CREATE TABLE IF NOT EXISTS public\.sales_pipelines/);
  assert.match(schema, /pipeline_id UUID NOT NULL REFERENCES public\.sales_pipelines\(id\)/);
  assert.match(schema, /is_default BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /fromVersion: '3\.4\.17'/);
  assert.match(migration, /toVersion: '3\.4\.18'/);
  assert.match(migration, /UPDATE public\.sales_pipeline_stages AS stage[\s\S]*SET pipeline_id=p\.id/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS sales_pipeline_stages_company_id_name_key/);
  assert.match(migration, /uq_sales_pipeline_stages_company_pipeline_name/);
  assert.match(migration, /uq_sales_pipelines_company_default/);
  assert.match(migration, /'Qualification'[\s\S]*'Won'[\s\S]*'Lost'/);
  assert.match(runtime, /SALES_3_4_17_TO_3_4_18/);
  assert.match(runtime, /SALES_3_4_17_TO_3_4_18,[\s\S]*\];/);
  assert.match(manifest, /key: "sales",[\s\S]*version: '3\.4\.19'/);
});

test('Sales creates company-scoped pipelines by cloning stages from the default pipeline', async () => {
  const [pipeline, service, route] = await Promise.all([
    source('lib/apps/sales/pipeline.ts'),
    source('lib/apps/sales/service.ts'),
    source('app/api/apps/sales/route.ts'),
  ]);

  assert.match(pipeline, /export async function createSalesPipeline/);
  assert.match(pipeline, /SALES_PERMISSIONS\.PIPELINE_MANAGE/);
  assert.match(pipeline, /sales-pipeline-name:/);
  assert.match(pipeline, /LOWER\(BTRIM\(name\)\)=LOWER\(BTRIM\(\$2\)\)/);
  assert.match(pipeline, /INSERT INTO sales_pipeline_stages[\s\S]*SELECT stage\.company_id,\$2,stage\.name/);
  assert.match(pipeline, /sales\.pipeline\.created/);
  assert.match(pipeline, /pipelineId: String\(created\.id\)/);
  assert.match(service, /createSalesPipeline/);
  assert.match(route, /create_pipeline:[\s\S]*createSalesPipeline/);
});

test('Sales workspace filters opportunities, stages, activity and history by active pipeline', async () => {
  const [pipeline, route, ui] = await Promise.all([
    source('lib/apps/sales/pipeline.ts'),
    source('app/api/apps/sales/route.ts'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
  ]);

  assert.match(pipeline, /getSalesPipelineData\(requestedPipelineId\?: unknown\)/);
  assert.match(pipeline, /WHERE id=\$1 AND company_id=\$2 AND is_active=TRUE AND deleted_at IS NULL/);
  assert.match(pipeline, /WHERE company_id=\$1 AND pipeline_id=\$2 AND is_active=TRUE/);
  assert.match(pipeline, /WHERE o\.company_id=\$1 AND s\.pipeline_id=\$2 AND o\.deleted_at IS NULL/);
  assert.match(pipeline, /selected_stage\.pipeline_id=\$2/);
  assert.match(pipeline, /current_stage\.pipeline_id=\$2/);
  assert.match(route, /getSalesPipelineData\(request\.nextUrl\.searchParams\.get\('pipelineId'\)\)/);
  assert.match(ui, /type SalesPipelineOption/);
  assert.match(ui, /value=\{selectedPipelineId \|\| data\.activePipelineId\}/);
  assert.match(ui, /Create a separate pipeline/);
  assert.match(ui, /action: 'create_pipeline'/);
  assert.match(ui, /pipelineId: selectedPipelineId \|\| data\.activePipelineId/);
});

test('Sales prevents moving or converting an opportunity into another company pipeline', async () => {
  const pipeline = await source('lib/apps/sales/pipeline.ts');

  assert.match(pipeline, /SELECT id[\s\S]*FROM sales_pipelines[\s\S]*WHERE id=\$1 AND company_id=\$2 AND is_active=TRUE AND deleted_at IS NULL/);
  assert.match(pipeline, /WHERE company_id=\$1 AND pipeline_id=\$2 AND stage_type='open' AND is_active=TRUE/);
  assert.match(pipeline, /current_stage\.pipeline_id AS current_pipeline_id/);
  assert.match(pipeline, /String\(current\.rows\[0\]\.current_pipeline_id\) !== String\(stage\.rows\[0\]\.pipeline_id\)/);
  assert.match(pipeline, /An opportunity cannot be moved to a stage in a different sales pipeline/);
});
