/**
 * AudioWorklet processor for real-time RMS and pitch analysis
 * Processes 50ms frames and posts results to main thread
 */

const SAMPLE_RATE = 48000; // typical, will be updated from context
const MIN_PITCH_HZ = 75;
const MAX_PITCH_HZ = 400;

class AnalyzerWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = Math.floor(SAMPLE_RATE * 0.05); // 50ms
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  /**
   * Compute RMS (root mean square) for loudness
   */
  computeRMS(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  /**
   * Compute pitch using autocorrelation
   * Returns frequency in Hz, or 0 if no clear pitch
   */
  computePitch(samples, sampleRate) {
    const minPeriod = Math.floor(sampleRate / MAX_PITCH_HZ);
    const maxPeriod = Math.floor(sampleRate / MIN_PITCH_HZ);

    let maxCorr = 0;
    let bestPeriod = 0;

    // Autocorrelation
    for (let period = minPeriod; period <= maxPeriod; period++) {
      let corr = 0;
      for (let i = 0; i < samples.length - period; i++) {
        corr += samples[i] * samples[i + period];
      }

      if (corr > maxCorr) {
        maxCorr = corr;
        bestPeriod = period;
      }
    }

    // Threshold check: require significant correlation
    const energy = samples.reduce((sum, s) => sum + s * s, 0);
    if (maxCorr < energy * 0.3 || bestPeriod === 0) {
      return 0; // no clear pitch
    }

    return sampleRate / bestPeriod;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) {
      return true; // keep processor alive
    }

    const samples = input[0]; // mono or first channel
    const sampleRate = globalThis.sampleRate || SAMPLE_RATE;

    // Accumulate samples into buffer
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.bufferIndex++] = samples[i];

      // When buffer is full, analyze and reset
      if (this.bufferIndex >= this.bufferSize) {
        const rms = this.computeRMS(this.buffer);
        const pitch = this.computePitch(this.buffer, sampleRate);

        // Post results to main thread
        this.port.postMessage({
          rms: rms,
          pitch: pitch,
        });

        this.bufferIndex = 0;
      }
    }

    return true; // keep processor alive
  }
}

registerProcessor('analyzer-worklet', AnalyzerWorklet);
