import TaxWorkspace from '@/app/apps/tax/TaxWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function TaxPage() {
  return <TaxWorkspace />;
}
