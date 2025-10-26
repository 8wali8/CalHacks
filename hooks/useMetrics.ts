/**
 * React hook for subscribing to metrics and managing rolling buffers
 * Maintains last 30s of data for each metric
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import type { MetricsEvent } from '../types';
import { metricsBus } from '../lib/metricsBus';
import { CONFIG } from '../lib/config';

export type MetricDataPoint = {
  t: number;
  v: number;
};

export type MetricsState = {
  latest: MetricsEvent | null;
  wpmData: MetricDataPoint[];
  pitchData: MetricDataPoint[];
  rmsData: MetricDataPoint[];
  pauseData: MetricDataPoint[];
  fillersData: MetricDataPoint[];
  blinkData: MetricDataPoint[];
  gazeData: MetricDataPoint[];
  smileData: MetricDataPoint[];
  headYawData: MetricDataPoint[];
  headPitchData: MetricDataPoint[];
  toneData: MetricDataPoint[];
};

/**
 * Hook to subscribe to metrics bus and maintain rolling buffers
 */
export function useMetrics(): MetricsState {
  const [latest, setLatest] = useState<MetricsEvent | null>(null);

  // Use refs for rolling buffers to avoid re-renders on every update
  const wpmDataRef = useRef<MetricDataPoint[]>([]);
  const pitchDataRef = useRef<MetricDataPoint[]>([]);
  const rmsDataRef = useRef<MetricDataPoint[]>([]);
  const pauseDataRef = useRef<MetricDataPoint[]>([]);
  const fillersDataRef = useRef<MetricDataPoint[]>([]);
  const blinkDataRef = useRef<MetricDataPoint[]>([]);
  const gazeDataRef = useRef<MetricDataPoint[]>([]);
  const smileDataRef = useRef<MetricDataPoint[]>([]);
  const headYawDataRef = useRef<MetricDataPoint[]>([]);
  const headPitchDataRef = useRef<MetricDataPoint[]>([]);
  const toneDataRef = useRef<MetricDataPoint[]>([]);

  // RMS history for pause ratio calculation
  const rmsHistoryRef = useRef<number[]>([]);

  // Force re-render state
  const [, setUpdateTrigger] = useState(0);

  useEffect(() => {
    const unsubscribe = metricsBus.subscribe((event: MetricsEvent) => {
      const now = Date.now();
      const cutoff = now - CONFIG.CHART_BUFFER_SEC * 1000;

      // Helper to add data point and trim old values
      const addPoint = (buffer: MetricDataPoint[], value: number | undefined) => {
        if (value !== undefined && !isNaN(value)) {
          buffer.push({ t: event.t, v: value });

          // Trim old data
          while (buffer.length > 0 && buffer[0].t < cutoff) {
            buffer.shift();
          }
        }
      };

      // Update all buffers
      addPoint(wpmDataRef.current, event.wpm);
      addPoint(pitchDataRef.current, event.pitch_hz);
      addPoint(rmsDataRef.current, event.rms);
      addPoint(fillersDataRef.current, event.fillers_per_min);
      addPoint(blinkDataRef.current, event.blink_per_min);
      addPoint(gazeDataRef.current, event.gaze_jitter);
      addPoint(smileDataRef.current, event.smile ? event.smile * 100 : undefined);
      addPoint(toneDataRef.current, event.tone_score);

      if (event.head) {
        addPoint(headYawDataRef.current, event.head.yaw);
        addPoint(headPitchDataRef.current, event.head.pitch);
      }

      // Calculate pause ratio from RMS history
      if (event.rms !== undefined) {
        rmsHistoryRef.current.push(event.rms);

        // Keep last 10 seconds at 10 Hz = 100 samples
        const maxSamples = CONFIG.PAUSE_WINDOW_SEC * CONFIG.METRICS_HZ;
        if (rmsHistoryRef.current.length > maxSamples) {
          rmsHistoryRef.current = rmsHistoryRef.current.slice(-maxSamples);
        }

        // Calculate pause ratio
        // Use a more sensitive threshold: RMS below this is considered a pause
        const threshold = CONFIG.RMS_NOISE_FLOOR * 20; // Increased multiplier for better detection
        const pauses = rmsHistoryRef.current.filter((rms) => rms < threshold).length;
        const pauseRatio = rmsHistoryRef.current.length > 0 ? pauses / rmsHistoryRef.current.length : 0;

        // Debug logging (remove after testing)
        if (Math.random() < 0.01) { // Log 1% of the time to avoid spam
          console.log('[Pause Detection]', {
            currentRMS: event.rms.toFixed(4),
            threshold: threshold.toFixed(4),
            pauseCount: pauses,
            totalSamples: rmsHistoryRef.current.length,
            pauseRatio: (pauseRatio * 100).toFixed(1) + '%'
          });
        }

        addPoint(pauseDataRef.current, pauseRatio);
      }

      // Update latest
      setLatest(event);

      // Trigger re-render every 10th update (1 Hz at 10 Hz metrics)
      if (wpmDataRef.current.length % 10 === 0) {
        setUpdateTrigger((prev) => prev + 1);
      }
    });

    return unsubscribe;
  }, []);

  return {
    latest,
    wpmData: wpmDataRef.current,
    pitchData: pitchDataRef.current,
    rmsData: rmsDataRef.current,
    pauseData: pauseDataRef.current,
    fillersData: fillersDataRef.current,
    blinkData: blinkDataRef.current,
    gazeData: gazeDataRef.current,
    smileData: smileDataRef.current,
    headYawData: headYawDataRef.current,
    headPitchData: headPitchDataRef.current,
    toneData: toneDataRef.current,
  };
}
