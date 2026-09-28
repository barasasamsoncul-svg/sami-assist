import BookingsWorkspace from '@/app/apps/bookings/BookingsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function BookingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <BookingsWorkspace section={section} />;
}
