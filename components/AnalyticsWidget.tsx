/**
 * Embeddable Analytics Widget
 * Clean React component that uses only the controller API
 */

'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { LiveBadges } from './LiveBadges';
import { LiveCharts } from './LiveCharts';
import { useMetrics } from '../hooks/useMetrics';
import { createAnalyticsController } from '../lib/analyticsController';
import { asrService } from '../lib/asr';
import type { AnalyticsController, MetricsEvent } from '../types';

export type AnalyticsWidgetProps = {
  theme?: 'light' | 'dark';
  controls?: boolean;
  showVideo?: boolean;
  showOverlay?: boolean;
  showCharts?: boolean;
  showBadges?: boolean;
  onMetrics?: (m: MetricsEvent) => void;
  onStop?: (summary: {
    durationMs: number;
    metricsCount: number;
    videoBlobUrl: string | null;
  }) => void;
};

export const AnalyticsWidget: React.FC<AnalyticsWidgetProps> = ({
  theme = 'light',
  controls = true,
  showVideo = true,
  showOverlay = true,
  showCharts = true,
  showBadges = true,
  onMetrics,
  onStop,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<AnalyticsController | null>(null);
  const overlayLoopRef = useRef<number | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metrics = useMetrics();

  // Forward metrics to parent
  useEffect(() => {
    if (onMetrics && metrics.latest) {
      onMetrics(metrics.latest);
    }
  }, [metrics.latest, onMetrics]);

  /**
   * Draw overlay
   */
  const drawOverlay = useCallback(() => {
    if (!showOverlay || !canvasRef.current || !videoRef.current || !metrics.latest?.head) {
      if (overlayLoopRef.current) {
        requestAnimationFrame(drawOverlay);
      }
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { yaw, pitch } = metrics.latest.head;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const axisLength = 100;

    const yawRad = (yaw * Math.PI) / 180;
    const pitchRad = (pitch * Math.PI) / 180;

    // Draw axes
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme === 'dark' ? 'rgba(255, 100, 100, 0.8)' : 'rgba(255, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.sin(yawRad) * axisLength, centerY - Math.sin(pitchRad) * axisLength);
    ctx.stroke();

    if (overlayLoopRef.current) {
      requestAnimationFrame(drawOverlay);
    }
  }, [metrics.latest, showOverlay, theme]);

  /**
   * Start session
   */
  const handleStart = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setError(null);

    try {
      if (!controllerRef.current) {
        controllerRef.current = createAnalyticsController();
      }

      await controllerRef.current.start({
        videoEl: videoRef.current,
        canvasEl: canvasRef.current,
      });

      setIsRunning(true);

      if (showOverlay) {
        overlayLoopRef.current = requestAnimationFrame(drawOverlay);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start');
    }
  };

  /**
   * Stop session
   */
  const handleStop = async () => {
    if (!controllerRef.current) return;

    if (overlayLoopRef.current) {
      cancelAnimationFrame(overlayLoopRef.current);
      overlayLoopRef.current = null;
    }

    await controllerRef.current.stop();
    setIsRunning(false);

    // Notify parent
    if (onStop) {
      const dump = controllerRef.current.getMetricsDump();
      const blob = controllerRef.current.getRecordingBlob();
      const videoBlobUrl = blob ? URL.createObjectURL(blob) : null;

      onStop({
        durationMs: dump.durationMs,
        metricsCount: dump.metrics.length,
        videoBlobUrl,
      });
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (overlayLoopRef.current) cancelAnimationFrame(overlayLoopRef.current);
      if (controllerRef.current) controllerRef.current.stop();
    };
  }, []);

  const bgClass = theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-900';
  const textClass = theme === 'dark' ? 'text-gray-300' : 'text-gray-600';

  return (
    <div className={`${bgClass} p-4 rounded-lg`}>
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Video */}
        {showVideo && (
          <div className={`${cardClass} rounded-lg p-3`}>
            <div className="relative bg-black rounded overflow-hidden aspect-video">
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
              {showOverlay && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />}
            </div>
          </div>
        )}

        {/* Controls & Badges */}
        <div className="space-y-4">
          {controls && (
            <div className={`${cardClass} rounded-lg p-3`}>
              {!isRunning ? (
                <button
                  onClick={handleStart}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded transition-colors"
                >
                  Start
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded transition-colors"
                >
                  Stop
                </button>
              )}
            </div>
          )}

          {showBadges && (
            <div className={`${cardClass} rounded-lg p-3`}>
              <LiveBadges metrics={metrics.latest} asrAvailable={asrService.available} />
            </div>
          )}
        </div>

        {/* Charts */}
        {showCharts && (
          <div className={`${cardClass} rounded-lg p-3`}>
            <LiveCharts
              wpmData={metrics.wpmData}
              pitchData={metrics.pitchData}
              rmsData={metrics.rmsData}
              pauseData={metrics.pauseData}
              fillersData={metrics.fillersData}
              blinkData={metrics.blinkData}
            />
          </div>
        )}
      </div>
    </div>
  );
};
