import SpreadsheetWorkspace from '@/app/apps/spreadsheet/SpreadsheetWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function SpreadsheetPage() {
  return <SpreadsheetWorkspace />;
}
