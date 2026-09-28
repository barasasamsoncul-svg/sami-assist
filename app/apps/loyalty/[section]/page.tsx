import LoyaltyWorkspace from '@/app/apps/loyalty/LoyaltyWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LoyaltySectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <LoyaltyWorkspace section={section} />;
}
