/**
 * Alert port: how the platform reaches the founder. In production this is
 * the founder's WhatsApp through a Channel Adapter; in every test it's the
 * mock channel. Core only knows this interface.
 */
export interface AlertSink {
  send(message: string): Promise<void>;
}

export interface ErrorBudgetOptions {
  /** Failures allowed inside the window before the budget is breached. */
  maxFailures: number;
  windowMs: number;
  alert: AlertSink;
  /** Rendered into the alert so the founder knows what is failing. */
  name: string;
}

/** Sliding-window error budget: breach fires exactly one alert per window. */
export class ErrorBudget {
  private failures: number[] = [];
  private alerted = false;

  constructor(private readonly options: ErrorBudgetOptions) {}

  async recordFailure(detail: string): Promise<boolean> {
    const now = Date.now();
    this.failures = this.failures.filter((t) => now - t < this.options.windowMs);
    this.failures.push(now);
    const breached = this.failures.length > this.options.maxFailures;
    if (breached && !this.alerted) {
      this.alerted = true;
      await this.options.alert.send(
        `⚠️ ${this.options.name}: error budget breached — ` +
          `${this.failures.length} failures in ${Math.round(this.options.windowMs / 1000)}s. ` +
          `Latest: ${detail}`,
      );
    }
    return breached;
  }

  recordSuccess(): void {
    // Successes age failures out naturally via the window; nothing to do.
  }
}
