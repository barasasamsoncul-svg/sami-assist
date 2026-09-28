import CheckoutWorkspace from '@/app/apps/checkout/CheckoutWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CheckoutSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <CheckoutWorkspace section={section} />;
}
