import SalesSectionPage from '@/app/apps/sales/SalesSectionPage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return <SalesSectionPage view="settings" />;
}
