/**
 * Face Worker - runs MediaPipe FaceMesh on downscaled frames
 * Computes: yaw, pitch, blink rate, smile, gaze jitter
 * Uses OffscreenCanvas to avoid blocking UI thread
 */

import type { FaceWorkerInput, FaceAnalysisMessage } from '../types';

// Polyfill document for TensorFlow.js in Web Worker context
// TensorFlow.js checks for 'document' even in workers, so we provide a minimal mock
if (typeof document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => ({}),
    createElementNS: () => ({}),
    getElementsByTagName: () => [],
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    readyState: 'complete',
    documentElement: {},
    head: {},
    body: {},
  };
}

// Face landmark detection
let faceMesh: any = null;
let isInitialized = false;

// Metrics tracking
const blinkTimestamps: number[] = [];
const gazePositions: { x: number; y: number; t: number }[] = [];
let lastEyeAspectRatio = 1.0;
let blinkCount = 0;

// Landmark indices for MediaPipe Face Mesh (468 landmarks)
const LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380];
const MOUTH_INDICES = [61, 291, 0, 17]; // left, right, top, bottom
const NOSE_TIP = 1;
const NOSE_BRIDGE = 6;
const LEFT_EYE_CENTER = 468;
const RIGHT_EYE_CENTER = 473;

/**
 * Initialize FaceMesh model
 */
async function initFaceMesh() {
  if (isInitialized) return;

  try {
    console.log('[FaceWorker] Starting initialization...');

    // Dynamically import MediaPipe FaceMesh
    // Note: In production, this should be @mediapipe/face_mesh
    // For now, we'll use a simplified approach with TensorFlow.js
    console.log('[FaceWorker] Importing TensorFlow.js...');
    const tf = await import('@tensorflow/tfjs');

    console.log('[FaceWorker] Importing face landmarks detection...');
    const faceLandmarksDetection = await import(
      '@tensorflow-models/face-landmarks-detection'
    );

    console.log('[FaceWorker] Waiting for TensorFlow.js to be ready...');
    await tf.ready();

    console.log('[FaceWorker] Setting WebGL backend...');
    await tf.setBackend('webgl');

    console.log('[FaceWorker] Creating face detector...');
    faceMesh = await faceLandmarksDetection.createDetector(
      faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
      {
        runtime: 'tfjs',
        refineLandmarks: false,
        maxFaces: 1,
      }
    );

    isInitialized = true;
    console.log('[FaceWorker] Initialization complete!');
  } catch (error) {
    console.error('[FaceWorker] Failed to initialize face detection:', error);
    throw error;
  }
}

/**
 * Calculate Eye Aspect Ratio (EAR) for blink detection
 * EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
 */
function calculateEAR(eyePoints: { x: number; y: number }[]): number {
  if (eyePoints.length < 6) return 1.0;

  const distance = (p1: { x: number; y: number }, p2: { x: number; y: number }) =>
    Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

  const vertical1 = distance(eyePoints[1], eyePoints[5]);
  const vertical2 = distance(eyePoints[2], eyePoints[4]);
  const horizontal = distance(eyePoints[0], eyePoints[3]);

  return (vertical1 + vertical2) / (2.0 * horizontal);
}

/**
 * Calculate Mouth Aspect Ratio (MAR) for smile detection
 */
function calculateMAR(mouthPoints: { x: number; y: number }[]): number {
  if (mouthPoints.length < 4) return 0;

  const width = Math.abs(mouthPoints[0].x - mouthPoints[1].x);
  const height = Math.abs(mouthPoints[2].y - mouthPoints[3].y);

  return width / (height + 0.001); // avoid division by zero
}

/**
 * Calculate head pose (yaw, pitch) from landmarks
 */
function calculateHeadPose(landmarks: any[]): { yaw: number; pitch: number } {
  if (!landmarks || landmarks.length < 10) {
    return { yaw: 0, pitch: 0 };
  }

  // Simple approximation using nose and face center
  // More accurate methods would use solvePnP
  const noseTip = landmarks[NOSE_TIP];
  const noseBridge = landmarks[NOSE_BRIDGE];
  const leftEye = landmarks[LEFT_EYE_INDICES[0]];
  const rightEye = landmarks[RIGHT_EYE_INDICES[0]];

  if (!noseTip || !noseBridge || !leftEye || !rightEye) {
    return { yaw: 0, pitch: 0 };
  }

  // Yaw: horizontal deviation from center
  const eyeCenter = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
  const yawRatio = (noseTip.x - eyeCenter.x) / Math.abs(leftEye.x - rightEye.x);
  const yaw = yawRatio * 45; // approximate degrees

  // Pitch: vertical deviation
  const pitchRatio = (noseTip.y - noseBridge.y) / Math.abs(leftEye.y - noseTip.y);
  const pitch = pitchRatio * 30; // approximate degrees

  return { yaw: Math.max(-90, Math.min(90, yaw)), pitch: Math.max(-45, Math.min(45, pitch)) };
}

/**
 * Track blinks and calculate blink rate per minute
 */
function updateBlinkRate(ear: number, currentTime: number): number {
  const BLINK_THRESHOLD = 0.25;
  const WINDOW_MS = 60000; // 1 minute

  // Detect blink (EAR drops below threshold)
  if (lastEyeAspectRatio > BLINK_THRESHOLD && ear <= BLINK_THRESHOLD) {
    blinkCount++;
    blinkTimestamps.push(currentTime);
  }
  lastEyeAspectRatio = ear;

  // Remove old timestamps outside window
  const cutoff = currentTime - WINDOW_MS;
  while (blinkTimestamps.length > 0 && blinkTimestamps[0] < cutoff) {
    blinkTimestamps.shift();
  }

  return blinkTimestamps.length; // blinks per minute
}

/**
 * Calculate gaze jitter (variance of eye center position)
 * Measures how much the gaze moves around over a 5-second window
 *
 * Typical values:
 * - Stable/focused gaze: 500-2000 (looking steadily at camera)
 * - Normal eye movement: 2000-10000 (reading, scanning)
 * - Head moving/distracted: 10000-30000+ (looking around, moving head)
 */
function calculateGazeJitter(
  landmarks: any[],
  currentTime: number
): number {
  const WINDOW_MS = 5000; // 5 seconds

  if (!landmarks || landmarks.length < 400) return 0;

  // Approximate eye centers from landmarks
  const leftEye = landmarks[LEFT_EYE_INDICES[0]];
  const rightEye = landmarks[RIGHT_EYE_INDICES[0]];

  if (!leftEye || !rightEye) return 0;

  const eyeCenter = {
    x: (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2,
    t: currentTime,
  };

  gazePositions.push(eyeCenter);

  // Remove old positions outside 5-second window
  const cutoff = currentTime - WINDOW_MS;
  while (gazePositions.length > 0 && gazePositions[0].t < cutoff) {
    gazePositions.shift();
  }

  if (gazePositions.length < 2) return 0;

  // Calculate variance (average squared distance from mean position)
  const meanX = gazePositions.reduce((sum, p) => sum + p.x, 0) / gazePositions.length;
  const meanY = gazePositions.reduce((sum, p) => sum + p.y, 0) / gazePositions.length;

  const variance =
    gazePositions.reduce(
      (sum, p) => sum + (p.x - meanX) ** 2 + (p.y - meanY) ** 2,
      0
    ) / gazePositions.length;

  // Return standard deviation × 1000 for readable numbers
  // Higher values = more eye/head movement = less stable gaze
  return Math.sqrt(variance) * 1000;
}

/**
 * Analyze a frame and extract face metrics
 */
async function analyzeFrame(bitmap: ImageBitmap): Promise<FaceAnalysisMessage> {
  if (!isInitialized || !faceMesh) {
    throw new Error('Face mesh not initialized');
  }

  const currentTime = Date.now();

  try {
    // Run face detection
    const faces = await faceMesh.estimateFaces(bitmap, {
      flipHorizontal: false,
    });

    if (!faces || faces.length === 0) {
      // No face detected - return neutral values
      return {
        yaw: 0,
        pitch: 0,
        blinkPerMin: 0,
        smile: 0,
        gazeJitter: 0,
      };
    }

    const face = faces[0];
    const landmarks = face.keypoints || face.scaledMesh || [];

    // Calculate head pose
    const { yaw, pitch } = calculateHeadPose(landmarks);

    // Calculate eye metrics
    const leftEyePoints = LEFT_EYE_INDICES.map((i) => landmarks[i]).filter(Boolean);
    const rightEyePoints = RIGHT_EYE_INDICES.map((i) => landmarks[i]).filter(Boolean);
    const leftEAR = calculateEAR(leftEyePoints);
    const rightEAR = calculateEAR(rightEyePoints);
    const avgEAR = (leftEAR + rightEAR) / 2;

    // Update blink tracking
    const blinkPerMin = updateBlinkRate(avgEAR, currentTime);

    // Calculate smile
    const mouthPoints = MOUTH_INDICES.map((i) => landmarks[i]).filter(Boolean);
    const mar = calculateMAR(mouthPoints);
    const smile = Math.min(1, Math.max(0, (mar - 3) / 2)); // normalize to 0..1

    // Calculate gaze jitter
    const gazeJitter = calculateGazeJitter(landmarks, currentTime);

    return {
      yaw,
      pitch,
      blinkPerMin,
      smile,
      gazeJitter,
    };
  } catch (error) {
    console.error('Face analysis error:', error);
    return {
      yaw: 0,
      pitch: 0,
      blinkPerMin: 0,
      smile: 0,
      gazeJitter: 0,
    };
  } finally {
    // Close bitmap to free memory
    bitmap.close();
  }
}

/**
 * Worker message handler
 */
self.onmessage = async (event: MessageEvent<FaceWorkerInput>) => {
  const { type, bitmap } = event.data;

  try {
    if (type === 'init') {
      await initFaceMesh();
      self.postMessage({ type: 'initialized' });
    } else if (type === 'analyze' && bitmap) {
      const result = await analyzeFrame(bitmap);
      self.postMessage(result);
    }
  } catch (error: any) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
