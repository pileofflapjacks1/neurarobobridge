/**
 * Intention → RobotCommand translation.
 * Pure mapping; safety gates live in SafetyEngine.
 */

import type {
  NeuralIntention,
  MovePayload,
  GraspPayload,
  ReleasePayload,
  NavigatePayload,
  CustomPayload,
  Vec3,
  Pose,
} from "../types/intention.js";
import type { TaskPayload, ModulatePayload } from "../types/task.js";
import type { RobotCommand } from "../types/robot.js";
import { createId } from "./id.js";
import { priorityOf } from "../types/control.js";

function isVec3(v: unknown): v is Vec3 {
  return (
    typeof v === "object" &&
    v !== null &&
    "x" in v &&
    "y" in v &&
    "z" in v &&
    typeof (v as Vec3).x === "number"
  );
}

function toPose(target: MovePayload["target"]): Pose {
  if (isVec3(target) && !("position" in target)) {
    return { position: target };
  }
  return target as Pose;
}

function extractPosition(payload: MovePayload | undefined): Vec3 | null {
  if (!payload?.target) return null;
  const t = payload.target;
  if ("position" in t && t.position) return t.position;
  if ("x" in t && "y" in t && "z" in t) return t as Vec3;
  return null;
}

/**
 * Translate a high-level neural intention into a robot command.
 * Returns null if the kind is unknown or payload is unusable.
 * Note: confirm/reject are handled by ConfirmManager, not here.
 */
export function translateIntention(intention: NeuralIntention): RobotCommand | null {
  const base = {
    id: createId("cmd"),
    intentionId: intention.id,
    timestamp: Date.now(),
    priority: priorityOf(intention.kind),
  };

  switch (intention.kind) {
    case "move": {
      const payload = intention.payload as MovePayload | undefined;
      const pos = extractPosition(payload);
      if (!pos && !payload?.target) return null;
      const pose = payload?.target ? toPose(payload.target) : { position: pos! };
      const relative = payload?.relative === true;
      return {
        ...base,
        kind: relative ? "move_delta" : "move_to",
        pose,
        speed: payload?.speed,
      };
    }
    case "grasp": {
      const payload = intention.payload as GraspPayload | undefined;
      const force = payload?.force ?? 0.5;
      const open = Math.max(0, 1 - force);
      return {
        ...base,
        kind: "set_gripper",
        gripper: open,
      };
    }
    case "release": {
      void (intention.payload as ReleasePayload | undefined);
      return {
        ...base,
        kind: "set_gripper",
        gripper: 1,
      };
    }
    case "navigate": {
      const payload = intention.payload as NavigatePayload | undefined;
      if (!payload?.goal) return null;
      return {
        ...base,
        kind: "navigate",
        goal: payload.goal,
        yaw: payload.yaw,
        speed: payload.speed,
      };
    }
    case "stop":
      return { ...base, kind: "stop" };
    case "home":
      return { ...base, kind: "home" };
    case "custom": {
      const payload = intention.payload as CustomPayload | undefined;
      if (!payload?.command) return null;
      return {
        ...base,
        kind: "custom",
        custom: { command: payload.command, params: payload.params },
      };
    }
    case "task": {
      const payload = intention.payload as TaskPayload | undefined;
      if (!payload?.task) return null;
      return {
        ...base,
        kind: "execute_task",
        task: {
          name: payload.task,
          target: payload.target,
          position: payload.position,
          params: payload.params,
          taskId: createId("task"),
        },
      };
    }
    case "modulate": {
      const payload = intention.payload as ModulatePayload | undefined;
      return {
        ...base,
        kind: "modulate",
        modulate: {
          speed: payload?.speed,
          force: payload?.force,
          yawDelta: payload?.yawDelta,
          channels: payload?.channels,
        },
        speed: payload?.speed,
      };
    }
    case "cancel":
      return { ...base, kind: "cancel_task" };
    case "confirm":
    case "reject":
      // Handled by ConfirmManager before translation
      return null;
    default:
      return null;
  }
}

/** Discrete (non-continuous) intention kinds — longer TTL allowed. */
export const DISCRETE_KINDS = new Set([
  "task",
  "home",
  "grasp",
  "release",
  "navigate",
  "custom",
  "stop",
  "cancel",
  "confirm",
  "reject",
]);

export function isDiscreteKind(kind: string): boolean {
  return DISCRETE_KINDS.has(kind);
}

export { extractPosition as extractMovePosition };
