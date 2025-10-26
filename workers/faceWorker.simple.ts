/**
 * Simple Face Worker - Mock implementation without TensorFlow.js
 * Returns randomized/neutral values to avoid SSR issues
 * Replace this with the full TensorFlow implementation once SSR is resolved
 */

import type { FaceWorkerInput, FaceAnalysisMessage } from '../types';

let isInitialized = false;
let frameCount = 0;

/**
 * Initialize (mock - instant)
 */
async function initFaceMesh() {
  if (isInitialized) return;

  // Simulate initialization delay
  await new Promise(resolve => setTimeout(resolve, 100));

  isInitialized = true;
  console.log('Face worker initialized (simple mode - no TensorFlow)');
}

/**
 * Analyze a frame (mock - returns neutral values)
 */
async function analyzeFrame(bitmap: ImageBitmap): Promise<FaceAnalysisMessage> {
  frameCount++;

  // Generate slight random variations to simulate head movement
  const baseYaw = Math.sin(frameCount * 0.05) * 5; // -5 to 5 degrees
  const basePitch = Math.cos(frameCount * 0.03) * 3; // -3 to 3 degrees

  // Close bitmap to free memory
  bitmap.close();

  return {
    yaw: baseYaw + (Math.random() - 0.5) * 2,
    pitch: basePitch + (Math.random() - 0.5) * 2,
    blinkPerMin: 15 + Math.random() * 5, // 15-20 blinks/min
    smile: 0.3 + Math.random() * 0.2, // 0.3-0.5 neutral smile
    gazeJitter: 10 + Math.random() * 5, // low jitter
  };
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
