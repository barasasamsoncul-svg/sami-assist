import SalesSectionPage from '@/app/apps/sales/SalesSectionPage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function CurrenciesPage() {
  return <SalesSectionPage view="currencies" />;
}
