import WhiteboardWorkspace from '@/app/apps/whiteboard/WhiteboardWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function WhiteboardSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <WhiteboardWorkspace section={section} />;
}
