/**
 * In-memory session recorder for intentions, commands, robot state, safety.
 */

import type {
  SessionRecording,
  SessionEvent,
  SessionMarker,
} from "../types/session.js";
import type { NeuralIntention } from "../types/intention.js";
import type { RobotCommand, RobotState } from "../types/robot.js";
import type { SafetyEvent } from "../types/safety.js";
import type { RecordingConfig } from "../types/config.js";
import { createId } from "../core/id.js";

export class SessionRecorder {
  private events: SessionEvent[] = [];
  private startedAt = 0;
  private active = false;
  private id = "";
  private config: Required<RecordingConfig>;

  constructor(config: boolean | RecordingConfig = true) {
    const c = typeof config === "boolean" ? {} : config;
    this.config = {
      recordIntentions: c.recordIntentions ?? true,
      recordRobotState: c.recordRobotState ?? true,
      recordSafetyEvents: c.recordSafetyEvents ?? true,
      maxEvents: c.maxEvents ?? 10_000,
    };
  }

  start(meta?: Record<string, unknown>): void {
    this.id = createId("session");
    this.startedAt = Date.now();
    this.events = [];
    this.active = true;
    if (meta) {
      this.marker("session_start", meta);
    }
  }

  stop(): SessionRecording {
    this.active = false;
    return this.toJSON();
  }

  isActive(): boolean {
    return this.active;
  }

  recordIntention(intention: NeuralIntention): void {
    if (!this.active || !this.config.recordIntentions) return;
    this.push({ type: "intention", t: this.t(), intention });
  }

  recordCommand(command: RobotCommand): void {
    if (!this.active) return;
    this.push({ type: "command", t: this.t(), command });
  }

  recordRobotState(robotState: RobotState): void {
    if (!this.active || !this.config.recordRobotState) return;
    // Throttle: only keep state every ~100ms worth by checking last
    const last = this.events[this.events.length - 1];
    if (
      last?.type === "robotState" &&
      this.t() - last.t < 100
    ) {
      return;
    }
    this.push({ type: "robotState", t: this.t(), robotState });
  }

  recordSafetyEvent(safetyEvent: SafetyEvent): void {
    if (!this.active || !this.config.recordSafetyEvents) return;
    this.push({ type: "safetyEvent", t: this.t(), safetyEvent });
  }

  marker(label: string, data?: Record<string, unknown>): void {
    if (!this.active) return;
    const marker: SessionMarker = { label, data };
    this.push({ type: "marker", t: this.t(), marker });
  }

  toJSON(): SessionRecording {
    return {
      version: 1,
      id: this.id || createId("session"),
      startedAt: this.startedAt,
      endedAt: this.active ? undefined : Date.now(),
      events: [...this.events],
    };
  }

  private t(): number {
    return Date.now() - this.startedAt;
  }

  private push(event: SessionEvent): void {
    this.events.push(event);
    if (this.events.length > this.config.maxEvents) {
      this.events.shift();
    }
  }
}
