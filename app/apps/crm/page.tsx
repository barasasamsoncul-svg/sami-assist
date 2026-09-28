import CrmWorkspace from '@/app/apps/crm/CrmWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function CrmPage() {
  return <CrmWorkspace />;
}
