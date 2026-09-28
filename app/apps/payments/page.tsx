import PaymentsWorkspace from '@/app/apps/payments/PaymentsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function PaymentsPage() {
  return <PaymentsWorkspace />;
}
