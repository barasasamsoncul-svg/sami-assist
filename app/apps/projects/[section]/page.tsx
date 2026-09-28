import ProjectsWorkspace from '@/app/apps/projects/ProjectsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ProjectsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <ProjectsWorkspace section={section} />;
}
