import {
  redirect,
} from 'next/navigation';

import {
  getSession,
} from '@/lib/auth/session';

import NewWorkspaceClient from './NewWorkspaceClient';


export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';


export default async function NewWorkspacePage() {
  const session =
    await getSession();

  if (
    !session
  ) {
    redirect(
      '/login?next=%2Fworkspaces%2Fnew',
    );
  }

  return (
    <NewWorkspaceClient
      account={{
        email:
          session.user
            .email,
        firstName:
          session.user
            .firstName,
        lastName:
          session.user
            .lastName,
      }}
    />
  );
}
