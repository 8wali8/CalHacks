# Analytics Lab

**Real-time delivery analytics** — 100% client-side processing with Next.js, TensorFlow.js, and Web APIs.

## Overview

Analytics Lab is a self-contained system that records webcam + microphone and computes real-time delivery analytics entirely in the browser. No servers, no cloud APIs, no third-party services.

### Key Features

- **Real-time Speech Analytics**: WPM, pitch, loudness, pause ratio, filler words
- **Face & Head Tracking**: Head pose (yaw/pitch), blink rate, smile detection, gaze stability
- **Live Visualization**: 6 charts updating at 10 Hz, numeric badges, overlay drawing
- **Recording**: Single WebM file with A/V + separate metrics JSON export
- **Performance**: AudioWorklet for audio, Web Worker for face detection, 60 FPS UI
- **Creao Integration**: Clean controller API, event bridge, embeddable widget

---

## Quick Start

### Installation

```bash
npm install
# or
yarn install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000/analytics-lab](http://localhost:3000/analytics-lab)

### Production Build

```bash
npm run build
npm start
```

---

## Usage

### Visual Testing Mode

1. Navigate to `/analytics-lab`
2. Click **"Start Session"** to begin capture
3. Speak naturally and move your head
4. Watch real-time metrics update:
   - **WPM**: Words per minute from speech recognition
   - **Pitch**: Voice pitch in Hz
   - **RMS**: Loudness level
   - **Pause Ratio**: Percentage of pauses
   - **Fillers**: "um", "uh", "like" per minute
   - **Blink Rate**: Blinks per minute
   - **Head Pose**: Yaw and pitch angles
   - **Smile**: Engagement heuristic
5. Click **"Stop Session"**
6. Download **Video** (WebM) and **Metrics** (JSON)

### Acceptance Tests

✅ **Test 1**: Start and speak for 20 seconds. Charts move within 1-2s: WPM, Pitch, RMS. Say "um/uh": Fillers/min increases. Nod/turn head: yaw/pitch badges change; overlay axes rotate. Blink intentionally: Blink/min ramps.

✅ **Test 2**: Stop → Download Video (`recording.webm`) and Download Metrics (`metrics.json`). Metrics length ≈ durationMs/100.

✅ **Test 3**: UMD harness at `/harness.html` dispatches `creao:command` start/stop/export, receives `creao:metrics` at ~10 Hz.

✅ **Test 4**: CPU stays reasonable on mid laptop. Face FPS capped at 12, charts at 10 Hz, overlay at 15 fps.

✅ **Test 5**: If ASR unavailable, app auto-falls back and shows "ASR unavailable" badge.

---

## Architecture

### Stack

- **Next.js 14** (App Router)
- **TypeScript** (strict mode)
- **Tailwind CSS**
- **TensorFlow.js** + **@tensorflow-models/face-landmarks-detection**
- **Chart.js** + **react-chartjs-2**
- **Web APIs**: getUserMedia, MediaRecorder, Web Speech API, AudioWorklet, Web Workers

### File Structure

```
analytics-lab/
├── app/
│   ├── analytics-lab/page.tsx    # Main visual testing page
│   ├── embed/page.tsx             # Embeddable widget route
│   ├── layout.tsx                 # Root layout
│   └── globals.css                # Global styles
├── components/
│   ├── AnalyticsWidget.tsx        # Reusable widget component
│   ├── LiveBadges.tsx             # Numeric metric badges
│   └── LiveCharts.tsx             # 6 real-time charts
├── hooks/
│   └── useMetrics.ts              # Metrics subscription + rolling buffers
├── lib/
│   ├── analyticsController.ts     # Core headless API
│   ├── metricsBus.ts              # Typed pub/sub
│   ├── asr.ts                     # Web Speech API wrapper
│   ├── scoring.ts                 # Metrics → 0..1 scores
│   ├── download.ts                # File download utilities
│   ├── config.ts                  # Configuration constants
│   └── index.ts                   # Public API exports
├── workers/
│   └── faceWorker.ts              # Face landmark detection (Web Worker)
├── public/
│   ├── worklets/analyzer.worklet.js  # AudioWorklet processor
│   └── harness.html               # UMD test harness
├── types.d.ts                     # TypeScript types
├── package.json
├── tsconfig.json
└── README.md
```

---

## Creao Integration

### 1. Headless Controller API

The core analytics engine is exposed as a headless controller:

```typescript
import { createAnalyticsController } from './lib/analyticsController';

const controller = createAnalyticsController();

// Start session
await controller.start({
  videoEl: document.querySelector('video'),
  canvasEl: document.querySelector('canvas'),
  useASR: true,
  faceFps: 12,
  metricsHz: 10,
});

// Subscribe to metrics (10 Hz)
const unsubscribe = controller.onMetrics((m: MetricsEvent) => {
  console.log('WPM:', m.wpm);
  console.log('Head pose:', m.head);
});

// Stop session
await controller.stop();

// Get exports
const blob = controller.getRecordingBlob();
const dump = controller.getMetricsDump();

// Performance stats
const stats = controller.getPerfStats();
```

### 2. Event Bridge (No-Code Orchestration)

**Outbound Events** (dispatched by controller):

```javascript
window.addEventListener('creao:metrics', (e) => {
  console.log('Metrics:', e.detail); // MetricsEvent at 10 Hz
});

window.addEventListener('creao:started', () => {
  console.log('Session started');
});

window.addEventListener('creao:stopped', () => {
  console.log('Session stopped');
});

window.addEventListener('creao:error', (e) => {
  console.error('Error:', e.detail.message);
});
```

**Inbound Commands** (listened by controller):

```javascript
// Start
window.dispatchEvent(new CustomEvent('creao:command', {
  detail: { type: 'start' }
}));

// Stop
window.dispatchEvent(new CustomEvent('creao:command', {
  detail: { type: 'stop' }
}));

// Export
window.dispatchEvent(new CustomEvent('creao:command', {
  detail: { type: 'export' }
}));

window.addEventListener('creao:export', (e) => {
  const { videoBlobUrl, metricsJson } = e.detail;
  console.log('Video URL:', videoBlobUrl);
  console.log('Metrics:', JSON.parse(metricsJson));
});
```

### 3. Embeddable React Widget

```tsx
import { AnalyticsWidget } from './components/AnalyticsWidget';

<AnalyticsWidget
  theme="dark"
  controls
  showVideo
  showOverlay
  showCharts
  showBadges
  onMetrics={(m) => console.log(m)}
  onStop={(summary) => console.log(summary)}
/>
```

**Embed Route**: `/embed?postMessage=1`

Use in an iframe to enable cross-origin postMessage events.

### 4. UMD Build (Standalone)

Open `/harness.html` in a browser to test the UMD build:

```html
<script src="dist/analytics-core.umd.js"></script>
<script>
  const ctrl = window.AnalyticsCore.createAnalyticsController();

  window.addEventListener('creao:metrics', e => console.log(e.detail));

  window.dispatchEvent(new CustomEvent('creao:command', {
    detail: { type: 'start' }
  }));

  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('creao:command', {
      detail: { type: 'export' }
    }));
  }, 5000);
</script>
```

### 5. Storage Adapter (Future-Proof)

```typescript
import { setStorageAdapter } from './lib';

setStorageAdapter({
  async saveBlob(name: string, blob: Blob): Promise<string> {
    // Upload to S3, Firebase, etc.
    return 'blob-url-or-id';
  },
  async saveJson(name: string, data: unknown): Promise<string> {
    // Save to database
    return 'json-id';
  },
});
```

---

## Metrics Reference

### MetricsEvent Type

Published at **10 Hz** via `metricsBus.publish()` and `window.dispatchEvent('creao:metrics')`.

```typescript
type MetricsEvent = {
  t: number;                   // ms since start
  wpm?: number;                // words per minute
  pitch_hz?: number;           // voice pitch in Hz
  rms?: number;                // loudness (0..1)
  pause_ratio?: number;        // pause % (0..1)
  fillers_per_min?: number;    // filler words per minute
  head?: {                     // head pose
    yaw: number;               // degrees
    pitch: number;             // degrees
  };
  gaze_jitter?: number;        // gaze stability (lower is better)
  smile?: number;              // engagement heuristic (0..1)
  blink_per_min?: number;      // blinks per minute
  transcript_partial?: string; // interim ASR
  transcript_final?: string;   // final transcript
};
```

### Scoring Functions

All metrics can be scored to 0..1 ranges:

```typescript
import { scoreWPM, scorePause, scoreFillers, scoreDelivery } from './lib/scoring';

const scores = scoreDelivery(metricsEvent);
// { wpm: 0.85, pause: 0.92, fillers: 0.78, overall: 0.82 }
```

---

## Performance

### Targets

- **Face Detection**: 10-15 FPS on downscaled 480p frames
- **Audio Analysis**: 50ms frame processing in AudioWorklet
- **Metrics Publishing**: 10 Hz (100ms intervals)
- **UI Updates**: Charts at 10 Hz, overlay at ~15 FPS
- **CPU**: Stays reasonable on mid-tier laptops

### Optimizations

1. **Downscaling**: Video frames downscaled to 640×480 before sending to worker
2. **OffscreenCanvas**: Face worker uses `createImageBitmap` for zero-copy transfer
3. **Throttling**: Face inference capped at 12 FPS, charts update at 10 Hz
4. **Rolling Buffers**: Only keep last 30s of data per metric
5. **No Animations**: Chart.js animations disabled for performance

---

## Browser Support

| Feature | Chrome | Safari | Firefox | Edge |
|---------|--------|--------|---------|------|
| getUserMedia | ✅ | ✅ | ✅ | ✅ |
| MediaRecorder | ✅ | ✅ | ✅ | ✅ |
| AudioWorklet | ✅ | ✅ | ✅ | ✅ |
| Web Workers | ✅ | ✅ | ✅ | ✅ |
| OffscreenCanvas | ✅ | ⚠️ | ✅ | ✅ |
| Web Speech API | ✅ | ⚠️ | ❌ | ✅ |
| TensorFlow.js (WebGL) | ✅ | ✅ | ✅ | ✅ |

**Legend**: ✅ Full support | ⚠️ Partial support | ❌ Not supported

**Note**: If Web Speech API is unavailable, the app auto-falls back to syllable-based WPM estimation.

---

## Configuration

All constants are in [lib/config.ts](lib/config.ts):

```typescript
export const CONFIG = {
  TARGET_VIDEO_WIDTH: 1280,
  TARGET_VIDEO_HEIGHT: 720,
  TARGET_VIDEO_FPS: 30,
  FACE_FPS: 12,
  METRICS_HZ: 10,
  OVERLAY_FPS: 15,
  AUDIO_FRAME_MS: 50,
  WPM_WINDOW_SEC: 30,
  CHART_BUFFER_SEC: 30,
  // ... more
};
```

Adjust these to trade off quality vs performance.

---

## Privacy & Security

### Data Handling

- **100% Client-Side**: All processing happens in the browser
- **No Network Requests**: Zero calls to external APIs
- **Local Storage**: Recordings and metrics stay on device until downloaded
- **Consent**: Displays privacy notice before capture

### Wording

- We label metrics as **"delivery signals"**, not "emotion"
- Consent text: *"This captures local audio/video for delivery signal analytics during the session."*

---

## Deployment

### Static Export

```bash
npm run build
```

Deploy the `out/` folder to any static host (Vercel, Netlify, S3, GitHub Pages).

### Docker (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## Development Notes

### Code Quality

- **Strong TypeScript**: All functions and messages are typed
- **No Magic Numbers**: Constants in `config.ts`
- **Commented Formulas**: Each metric has a one-line formula comment
- **Small Components**: Keep testable and focused

### Debugging

Enable verbose logging:

```typescript
// In lib/metricsBus.ts
publish(event: MetricsEvent): void {
  console.log('[MetricsBus]', event); // Debug
  this.subscribers.forEach(/* ... */);
}
```

Check performance:

```typescript
const stats = controller.getPerfStats();
console.log('Face FPS:', stats.faceFps);
```

---

## Roadmap

- [ ] UMD build script (Webpack/Rollup)
- [ ] ESM module exports for tree-shaking
- [ ] Demo mode with sample video playback
- [ ] Session replay feature
- [ ] Multi-language ASR support
- [ ] Advanced face mesh visualization
- [ ] Real-time delivery coaching UI
- [ ] Export to PDF report

---

## Troubleshooting

### Camera/Mic Permission Denied

Check browser permissions in Settings → Privacy → Camera/Microphone.

### Face Detection Not Working

Ensure TensorFlow.js models are loading:
- Check Network tab for 404s
- Verify WebGL is enabled in browser

### ASR Not Available

The app will auto-fallback to syllable-based WPM. This is expected on Firefox.

### High CPU Usage

Reduce face FPS in config:
```typescript
faceFps: 8  // Down from 12
```

---

## License

MIT License - free for commercial and non-commercial use.

---

## Credits

Built with:
- [Next.js](https://nextjs.org/)
- [TensorFlow.js](https://www.tensorflow.org/js)
- [Chart.js](https://www.chartjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)

---

## Support

For issues or questions:
- Open an issue on GitHub
- Email: support@analytics-lab.dev (example)

---

**Ready to test?** Run `npm run dev` and navigate to `/analytics-lab`! 🚀
