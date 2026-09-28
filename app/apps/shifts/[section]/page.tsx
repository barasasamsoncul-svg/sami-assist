import ShiftsWorkspace from '@/app/apps/shifts/ShiftsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ShiftsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <ShiftsWorkspace section={section} />;
}
