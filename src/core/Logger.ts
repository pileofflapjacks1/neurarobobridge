import type { LogLevel } from "../types/config.js";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export class Logger {
  constructor(
    private level: LogLevel = "info",
    private prefix = "[NeuroBridge]"
  ) {}

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private should(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
  }

  debug(...args: unknown[]): void {
    if (this.should("debug")) console.debug(this.prefix, ...args);
  }

  info(...args: unknown[]): void {
    if (this.should("info")) console.info(this.prefix, ...args);
  }

  warn(...args: unknown[]): void {
    if (this.should("warn")) console.warn(this.prefix, ...args);
  }

  error(...args: unknown[]): void {
    if (this.should("error")) console.error(this.prefix, ...args);
  }

  child(suffix: string): Logger {
    const child = new Logger(this.level, `${this.prefix}${suffix}`);
    return child;
  }
}
