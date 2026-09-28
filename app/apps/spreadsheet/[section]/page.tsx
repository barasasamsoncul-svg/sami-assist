import SpreadsheetWorkspace from '@/app/apps/spreadsheet/SpreadsheetWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SpreadsheetSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <SpreadsheetWorkspace section={section} />;
}
