import CustomerPortalWorkspace from '@/app/apps/customer_portal/CustomerPortalWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CustomerPortalSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <CustomerPortalWorkspace section={section} />;
}
