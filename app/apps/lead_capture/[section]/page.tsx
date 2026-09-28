import LeadCaptureWorkspace from '@/app/apps/lead_capture/LeadCaptureWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LeadCaptureSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <LeadCaptureWorkspace section={section} />;
}
