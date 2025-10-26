# Changelog

All notable changes to Analytics Lab will be documented in this file.

## [1.0.0] - 2025-01-XX

### Initial Release

#### Features

- **Real-time Speech Analytics**
  - Words per minute (WPM) calculation via Web Speech API
  - Voice pitch detection via autocorrelation
  - Loudness (RMS) tracking
  - Pause ratio detection
  - Filler word counting (um, uh, like, etc.)

- **Face & Head Tracking**
  - Head pose estimation (yaw/pitch)
  - Blink rate detection
  - Smile probability heuristic
  - Gaze stability tracking

- **Live Visualization**
  - 6 real-time charts (WPM, Pitch, RMS, Pause, Fillers, Blink)
  - Numeric metric badges with color coding
  - Canvas overlay with head pose axes
  - Live transcript display (interim + final)

- **Recording & Export**
  - Single WebM recording with A/V sync
  - Metrics JSON export with full time-series
  - Browser download support

- **Performance Optimizations**
  - AudioWorklet for real-time audio processing
  - Web Worker for face detection (non-blocking)
  - OffscreenCanvas for efficient frame transfer
  - Rolling buffers for memory efficiency
  - Throttled UI updates (10 Hz metrics, 15 FPS overlay)

- **Creao Integration Surfaces**
  - Headless controller API
  - Event bridge (creao:* events)
  - Embeddable React widget
  - Iframe postMessage support
  - UMD build harness

#### Technical Specifications

- Next.js 14 (App Router)
- TypeScript (strict mode)
- TensorFlow.js + MediaPipe Face Mesh
- Chart.js for visualizations
- Tailwind CSS for styling
- 100% client-side processing

#### Browser Support

- Chrome 90+
- Safari 15+
- Edge 90+
- Firefox 88+ (limited ASR support)

---

## Roadmap

### [1.1.0] - Planned

- [ ] UMD build automation (Webpack)
- [ ] ESM module exports
- [ ] Demo mode with sample video
- [ ] Session replay UI
- [ ] PDF export reports
- [ ] Advanced face mesh visualization
- [ ] Multi-language ASR support

### [1.2.0] - Future

- [ ] Real-time coaching suggestions
- [ ] Historical session comparison
- [ ] Team analytics dashboard
- [ ] API for programmatic access
- [ ] Mobile app (React Native)

---

## Breaking Changes

None (initial release)

---

## Security

### [1.0.0]

- All processing is 100% client-side
- No data sent to external servers
- MediaStream privacy indicators shown
- Consent banner before capture
- Local-only storage by default
