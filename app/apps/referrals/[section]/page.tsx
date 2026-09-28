import ReferralsWorkspace from '@/app/apps/referrals/ReferralsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ReferralsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <ReferralsWorkspace section={section} />;
}
