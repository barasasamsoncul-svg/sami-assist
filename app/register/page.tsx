import { redirectIfAuthenticated } from '@/lib/auth/require-page-session';
import RegisterClient from './RegisterClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  await redirectIfAuthenticated('/dashboard');
  return <RegisterClient />;
}
