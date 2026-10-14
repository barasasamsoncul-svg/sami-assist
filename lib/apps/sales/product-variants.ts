import 'server-only';
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { cleanText, numberInput, requireSalesContext, requireUuid, SALES_PERMISSIONS, SalesError } from '@/lib/apps/sales/context';
import { createSalesCatalogItem } from '@/lib/apps/sales/commands';

type Attribute = { name: string; value: string };
type Context = Awaited<ReturnType<typeof requireSalesContext>>;

function requireCatalogManage(context: Context) {
  if (!context.permissions.isOwner && !context.permissions.permissionSet.has('invoicing.catalog.manage')) {
    throw new SalesError('SALES_PERMISSION_REQUIRED', 'Product-variant management requires shared catalogue-management permission.', { permission: 'invoicing.catalog.manage' });
  }
}

function canManageSalesCost(context: Context) {
  return context.permissions.isOwner || context.permissions.permissionSet.has(SALES_PERMISSIONS.MARGIN_MANAGE);
}

function canViewSalesCost(context: Context) {
  return canManageSalesCost(context) || context.permissions.permissionSet.has(SALES_PERMISSIONS.MARGIN_VIEW);
}

function requireCostPermission(context: Context, value: unknown) {
  if (value !== undefined && !canManageSalesCost(context)) {
    throw new SalesError('SALES_PERMISSION_REQUIRED', 'Changing product cost requires sales margin-management permission.', { permission: SALES_PERMISSIONS.MARGIN_MANAGE });
  }
}
function normalizeAttributes(value: unknown): Attribute[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) throw new SalesError('INVALID_INPUT', 'A product variant needs between 1 and 12 attribute values.');
  const seen = new Set<string>();
  const rows: Attribute[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const raw = value[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SalesError('INVALID_INPUT', 'Variant attribute ' + String(i + 1) + ' is invalid.');
    const record = raw as Record<string, unknown>;
    const name = cleanText(record.name, 40);
    const attributeValue = cleanText(record.value, 80);
    if (!name || !attributeValue) throw new SalesError('INVALID_INPUT', 'Every variant attribute needs both a name and a value.');
    if (seen.has(name.toLowerCase())) throw new SalesError('INVALID_INPUT', 'Variant attribute names must be unique within a variant.');
    seen.add(name.toLowerCase());
    rows.push({ name, value: attributeValue });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
function labelFor(attributes: Attribute[]) {
  return attributes.map(item => item.name + ': ' + item.value).join(' · ').slice(0, 180);
}
function nameFor(baseName: string, label: string) {
  return cleanText(baseName + ' — ' + label, 255);
}
async function audit(client: PoolClient, context: Context, id: string, event: string, content: string, metadata: Record<string, unknown>) {
  await client.query(
    `INSERT INTO activities(company_id,user_id,model,record_id,type,content,metadata)
     VALUES ($1,$2,'sales.product.variant',$3,$4,$5,$6::jsonb)`,
    [context.companyId, context.userId, id, event, content, JSON.stringify(metadata)],
  );
}

export async function createSalesProductVariant(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_CREATE);
  requireCatalogManage(context);
  const baseCatalogItemId = requireUuid(input.baseCatalogItemId, 'Base product');
  const sku = cleanText(input.sku, 120);
  if (!sku) throw new SalesError('INVALID_INPUT', 'Each product variant needs a unique SKU.');
  const attributes = normalizeAttributes(input.attributes);
  const label = labelFor(attributes);
  requireCostPermission(context, input.unitCost);
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const baseResult = await client.query(
      `SELECT id,name,item_type,description,unit,unit_price,tax_category,default_tax_rate_id,default_tax_group_id,metadata
       FROM invoicing_catalog_items WHERE id=$1 AND company_id=$2 AND item_type='product'
         AND is_active=TRUE AND deleted_at IS NULL FOR SHARE`,
      [baseCatalogItemId, context.companyId],
    );
    const base = baseResult.rows[0];
    if (!base) throw new SalesError('INVALID_INPUT', 'Select an active product from the shared catalogue.');
    const baseMetadata = base.metadata && typeof base.metadata === 'object' && !Array.isArray(base.metadata)
      ? base.metadata as Record<string, unknown>
      : {};
    const inheritedUnitCost = numberInput(
      baseMetadata.standardCost ?? baseMetadata.unitCost ?? 0,
      'Base product cost',
      { min: 0 },
    );
    const unitCost = canManageSalesCost(context)
      ? numberInput(input.unitCost ?? inheritedUnitCost, 'Variant unit cost', { min: 0 })
      : inheritedUnitCost;
    const unitPrice = numberInput(input.unitPrice ?? base.unit_price, 'Variant unit price', { min: 0 });
    const name = nameFor(String(base.name), label);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext(LOWER(BTRIM($2))))', ['sales-product-variant:' + context.companyId, sku]);
    const duplicate = await client.query(
      `SELECT id FROM invoicing_catalog_items WHERE company_id=$1 AND deleted_at IS NULL
       AND LOWER(BTRIM(COALESCE(sku,'')))=LOWER(BTRIM($2)) LIMIT 1`,
      [context.companyId, sku],
    );
    if (duplicate.rows[0]) throw new SalesError('INVALID_INPUT', 'That SKU is already used by another active catalogue item.');
    const variantId = crypto.randomUUID();
    const metadata = { standardCost: unitCost, unitCost, salesProductVariant: { id: variantId, baseCatalogItemId, label, attributes } };
    const created = await client.query(
      `INSERT INTO invoicing_catalog_items
       (company_id,item_type,name,sku,description,unit,unit_price,tax_category,default_tax_rate_id,
        default_tax_group_id,created_by,updated_by,metadata)
       VALUES ($1,'product',$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11::jsonb) RETURNING id,name`,
      [context.companyId,name,sku,base.description||null,String(base.unit||'unit'),unitPrice,base.tax_category||null,
       base.default_tax_rate_id||null,base.default_tax_group_id||null,context.userId,JSON.stringify(metadata)],
    );
    const catalogItemId = String(created.rows[0].id);
    await client.query(
      `INSERT INTO sales_product_variants
       (id,company_id,base_catalog_item_id,variant_catalog_item_id,variant_label,sku,attributes,unit_price,unit_cost,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$10)`,
      [variantId,context.companyId,baseCatalogItemId,catalogItemId,label,sku,JSON.stringify(attributes),unitPrice,unitCost,context.userId],
    );
    await audit(client,context,variantId,'sales.product.variant.created','Created product variant '+name+'.',
      {baseCatalogItemId,catalogItemId,sku,attributes,unitPrice});
    await client.query('COMMIT');
    return {variantId,id:catalogItemId,catalogItemId,baseCatalogItemId,name,variantLabel:label,sku,attributes,unitPrice,...(canViewSalesCost(context) ? { unitCost } : {}),isVariant:true};
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally { client.release(); }
}

export async function updateSalesProductVariant(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_EDIT);
  requireCatalogManage(context);
  const variantId = requireUuid(input.variantId, 'Product variant');
  const sku = cleanText(input.sku, 120);
  if (!sku) throw new SalesError('INVALID_INPUT', 'Each product variant needs a unique SKU.');
  const attributes = normalizeAttributes(input.attributes);
  const label = labelFor(attributes);
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT v.id,v.base_catalog_item_id,v.variant_catalog_item_id,v.unit_price,v.unit_cost,
              b.name AS base_name,b.description AS base_description,b.unit,b.tax_category,
              b.default_tax_rate_id,b.default_tax_group_id
       FROM sales_product_variants v
       INNER JOIN invoicing_catalog_items b ON b.id=v.base_catalog_item_id AND b.company_id=v.company_id
         AND b.is_active=TRUE AND b.deleted_at IS NULL
       INNER JOIN invoicing_catalog_items i ON i.id=v.variant_catalog_item_id AND i.company_id=v.company_id
       WHERE v.id=$1 AND v.company_id=$2 AND v.is_active=TRUE AND v.deleted_at IS NULL
         AND i.is_active=TRUE AND i.deleted_at IS NULL FOR UPDATE OF v,i`,
      [variantId,context.companyId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new SalesError('INVALID_INPUT', 'The active product variant was not found.');
    const unitPrice = numberInput(input.unitPrice ?? current.unit_price,'Variant unit price',{min:0});
    requireCostPermission(context, input.unitCost);
    const unitCost = canManageSalesCost(context)
      ? numberInput(input.unitCost ?? current.unit_cost,'Variant unit cost',{min:0})
      : Number(current.unit_cost ?? 0);
    const name = nameFor(String(current.base_name),label);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext(LOWER(BTRIM($2))))',['sales-product-variant:'+context.companyId,sku]);
    const duplicate = await client.query(
      `SELECT id FROM invoicing_catalog_items WHERE company_id=$1 AND id<>$2 AND deleted_at IS NULL
       AND LOWER(BTRIM(COALESCE(sku,'')))=LOWER(BTRIM($3)) LIMIT 1`,
      [context.companyId,current.variant_catalog_item_id,sku],
    );
    if (duplicate.rows[0]) throw new SalesError('INVALID_INPUT','That SKU is already used by another active catalogue item.');
    const metadata = { standardCost:unitCost, unitCost, salesProductVariant:{id:variantId,baseCatalogItemId:current.base_catalog_item_id,label,attributes} };
    await client.query(
      `UPDATE invoicing_catalog_items SET name=$3,sku=$4,description=$5,unit=$6,unit_price=$7,tax_category=$8,
        default_tax_rate_id=$9,default_tax_group_id=$10,metadata=COALESCE(metadata,'{}'::jsonb)||$11::jsonb,
        updated_by=$12,updated_at=NOW() WHERE id=$1 AND company_id=$2 AND is_active=TRUE AND deleted_at IS NULL`,
      [current.variant_catalog_item_id,context.companyId,name,sku,current.base_description||null,String(current.unit||'unit'),
       unitPrice,current.tax_category||null,current.default_tax_rate_id||null,current.default_tax_group_id||null,JSON.stringify(metadata),context.userId],
    );
    await client.query(
      `UPDATE sales_product_variants SET variant_label=$3,sku=$4,attributes=$5::jsonb,unit_price=$6,unit_cost=$7,
        updated_by=$8,updated_at=NOW() WHERE id=$1 AND company_id=$2 AND is_active=TRUE AND deleted_at IS NULL`,
      [variantId,context.companyId,label,sku,JSON.stringify(attributes),unitPrice,unitCost,context.userId],
    );
    await audit(client,context,variantId,'sales.product.variant.updated','Updated product variant '+name+'.',
      {variantId,sku,attributes,unitPrice});
    await client.query('COMMIT');
    return {variantId,id:String(current.variant_catalog_item_id),catalogItemId:String(current.variant_catalog_item_id),
      baseCatalogItemId:String(current.base_catalog_item_id),name,variantLabel:label,sku,attributes,unitPrice,...(canViewSalesCost(context) ? { unitCost } : {}),isVariant:true};
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally { client.release(); }
}

export async function archiveSalesProductVariant(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_EDIT);
  requireCatalogManage(context);
  const variantId = requireUuid(input.variantId,'Product variant');
  const client = await context.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id,variant_catalog_item_id,variant_label,sku FROM sales_product_variants
       WHERE id=$1 AND company_id=$2 AND is_active=TRUE AND deleted_at IS NULL FOR UPDATE`,
      [variantId,context.companyId],
    );
    const variant=result.rows[0];
    if(!variant) throw new SalesError('INVALID_INPUT','The active product variant was not found.');
    await client.query(
      `UPDATE invoicing_catalog_items SET is_active=FALSE,deleted_at=NOW(),updated_by=$3,updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND is_active=TRUE AND deleted_at IS NULL`,
      [variant.variant_catalog_item_id,context.companyId,context.userId],
    );
    await client.query(
      `UPDATE sales_product_variants SET is_active=FALSE,deleted_at=NOW(),updated_by=$3,updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND is_active=TRUE AND deleted_at IS NULL`,
      [variantId,context.companyId,context.userId],
    );
    await audit(client,context,variantId,'sales.product.variant.archived','Archived product variant '+String(variant.variant_label)+'.',
      {variantId,sku:variant.sku,catalogItemId:variant.variant_catalog_item_id});
    await client.query('COMMIT');
    return {variantId,catalogItemId:String(variant.variant_catalog_item_id),archived:true};
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>undefined);
    throw error;
  } finally { client.release(); }
}

function parseImportedVariantAttributes(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) {
    throw new SalesError('INVALID_INPUT', 'Variant rows need variantAttributes, for example Color=Blue|Size=Large.');
  }
  const raw = value.trim();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Accept a human-editable delimited form as well as JSON exported by SaMi.
  }
  return raw.split(/[|\r\n;]+/).map(part => {
    const separator = part.indexOf('=');
    if (separator < 1) {
      throw new SalesError('INVALID_INPUT', 'Use attribute=value pairs for variantAttributes.');
    }
    return {
      name: part.slice(0, separator).trim(),
      value: part.slice(separator + 1).trim(),
    };
  }).filter(part => part.name && part.value);
}

export async function bulkImportSalesCatalogItems(input: Record<string, unknown>) {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_CREATE);
  requireCatalogManage(context);
  const rows = input.items;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 200) {
    throw new SalesError('INVALID_INPUT', 'Upload between 1 and 200 catalogue rows per import.');
  }

  const results: Array<Record<string, unknown>> = [];
  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 2;
    const raw = rows[index];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      results.push({ row: rowNumber, success: false, error: 'Invalid row data.' });
      continue;
    }

    const row = raw as Record<string, unknown>;
    const sku = cleanText(row.sku, 120);
    const unit = cleanText(row.unit, 40) || 'unit';
    const description = cleanText(row.description, 4000);
    const baseProductSku = cleanText(row.baseProductSku, 120);

    try {
      if (baseProductSku) {
        if (!sku) throw new SalesError('INVALID_INPUT', 'Each product variant needs a unique SKU.');
        const baseResult = await context.pool.query(
          "SELECT item.id " +
          "FROM invoicing_catalog_items item " +
          "WHERE item.company_id=$1 AND item.item_type='product' " +
          "AND item.is_active=TRUE AND item.deleted_at IS NULL " +
          "AND LOWER(BTRIM(COALESCE(item.sku,'')))=LOWER(BTRIM($2)) " +
          "AND NOT EXISTS (" +
          "SELECT 1 FROM sales_product_variants variant " +
          "WHERE variant.company_id=item.company_id " +
          "AND variant.variant_catalog_item_id=item.id AND variant.deleted_at IS NULL) " +
          "LIMIT 1",
          [context.companyId, baseProductSku],
        );
        const base = baseResult.rows[0];
        if (!base) {
          throw new SalesError('INVALID_INPUT', 'Base product SKU "' + baseProductSku + '" was not found in this company catalogue. Import the base product first.');
        }
        const optionalUnitCost = cleanText(row.unitCost, 60);
        const created = await createSalesProductVariant({
          baseCatalogItemId: String(base.id),
          sku,
          attributes: parseImportedVariantAttributes(row.variantAttributes ?? row.attributes),
          ...(cleanText(row.unitPrice, 60) ? { unitPrice: row.unitPrice } : {}),
          ...(optionalUnitCost ? { unitCost: optionalUnitCost } : {}),
        });
        results.push({ row: rowNumber, success: true, id: created.catalogItemId, name: created.name, sku, isVariant: true });
        continue;
      }

      const name = cleanText(row.name, 255);
      if (!name) throw new SalesError('INVALID_INPUT', 'Item name is required.');
      const rawType = cleanText(row.itemType, 30).toLowerCase();
      const itemType = rawType || 'product';
      if (itemType !== 'product' && itemType !== 'service') {
        throw new SalesError('INVALID_INPUT', 'Item type must be product or service.');
      }
      const unitPrice = numberInput(row.unitPrice ?? 0, 'Unit price', { min: 0 });
      const created = await createSalesCatalogItem({
        itemType,
        name,
        sku,
        unit,
        description,
        unitPrice,
        taxRateId: cleanText(row.taxRateId, 120) || undefined,
      });
      results.push({ row: rowNumber, success: true, id: created.id, name: created.name, sku, isVariant: false });
    } catch (error) {
      results.push({
        row: rowNumber,
        success: false,
        name: cleanText(row.name, 255) || undefined,
        sku: sku || undefined,
        error: error instanceof Error ? error.message : 'Could not create this catalogue row.',
      });
    }
  }

  const created = results.filter(row => row.success === true).length;
  return { total: rows.length, created, failed: rows.length - created, results };
}
