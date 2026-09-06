import { redirect } from 'next/navigation';
import {
  getSession,
  type Session,
} from '@/lib/auth/session';

export async function requirePageSession(
  nextPath = '/dashboard'
): Promise<Session> {
  const session = await getSession();

  if (!session) {
    const loginUrl = new URL(
      '/login',
      'http://sami.local'
    );

    loginUrl.searchParams.set(
      'next',
      nextPath
    );

    redirect(
      `${loginUrl.pathname}${loginUrl.search}`
    );
  }

  return session;
}

export async function redirectIfAuthenticated(
  redirectTo = '/dashboard'
): Promise<void> {
  const session = await getSession();

  if (session) {
    redirect(redirectTo);
  }
}