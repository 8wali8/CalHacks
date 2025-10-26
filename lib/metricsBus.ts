/**
 * Minimal typed pub/sub for MetricsEvent
 */

import type { MetricsEvent } from '../types';

type Subscriber = (event: MetricsEvent) => void;

class MetricsBus {
  private subscribers: Set<Subscriber> = new Set();

  /**
   * Subscribe to metrics events
   * @returns unsubscribe function
   */
  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Publish a metrics event to all subscribers
   */
  publish(event: MetricsEvent): void {
    this.subscribers.forEach((subscriber) => {
      try {
        subscriber(event);
      } catch (error) {
        console.error('Metrics subscriber error:', error);
      }
    });
  }

  /**
   * Clear all subscribers
   */
  clear(): void {
    this.subscribers.clear();
  }

  /**
   * Get subscriber count
   */
  get count(): number {
    return this.subscribers.size;
  }
}

// Singleton instance
export const metricsBus = new MetricsBus();
