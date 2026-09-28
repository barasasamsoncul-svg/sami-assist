import EmployeesWorkspace from '@/app/apps/employees/EmployeesWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function EmployeesSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <EmployeesWorkspace section={section} />;
}
