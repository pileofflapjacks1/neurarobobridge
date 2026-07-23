/**
 * Shared-autonomy skill runtime contracts.
 * Human issues a high-level task; the skill completes local steps.
 */

import type { Vec3 } from "../types/intention.js";
import type { TaskName } from "../types/task.js";
import type { RobotCommand, RobotState } from "../types/robot.js";
import type { RobotCapabilities } from "../types/capabilities.js";
import type { ModulatePayload } from "../types/task.js";

/** One atomic step a skill schedules on the robot. */
export interface SkillStep {
  /** Stable step id within the skill run. */
  id: string;
  /** Human-readable label for UI / logs. */
  label?: string;
  /** Delay before executing this step (ms). Default 0. */
  delayMs?: number;
  /**
   * Robot command body (id/timestamp filled by runtime).
   * Prefer high-level kinds: move_to, set_gripper, navigate, home, stop.
   */
  command: Omit<RobotCommand, "id" | "timestamp" | "intentionId">;
}

/** Live modulation applied to skill step speeds/forces. */
export interface SkillModulation {
  speed: number;
  force: number;
  yawDelta: number;
  channels: Record<string, number>;
}

/** Context supplied when a skill builds its step plan. */
export interface SkillContext {
  taskId: string;
  intentionId: string;
  task: TaskName;
  target?: string;
  position?: Vec3;
  params?: Record<string, unknown>;
  robotState: RobotState;
  capabilities: RobotCapabilities | null;
  modulation: SkillModulation;
}

/** Pluggable skill definition. */
export interface SkillDefinition {
  /** Matches TaskPayload.task / TaskName. */
  name: TaskName;
  description: string;
  requiresLocomotion?: boolean;
  requiresManipulation?: boolean;
  /** Build ordered steps for this run. */
  build(ctx: SkillContext): SkillStep[];
}

export type SkillRunStatus =
  | "idle"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

/** Snapshot of an in-flight skill. */
export interface ActiveSkill {
  taskId: string;
  skillName: TaskName;
  intentionId: string;
  status: SkillRunStatus;
  stepIndex: number;
  stepCount: number;
  currentStepId?: string;
  progress: number;
  message: string;
  startedAt: number;
  modulation: SkillModulation;
}

export interface SkillRuntimeHandlers {
  /** Execute a validated step command on the robot. */
  execute: (command: RobotCommand) => Promise<void> | void;
  /** Progress / lifecycle notifications. */
  onUpdate: (skill: ActiveSkill) => void;
  onFeedback?: (kind: string, message: string, skill: ActiveSkill) => void;
  log?: (msg: string, ...args: unknown[]) => void;
}

export interface SkillRuntimeOptions {
  /** Default step delay when skill omits delayMs. Default 120. */
  defaultStepDelayMs?: number;
  /** If true, cancel any running skill when starting a new one. Default true. */
  preempt?: boolean;
}

export type { ModulatePayload };
