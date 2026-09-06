import { Suspense } from 'react';
import RegisterClient from './RegisterClient';

export const dynamic = 'force-static';

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterClient />
    </Suspense>
  );
}