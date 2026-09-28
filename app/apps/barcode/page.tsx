import BarcodeWorkspace from '@/app/apps/barcode/BarcodeWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function BarcodePage() {
  return <BarcodeWorkspace />;
}
