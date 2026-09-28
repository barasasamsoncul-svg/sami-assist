import VendorPortalWorkspace from '@/app/apps/vendor_portal/VendorPortalWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function VendorPortalSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <VendorPortalWorkspace section={section} />;
}
