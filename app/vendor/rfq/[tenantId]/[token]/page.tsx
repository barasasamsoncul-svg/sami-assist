import type { Metadata } from 'next';
import VendorRfqResponseClient from '@/app/vendor/rfq/VendorRfqResponseClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Supplier quotation | SaMi Vendor Portal',
  robots: { index: false, follow: false, nocache: true },
};

export default async function VendorRfqPage({
  params,
}: {
  params: Promise<{ tenantId: string; token: string }>;
}) {
  const { tenantId, token } = await params;
  return <VendorRfqResponseClient tenantId={tenantId} token={token} />;
}
