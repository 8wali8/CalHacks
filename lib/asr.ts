/**
 * Web Speech API wrapper with feature detection
 */

type ASRCallbacks = {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: string) => void;
};

class ASRService {
  private recognition: any = null;
  private isRunning = false;
  public available = false;

  constructor() {
    // Feature detection
    const SpeechRecognition =
      (typeof window !== 'undefined' &&
        ((window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition)) ||
      null;

    if (SpeechRecognition) {
      this.available = true;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
      this.recognition.maxAlternatives = 1;
    }
  }

  /**
   * Start speech recognition
   */
  start(callbacks: ASRCallbacks): void {
    if (!this.available || !this.recognition) {
      callbacks.onError?.('Web Speech API not available');
      return;
    }

    if (this.isRunning) {
      this.stop();
    }

    this.recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          callbacks.onFinal?.(transcript);
        } else {
          callbacks.onInterim?.(transcript);
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      // Ignore 'no-speech' errors as they're expected during pauses
      if (event.error !== 'no-speech') {
        callbacks.onError?.(event.error);
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if still running (handles iOS/Safari auto-stop)
      if (this.isRunning) {
        try {
          this.recognition.start();
        } catch (e) {
          console.warn('ASR restart failed:', e);
        }
      }
    };

    try {
      this.recognition.start();
      this.isRunning = true;
    } catch (error) {
      callbacks.onError?.(`Failed to start ASR: ${error}`);
    }
  }

  /**
   * Stop speech recognition
   */
  stop(): void {
    if (this.recognition && this.isRunning) {
      this.isRunning = false;
      try {
        this.recognition.stop();
      } catch (e) {
        console.warn('ASR stop error:', e);
      }
    }
  }

  /**
   * Check if currently running
   */
  get running(): boolean {
    return this.isRunning;
  }
}

// Lazy singleton instance (avoids SSR issues)
let asrServiceInstance: ASRService | null = null;

export const asrService = {
  get available(): boolean {
    if (typeof window === 'undefined') return false;
    if (!asrServiceInstance) {
      asrServiceInstance = new ASRService();
    }
    return asrServiceInstance.available;
  },

  get running(): boolean {
    if (!asrServiceInstance) return false;
    return asrServiceInstance.running;
  },

  start(callbacks: ASRCallbacks): void {
    if (typeof window === 'undefined') {
      callbacks.onError?.('ASR not available on server');
      return;
    }
    if (!asrServiceInstance) {
      asrServiceInstance = new ASRService();
    }
    asrServiceInstance.start(callbacks);
  },

  stop(): void {
    if (asrServiceInstance) {
      asrServiceInstance.stop();
    }
  },
};
