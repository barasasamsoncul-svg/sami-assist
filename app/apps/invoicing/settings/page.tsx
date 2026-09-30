import InvoicingSectionPage from '@/app/apps/invoicing/InvoicingSectionPage';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default function SettingsPage() {
  return (
    <InvoicingSectionPage
      view="settings"
    />
  );
}
