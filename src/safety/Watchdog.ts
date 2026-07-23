/**
 * BCI liveness watchdog — fail-safe when human authority signal goes silent.
 */

import type { SafetyConfig } from "../types/safety.js";
import { DEFAULT_SAFETY } from "../core/defaults.js";
import type { Logger } from "../core/Logger.js";

export type WatchdogTimeoutHandler = (idleMs: number) => void;

export class Watchdog {
  private lastBeat = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private enabled = false;
  private fired = false;
  private config: SafetyConfig;
  private onTimeout: WatchdogTimeoutHandler;

  constructor(
    config: SafetyConfig,
    onTimeout: WatchdogTimeoutHandler,
    private log?: Logger
  ) {
    this.config = config;
    this.onTimeout = onTimeout;
  }

  updateConfig(partial: Partial<SafetyConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /** Call on every intention (or explicit heartbeat). */
  beat(at = Date.now()): void {
    this.lastBeat = at;
    this.fired = false;
  }

  lastBeatAt(): number | undefined {
    return this.lastBeat || undefined;
  }

  isAlive(): boolean {
    const timeout =
      this.config.watchdogTimeoutMs ?? DEFAULT_SAFETY.watchdogTimeoutMs;
    if (!this.enabled || timeout <= 0) return true;
    if (!this.lastBeat) return false;
    return Date.now() - this.lastBeat < timeout;
  }

  /**
   * Start monitoring. Typically called when control is enabled.
   * Seeds lastBeat so the human has a full timeout window.
   */
  start(): void {
    const timeout =
      this.config.watchdogTimeoutMs ?? DEFAULT_SAFETY.watchdogTimeoutMs;
    if (timeout <= 0) {
      this.enabled = false;
      return;
    }
    this.enabled = true;
    this.fired = false;
    this.lastBeat = Date.now();
    this.stopTimer();
    const poll = this.config.watchdogPollMs ?? DEFAULT_SAFETY.watchdogPollMs;
    this.timer = setInterval(() => this.tick(), poll);
    this.log?.debug("Watchdog started", { timeout });
  }

  stop(): void {
    this.enabled = false;
    this.stopTimer();
    this.log?.debug("Watchdog stopped");
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    if (!this.enabled || this.fired) return;
    const timeout =
      this.config.watchdogTimeoutMs ?? DEFAULT_SAFETY.watchdogTimeoutMs;
    if (timeout <= 0) return;
    const idle = Date.now() - this.lastBeat;
    if (idle >= timeout) {
      this.fired = true;
      this.log?.warn(`Watchdog timeout — no intention for ${idle}ms`);
      this.onTimeout(idle);
    }
  }

  dispose(): void {
    this.stop();
  }
}
