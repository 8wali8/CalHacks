/**
 * Root page - redirect to /analytics-lab
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/analytics-lab');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Analytics Lab</h1>
        <p className="text-gray-600">Redirecting...</p>
      </div>
    </div>
  );
}
