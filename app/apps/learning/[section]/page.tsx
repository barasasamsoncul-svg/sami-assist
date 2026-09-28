import LearningWorkspace from '@/app/apps/learning/LearningWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LearningSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <LearningWorkspace section={section} />;
}
