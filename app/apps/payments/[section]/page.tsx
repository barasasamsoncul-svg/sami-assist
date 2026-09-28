import PaymentsWorkspace from '@/app/apps/payments/PaymentsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PaymentsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <PaymentsWorkspace section={section} />;
}
