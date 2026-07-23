/**
 * Robot command and state types (output side).
 */

import type { Pose, Vec3 } from "./intention.js";
import type { TaskName } from "./task.js";

/** Command kinds after safety validation / translation. */
export type RobotCommandKind =
  | "move_to"
  | "move_delta"
  | "set_gripper"
  | "navigate"
  | "stop"
  | "home"
  | "estop"
  | "custom"
  | "execute_task"
  | "cancel_task"
  | "modulate";

/**
 * Validated robot command produced by the Safety & Translation Engine.
 * Robot backends execute these; they never see raw NeuralIntention.
 */
export interface RobotCommand {
  id: string;
  kind: RobotCommandKind;
  /** Target pose for move commands. */
  pose?: Pose;
  /** Joint targets in radians (if joint-space control). */
  joints?: number[];
  /** Gripper open fraction 0 (closed) – 1 (open). */
  gripper?: number;
  /** Navigation goal. */
  goal?: Vec3;
  yaw?: number;
  /** Speed scale 0–1. */
  speed?: number;
  /** Custom command name / params. */
  custom?: { command: string; params?: Record<string, unknown> };
  /** Semantic task execution. */
  task?: {
    name: TaskName;
    target?: string;
    position?: Vec3;
    params?: Record<string, unknown>;
    taskId?: string;
  };
  /** Continuous modulation channels. */
  modulate?: {
    speed?: number;
    force?: number;
    yawDelta?: number;
    channels?: Record<string, number>;
  };
  /** Originating intention id (traceability). */
  intentionId?: string;
  timestamp: number;
  /** True if this command was force-injected (e.g. e-stop). */
  forced?: boolean;
  /** Priority band for logging / arbitration audit. */
  priority?: string;
}

/** Joint state snapshot. */
export interface JointState {
  name: string;
  position: number;
  velocity?: number;
  effort?: number;
  /** Soft/hard limit flags. */
  atLimit?: boolean;
}

/** Gripper / end-effector state. */
export interface GripperState {
  name: string;
  open: number;
  force?: number;
  holding?: boolean;
}

/** Overall robot operational mode. */
export type RobotMode =
  | "idle"
  | "ready"
  | "moving"
  | "grasping"
  | "executing_task"
  | "blocked"
  | "error"
  | "estop"
  | "disconnected";

/**
 * Feedback state from the robot backend.
 * Applications subscribe via bridge.on("robotState", ...).
 */
export interface RobotState {
  mode: RobotMode;
  /** End-effector or primary body pose. */
  pose?: Pose;
  joints?: JointState[];
  grippers?: GripperState[];
  /** Optional base pose for mobile / humanoid. */
  basePose?: Pose;
  /** Last executed command id. */
  lastCommandId?: string;
  /** Active task id if any. */
  activeTaskId?: string;
  /** Human-readable status message. */
  message?: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

/** Axis-aligned workspace bounds in meters. */
export interface WorkspaceLimits {
  min: Vec3;
  max: Vec3;
}

/** Per-joint limits in radians. */
export interface JointLimits {
  name: string;
  min: number;
  max: number;
  maxVelocity?: number;
}
