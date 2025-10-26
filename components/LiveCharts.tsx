/**
 * Live charts component - 6 small line charts with Chart.js
 * Updates at 10 Hz with rolling 30s buffers
 */

'use client';

import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import type { MetricDataPoint } from '../hooks/useMetrics';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

type LiveChartsProps = {
  wpmData: MetricDataPoint[];
  pitchData: MetricDataPoint[];
  rmsData: MetricDataPoint[];
  pauseData: MetricDataPoint[];
  fillersData: MetricDataPoint[];
  blinkData: MetricDataPoint[];
  toneData: MetricDataPoint[];
};

type ChartData = {
  labels: number[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    tension: number;
  }[];
};

const createChartOptions = (title: string, yMin?: number, yMax?: number): ChartOptions<'line'> => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: {
      display: false,
    },
    title: {
      display: true,
      text: title,
      font: {
        size: 12,
        weight: 'bold',
      },
    },
    tooltip: {
      enabled: true,
      mode: 'index',
      intersect: false,
    },
  },
  scales: {
    x: {
      display: false,
      type: 'linear',
    },
    y: {
      display: true,
      min: yMin,
      max: yMax,
      ticks: {
        font: {
          size: 10,
        },
      },
      grid: {
        color: 'rgba(0, 0, 0, 0.05)',
      },
    },
  },
  elements: {
    point: {
      radius: 0,
    },
    line: {
      borderWidth: 2,
    },
  },
});

const createChartData = (
  data: MetricDataPoint[],
  label: string,
  color: string
): ChartData => {
  return {
    labels: data.map((d) => d.t),
    datasets: [
      {
        label,
        data: data.map((d) => d.v),
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
        tension: 0.3,
      },
    ],
  };
};

export const LiveCharts: React.FC<LiveChartsProps> = ({
  wpmData,
  pitchData,
  rmsData,
  pauseData,
  fillersData,
  blinkData,
  toneData,
}) => {
  // Memoize chart data to avoid recreating on every render
  const wpmChartData = useMemo(
    () => createChartData(wpmData, 'WPM', 'rgb(59, 130, 246)'),
    [wpmData]
  );
  const pitchChartData = useMemo(
    () => createChartData(pitchData, 'Pitch (Hz)', 'rgb(16, 185, 129)'),
    [pitchData]
  );
  const rmsChartData = useMemo(
    () => createChartData(rmsData, 'RMS', 'rgb(139, 92, 246)'),
    [rmsData]
  );
  const pauseChartData = useMemo(
    () =>
      createChartData(
        pauseData.map((d) => ({ t: d.t, v: d.v * 100 })),
        'Pause %',
        'rgb(245, 158, 11)'
      ),
    [pauseData]
  );
  const fillersChartData = useMemo(
    () => createChartData(fillersData, 'Fillers/min', 'rgb(239, 68, 68)'),
    [fillersData]
  );
  const blinkChartData = useMemo(
    () => createChartData(blinkData, 'Blink/min', 'rgb(236, 72, 153)'),
    [blinkData]
  );
  const toneChartData = useMemo(
    () => createChartData(toneData, 'Tone Score', 'rgb(168, 85, 247)'),
    [toneData]
  );

  return (
    <div className="space-y-4">
      <div className="h-32 bg-white rounded-lg p-3 border border-gray-200">
        <Line data={wpmChartData} options={createChartOptions('WPM', 0, 250)} />
      </div>

      <div className="h-32 bg-white rounded-lg p-3 border border-gray-200">
        <Line data={pitchChartData} options={createChartOptions('Pitch (Hz)', 75, 400)} />
      </div>

      <div className="h-32 bg-white rounded-lg p-3 border border-gray-200">
        <Line data={rmsChartData} options={createChartOptions('RMS (Loudness)', 0, 0.5)} />
      </div>

      <div className="h-32 bg-white rounded-lg p-3 border border-gray-200">
        <Line data={pauseChartData} options={createChartOptions('Pause Ratio (%)', 0, 100)} />
      </div>

      <div className="h-32 bg-white rounded-lg p-3 border border-gray-200">
        <Line data={fillersChartData} options={createChartOptions('Fillers per Min', 0, 20)} />
      </div>

      <div className="h-32 bg-white rounded-lg p-3 border border-gray-200">
        <Line data={blinkChartData} options={createChartOptions('Blink per Min', 0, 40)} />
      </div>

      <div className="h-32 bg-white rounded-lg p-3 border border-gray-200">
        <Line data={toneChartData} options={createChartOptions('Tone Score (-1 to +1)', -1, 1)} />
      </div>
    </div>
  );
};
