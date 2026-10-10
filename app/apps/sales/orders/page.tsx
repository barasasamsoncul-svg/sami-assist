import SalesSectionPage from '@/app/apps/sales/SalesSectionPage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function OrdersPage() {
  return <SalesSectionPage view="orders" />;
}
