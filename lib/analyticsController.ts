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
import { classifyGoEmotions, initGoEmotions, isGoEmotionsReady } from './goemotions';

// Emotion pipeline loader (lazy, browser-only)
let _emoLoading = false;

export const isEmotionLoading = () => _emoLoading;

export async function getEmotionPipeline() {
  if (typeof window === 'undefined') throw new Error('emotion pipeline is browser-only');
  const needsLoad = !isGoEmotionsReady();
  if (needsLoad) _emoLoading = true;

  try {
    return await initGoEmotions();
  } finally {
    if (needsLoad) _emoLoading = false;
  }
}

export async function classifyEmotions(text: string, threshold = 0.30) {
  if (!text?.trim()) return [];
  try {
    return await classifyGoEmotions(text, threshold, 3);
  } catch (error) {
    console.error('[Emotion] Classification failed:', error);
    throw error;
  }
}

export function createAnalyticsController(): AnalyticsController {

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
  const TONE_HISTORY_SIZE = 30; // 3 seconds at 10Hz

  // Emotion state
  let lastEmotions: Array<{ label: string; score: number }> = [];

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

        // Classify emotions from final transcript (async, non-blocking)
        if (text.trim().length > 0) {
          classifyEmotions(text).then((emotions) => {
            lastEmotions = emotions;
            console.log('[Emotion]', text, '→', emotions.slice(0, 3).map(e => `${e.label} ${(e.score * 100).toFixed(1)}%`).join(', '));
          }).catch((error) => {
            console.warn('[Emotion] Classification failed:', error);
          });
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
      pause_ratio: rmsHistory.length > 0 ? calculatePauseRatio(rmsHistory) : undefined,
      fillers_per_min: calculateFillersPerMin(),
      head: latestFaceData.yaw !== undefined ? { yaw: latestFaceData.yaw, pitch: latestFaceData.pitch || 0 } : undefined,
      gaze_jitter: latestFaceData.gazeJitter,
      smile: latestFaceData.smile,
      blink_per_min: latestFaceData.blinkPerMin,
      transcript_partial: transcriptInterim,
      transcript_final: transcriptFinal,
      emotions: lastEmotions.length > 0 ? lastEmotions : undefined,
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
      lastEmotions = [];

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
        tone: null,
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
