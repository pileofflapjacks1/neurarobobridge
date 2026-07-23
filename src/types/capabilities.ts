/**
 * Robot capability handshake — what the body can actually do.
 */

import type { WorkspaceLimits, JointLimits } from "./robot.js";
import type { RobotCommandKind } from "./robot.js";

/** Named effector on the robot. */
export interface EffectorInfo {
  id: string;
  type: "arm" | "gripper" | "hand" | "base" | "head" | "torso" | "other";
  side?: "left" | "right" | "center";
}

/**
 * Declared by every robot backend at connect time.
 * Safety rejects commands the body cannot execute.
 */
export interface RobotCapabilities {
  /** Backend id. */
  backendId: string;
  /** Human-readable model name. */
  model: string;
  /** Robot class for policy defaults. */
  class: "arm" | "mobile_base" | "humanoid" | "multi" | "null" | "unknown";
  /** Present effectors. */
  effectors: EffectorInfo[];
  /** Command kinds this backend accepts. */
  supportedCommands: RobotCommandKind[];
  /** True if locomotion / navigate is meaningful. */
  locomotion: boolean;
  /** True if at least one gripper/hand exists. */
  manipulation: boolean;
  /** Degrees of freedom (primary arm or total approximate). */
  dof?: number;
  /** Max end-effector speed scale the hardware allows (0–1). */
  maxSpeed?: number;
  /** Max base speed m/s if mobile. */
  maxBaseSpeedMs?: number;
  workspaceLimits?: WorkspaceLimits;
  jointLimits?: JointLimits[];
  /** Free-form vendor notes. */
  meta?: Record<string, unknown>;
}

/** Built-in capability presets for simulators. */
export function armCapabilities(
  backendId: string,
  opts?: Partial<RobotCapabilities>
): RobotCapabilities {
  return {
    backendId,
    model: opts?.model ?? "Simulated 6-DOF Arm",
    class: "arm",
    effectors: [
      { id: "arm", type: "arm", side: "right" },
      { id: "gripper", type: "gripper", side: "right" },
    ],
    supportedCommands: [
      "move_to",
      "move_delta",
      "set_gripper",
      "stop",
      "home",
      "estop",
      "custom",
      "execute_task",
      "cancel_task",
      "modulate",
    ],
    locomotion: false,
    manipulation: true,
    dof: opts?.dof ?? 6,
    maxSpeed: opts?.maxSpeed ?? 1,
    workspaceLimits: opts?.workspaceLimits,
    jointLimits: opts?.jointLimits,
    meta: opts?.meta,
  };
}

export function humanoidCapabilities(
  backendId: string,
  opts?: Partial<RobotCapabilities>
): RobotCapabilities {
  return {
    backendId,
    model: opts?.model ?? "Simulated Humanoid (simplified)",
    class: "humanoid",
    effectors: [
      { id: "base", type: "base" },
      { id: "left_arm", type: "arm", side: "left" },
      { id: "right_arm", type: "arm", side: "right" },
      { id: "right_hand", type: "hand", side: "right" },
      { id: "head", type: "head" },
    ],
    supportedCommands: [
      "move_to",
      "move_delta",
      "set_gripper",
      "navigate",
      "stop",
      "home",
      "estop",
      "custom",
      "execute_task",
      "cancel_task",
      "modulate",
    ],
    locomotion: true,
    manipulation: true,
    dof: opts?.dof ?? 20,
    maxSpeed: opts?.maxSpeed ?? 0.8,
    maxBaseSpeedMs: opts?.maxBaseSpeedMs ?? 0.8,
    workspaceLimits: opts?.workspaceLimits,
    meta: opts?.meta,
  };
}

export function nullCapabilities(backendId = "null"): RobotCapabilities {
  return {
    backendId,
    model: "Null Robot",
    class: "null",
    effectors: [],
    supportedCommands: [
      "move_to",
      "move_delta",
      "set_gripper",
      "navigate",
      "stop",
      "home",
      "estop",
      "custom",
      "execute_task",
      "cancel_task",
      "modulate",
    ],
    locomotion: true,
    manipulation: true,
  };
}
