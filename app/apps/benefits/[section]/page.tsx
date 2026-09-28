import BenefitsWorkspace from '@/app/apps/benefits/BenefitsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function BenefitsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <BenefitsWorkspace section={section} />;
}
