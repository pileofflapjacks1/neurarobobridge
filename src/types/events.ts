/**
 * Event map for the NeuraRoboBridge public EventEmitter API.
 */

import type { NeuralIntention } from "./intention.js";
import type { RobotState, RobotCommand } from "./robot.js";
import type { SafetyEvent, SafetyStatus } from "./safety.js";
import type { ControlMode } from "./control.js";
import type { RobotCapabilities } from "./capabilities.js";
import type { RobotFeedback, LatencySample } from "./feedback.js";
import type { PendingConfirmation, ActiveTask } from "./task.js";
import type { ActiveSkill } from "../skills/types.js";

/** Connection / lifecycle status. */
export type BridgeStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "control_enabled"
  | "control_disabled"
  | "estop"
  | "watchdog_timeout";

export interface BridgeStatusEvent {
  status: BridgeStatus;
  message?: string;
  timestamp: number;
}

export interface BridgeErrorEvent {
  error: Error;
  context?: string;
  timestamp: number;
}

export interface ControlModeEvent {
  mode: ControlMode;
  previous: ControlMode;
  timestamp: number;
}

/**
 * Typed event map. `bridge.on("intention", (i) => ...)` is fully typed.
 */
export interface NeuraRoboBridgeEvents {
  intention: (intention: NeuralIntention) => void;
  /** Intention accepted and translated into a robot command. */
  command: (command: RobotCommand) => void;
  /** Intention rejected by safety (also emits safetyEvent). */
  intentionRejected: (intention: NeuralIntention, reason: string) => void;
  robotState: (state: RobotState) => void;
  safetyEvent: (event: SafetyEvent) => void;
  safetyStatus: (status: SafetyStatus) => void;
  status: (event: BridgeStatusEvent) => void;
  error: (event: BridgeErrorEvent) => void;
  /** Control enable/disable transitions. */
  control: (enabled: boolean) => void;
  /** Control mode changes. */
  controlMode: (event: ControlModeEvent) => void;
  /** Robot capability handshake after connect. */
  capabilities: (caps: RobotCapabilities) => void;
  /** Bidirectional feedback (task status, blocked, needs help, …). */
  feedback: (feedback: RobotFeedback) => void;
  /** Pending high-risk action awaiting confirm. */
  pendingConfirm: (pending: PendingConfirmation) => void;
  /** Active task lifecycle updates. */
  task: (task: ActiveTask) => void;
  /** Shared-autonomy skill progress (step-level). */
  skill: (skill: ActiveSkill) => void;
  /** Pipeline latency samples. */
  latency: (sample: LatencySample) => void;
  /** Intention dropped by NeuralBridge adapter mapping (optional consumers). */
  adapterDrop: (reason: string, event: unknown) => void;
}

export type NeuraRoboBridgeEventName = keyof NeuraRoboBridgeEvents;
