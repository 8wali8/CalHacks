/**
 * Live numeric badges showing latest metric values
 */

'use client';

import React from 'react';
import type { MetricsEvent } from '../types';

type LiveBadgesProps = {
  metrics: MetricsEvent | null;
  asrAvailable: boolean;
};

type BadgeProps = {
  label: string;
  value: string | number | undefined;
  unit?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';
};

const Badge: React.FC<BadgeProps> = ({ label, value, unit, color = 'blue' }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
  };

  const displayValue = value !== undefined ? value : '—';

  return (
    <div className={`px-3 py-2 rounded-lg border ${colorClasses[color]}`}>
      <div className="text-xs font-medium opacity-70">{label}</div>
      <div className="text-xl font-bold mt-1">
        {displayValue}
        {unit && value !== undefined && (
          <span className="text-sm font-normal ml-1 opacity-70">{unit}</span>
        )}
      </div>
    </div>
  );
};

export const LiveBadges: React.FC<LiveBadgesProps> = ({ metrics, asrAvailable }) => {
  if (!metrics) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Badge label="WPM" value="—" color="gray" />
        <Badge label="Pitch" value="—" unit="Hz" color="gray" />
        <Badge label="Pause" value="—" unit="%" color="gray" />
        <Badge label="Fillers" value="—" unit="/min" color="gray" />
        <Badge label="Blink" value="—" unit="/min" color="gray" />
        <Badge label="Gaze Stability" value="—" color="gray" />
        <Badge label="Tone" value="—" color="gray" />
      </div>
    );
  }

  // Format values
  const wpm = metrics.wpm !== undefined ? Math.round(metrics.wpm) : undefined;
  const pitch = metrics.pitch_hz !== undefined ? Math.round(metrics.pitch_hz) : undefined;
  const pause =
    metrics.pause_ratio !== undefined ? Math.round(metrics.pause_ratio * 100) : undefined;
  const fillers =
    metrics.fillers_per_min !== undefined ? Math.round(metrics.fillers_per_min) : undefined;
  const blink =
    metrics.blink_per_min !== undefined ? Math.round(metrics.blink_per_min) : undefined;

  // Color coding based on quality
  const getWpmColor = (v: number | undefined): BadgeProps['color'] => {
    if (v === undefined) return 'gray';
    if (v >= 120 && v <= 180) return 'green';
    if (v >= 100 && v <= 200) return 'yellow';
    return 'red';
  };

  const getPauseColor = (v: number | undefined): BadgeProps['color'] => {
    if (v === undefined) return 'gray';
    if (v >= 15 && v <= 25) return 'green';
    if (v >= 10 && v <= 35) return 'yellow';
    return 'red';
  };

  const getFillersColor = (v: number | undefined): BadgeProps['color'] => {
    if (v === undefined) return 'gray';
    if (v <= 3) return 'green';
    if (v <= 7) return 'yellow';
    return 'red';
  };

  const getBlinkColor = (v: number | undefined): BadgeProps['color'] => {
    if (v === undefined) return 'gray';
    if (v >= 12 && v <= 25) return 'green';
    if (v >= 8 && v <= 30) return 'yellow';
    return 'red';
  };

  const getToneColor = (v: number | undefined): BadgeProps['color'] => {
    if (v === undefined) return 'gray';
    if (v >= 0.3) return 'green'; // Positive/energetic
    if (v >= -0.3) return 'blue'; // Neutral
    return 'purple'; // Calm/low energy
  };

  const getToneLabel = (v: number | undefined): string => {
    if (v === undefined) return '—';
    const percentage = Math.round(v * 100);
    if (v >= 0.5) return `+${percentage}% Energetic`;
    if (v >= 0.3) return `+${percentage}% Positive`;
    if (v >= -0.3) return `${percentage}% Neutral`;
    return `${percentage}% Calm`;
  };

  return (
    <div className="space-y-4">
      {!asrAvailable && (
        <div className="px-3 py-2 bg-yellow-50 text-yellow-800 text-xs rounded border border-yellow-200">
          ASR unavailable - using syllable-based WPM fallback
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Badge label="WPM" value={wpm} color={getWpmColor(wpm)} />
        <Badge label="Pitch" value={pitch} unit="Hz" color="blue" />
        <Badge label="Pause" value={pause} unit="%" color={getPauseColor(pause)} />
        <Badge label="Fillers" value={fillers} unit="/min" color={getFillersColor(fillers)} />
        <Badge label="Blink" value={blink} unit="/min" color={getBlinkColor(blink)} />
        {metrics.gaze_jitter !== undefined && (
          <Badge
            label="Gaze Stability"
            value={Math.round(metrics.gaze_jitter)}
            color={metrics.gaze_jitter < 2000 ? 'green' : metrics.gaze_jitter < 10000 ? 'yellow' : 'red'}
          />
        )}
        <Badge
          label="Tone"
          value={getToneLabel(metrics.tone_score)}
          color={getToneColor(metrics.tone_score)}
        />
      </div>
    </div>
  );
};
