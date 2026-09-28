import GiftCardsWorkspace from '@/app/apps/gift_cards/GiftCardsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function GiftCardsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <GiftCardsWorkspace section={section} />;
}
