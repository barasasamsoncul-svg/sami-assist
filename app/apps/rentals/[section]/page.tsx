import RentalsWorkspace from '@/app/apps/rentals/RentalsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function RentalsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <RentalsWorkspace section={section} />;
}
