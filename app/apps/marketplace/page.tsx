import MarketplaceWorkspace from '@/app/apps/marketplace/MarketplaceWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function MarketplacePage() {
  return <MarketplaceWorkspace />;
}
