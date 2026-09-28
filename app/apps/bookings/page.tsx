import BookingsWorkspace from '@/app/apps/bookings/BookingsWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function BookingsPage() {
  return <BookingsWorkspace />;
}
