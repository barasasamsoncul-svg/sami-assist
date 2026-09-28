import CustomerPortalWorkspace from '@/app/apps/customer_portal/CustomerPortalWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function CustomerPortalPage() {
  return <CustomerPortalWorkspace />;
}
