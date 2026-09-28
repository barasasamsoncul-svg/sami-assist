import ChatWorkspace from '@/app/apps/chat/ChatWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ChatSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  return <ChatWorkspace section={section} />;
}
