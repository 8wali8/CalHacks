/**
 * Embed route - full-screen widget with postMessage support
 */

'use client';

import React, { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnalyticsWidget } from '../../components/AnalyticsWidget';
import type { MetricsEvent } from '../../types';

export default function EmbedPage() {
  const searchParams = useSearchParams();
  const usePostMessage = searchParams.get('postMessage') === '1';

  useEffect(() => {
    if (!usePostMessage || typeof window === 'undefined') return;

    // Mirror Creao events to parent via postMessage
    const handlers = [
      ['creao:metrics', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        window.parent.postMessage({ type: 'creao:metrics', data: detail }, '*');
      }],
      ['creao:started', () => {
        window.parent.postMessage({ type: 'creao:started' }, '*');
      }],
      ['creao:stopped', () => {
        window.parent.postMessage({ type: 'creao:stopped' }, '*');
      }],
      ['creao:export', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        window.parent.postMessage({ type: 'creao:export', data: detail }, '*');
      }],
      ['creao:error', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        window.parent.postMessage({ type: 'creao:error', data: detail }, '*');
      }],
    ];

    handlers.forEach(([event, handler]) => {
      window.addEventListener(event as string, handler as EventListener);
    });

    // Listen for commands from parent
    const messageHandler = (e: MessageEvent) => {
      // Basic origin check - in production, validate specific origins
      if (e.data?.type === 'creao:command') {
        window.dispatchEvent(new CustomEvent('creao:command', { detail: e.data.command }));
      }
    };
    window.addEventListener('message', messageHandler);

    return () => {
      handlers.forEach(([event, handler]) => {
        window.removeEventListener(event as string, handler as EventListener);
      });
      window.removeEventListener('message', messageHandler);
    };
  }, [usePostMessage]);

  return (
    <div className="min-h-screen bg-gray-900">
      <AnalyticsWidget
        theme="dark"
        controls
        showVideo
        showOverlay
        showBadges
        onMetrics={(m: MetricsEvent) => {
          // Optionally log or process metrics
          console.log('Metrics:', m);
        }}
        onStop={(summary) => {
          console.log('Session stopped:', summary);
        }}
      />
    </div>
  );
}
