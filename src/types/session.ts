/**
 * Session recording / playback types.
 */

import type { NeuralIntention } from "./intention.js";
import type { RobotState, RobotCommand } from "./robot.js";
import type { SafetyEvent } from "./safety.js";

export type SessionEventType =
  | "intention"
  | "command"
  | "robotState"
  | "safetyEvent"
  | "marker";

export interface SessionMarker {
  label: string;
  data?: Record<string, unknown>;
}

export interface SessionEvent {
  type: SessionEventType;
  /** Offset ms from session start. */
  t: number;
  intention?: NeuralIntention;
  command?: RobotCommand;
  robotState?: RobotState;
  safetyEvent?: SafetyEvent;
  marker?: SessionMarker;
}

export interface SessionRecording {
  version: 1;
  id: string;
  startedAt: number;
  endedAt?: number;
  meta?: Record<string, unknown>;
  events: SessionEvent[];
}
