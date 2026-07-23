/**
 * Null robot backend — accepts commands, emits idle state.
 * Useful for testing BCI / safety without robot motion.
 */

import type { RobotBackend } from "./types.js";
import type { RobotCommand, RobotState } from "../types/robot.js";
import type { RobotCapabilities } from "../types/capabilities.js";
import { nullCapabilities } from "../types/capabilities.js";
import type { Logger } from "../core/Logger.js";

export class NullRobotBackend implements RobotBackend {
  readonly id = "null";
  readonly name = "Null Robot";

  private connected = false;
  private lastCommandId?: string;
  private handlers = new Set<(s: RobotState) => void>();

  constructor(private log?: Logger) {}

  async connect(): Promise<void> {
    this.connected = true;
    this.emit();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit();
  }

  isConnected(): boolean {
    return this.connected;
  }

  getCapabilities(): RobotCapabilities {
    return nullCapabilities(this.id);
  }

  execute(command: RobotCommand): void {
    this.lastCommandId = command.id;
    this.log?.debug("Null robot command", command.kind);
    this.emit();
  }

  getState(): RobotState {
    return {
      mode: this.connected ? "ready" : "disconnected",
      lastCommandId: this.lastCommandId,
      timestamp: Date.now(),
      message: "null backend",
    };
  }

  onState(handler: (s: RobotState) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emergencyStop(): void {
    this.log?.warn("Null robot e-stop");
    this.emit();
  }

  private emit(): void {
    const s = this.getState();
    for (const h of this.handlers) h(s);
  }
}
