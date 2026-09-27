import EnterpriseModulePage from '@/app/apps/[appKey]/EnterpriseModulePage';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function EnterpriseModuleSectionPage({
  params,
}: {
  params:
    Promise<{
      appKey:
        string;
      section:
        string;
    }>;
}) {
  const {
    appKey,
    section,
  } =
    await params;

  return (
    <EnterpriseModulePage
      appKey={
        appKey
      }
      section={
        section
      }
    />
  );
}
