/**
 * Analytics Lab - Client Component
 * All the actual UI logic - runs ONLY in browser
 */

'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { LiveBadges } from '../../components/LiveBadges';
import { useMetrics } from '../../hooks/useMetrics';
import { createAnalyticsController } from '../../lib/analyticsController';
import { downloadBlob, downloadJson, createTimestampedFilename } from '../../lib/download';
import { asrService } from '../../lib/asr';
import { CONFIG } from '../../lib/config';
import type { AnalyticsController } from '../../types';

export default function AnalyticsLabClient() {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<AnalyticsController | null>(null);
  const overlayLoopRef = useRef<number | null>(null);

  // State
  const [isRunning, setIsRunning] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [showConsent, setShowConsent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [perfStats, setPerfStats] = useState({ faceFps: 0 });
  const [isInitializing, setIsInitializing] = useState(false);

  // Metrics from hook
  const metrics = useMetrics();

  /**
   * Draw overlay with landmarks and head pose axes
   */
  const drawOverlay = useCallback(() => {
    if (!canvasRef.current || !videoRef.current || !metrics.latest?.head) {
      if (overlayLoopRef.current) {
        requestAnimationFrame(drawOverlay);
      }
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw head pose axes
    const { yaw, pitch } = metrics.latest.head;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const axisLength = 100;

    // Convert angles to radians
    const yawRad = (yaw * Math.PI) / 180;
    const pitchRad = (pitch * Math.PI) / 180;

    // Draw coordinate system
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)'; // Red for yaw (X-axis)
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.sin(yawRad) * axisLength,
      centerY - Math.sin(pitchRad) * axisLength
    );
    ctx.stroke();

    // Draw yaw arc
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 80, -Math.PI / 2, -Math.PI / 2 + yawRad, yawRad > 0);
    ctx.stroke();

    // Draw pitch arc
    ctx.strokeStyle = 'rgba(0, 0, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 60, 0, pitchRad, pitchRad > 0);
    ctx.stroke();

    // Draw center point
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
    ctx.fill();

    // Draw text labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 14px monospace';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(`Yaw: ${Math.round(yaw)}°`, 10, 30);
    ctx.fillText(`Pitch: ${Math.round(pitch)}°`, 10, 55);

    if (overlayLoopRef.current) {
      requestAnimationFrame(drawOverlay);
    }
  }, [metrics.latest]);

  /**
   * Start analytics session
   */
  const handleStart = async () => {
    if (!videoRef.current || !canvasRef.current) {
      setError('Video or canvas element not ready');
      return;
    }

    setError(null);
    setShowConsent(false);
    setIsInitializing(true);

    try {
      // Create controller if needed
      if (!controllerRef.current) {
        controllerRef.current = createAnalyticsController();
      }

      // Start controller
      await controllerRef.current.start({
        videoEl: videoRef.current,
        canvasEl: canvasRef.current,
        useASR: true,
        faceFps: CONFIG.FACE_FPS,
        metricsHz: CONFIG.METRICS_HZ,
      });

      setIsRunning(true);
      setIsInitializing(false);

      // Start overlay drawing loop
      overlayLoopRef.current = requestAnimationFrame(drawOverlay);

      // Update perf stats every 2s
      const perfInterval = setInterval(() => {
        if (controllerRef.current) {
          setPerfStats(controllerRef.current.getPerfStats());
        }
      }, 2000);

      // Store interval for cleanup
      (overlayLoopRef as any).perfInterval = perfInterval;
    } catch (err: any) {
      setError(err.message || 'Failed to start analytics');
      setIsRunning(false);
      setIsInitializing(false);
    }
  };

  /**
   * Stop analytics session
   */
  const handleStop = async () => {
    if (!controllerRef.current) return;

    // Stop overlay loop
    if (overlayLoopRef.current) {
      cancelAnimationFrame(overlayLoopRef.current);
      overlayLoopRef.current = null;

      // Clear perf interval
      if ((overlayLoopRef as any).perfInterval) {
        clearInterval((overlayLoopRef as any).perfInterval);
      }
    }

    await controllerRef.current.stop();
    setIsRunning(false);
    setHasRecording(true);
  };

  /**
   * Download video recording
   */
  const handleDownloadVideo = () => {
    if (!controllerRef.current) return;

    const blob = controllerRef.current.getRecordingBlob();
    if (blob) {
      const filename = createTimestampedFilename('recording', 'webm');
      downloadBlob(blob, filename);
    }
  };

  /**
   * Download metrics summary JSON (concise statistics instead of raw data)
   */
  const handleDownloadMetrics = () => {
    if (!controllerRef.current) return;

    const summary = controllerRef.current.getMetricsSummary();
    const filename = createTimestampedFilename('metrics-summary', 'json');
    downloadJson(summary, filename);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (overlayLoopRef.current) {
        cancelAnimationFrame(overlayLoopRef.current);
      }
      if (controllerRef.current) {
        controllerRef.current.stop();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Analytics Lab</h1>
          <p className="text-gray-600 mt-1">
            Real-time delivery analytics - 100% client-side processing
          </p>
        </div>

        {/* Consent Bar */}
        {showConsent && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900">Privacy Notice</h3>
                <p className="text-sm text-blue-800 mt-1">
                  This captures local audio/video for delivery signal analytics during the
                  session. All processing happens in your browser. No data is sent to servers.
                </p>
              </div>
              <button
                onClick={() => setShowConsent(false)}
                className="ml-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Initializing Display */}
        {isInitializing && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
              <p className="text-blue-800 font-medium">
                Initializing TensorFlow.js for face detection... This may take up to 30 seconds.
              </p>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 font-medium">Error: {error}</p>
            {error.includes('timeout') && (
              <p className="text-red-600 text-sm mt-2">
                Face detection initialization timed out. This might be due to slow network or browser issues.
                Try refreshing the page or check the browser console for more details.
              </p>
            )}
          </div>
        )}

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Video Preview + Overlay */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-4">
              <h2 className="text-lg font-semibold mb-3">Live Preview</h2>
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
              </div>

              {/* Performance Stats */}
              {isRunning && (
                <div className="mt-3 text-xs text-gray-600">
                  <div>Face FPS: {perfStats.faceFps.toFixed(1)}</div>
                  <div>ASR: {asrService.available ? 'Available' : 'Unavailable'}</div>
                </div>
              )}
            </div>
          </div>

          {/* Middle Column: Controls + Transcript */}
          <div className="lg:col-span-1 space-y-6">
            {/* Controls */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <h2 className="text-lg font-semibold mb-3">Controls</h2>
              <div className="space-y-3">
                {!isRunning ? (
                  <button
                    onClick={handleStart}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                  >
                    Start Session
                  </button>
                ) : (
                  <button
                    onClick={handleStop}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                  >
                    Stop Session
                  </button>
                )}

                {hasRecording && (
                  <>
                    <button
                      onClick={handleDownloadVideo}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                      Download Video
                    </button>
                    <button
                      onClick={handleDownloadMetrics}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                      Download Metrics
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Transcript */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <h2 className="text-lg font-semibold mb-3">Transcript</h2>
              <div className="h-64 overflow-y-auto bg-gray-50 rounded p-3 text-sm">
                {metrics.latest?.transcript_final && (
                  <p className="text-gray-900 mb-2">{metrics.latest.transcript_final}</p>
                )}
                {metrics.latest?.transcript_partial && (
                  <p className="text-gray-400 italic">{metrics.latest.transcript_partial}</p>
                )}
                {!metrics.latest?.transcript_final && !metrics.latest?.transcript_partial && (
                  <p className="text-gray-400">Start speaking to see transcript...</p>
                )}
              </div>
            </div>

            {/* Badges */}
            <div className="bg-white rounded-lg shadow-md p-4">
              <h2 className="text-lg font-semibold mb-3">Metrics</h2>
              <LiveBadges metrics={metrics.latest} asrAvailable={asrService.available} />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            Built with Next.js, TensorFlow.js, and Web APIs. No servers required.
          </p>
        </div>
      </div>
    </div>
  );
}
