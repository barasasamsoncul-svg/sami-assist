import type { PoolClient } from 'pg';

type PurchaseSupplierOperation = 'create' | 'update' | 'delete';

function nullableText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new Error('Purchase supplier field exceeds its supported length.');
  }
  return normalized;
}

/**
 * Purchase owns supplier identity. When Accounting exists, keep its AP vendor
 * projection linked by company + purchase_supplier_id so bills reuse the same
 * supplier instead of creating a second unrelated counterparty.
 *
 * This runs inside the calling enterprise-record transaction. If Accounting
 * is not installed, Purchase remains fully usable and no write is attempted.
 */
export async function syncPurchaseSupplierToAccounting(
  client: PoolClient,
  input: {
    companyId: string;
    userId: string;
    operation: PurchaseSupplierOperation;
    row: Record<string, unknown>;
  },
): Promise<{ synced: boolean; vendorId?: string }> {
  const accounting = await client.query(
    `SELECT to_regclass('public.accounting_vendors') AS relation`,
  );
  if (!accounting.rows[0]?.relation) {
    return { synced: false };
  }

  const columns = await client.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public'
           AND table_name='accounting_vendors'
           AND column_name='purchase_supplier_id'
       ) AS link_ready`,
  );
  if (columns.rows[0]?.link_ready !== true) {
    await client.query(
      `ALTER TABLE public.accounting_vendors
       ADD COLUMN IF NOT EXISTS purchase_supplier_id UUID`,
    );
  }
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_vendors_company_purchase_supplier
     ON public.accounting_vendors(company_id, purchase_supplier_id)
     WHERE purchase_supplier_id IS NOT NULL AND deleted_at IS NULL`,
  );

  const supplierId = nullableText(input.row.id, 64);
  if (!supplierId) {
    throw new Error('The Purchase supplier ID is required to synchronize its Accounting vendor.');
  }

  if (input.operation === 'delete' || input.row.deleted_at) {
    await client.query(
      `UPDATE public.accounting_vendors
       SET status='inactive', updated_by=$3, updated_at=NOW()
       WHERE company_id=$1
         AND purchase_supplier_id=$2
         AND deleted_at IS NULL`,
      [input.companyId, supplierId, input.userId],
    );
    return { synced: true };
  }

  const name = nullableText(input.row.name, 255);
  if (!name) {
    throw new Error('A Purchase supplier needs a name before it can be synchronized to Accounting.');
  }

  const sourceStatus = String(input.row.status || 'active').trim().toLowerCase();
  const status = sourceStatus === 'blocked'
    ? 'blocked'
    : sourceStatus === 'inactive' || sourceStatus === 'archived'
      ? 'inactive'
      : 'active';

  const result = await client.query(
    `INSERT INTO public.accounting_vendors (
       company_id, vendor_code, name, email, phone, tax_number,
       purchase_supplier_id, status, created_by, updated_by
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $9
     )
     ON CONFLICT (company_id, purchase_supplier_id)
       WHERE purchase_supplier_id IS NOT NULL AND deleted_at IS NULL
     DO UPDATE SET
       name=EXCLUDED.name,
       email=EXCLUDED.email,
       phone=EXCLUDED.phone,
       tax_number=EXCLUDED.tax_number,
       status=EXCLUDED.status,
       updated_by=EXCLUDED.updated_by,
       updated_at=NOW(),
       deleted_at=NULL
     RETURNING id::text`,
    [
      input.companyId,
      'PUR-' + supplierId.toUpperCase(),
      name,
      nullableText(input.row.email, 255),
      nullableText(input.row.phone, 50),
      nullableText(input.row.tax_number, 100),
      supplierId,
      status,
      input.userId,
    ],
  );

  return {
    synced: true,
    vendorId: result.rows[0]?.id ? String(result.rows[0].id) : undefined,
  };
}
