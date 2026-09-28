import PosRestaurantWorkspace from '@/app/apps/pos_restaurant/PosRestaurantWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function PosRestaurantPage() {
  return <PosRestaurantWorkspace />;
}
