import LandingPagesWorkspace from '@/app/apps/landing_pages/LandingPagesWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LandingPagesSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <LandingPagesWorkspace section={section} />;
}
