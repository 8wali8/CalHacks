/**
 * Headless Analytics Controller - main orchestration logic
 * Manages recording, audio/face pipelines, ASR, and metrics publishing
 */

import type {
  AnalyticsController,
  StartOptions,
  MetricsEvent,
  AudioAnalysisMessage,
  FaceAnalysisMessage,
  FaceWorkerInput,
} from '../types';
import { CONFIG, FILLER_REGEX } from './config';
import { metricsBus } from './metricsBus';
import { asrService } from './asr';
import Sentiment from 'sentiment';

export function createAnalyticsController(): AnalyticsController {
  // Sentiment analyzer
  const sentiment = new Sentiment();

  // State
  let isRunning = false;
  let startTime = 0;
  let endTime = 0;

  // Media
  let stream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];
  let recordingBlob: Blob | null = null;

  // Audio pipeline
  let audioContext: AudioContext | null = null;
  let audioWorkletNode: AudioWorkletNode | null = null;
  let latestAudioData: Partial<AudioAnalysisMessage> = {};

  // Face pipeline
  let faceWorker: Worker | null = null;
  let faceLoopId: number | null = null;
  let latestFaceData: Partial<FaceAnalysisMessage> = {};
  let lastFaceFrameTime = 0;
  let faceFrameCount = 0;
  let faceStartTime = 0;

  // ASR state
  let transcriptFinal = '';
  let transcriptInterim = '';
  let wordTimestamps: { word: string; t: number }[] = [];
  let fillerCount = 0;
  let lastFillerCheckTime = 0;

  // Tone detection state
  let pitchHistory: number[] = [];
  let rmsHistory: number[] = [];
  let wpmHistory: number[] = [];
  let sentimentHistory: number[] = [];
  const TONE_HISTORY_SIZE = 30; // 3 seconds at 10Hz

  // Metrics
  const allMetrics: MetricsEvent[] = [];
  let metricsIntervalId: number | null = null;

  // Elements
  let videoElement: HTMLVideoElement | null = null;
  let canvasElement: HTMLCanvasElement | null = null;

  /**
   * Initialize audio processing pipeline
   */
  async function setupAudioPipeline(audioStream: MediaStream): Promise<void> {
    audioContext = new AudioContext({ sampleRate: 48000 });

    // Load AudioWorklet
    try {
      await audioContext.audioWorklet.addModule('/worklets/analyzer.worklet.js');
    } catch (error) {
      console.error('Failed to load audio worklet:', error);
      throw error;
    }

    // Create worklet node
    audioWorkletNode = new AudioWorkletNode(audioContext, 'analyzer-worklet');

    // Listen for analysis results
    audioWorkletNode.port.onmessage = (event: MessageEvent<AudioAnalysisMessage>) => {
      latestAudioData = event.data;
    };

    // Connect audio stream
    const source = audioContext.createMediaStreamSource(audioStream);
    source.connect(audioWorkletNode);
    audioWorkletNode.connect(audioContext.destination);
  }

  /**
   * Initialize face processing pipeline
   */
  async function setupFacePipeline(
    videoEl: HTMLVideoElement,
    faceFps: number
  ): Promise<void> {
    // Create worker
    faceWorker = new Worker(new URL('../workers/faceWorker.ts', import.meta.url), {
      type: 'module',
    });

    // Initialize worker
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Face worker init timeout - TensorFlow.js may be taking too long to load')), 30000);

      faceWorker!.onmessage = (event) => {
        if (event.data.type === 'initialized') {
          clearTimeout(timeout);
          resolve();
        } else if (event.data.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(event.data.message));
        }
      };

      const initMsg: FaceWorkerInput = { type: 'init' };
      faceWorker!.postMessage(initMsg);
    });

    // Set up face analysis loop
    faceStartTime = Date.now();
    const frameInterval = 1000 / faceFps;

    faceWorker.onmessage = (event: MessageEvent<FaceAnalysisMessage>) => {
      if (event.data.type !== 'error' && event.data.type !== 'initialized') {
        latestFaceData = event.data;
        faceFrameCount++;
      }
    };

    // Frame capture function
    const captureFrame = async () => {
      if (!isRunning || !faceWorker) return;

      const now = Date.now();
      if (now - lastFaceFrameTime < frameInterval) {
        faceLoopId = requestAnimationFrame(captureFrame);
        return;
      }
      lastFaceFrameTime = now;

      try {
        // Create offscreen canvas and downsample frame
        const offscreen = new OffscreenCanvas(
          CONFIG.WORKER_FRAME_WIDTH,
          CONFIG.WORKER_FRAME_HEIGHT
        );
        const ctx = offscreen.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, CONFIG.WORKER_FRAME_WIDTH, CONFIG.WORKER_FRAME_HEIGHT);
          const bitmap = await createImageBitmap(offscreen);

          const msg: FaceWorkerInput = { type: 'analyze', bitmap };
          faceWorker.postMessage(msg, [bitmap as any]);
        }
      } catch (error) {
        console.warn('Face frame capture error:', error);
      }

      faceLoopId = requestAnimationFrame(captureFrame);
    };

    // Start capture loop
    faceLoopId = requestAnimationFrame(captureFrame);
  }

  /**
   * Setup ASR with callbacks
   */
  function setupASR(): void {
    if (!asrService.available) {
      console.warn('ASR not available, will use syllable-based WPM fallback');
      return;
    }

    asrService.start({
      onInterim: (text) => {
        transcriptInterim = text;
      },
      onFinal: (text) => {
        transcriptFinal += (transcriptFinal ? ' ' : '') + text;
        transcriptInterim = '';

        // Track words for WPM
        const words = text.trim().split(/\s+/);
        const now = Date.now();
        words.forEach((word) => {
          wordTimestamps.push({ word, t: now });
        });

        // Count fillers
        const fillers = (text.match(FILLER_REGEX) || []).length;
        fillerCount += fillers;

        // Analyze sentiment of the text
        if (text.trim().length > 0) {
          const result = sentiment.analyze(text);
          // Normalize sentiment score: typical range is -5 to +5 per sentence
          // Map to -1 to +1 range
          const normalizedSentiment = Math.max(-1, Math.min(1, result.score / 3));
          sentimentHistory.push(normalizedSentiment);

          // Keep only recent sentiment (last 30 samples)
          if (sentimentHistory.length > TONE_HISTORY_SIZE) {
            sentimentHistory.shift();
          }
        }
      },
      onError: (error) => {
        console.warn('ASR error:', error);
      },
    });
  }

  /**
   * Calculate WPM from word timestamps
   */
  function calculateWPM(): number {
    const now = Date.now();
    const windowMs = CONFIG.WPM_WINDOW_SEC * 1000;
    const cutoff = now - windowMs;

    // Remove old words
    wordTimestamps = wordTimestamps.filter((w) => w.t >= cutoff);

    if (wordTimestamps.length === 0) return 0;

    // WPM = words in window × (60s / window duration)
    return Math.round((wordTimestamps.length / CONFIG.WPM_WINDOW_SEC) * 60);
  }

  /**
   * Calculate pause ratio from recent RMS values
   */
  function calculatePauseRatio(rmsHistory: number[]): number {
    if (rmsHistory.length === 0) return 0;

    // Adaptive threshold: 2x noise floor
    const threshold = CONFIG.RMS_NOISE_FLOOR * 2;
    const pauses = rmsHistory.filter((rms) => rms < threshold).length;

    return pauses / rmsHistory.length;
  }

  /**
   * Calculate fillers per minute
   */
  function calculateFillersPerMin(): number {
    const now = Date.now();
    const elapsedMin = (now - startTime) / 60000;

    if (elapsedMin === 0) return 0;
    return fillerCount / elapsedMin;
  }

  /**
   * Calculate tone score from audio features + text sentiment
   * Returns -1 (negative/low energy) to +1 (positive/high energy)
   */
  function calculateToneScore(): number | undefined {
    // Need at least 10 samples (1 second of data)
    if (pitchHistory.length < 10 || rmsHistory.length < 10) {
      return undefined;
    }

    // Filter out zeros from pitch (silence periods)
    const validPitches = pitchHistory.filter(p => p > 0);
    if (validPitches.length < 5) {
      return undefined; // Not enough speech data
    }

    // 1. Pitch variance (high variance = more energetic/excited)
    const pitchMean = validPitches.reduce((a, b) => a + b, 0) / validPitches.length;
    const pitchVariance = validPitches.reduce((sum, p) => sum + Math.pow(p - pitchMean, 2), 0) / validPitches.length;
    const pitchStdDev = Math.sqrt(pitchVariance);

    // Calculate coefficient of variation (CV) - normalized measure of variability
    // CV = stddev / mean, measures relative variability regardless of pitch level
    const pitchCV = pitchMean > 0 ? pitchStdDev / pitchMean : 0;

    // Typical CV for monotone speech: 0.03-0.05 (3-5%)
    // Typical CV for expressive speech: 0.08-0.15 (8-15%)
    // Very animated speech: 0.15+ (15%+)
    // Map 0.05 (monotone) to -0.5, 0.10 (normal) to 0.5, 0.15+ (expressive) to 1.5
    const varianceScore = (pitchCV - 0.07) / 0.05; // Range: roughly -0.5 to 1.5

    // 2. Pitch level (higher pitch = more excited/stressed)
    // Typical male: 85-180 Hz, female: 165-255 Hz
    // Use 200 Hz as neutral midpoint (works for both genders)
    // Map 150-250 Hz range to -1 to +1
    const pitchLevelScore = (pitchMean - 200) / 50;

    // 3. Volume dynamics (louder = more confident/energetic)
    const rmsMean = rmsHistory.reduce((a, b) => a + b, 0) / rmsHistory.length;
    // More sensitive volume detection (scale 0.05-0.2 range)
    const volumeScore = (rmsMean - 0.08) / 0.06;

    // 4. Speaking rate (faster = more excited, slower = calm/sad)
    let rateScore = 0;
    if (wpmHistory.length > 0) {
      const wpmMean = wpmHistory.reduce((a, b) => a + b, 0) / wpmHistory.length;
      // More sensitive: 100-170 WPM range maps to -1 to +1
      rateScore = (wpmMean - 135) / 35;
    }

    // 5. Text sentiment (from transcript words)
    let sentimentScore = 0;
    if (sentimentHistory.length > 0) {
      sentimentScore = sentimentHistory.reduce((a, b) => a + b, 0) / sentimentHistory.length;
    }

    // Weighted combination with amplification
    const toneScore = (
      varianceScore * 0.25 +       // Pitch variance (energy)        
      rateScore * 0.25 +            // Speaking rate
      sentimentScore * 0.5         // Text sentiment - HIGHEST weight
    );

    // Amplify and clamp to -1 to +1 range
    // Multiply by 1.5 to make it more sensitive
    return Math.max(-1, Math.min(1, toneScore * 1.5));
  }

  /**
   * Publish unified metrics event at configured Hz
   */
  function publishMetrics(): void {
    const now = Date.now();
    const t = now - startTime;

    // Update tone detection history
    const currentWpm = asrService.available ? calculateWPM() : 0;
    const currentPitch = latestAudioData.pitch || 0;
    const currentRms = latestAudioData.rms || 0;

    pitchHistory.push(currentPitch);
    rmsHistory.push(currentRms);
    wpmHistory.push(currentWpm);

    // Trim history to window size
    if (pitchHistory.length > TONE_HISTORY_SIZE) pitchHistory.shift();
    if (rmsHistory.length > TONE_HISTORY_SIZE) rmsHistory.shift();
    if (wpmHistory.length > TONE_HISTORY_SIZE) wpmHistory.shift();

    // Build metrics event
    const event: MetricsEvent = {
      t,
      wpm: asrService.available ? currentWpm : undefined,
      pitch_hz: latestAudioData.pitch && latestAudioData.pitch > 0 ? latestAudioData.pitch : undefined,
      rms: latestAudioData.rms,
      pause_ratio: undefined, // will be calculated from rolling buffer in UI
      fillers_per_min: calculateFillersPerMin(),
      head: latestFaceData.yaw !== undefined ? { yaw: latestFaceData.yaw, pitch: latestFaceData.pitch || 0 } : undefined,
      gaze_jitter: latestFaceData.gazeJitter,
      smile: latestFaceData.smile,
      blink_per_min: latestFaceData.blinkPerMin,
      tone_score: calculateToneScore(),
      transcript_partial: transcriptInterim,
      transcript_final: transcriptFinal,
    };

    // Store and publish
    allMetrics.push(event);

    // Trim buffer if too large
    if (allMetrics.length > CONFIG.MAX_METRICS_BUFFER) {
      allMetrics.shift();
    }

    metricsBus.publish(event);

    // Dispatch Creao event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('creao:metrics', { detail: event }));
    }
  }

  /**
   * Setup MediaRecorder for A/V capture
   */
  function setupRecorder(stream: MediaStream): void {
    // Try preferred codec first
    const mimeType = MediaRecorder.isTypeSupported(CONFIG.RECORDER_MIME_TYPE)
      ? CONFIG.RECORDER_MIME_TYPE
      : CONFIG.RECORDER_FALLBACK_MIME_TYPE;

    mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2500000, // 2.5 Mbps
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      recordingBlob = new Blob(recordedChunks, { type: mimeType });
    };

    mediaRecorder.start(1000); // 1s chunks
  }

  // ========== Public API ==========

  const controller: AnalyticsController = {
    async start(opts: StartOptions = {}): Promise<void> {
      if (isRunning) {
        throw new Error('Already running');
      }

      const {
        videoEl,
        canvasEl,
        audioConstraints = {},
        videoConstraints = {},
        useASR = true,
        faceFps = CONFIG.FACE_FPS,
        metricsHz = CONFIG.METRICS_HZ,
      } = opts;

      // Reset state
      recordedChunks = [];
      recordingBlob = null;
      transcriptFinal = '';
      transcriptInterim = '';
      wordTimestamps = [];
      fillerCount = 0;
      allMetrics.length = 0;
      latestAudioData = {};
      latestFaceData = {};
      faceFrameCount = 0;
      pitchHistory = [];
      rmsHistory = [];
      wpmHistory = [];
      sentimentHistory = [];

      try {
        // Get media stream
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: CONFIG.TARGET_VIDEO_WIDTH },
            height: { ideal: CONFIG.TARGET_VIDEO_HEIGHT },
            frameRate: { ideal: CONFIG.TARGET_VIDEO_FPS },
            ...videoConstraints,
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            ...audioConstraints,
          },
        });

        // Attach video to element
        if (videoEl) {
          videoElement = videoEl;
          videoEl.srcObject = stream;
          await videoEl.play();
        }

        if (canvasEl) {
          canvasElement = canvasEl;
        }

        // Setup pipelines
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          const audioStream = new MediaStream([audioTrack]);
          await setupAudioPipeline(audioStream);
        }

        if (videoElement) {
          await setupFacePipeline(videoElement, faceFps);
        }

        if (useASR) {
          setupASR();
        }

        // Setup recording
        setupRecorder(stream);

        // Start metrics publishing
        const metricsInterval = 1000 / metricsHz;
        metricsIntervalId = window.setInterval(publishMetrics, metricsInterval);

        isRunning = true;
        startTime = Date.now();

        // Dispatch started event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('creao:started'));
        }

        console.log('Analytics controller started');
      } catch (error) {
        // Cleanup on error
        await this.stop();
        throw error;
      }
    },

    async stop(): Promise<void> {
      if (!isRunning && !stream) return;

      isRunning = false;
      endTime = Date.now();

      // Stop metrics publishing
      if (metricsIntervalId !== null) {
        clearInterval(metricsIntervalId);
        metricsIntervalId = null;
      }

      // Stop ASR
      asrService.stop();

      // Stop face worker
      if (faceLoopId !== null) {
        cancelAnimationFrame(faceLoopId);
        faceLoopId = null;
      }
      if (faceWorker) {
        faceWorker.terminate();
        faceWorker = null;
      }

      // Stop audio
      if (audioWorkletNode) {
        audioWorkletNode.disconnect();
        audioWorkletNode = null;
      }
      if (audioContext) {
        await audioContext.close();
        audioContext = null;
      }

      // Stop recorder
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }

      // Stop media stream
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }

      // Clear video element
      if (videoElement) {
        videoElement.srcObject = null;
      }

      // Dispatch stopped event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('creao:stopped'));
      }

      console.log('Analytics controller stopped');
    },

    onMetrics(cb: (m: MetricsEvent) => void): () => void {
      return metricsBus.subscribe(cb);
    },

    getRecordingBlob(): Blob | null {
      return recordingBlob;
    },

    getMetricsDump() {
      return {
        startedAt: new Date(startTime).toISOString(),
        endedAt: new Date(endTime || Date.now()).toISOString(),
        durationMs: (endTime || Date.now()) - startTime,
        metrics: allMetrics,
      };
    },

    getMetricsSummary() {
      const duration = ((endTime || Date.now()) - startTime) / 1000; // seconds

      // Helper to calculate stats for a metric
      const calculateStats = (values: number[]) => {
        if (values.length === 0) return null;
        const sorted = [...values].sort((a, b) => a - b);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

        return {
          mean: Math.round(mean * 100) / 100,
          median: sorted[Math.floor(sorted.length / 2)],
          min: sorted[0],
          max: sorted[sorted.length - 1],
          stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
        };
      };

      // Extract non-null values for each metric
      const wpmValues = allMetrics.map(m => m.wpm).filter((v): v is number => v !== undefined);
      const pitchValues = allMetrics.map(m => m.pitch_hz).filter((v): v is number => v !== undefined);
      const pauseValues = allMetrics.map(m => m.pause_ratio).filter((v): v is number => v !== undefined);
      const fillersValues = allMetrics.map(m => m.fillers_per_min).filter((v): v is number => v !== undefined);
      const blinkValues = allMetrics.map(m => m.blink_per_min).filter((v): v is number => v !== undefined);
      const gazeValues = allMetrics.map(m => m.gaze_jitter).filter((v): v is number => v !== undefined);
      const toneValues = allMetrics.map(m => m.tone_score).filter((v): v is number => v !== undefined);

      return {
        session: {
          startedAt: new Date(startTime).toISOString(),
          endedAt: new Date(endTime || Date.now()).toISOString(),
          durationSeconds: Math.round(duration),
          totalDataPoints: allMetrics.length,
        },
        speech: {
          wpm: calculateStats(wpmValues),
          pitch_hz: calculateStats(pitchValues),
          pause_ratio_pct: calculateStats(pauseValues.map(v => v * 100)),
          fillers_per_min: calculateStats(fillersValues),
          total_filler_count: fillerCount,
        },
        face: {
          blink_per_min: calculateStats(blinkValues),
          gaze_stability: calculateStats(gazeValues),
        },
        tone: calculateStats(toneValues),
        transcript: {
          full_text: transcriptFinal,
          word_count: transcriptFinal.split(/\s+/).filter(w => w.length > 0).length,
        },
      };
    },

    getPerfStats() {
      const elapsedSec = (Date.now() - faceStartTime) / 1000;
      const faceFps = elapsedSec > 0 ? faceFrameCount / elapsedSec : 0;

      return {
        faceFps: Math.round(faceFps * 10) / 10,
      };
    },
  };

  // Listen for Creao commands
  if (typeof window !== 'undefined') {
    window.addEventListener('creao:command', async (event: any) => {
      const { type } = event.detail || {};

      try {
        if (type === 'start') {
          await controller.start();
        } else if (type === 'stop') {
          await controller.stop();
        } else if (type === 'export') {
          const dump = controller.getMetricsDump();
          const blob = controller.getRecordingBlob();
          const videoBlobUrl = blob ? URL.createObjectURL(blob) : null;

          window.dispatchEvent(
            new CustomEvent('creao:export', {
              detail: { videoBlobUrl, metricsJson: JSON.stringify(dump) },
            })
          );
        }
      } catch (error: any) {
        window.dispatchEvent(
          new CustomEvent('creao:error', {
            detail: { message: error.message },
          })
        );
      }
    });
  }

  return controller;
}
