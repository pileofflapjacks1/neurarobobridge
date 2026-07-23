/**
 * Task / skill-level intention vocabulary for humanoid-class use.
 */

import type { Vec3 } from "./intention.js";

/** Built-in high-level tasks (semantic, not joint-space). */
export type TaskName =
  | "pick_object"
  | "place_object"
  | "hand_over"
  | "follow_me"
  | "go_to"
  | "open_door"
  | "wait"
  | "wave"
  | (string & {});

export interface TaskPayload {
  /** Skill / task name. */
  task: TaskName;
  /** Optional object or location label. */
  target?: string;
  /** Optional world position. */
  position?: Vec3;
  /** Task-specific parameters. */
  params?: Record<string, unknown>;
  /**
   * If true (default for high-risk tasks), requires confirm before execute.
   * Overridden by safety.confirmTasks policy.
   */
  requireConfirm?: boolean;
}

/** Continuous modulation while a task/mode is active. */
export interface ModulatePayload {
  /** Speed scale override 0–1. */
  speed?: number;
  /** Force scale override 0–1. */
  force?: number;
  /** Relative yaw nudge (rad). */
  yawDelta?: number;
  /** Generic scalar channels. */
  channels?: Record<string, number>;
}

/** Pending confirmation for a high-risk intention/task. */
export interface PendingConfirmation {
  id: string;
  intentionId: string;
  task?: TaskName;
  kind: string;
  message: string;
  /** When the proposal was created. */
  createdAt: number;
  /** When it expires if not confirmed. */
  expiresAt: number;
  /** Serialized intention snapshot for execution on confirm. */
  snapshot: Record<string, unknown>;
}

export type TaskStatus =
  | "idle"
  | "awaiting_confirm"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface ActiveTask {
  id: string;
  task: TaskName;
  status: TaskStatus;
  intentionId?: string;
  startedAt: number;
  progress?: number;
  message?: string;
}
