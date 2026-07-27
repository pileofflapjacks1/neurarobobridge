/**
 * Shared-autonomy skill runtime contracts.
 * Human issues a high-level task; the skill completes local steps.
 */

import type { Vec3 } from "../types/intention.js";
import type { TaskName } from "../types/task.js";
import type { RobotCommand, RobotState } from "../types/robot.js";
import type { RobotCapabilities } from "../types/capabilities.js";
import type { ModulatePayload } from "../types/task.js";

/** Why a skill failed or needs human help. */
export type SkillFailureKind =
  | "timeout"
  | "execute_error"
  | "build_error"
  | "capability"
  | "preempted"
  | "cancelled"
  | "unknown";

/** One atomic step a skill schedules on the robot. */
export interface SkillStep {
  /** Stable step id within the skill run. */
  id: string;
  /** Human-readable label for UI / logs. */
  label?: string;
  /** Delay before executing this step (ms). Default 0. */
  delayMs?: number;
  /**
   * Max time for this step's execute() call (ms).
   * Overrides SkillRuntimeOptions.defaultStepTimeoutMs when set.
   */
  timeoutMs?: number;
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
  | "cancelled"
  /** Failed and waiting for human intervention / replan. */
  | "needs_help";

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
  /** Set when status is failed / needs_help. */
  failureKind?: SkillFailureKind;
  /** True when human should intervene (timeout, blocked, execute error). */
  needsHelp?: boolean;
  /** Recovery commands already issued (stop / open gripper). */
  recoveryApplied?: boolean;
}

export interface SkillRuntimeHandlers {
  /** Execute a validated step command on the robot. */
  execute: (command: RobotCommand) => Promise<void> | void;
  /** Progress / lifecycle notifications. */
  onUpdate: (skill: ActiveSkill) => void;
  /**
   * Feedback channel. kind is FeedbackKind-compatible string.
   * Optional meta (failureKind, stepId, …) for needs_help.
   */
  onFeedback?: (
    kind: string,
    message: string,
    skill: ActiveSkill,
    meta?: Record<string, unknown>
  ) => void;
  log?: (msg: string, ...args: unknown[]) => void;
}

export interface SkillRuntimeOptions {
  /** Default step delay when skill omits delayMs. Default 120. */
  defaultStepDelayMs?: number;
  /**
   * Default max ms for each step execute(). 0 = no timeout.
   * Default 8000.
   */
  defaultStepTimeoutMs?: number;
  /** Overall skill wall-clock timeout (ms). 0 = disabled. Default 60000. */
  skillTimeoutMs?: number;
  /** If true, cancel any running skill when starting a new one. Default true. */
  preempt?: boolean;
  /**
   * On failure/timeout: issue stop + open gripper for safe pose.
   * Default true.
   */
  safeFailRecovery?: boolean;
  /**
   * On timeout/execute error, mark status needs_help (else failed).
   * Default true.
   */
  needsHelpOnFailure?: boolean;
}

export type { ModulatePayload };
