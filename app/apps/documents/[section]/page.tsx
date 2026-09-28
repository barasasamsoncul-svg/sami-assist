import DocumentsWorkspace from '@/app/apps/documents/DocumentsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function DocumentsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <DocumentsWorkspace section={section} />;
}
