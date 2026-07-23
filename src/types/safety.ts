/**
 * Safety events, policies, and intervention records.
 */

import type { WorkspaceLimits, JointLimits } from "./robot.js";
import type { ControlMode } from "./control.js";

/** Why a safety gate fired. */
export type SafetyReason =
  | "low_confidence"
  | "low_quality"
  | "rate_limit"
  | "control_disabled"
  | "emergency_stop"
  | "workspace_violation"
  | "joint_limit"
  | "invalid_payload"
  | "unknown_intention"
  | "backend_error"
  | "manual_override"
  | "stale_intention"
  | "watchdog_timeout"
  | "capability_mismatch"
  | "mode_forbidden"
  | "preempted"
  | "awaiting_confirm"
  | "confirm_timeout"
  | "confirm_required"
  | "policy_violation"
  | "skill_error";

/** Severity of a safety intervention. */
export type SafetySeverity = "info" | "warning" | "critical";

/**
 * Emitted whenever the safety layer blocks, modifies, or forces an action.
 */
export interface SafetyEvent {
  id: string;
  reason: SafetyReason;
  severity: SafetySeverity;
  message: string;
  /** Related intention id if applicable. */
  intentionId?: string;
  /** Related command id if applicable. */
  commandId?: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

/**
 * Safety policy configuration.
 * Designed in from day one — not bolted on later.
 */
export interface SafetyConfig {
  /** Minimum intention confidence [0, 1]. Default 0.75. */
  minConfidence?: number;
  /** Optional minimum signal quality [0, 1]. */
  minQuality?: number;
  /** Max accepted intentions per second. Default 10. */
  maxIntentionsPerSecond?: number;
  /** Minimum ms between accepted commands. Default 50. */
  minCommandIntervalMs?: number;
  /** Enable hardware-style e-stop path. Default true. */
  enableEmergencyStop?: boolean;
  /** Cartesian workspace limits (meters). */
  workspaceLimits?: WorkspaceLimits;
  /** Joint limits for simulated / known robots. */
  jointLimits?: JointLimits[];
  /** Max end-effector speed scale override (0–1). */
  maxSpeed?: number;
  /** If true, block all motion when quality is unknown. Default false. */
  requireQuality?: boolean;
  /** Allowed intention kinds; others rejected. Default: all known. */
  allowedIntentions?: string[];

  /**
   * Drop intentions older than this many ms (source timestamp).
   * Default 250 for continuous; discrete tasks use maxTaskAgeMs.
   */
  maxIntentionAgeMs?: number;
  /** Max age for discrete task / home / grasp style intents. Default 2000. */
  maxTaskAgeMs?: number;
  /**
   * BCI liveness: if no intention (or heartbeat) for this many ms while
   * control is enabled, trigger fail-safe. Default 1500. 0 = disabled.
   */
  watchdogTimeoutMs?: number;
  /** Watchdog poll interval ms. Default 100. */
  watchdogPollMs?: number;
  /**
   * On watchdog timeout: "stop" (default) issues stop + disables control;
   * "estop" latches emergency stop.
   */
  watchdogAction?: "stop" | "estop";

  /**
   * Task names that always require confirm-to-execute.
   * Default: open_door, hand_over, follow_me, go_to (locomotion-related).
   */
  confirmTasks?: string[];
  /** Intention kinds that require confirm. Default: none beyond tasks. */
  confirmIntentions?: string[];
  /** Pending confirmation TTL ms. Default 5000. */
  confirmTimeoutMs?: number;
  /**
   * If true, navigate always requires confirm in supervised mode.
   * Default true.
   */
  confirmNavigate?: boolean;

  /** Default control mode when enableControl() is called. Default "supervised". */
  defaultControlMode?: ControlMode;
}

/** Runtime safety status snapshot. */
export interface SafetyStatus {
  controlEnabled: boolean;
  emergencyStopActive: boolean;
  controlMode: ControlMode;
  watchdogAlive: boolean;
  lastIntentionAt?: number;
  pendingConfirmations: number;
  recentInterventions: number;
  lastIntervention?: SafetyEvent;
  config: Required<
    Pick<
      SafetyConfig,
      | "minConfidence"
      | "maxIntentionsPerSecond"
      | "minCommandIntervalMs"
      | "enableEmergencyStop"
      | "maxIntentionAgeMs"
      | "watchdogTimeoutMs"
    >
  > &
    SafetyConfig;
}
