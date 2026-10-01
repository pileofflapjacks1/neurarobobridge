/**
 * One in-flight simulated motion.
 * execute() waits here. Arrival, stop, and teardown release it.
 * Release always resolves so a preempted wait cannot reject in the background.
 */
export class ArrivalGate {
  private pending: (() => void) | null = null;

  /** Supersede any previous wait, then wait for the next release. */
  wait(): Promise<void> {
    this.release();
    return new Promise((resolve) => {
      this.pending = resolve;
    });
  }

  release(): void {
    const resolve = this.pending;
    this.pending = null;
    resolve?.();
  }
}
