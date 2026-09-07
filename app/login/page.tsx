import { redirectIfAuthenticated } from '@/lib/auth/require-page-session';
import LoginClient from './LoginClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  await redirectIfAuthenticated('/dashboard');

  return <LoginClient />;
}