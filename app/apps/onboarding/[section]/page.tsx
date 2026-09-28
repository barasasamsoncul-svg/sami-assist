import OnboardingWorkspace from '@/app/apps/onboarding/OnboardingWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function OnboardingSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <OnboardingWorkspace section={section} />;
}
