/**
 * Built-in world / interaction constraint policies.
 */

import type { SafetyPolicy, PolicyContext, PolicyResult, Zone3 } from "./types.js";
import type { Vec3 } from "../types/intention.js";
import type { NavigatePayload, MovePayload } from "../types/intention.js";
import type { TaskPayload } from "../types/task.js";
import { extractPosition } from "../safety/SafetyEngine.js";

function pointInZone(p: Vec3, z: Zone3): boolean {
  return (
    p.x >= z.min.x &&
    p.x <= z.max.x &&
    p.y >= z.min.y &&
    p.y <= z.max.y &&
    p.z >= z.min.z &&
    p.z <= z.max.z
  );
}

function goalFromIntention(ctx: PolicyContext): Vec3 | null {
  if (ctx.command?.pose?.position) return ctx.command.pose.position;
  if (ctx.command?.goal) return ctx.command.goal;
  if (ctx.command?.task?.position) return ctx.command.task.position;

  const i = ctx.intention;
  if (i.kind === "move") {
    return extractPosition(i.payload as MovePayload | undefined);
  }
  if (i.kind === "navigate") {
    return (i.payload as NavigatePayload | undefined)?.goal ?? null;
  }
  if (i.kind === "task") {
    return (i.payload as TaskPayload | undefined)?.position ?? null;
  }
  return null;
}

function isLocomotion(ctx: PolicyContext): boolean {
  if (ctx.command?.kind === "navigate") return true;
  if (ctx.intention.kind === "navigate") return true;
  if (ctx.intention.kind === "task") {
    const t = (ctx.intention.payload as TaskPayload | undefined)?.task;
    return t === "go_to" || t === "follow_me";
  }
  return false;
}

/** Reject goals that enter any keep-out zone. */
export function createKeepOutZonesPolicy(zones: Zone3[]): SafetyPolicy {
  return {
    id: "keep_out_zones",
    name: "Keep-out zones",
    evaluate(ctx: PolicyContext): PolicyResult {
      if (!zones.length) return { allow: true };
      const goal = goalFromIntention(ctx);
      if (!goal) return { allow: true };
      for (const z of zones) {
        if (pointInZone(goal, z)) {
          return {
            allow: false,
            reason: "policy_violation",
            severity: "warning",
            message: `Goal enters keep-out zone "${z.id}"`,
          };
        }
      }
      return { allow: true };
    },
  };
}

/**
 * Optional home geofence: locomotion goals must stay inside the allowed box.
 */
export function createHomeGeofencePolicy(fence: Zone3): SafetyPolicy {
  return {
    id: "home_geofence",
    name: "Home geofence",
    evaluate(ctx: PolicyContext): PolicyResult {
      if (!isLocomotion(ctx)) return { allow: true };
      const goal = goalFromIntention(ctx);
      if (!goal) return { allow: true };
      if (!pointInZone(goal, fence)) {
        return {
          allow: false,
          reason: "policy_violation",
          severity: "warning",
          message: `Locomotion goal outside home geofence "${fence.id}"`,
        };
      }
      return { allow: true };
    },
  };
}

/** Block navigate / go_to / follow while gripper is holding. */
export function createNoLocomotionWhileGraspingPolicy(): SafetyPolicy {
  return {
    id: "no_loco_while_grasping",
    name: "No locomotion while grasping",
    evaluate(ctx: PolicyContext): PolicyResult {
      if (!ctx.holding) return { allow: true };
      if (!isLocomotion(ctx)) return { allow: true };
      return {
        allow: false,
        reason: "policy_violation",
        severity: "warning",
        message: "Locomotion blocked while holding an object — release first",
      };
    },
  };
}

/**
 * Clamp command speed when the goal (or current EE) lies in a speed-limited zone.
 */
export function createMaxSpeedByZonePolicy(zones: Zone3[]): SafetyPolicy {
  return {
    id: "max_speed_by_zone",
    name: "Max speed by zone",
    evaluate(ctx: PolicyContext): PolicyResult {
      if (!ctx.command || !zones.length) return { allow: true };
      const p =
        goalFromIntention(ctx) ??
        ctx.robotState.pose?.position ??
        ctx.robotState.basePose?.position;
      if (!p) return { allow: true };

      let maxSpeed = 1;
      let hit: string | undefined;
      for (const z of zones) {
        if (z.maxSpeed !== undefined && pointInZone(p, z)) {
          if (z.maxSpeed < maxSpeed) {
            maxSpeed = z.maxSpeed;
            hit = z.id;
          }
        }
      }
      if (maxSpeed >= 1 || !hit) return { allow: true };

      const current = ctx.command.speed ?? 1;
      if (current <= maxSpeed) return { allow: true };
      return {
        allow: true,
        message: `Speed clamped to ${maxSpeed} in zone "${hit}"`,
        severity: "info",
        patchCommand: { speed: maxSpeed },
      };
    },
  };
}

/** Block free move while a skill/task is running (optional strict mode). */
export function createNoFreeMoveDuringSkillPolicy(): SafetyPolicy {
  return {
    id: "no_free_move_during_skill",
    name: "No free move during skill",
    evaluate(ctx: PolicyContext): PolicyResult {
      if (!ctx.activeTask || ctx.activeTask.status !== "running") {
        return { allow: true };
      }
      if (ctx.intention.kind === "move") {
        return {
          allow: false,
          reason: "policy_violation",
          severity: "info",
          message: "Free move blocked during active skill — use modulate or cancel",
        };
      }
      return { allow: true };
    },
  };
}
