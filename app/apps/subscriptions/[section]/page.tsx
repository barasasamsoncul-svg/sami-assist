import SubscriptionsWorkspace from '@/app/apps/subscriptions/SubscriptionsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SubscriptionsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <SubscriptionsWorkspace section={section} />;
}
