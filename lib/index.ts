/**
 * Main entry point for ESM/UMD builds
 * Export all public APIs for Creao integration
 */

export { createAnalyticsController } from './analyticsController';
export { metricsBus } from './metricsBus';
export { asrService } from './asr';
export { downloadBlob, downloadJson, createTimestampedFilename } from './download';
export {
  scoreWPM,
  scorePause,
  scoreFillers,
  scoreBlink,
  scoreGaze,
  scoreHeadPose,
  scoreSmile,
  scoreDelivery,
} from './scoring';
export { CONFIG } from './config';

export type {
  MetricsEvent,
  AudioAnalysisMessage,
  FaceAnalysisMessage,
  StartOptions,
  AnalyticsController,
  StorageAdapter,
  CreaoCommand,
  CreaoExportPayload,
} from '../types';

// Storage adapter implementation (optional)
let storageAdapter: any = null;

export function setStorageAdapter(adapter: any): void {
  storageAdapter = adapter;
}

export function getStorageAdapter(): any {
  return storageAdapter;
}
