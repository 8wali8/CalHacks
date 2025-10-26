/**
 * Configuration constants - no magic numbers
 */

export const CONFIG = {
  // Video & Audio
  TARGET_VIDEO_WIDTH: 1280,
  TARGET_VIDEO_HEIGHT: 720,
  TARGET_VIDEO_FPS: 30,
  WORKER_FRAME_WIDTH: 640, // downscaled for face detection
  WORKER_FRAME_HEIGHT: 480,

  // Processing rates
  FACE_FPS: 12,
  METRICS_HZ: 10, // publish unified metrics at 10 Hz
  OVERLAY_FPS: 15, // draw overlay at 15 fps

  // Audio analysis
  AUDIO_FRAME_MS: 50, // AudioWorklet frame size
  PITCH_MIN_HZ: 75,
  PITCH_MAX_HZ: 400,
  RMS_NOISE_FLOOR: 0.03, // adaptive threshold for pause detection (raised for better sensitivity)

  // Speech metrics
  WPM_WINDOW_SEC: 30, // rolling window for WPM calculation
  PAUSE_WINDOW_SEC: 10, // window for pause ratio
  PITCH_WINDOW_SEC: 2, // median pitch over last 2s
  FILLER_WORDS: [
    // Hesitation sounds
    'um', 'uh', 'er', 'ah', 'hmm',
    // Common hedges
    'like', 'kind of', 'sort of', 'you know', 'I mean',
    // Intensifiers (overused)
    'actually', 'literally', 'basically', 'honestly', 'really',
    // Discourse markers
    'you see', 'right', 'okay', 'so', 'well',
    // Stalling phrases
    'let me think', 'how do I say', 'the thing is',
  ],

  // Face metrics
  GAZE_WINDOW_SEC: 5, // gaze stability variance window
  BLINK_EAR_THRESHOLD: 0.25, // eye aspect ratio threshold
  SMILE_MAR_THRESHOLD: 0.6, // mouth aspect ratio threshold

  // Rolling buffers
  CHART_BUFFER_SEC: 30, // keep last 30s for charts

  // Recording
  RECORDER_MIME_TYPE: 'video/webm;codecs=vp9,opus',
  RECORDER_FALLBACK_MIME_TYPE: 'video/webm',

  // Performance
  MAX_METRICS_BUFFER: 18000, // 30 min at 10 Hz
} as const;

/**
 * Filler word regex pattern
 */
export const FILLER_REGEX = new RegExp(
  `\\b(${CONFIG.FILLER_WORDS.join('|')})\\b`,
  'gi'
);
