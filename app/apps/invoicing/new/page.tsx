import InvoicingSectionPage from '@/app/apps/invoicing/InvoicingSectionPage';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default function NewPage() {
  return (
    <InvoicingSectionPage
      view="newInvoice"
    />
  );
}
