/**
 * Pluggable safety / world-constraint policies.
 */

import type { NeuralIntention } from "../types/intention.js";
import type { RobotCommand, RobotState } from "../types/robot.js";
import type { RobotCapabilities } from "../types/capabilities.js";
import type { ControlMode } from "../types/control.js";
import type { ActiveTask } from "../types/task.js";
import type { SafetyReason, SafetySeverity } from "../types/safety.js";
import type { Vec3 } from "../types/intention.js";

export interface PolicyContext {
  intention: NeuralIntention;
  /** Present when policy runs post-translation. */
  command: RobotCommand | null;
  robotState: RobotState;
  controlMode: ControlMode;
  capabilities: RobotCapabilities | null;
  activeTask: ActiveTask | null;
  /** True if gripper appears to be holding something. */
  holding: boolean;
}

export interface PolicyResult {
  /** Continue pipeline if true. */
  allow: boolean;
  /** Machine reason (defaults to policy_violation). */
  reason?: SafetyReason;
  message?: string;
  severity?: SafetySeverity;
  /** Optional command patch applied when allow is true. */
  patchCommand?: Partial<RobotCommand>;
  /** Policy id that produced this result (filled by engine). */
  policyId?: string;
}

export interface SafetyPolicy {
  readonly id: string;
  readonly name: string;
  /**
   * Evaluate intention/command against this policy.
   * Return { allow: true } to pass (optionally patch command).
   */
  evaluate(ctx: PolicyContext): PolicyResult;
}

/** Axis-aligned keep-out or allowed region. */
export interface Zone3 {
  id: string;
  min: Vec3;
  max: Vec3;
  /** Optional max speed scale inside this zone (0–1). */
  maxSpeed?: number;
}
