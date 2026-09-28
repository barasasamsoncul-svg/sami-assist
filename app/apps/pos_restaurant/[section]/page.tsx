import PosRestaurantWorkspace from '@/app/apps/pos_restaurant/PosRestaurantWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PosRestaurantSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <PosRestaurantWorkspace section={section} />;
}
