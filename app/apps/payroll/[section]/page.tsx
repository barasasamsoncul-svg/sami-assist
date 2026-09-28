import PayrollWorkspace from '@/app/apps/payroll/PayrollWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PayrollSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <PayrollWorkspace section={section} />;
}
