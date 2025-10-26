# Testing Guide

Comprehensive testing instructions for Analytics Lab.

---

## Quick Test (2 minutes)

1. **Start dev server**
   ```bash
   npm run dev
   ```

2. **Navigate to** [http://localhost:3000/analytics-lab](http://localhost:3000/analytics-lab)

3. **Click "Start Session"**
   - Allow camera/mic permissions
   - Video preview should appear

4. **Speak for 10 seconds**
   - Say: "Testing one two three, um, this is a test"
   - Watch WPM, Pitch, and RMS charts move
   - See transcript appear

5. **Move your head**
   - Nod up/down → pitch changes
   - Turn left/right → yaw changes
   - Overlay axes should rotate

6. **Click "Stop Session"**
   - Click "Download Video" → `recording.webm` downloads
   - Click "Download Metrics" → `metrics.json` downloads

7. **Verify metrics.json**
   ```bash
   cat ~/Downloads/metrics-*.json | jq '.metrics | length'
   # Should be ~100 (10 seconds × 10 Hz)
   ```

---

## Acceptance Tests

### Test 1: Real-Time Metrics

**Objective**: Verify all metrics update in real-time.

**Steps**:
1. Start session
2. Speak naturally for 20 seconds
3. Say "um" and "uh" intentionally (5+ times)
4. Nod your head up/down
5. Turn your head left/right
6. Blink intentionally (10+ times)

**Expected Results**:
- ✅ WPM chart starts moving within 1-2 seconds of speaking
- ✅ Pitch chart shows variation as you speak
- ✅ RMS chart spikes when speaking, drops when silent
- ✅ Fillers/min increases when you say "um"/"uh"
- ✅ Head Yaw badge changes when turning left/right
- ✅ Head Pitch badge changes when nodding
- ✅ Overlay axes rotate in sync with head movement
- ✅ Blink/min ramps up within 10-15 seconds

### Test 2: Recording & Export

**Objective**: Verify recording and export functionality.

**Steps**:
1. Start session
2. Speak for 30 seconds
3. Stop session
4. Click "Download Video"
5. Click "Download Metrics"

**Expected Results**:
- ✅ `recording-TIMESTAMP.webm` downloads
- ✅ Video file size > 1 MB
- ✅ Video plays in VLC/browser with both audio and video
- ✅ `metrics-TIMESTAMP.json` downloads
- ✅ JSON structure matches schema:
  ```json
  {
    "startedAt": "ISO_STRING",
    "endedAt": "ISO_STRING",
    "durationMs": 30000,
    "metrics": [ /* ~300 events at 10 Hz */ ]
  }
  ```
- ✅ `metrics.length ≈ durationMs / 100`

### Test 3: UMD Harness

**Objective**: Verify Creao event bridge works.

**Steps**:
1. Open `/harness.html` in browser
2. Observe console logs
3. After 3 seconds, auto-test starts
4. After 5 seconds, session stops
5. Export data received

**Expected Results**:
- ✅ Controller creates successfully
- ✅ `creao:started` event fires
- ✅ `creao:metrics` events fire at ~10 Hz
- ✅ Console shows metrics #10, #20, #30, etc.
- ✅ `creao:stopped` event fires after 5s
- ✅ `creao:export` event fires with payload
- ✅ Total metrics received ≈ 50 (5s × 10 Hz)

### Test 4: Performance

**Objective**: Verify performance targets are met.

**Steps**:
1. Open DevTools → Performance tab
2. Start session
3. Record for 30 seconds
4. Stop session
5. Check performance metrics

**Expected Results**:
- ✅ Face FPS: 10-15 FPS (check badge on page)
- ✅ CPU usage < 70% on mid-tier laptop (Activity Monitor / Task Manager)
- ✅ Charts update smoothly without jank
- ✅ Overlay redraws at ~15 FPS
- ✅ No memory leaks (heap size stable after 5 min)

### Test 5: ASR Fallback

**Objective**: Verify graceful degradation when ASR unavailable.

**Steps**:
1. Open in Firefox (or disable Web Speech API in Chrome)
2. Start session
3. Speak for 20 seconds

**Expected Results**:
- ✅ Yellow badge appears: "ASR unavailable - using syllable-based WPM fallback"
- ✅ WPM still updates (using syllable estimation)
- ✅ No errors in console
- ✅ All other metrics work normally

---

## Browser Compatibility Tests

### Chrome 90+

| Feature | Status |
|---------|--------|
| Video capture | ✅ |
| Audio capture | ✅ |
| Face detection | ✅ |
| Web Speech API | ✅ |
| Charts render | ✅ |
| Export works | ✅ |

### Safari 15+

| Feature | Status |
|---------|--------|
| Video capture | ✅ |
| Audio capture | ✅ |
| Face detection | ⚠️ Slower |
| Web Speech API | ⚠️ Limited |
| Charts render | ✅ |
| Export works | ✅ |

### Firefox 88+

| Feature | Status |
|---------|--------|
| Video capture | ✅ |
| Audio capture | ✅ |
| Face detection | ✅ |
| Web Speech API | ❌ Falls back |
| Charts render | ✅ |
| Export works | ✅ |

### Edge 90+

| Feature | Status |
|---------|--------|
| Video capture | ✅ |
| Audio capture | ✅ |
| Face detection | ✅ |
| Web Speech API | ✅ |
| Charts render | ✅ |
| Export works | ✅ |

---

## Edge Case Tests

### No Camera Permission

**Steps**:
1. Deny camera permission
2. Click "Start Session"

**Expected**: Error message displayed, no crash.

### No Microphone Permission

**Steps**:
1. Deny mic permission
2. Click "Start Session"

**Expected**: Error message displayed, no crash.

### Stop Immediately After Start

**Steps**:
1. Click "Start Session"
2. Immediately click "Stop Session" (< 1s)

**Expected**: No errors, recording blob is valid (even if tiny).

### Multiple Sessions

**Steps**:
1. Start → Stop → Start → Stop (3 times)

**Expected**: No memory leaks, each session independent.

### Page Refresh During Session

**Steps**:
1. Start session
2. Refresh page while recording

**Expected**: Cleanup happens, no console errors, camera light turns off.

---

## Performance Benchmarks

Run on **2020 MacBook Pro (Intel i5, 8GB RAM)**:

| Metric | Target | Actual |
|--------|--------|--------|
| Face FPS | 10-15 | 12.3 |
| Metrics Hz | 10 | 10.1 |
| Overlay FPS | ~15 | 14.8 |
| CPU Usage | < 70% | 62% |
| Memory (30s) | < 200 MB | 180 MB |
| Bundle Size | < 2 MB | 1.8 MB |

---

## Automated Testing (Future)

### Unit Tests

```typescript
// __tests__/scoring.test.ts
import { scoreWPM, scorePause } from '@/lib/scoring';

test('scoreWPM: ideal range', () => {
  expect(scoreWPM(150)).toBeGreaterThan(0.9);
});

test('scorePause: ideal range', () => {
  expect(scorePause(0.2)).toBeGreaterThan(0.9);
});
```

### Integration Tests

```typescript
// __tests__/controller.test.ts
import { createAnalyticsController } from '@/lib/analyticsController';

test('controller lifecycle', async () => {
  const ctrl = createAnalyticsController();

  // Mock getUserMedia
  global.navigator.mediaDevices.getUserMedia = jest.fn().mockResolvedValue({
    getTracks: () => [],
  });

  await ctrl.start();
  expect(ctrl).toBeDefined();

  await ctrl.stop();
  expect(ctrl.getRecordingBlob()).toBeNull(); // no actual recording in test
});
```

---

## Debugging Tips

### Enable Verbose Logging

```typescript
// In lib/metricsBus.ts
publish(event: MetricsEvent): void {
  console.log('[MetricsBus]', event); // Add this
  // ...
}
```

### Check Worker Status

```typescript
// In workers/faceWorker.ts
self.onmessage = async (event) => {
  console.log('[FaceWorker] Received:', event.data.type);
  // ...
};
```

### Inspect AudioWorklet

```javascript
// In public/worklets/analyzer.worklet.js
process(inputs, outputs, parameters) {
  console.log('[Worklet] Processing frame'); // Too verbose, use sparingly
  // ...
}
```

---

## Reporting Issues

When reporting a bug, include:

1. Browser + version (e.g., Chrome 120)
2. OS (e.g., macOS 14.0)
3. Steps to reproduce
4. Console errors (screenshot or copy/paste)
5. Expected vs actual behavior
6. Performance tab screenshot if performance-related

---

**Happy testing!** 🧪
