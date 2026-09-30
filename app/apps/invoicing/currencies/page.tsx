import InvoicingSectionPage from '@/app/apps/invoicing/InvoicingSectionPage';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default function CurrenciesPage() {
  return (
    <InvoicingSectionPage
      view="currencies"
    />
  );
}
