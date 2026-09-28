import SurveysWorkspace from '@/app/apps/surveys/SurveysWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SurveysSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <SurveysWorkspace section={section} />;
}
