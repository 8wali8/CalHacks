# Creao Integration Guide

This document provides detailed instructions for integrating Analytics Lab into Creao or any other platform.

---

## Integration Methods

### Method 1: Headless Controller (Recommended)

Use the controller API directly for maximum flexibility.

```typescript
import { createAnalyticsController } from '@/lib/analyticsController';
import type { MetricsEvent } from '@/types';

// Create controller instance
const controller = createAnalyticsController();

// Start analytics session
async function startAnalytics() {
  const videoEl = document.querySelector('#my-video') as HTMLVideoElement;
  const canvasEl = document.querySelector('#my-canvas') as HTMLCanvasElement;

  await controller.start({
    videoEl,
    canvasEl,
    useASR: true,
    faceFps: 12,
    metricsHz: 10,
  });

  console.log('Analytics started');
}

// Subscribe to real-time metrics (10 Hz)
const unsubscribe = controller.onMetrics((m: MetricsEvent) => {
  // Process metrics in real-time
  console.log('WPM:', m.wpm);
  console.log('Pitch:', m.pitch_hz);
  console.log('Head Pose:', m.head);

  // Send to your backend, update UI, etc.
  sendToBackend(m);
});

// Stop session
async function stopAnalytics() {
  await controller.stop();

  // Get recording blob
  const videoBlob = controller.getRecordingBlob();
  if (videoBlob) {
    uploadVideo(videoBlob);
  }

  // Get metrics dump
  const dump = controller.getMetricsDump();
  console.log('Total metrics:', dump.metrics.length);
  console.log('Duration:', dump.durationMs);

  // Cleanup subscription
  unsubscribe();
}
```

---

### Method 2: Event Bridge (No-Code)

Use custom events for orchestration without importing code.

```javascript
// Start session
window.dispatchEvent(new CustomEvent('creao:command', {
  detail: { type: 'start' }
}));

// Listen for metrics (10 Hz)
window.addEventListener('creao:metrics', (e) => {
  const metrics = e.detail; // MetricsEvent
  updateDashboard(metrics);
});

// Listen for lifecycle events
window.addEventListener('creao:started', () => {
  console.log('Session started');
  showRecordingIndicator();
});

window.addEventListener('creao:stopped', () => {
  console.log('Session stopped');
  hideRecordingIndicator();
});

window.addEventListener('creao:error', (e) => {
  console.error('Analytics error:', e.detail.message);
  showErrorNotification(e.detail.message);
});

// Export data
window.dispatchEvent(new CustomEvent('creao:command', {
  detail: { type: 'export' }
}));

window.addEventListener('creao:export', (e) => {
  const { videoBlobUrl, metricsJson } = e.detail;

  // Download or upload
  fetch(videoBlobUrl)
    .then(r => r.blob())
    .then(blob => uploadToS3(blob));

  const metrics = JSON.parse(metricsJson);
  saveToDatabase(metrics);
});
```

---

### Method 3: React Widget

Embed as a React component with full UI.

```tsx
import { AnalyticsWidget } from '@/components/AnalyticsWidget';

export default function CreaoAnalyticsPage() {
  const handleMetrics = (m: MetricsEvent) => {
    // Real-time processing
    updateLiveScores(m);
  };

  const handleStop = (summary) => {
    console.log('Session complete:', summary);
    console.log('Duration:', summary.durationMs);
    console.log('Metrics count:', summary.metricsCount);

    if (summary.videoBlobUrl) {
      // Upload video
      fetch(summary.videoBlobUrl)
        .then(r => r.blob())
        .then(uploadVideo);
    }
  };

  return (
    <div className="p-4">
      <h1>Delivery Analytics</h1>
      <AnalyticsWidget
        theme="light"
        controls
        showVideo
        showOverlay
        showCharts
        showBadges
        onMetrics={handleMetrics}
        onStop={handleStop}
      />
    </div>
  );
}
```

---

### Method 4: Iframe Embed

Embed in an iframe with postMessage communication.

**Parent page:**

```html
<iframe
  id="analytics-frame"
  src="https://your-domain.com/embed?postMessage=1"
  width="100%"
  height="800"
  frameborder="0"
></iframe>

<script>
  const iframe = document.getElementById('analytics-frame');

  // Send commands to iframe
  function startAnalytics() {
    iframe.contentWindow.postMessage({
      type: 'creao:command',
      command: { type: 'start' }
    }, '*');
  }

  function stopAnalytics() {
    iframe.contentWindow.postMessage({
      type: 'creao:command',
      command: { type: 'stop' }
    }, '*');
  }

  // Listen for events from iframe
  window.addEventListener('message', (e) => {
    if (e.data.type === 'creao:metrics') {
      console.log('Metrics:', e.data.data);
    }

    if (e.data.type === 'creao:export') {
      const { videoBlobUrl, metricsJson } = e.data.data;
      handleExport(videoBlobUrl, metricsJson);
    }
  });

  // Auto-start on load
  iframe.addEventListener('load', () => {
    setTimeout(startAnalytics, 1000);
  });
</script>
```

---

## Custom Storage Adapter

Integrate with your storage backend:

```typescript
import { setStorageAdapter } from '@/lib';

// Set up custom storage
setStorageAdapter({
  async saveBlob(name: string, blob: Blob): Promise<string> {
    // Upload to S3
    const formData = new FormData();
    formData.append('file', blob, name);

    const response = await fetch('/api/upload-video', {
      method: 'POST',
      body: formData,
    });

    const { url } = await response.json();
    return url;
  },

  async saveJson(name: string, data: unknown): Promise<string> {
    // Save to database
    const response = await fetch('/api/save-metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, data }),
    });

    const { id } = await response.json();
    return id;
  },
});

// Now when you stop, it will auto-upload
await controller.stop();
```

---

## Metrics Processing Pipeline

### Real-Time Scoring

```typescript
import { scoreDelivery } from '@/lib/scoring';

controller.onMetrics((m: MetricsEvent) => {
  const scores = scoreDelivery(m);

  // scores = {
  //   wpm: 0.85,
  //   pause: 0.92,
  //   fillers: 0.78,
  //   blink: 0.65,
  //   gaze: 0.88,
  //   headPose: 0.75,
  //   smile: 0.60,
  //   overall: 0.79
  // }

  updateProgressBar(scores.overall);

  if (scores.fillers < 0.5) {
    showCoachingTip('Try to reduce filler words like "um" and "uh"');
  }

  if (scores.wpm < 0.4) {
    showCoachingTip('Speak a bit faster - aim for 120-180 WPM');
  }
});
```

### Batch Processing

```typescript
// After session ends
const dump = controller.getMetricsDump();

// Aggregate statistics
const avgWPM = dump.metrics
  .filter(m => m.wpm !== undefined)
  .reduce((sum, m) => sum + m.wpm!, 0) / dump.metrics.length;

const maxFillers = Math.max(
  ...dump.metrics.map(m => m.fillers_per_min || 0)
);

// Time-series analysis
const wpmOverTime = dump.metrics
  .filter(m => m.wpm !== undefined)
  .map(m => ({ time: m.t / 1000, wpm: m.wpm }));

// Detect patterns
const pauseSpikes = dump.metrics.filter(
  m => (m.pause_ratio || 0) > 0.5
);

console.log('Pause spikes at:', pauseSpikes.map(m => m.t));
```

---

## Backend API Examples

### Save Session Endpoint

```typescript
// pages/api/save-session.ts (Next.js API route)
import { NextApiRequest, NextApiResponse } from 'next';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: 'us-east-1' });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, sessionId, metricsJson, videoBlob } = req.body;

  // Save metrics to database
  await db.sessions.create({
    data: {
      id: sessionId,
      userId,
      metrics: JSON.parse(metricsJson),
      createdAt: new Date(),
    },
  });

  // Upload video to S3
  await s3.send(new PutObjectCommand({
    Bucket: 'my-analytics-videos',
    Key: `${userId}/${sessionId}.webm`,
    Body: Buffer.from(videoBlob, 'base64'),
    ContentType: 'video/webm',
  }));

  res.status(200).json({ success: true, sessionId });
}
```

### Get Session Endpoint

```typescript
// pages/api/sessions/[id].ts
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  const session = await db.sessions.findUnique({
    where: { id: String(id) },
  });

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.status(200).json(session);
}
```

---

## Testing Checklist

### Integration Tests

- [ ] Controller starts and stops without errors
- [ ] Metrics publish at 10 Hz
- [ ] Video recording produces valid WebM blob
- [ ] Metrics JSON has correct structure
- [ ] Events dispatch correctly (creao:started, creao:stopped, etc.)
- [ ] Widget renders in light and dark themes
- [ ] Iframe postMessage works bidirectionally
- [ ] Storage adapter uploads successfully

### Performance Tests

- [ ] Face FPS stays at ~12 FPS
- [ ] CPU usage < 70% on mid-tier laptop
- [ ] Charts update smoothly at 10 Hz
- [ ] No memory leaks after multiple sessions
- [ ] Works on Chrome, Safari, Edge

### Edge Cases

- [ ] Camera/mic permission denied → shows error
- [ ] ASR not available → falls back to syllable WPM
- [ ] No face detected → returns neutral values
- [ ] User stops immediately after start → no crash
- [ ] User refreshes during session → cleanup works

---

## Deployment to Creao

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Build for Production

```bash
npm run build
```

### Step 3: Deploy to Vercel/Netlify

```bash
vercel deploy --prod
# or
netlify deploy --prod
```

### Step 4: Integrate into Creao

**Option A: Direct Import**

```typescript
import { createAnalyticsController } from '@analytics-lab/lib';
```

**Option B: Iframe Embed**

```html
<iframe src="https://analytics.creao.app/embed?postMessage=1"></iframe>
```

**Option C: Event Bridge**

```javascript
// Include analytics-core.umd.js
<script src="https://cdn.creao.app/analytics-core.umd.js"></script>
```

---

## Support

For integration help:
- Email: integrations@analytics-lab.dev
- Slack: #analytics-lab
- Docs: https://docs.analytics-lab.dev

---

**Happy integrating!** 🚀
