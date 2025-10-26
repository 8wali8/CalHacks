/**
 * Analytics Lab - Server Component Wrapper
 * This file is server-rendered, but it dynamically imports the client component
 * to avoid SSR issues with browser APIs
 */

import dynamic from 'next/dynamic';

// Dynamically import the client component with NO SSR
const AnalyticsLabClient = dynamic(() => import('./page-client'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mb-4"></div>
        <h1 className="text-2xl font-bold mb-2">Loading Analytics Lab...</h1>
        <p className="text-gray-600">Initializing browser environment</p>
      </div>
    </div>
  ),
});

export default function AnalyticsLabPage() {
  return <AnalyticsLabClient />;
}
