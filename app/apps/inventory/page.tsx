import InventoryWorkspace from '@/app/apps/inventory/InventoryWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function InventoryPage() {
  return <InventoryWorkspace />;
}
