/**
 * Core metrics event type - published at 10 Hz with latest analytics
 */
export type MetricsEvent = {
  t: number; // ms since start
  wpm?: number;
  pitch_hz?: number;
  rms?: number;
  pause_ratio?: number; // 0..1
  fillers_per_min?: number;
  head?: { yaw: number; pitch: number };
  gaze_jitter?: number;
  smile?: number; // 0..1 heuristic
  blink_per_min?: number;
  transcript_partial?: string; // interim
  transcript_final?: string; // final segments appended
  emotions?: Array<{ label: string; score: number }>; // multi-emotion classification
};

/**
 * Audio worklet message types
 */
export type AudioAnalysisMessage = {
  rms: number;
  pitch: number; // Hz, 0 if no pitch detected
};

/**
 * Face worker message types
 */
export type FaceAnalysisMessage = {
  yaw: number; // degrees
  pitch: number; // degrees
  blinkPerMin: number;
  smile: number; // 0..1
  gazeJitter: number;
};

export type FaceWorkerInput = {
  type: 'init' | 'analyze';
  bitmap?: ImageBitmap;
  width?: number;
  height?: number;
};

/**
 * Controller configuration
 */
export type StartOptions = {
  videoEl?: HTMLVideoElement;
  canvasEl?: HTMLCanvasElement;
  audioConstraints?: MediaTrackConstraints;
  videoConstraints?: MediaTrackConstraints;
  useASR?: boolean; // default true
  faceFps?: number; // default 12
  metricsHz?: number; // default 10
};

export interface AnalyticsController {
  start(opts?: StartOptions): Promise<void>;
  stop(): Promise<void>;
  onMetrics(cb: (m: MetricsEvent) => void): () => void;
  getRecordingBlob(): Blob | null;
  getMetricsDump(): {
    startedAt: string;
    endedAt: string;
    durationMs: number;
    metrics: MetricsEvent[];
  };
  getMetricsSummary(): {
    session: {
      startedAt: string;
      endedAt: string;
      durationSeconds: number;
      totalDataPoints: number;
    };
    speech: {
      wpm: { mean: number; median: number; min: number; max: number; stdDev: number } | null;
      pitch_hz: { mean: number; median: number; min: number; max: number; stdDev: number } | null;
      pause_ratio_pct: { mean: number; median: number; min: number; max: number; stdDev: number } | null;
      fillers_per_min: { mean: number; median: number; min: number; max: number; stdDev: number } | null;
      total_filler_count: number;
    };
    face: {
      blink_per_min: { mean: number; median: number; min: number; max: number; stdDev: number } | null;
      gaze_stability: { mean: number; median: number; min: number; max: number; stdDev: number } | null;
    };
    tone: { mean: number; median: number; min: number; max: number; stdDev: number } | null;
    transcript: {
      full_text: string;
      word_count: number;
    };
  };
  getPerfStats(): { faceFps: number; cpuLoad?: number };
}

/**
 * Storage adapter for future extensibility
 */
export interface StorageAdapter {
  saveBlob(name: string, blob: Blob): Promise<string>;
  saveJson(name: string, data: unknown): Promise<string>;
}

/**
 * Creao event types
 */
export type CreaoCommand = {
  type: 'start' | 'stop' | 'export';
};

export type CreaoExportPayload = {
  videoBlobUrl: string | null;
  metricsJson: string;
};
