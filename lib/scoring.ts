/**
 * Pure helper functions mapping raw metrics to 0..1 scores
 */

import type { MetricsEvent } from '../types';

/**
 * Score WPM: 120-180 is ideal, mapped to 0.8-1.0
 * Formula: clamp((wpm - 80) / 120, 0, 1)
 */
export function scoreWPM(wpm: number): number {
  if (wpm < 80) return Math.max(0, wpm / 80 * 0.5);
  if (wpm > 200) return Math.max(0, 1 - (wpm - 200) / 100);
  return 0.5 + ((wpm - 80) / 120) * 0.5;
}

/**
 * Score pause ratio: 0.15-0.25 is ideal (natural pauses)
 * Formula: 1 - abs(pauseRatio - 0.2) / 0.2
 */
export function scorePause(pauseRatio: number): number {
  const ideal = 0.2;
  const deviation = Math.abs(pauseRatio - ideal);
  return Math.max(0, 1 - deviation / ideal);
}

/**
 * Score fillers: < 5/min is good, 0 is ideal
 * Formula: max(0, 1 - fillersPerMin / 10)
 */
export function scoreFillers(fillersPerMin: number): number {
  return Math.max(0, 1 - fillersPerMin / 10);
}

/**
 * Score blink rate: 15-20 blinks/min is normal, too few or many is worse
 * Formula: 1 - abs(blinkRate - 17.5) / 20
 */
export function scoreBlink(blinkPerMin: number): number {
  const ideal = 17.5;
  const deviation = Math.abs(blinkPerMin - ideal);
  return Math.max(0, 1 - deviation / 20);
}

/**
 * Score gaze stability: lower jitter is better
 * Formula: max(0, 1 - gazeJitter / 50)
 */
export function scoreGaze(gazeJitter: number): number {
  return Math.max(0, 1 - gazeJitter / 50);
}

/**
 * Score head pose: minimal deviation from neutral is best
 * Formula: 1 - (abs(yaw) + abs(pitch)) / 60
 */
export function scoreHeadPose(yaw: number, pitch: number): number {
  const totalDeviation = Math.abs(yaw) + Math.abs(pitch);
  return Math.max(0, 1 - totalDeviation / 60);
}

/**
 * Score smile: 0.3-0.7 is engaged, 0 is neutral, 1.0 is too much
 * Formula: custom curve
 */
export function scoreSmile(smile: number): number {
  if (smile < 0.3) return smile / 0.3 * 0.7;
  if (smile > 0.7) return Math.max(0, 1 - (smile - 0.7) / 0.3 * 0.3);
  return 0.7 + (smile - 0.3) / 0.4 * 0.3;
}

/**
 * Overall delivery score: weighted combination
 */
export function scoreDelivery(m: MetricsEvent): {
  wpm: number;
  pause: number;
  fillers: number;
  blink: number;
  gaze: number;
  headPose: number;
  smile: number;
  overall: number;
} {
  const scores = {
    wpm: m.wpm !== undefined ? scoreWPM(m.wpm) : 0.5,
    pause: m.pause_ratio !== undefined ? scorePause(m.pause_ratio) : 0.5,
    fillers: m.fillers_per_min !== undefined ? scoreFillers(m.fillers_per_min) : 1,
    blink: m.blink_per_min !== undefined ? scoreBlink(m.blink_per_min) : 0.5,
    gaze: m.gaze_jitter !== undefined ? scoreGaze(m.gaze_jitter) : 0.5,
    headPose: m.head ? scoreHeadPose(m.head.yaw, m.head.pitch) : 0.5,
    smile: m.smile !== undefined ? scoreSmile(m.smile) : 0.5,
    overall: 0,
  };

  // Weighted average: speech (60%), visual (40%)
  scores.overall =
    scores.wpm * 0.25 +
    scores.pause * 0.15 +
    scores.fillers * 0.2 +
    scores.blink * 0.1 +
    scores.gaze * 0.15 +
    scores.headPose * 0.1 +
    scores.smile * 0.05;

  return scores;
}
