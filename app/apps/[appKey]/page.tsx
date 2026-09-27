import EnterpriseModulePage from '@/app/apps/[appKey]/EnterpriseModulePage';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function AppEntryPage({
  params,
}: {
  params:
    Promise<{
      appKey:
        string;
    }>;
}) {
  const {
    appKey,
  } =
    await params;

  return (
    <EnterpriseModulePage
      appKey={
        appKey
      }
    />
  );
}
