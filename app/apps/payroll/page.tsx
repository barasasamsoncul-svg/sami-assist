import PayrollWorkspace from '@/app/apps/payroll/PayrollWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function PayrollPage() {
  return <PayrollWorkspace />;
}
