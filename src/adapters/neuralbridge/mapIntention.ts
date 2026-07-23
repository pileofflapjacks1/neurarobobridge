/**
 * Map NeuralBridge IntentionEvent / GestureEvent shapes → NeuraRoboBridge intentions.
 * Duck-typed — no hard dependency on the neuralbridge package.
 */

import type { IntentionInput, IntentionKind } from "../../types/intention.js";
import type { TaskName } from "../../types/task.js";

/** Minimal NeuralBridge intention shape. */
export interface NeuralBridgeIntentionLike {
  type: string;
  confidence: number;
  timestamp: number;
  payload?: Record<string, unknown>;
  source?: string;
  sequence?: number;
}

/** Minimal NeuralBridge gesture shape. */
export interface NeuralBridgeGestureLike {
  type: string;
  confidence: number;
  timestamp: number;
  vector?: { x: number; y: number; z?: number };
  durationMs?: number;
  payload?: Record<string, unknown>;
  source?: string;
}

export type IntentionMapFn = (
  event: NeuralBridgeIntentionLike
) => IntentionInput | null;

export type GestureMapFn = (
  event: NeuralBridgeGestureLike
) => IntentionInput | null;

/**
 * Default mapping from NeuralBridge app-level intents to robot intentions.
 *
 * NeuralBridge types are UI-oriented (click, select, scroll…).
 * Robot-oriented apps should emit custom types or payload.robotKind.
 */
export function mapNeuralBridgeIntention(
  event: NeuralBridgeIntentionLike
): IntentionInput | null {
  const p = event.payload ?? {};
  const conf = event.confidence;
  const base = {
    confidence: conf,
    timestamp: event.timestamp,
    source: event.source ?? "neuralbridge",
    meta: { neuralBridgeType: event.type, sequence: event.sequence },
  };

  // Explicit robot routing via payload
  if (typeof p.robotKind === "string") {
    return {
      ...base,
      kind: p.robotKind as IntentionKind,
      payload: (p.robotPayload as IntentionInput["payload"]) ?? p,
    };
  }

  if (typeof p.task === "string") {
    return {
      ...base,
      kind: "task",
      payload: {
        task: p.task as TaskName,
        target: typeof p.target === "string" ? p.target : undefined,
        position: isVec3(p.position) ? p.position : undefined,
        params: typeof p.params === "object" && p.params ? (p.params as Record<string, unknown>) : undefined,
        requireConfirm: typeof p.requireConfirm === "boolean" ? p.requireConfirm : undefined,
      },
    };
  }

  switch (event.type) {
    case "confirm":
      return {
        ...base,
        kind: "confirm",
        payload: {
          confirmationId:
            typeof p.confirmationId === "string" ? p.confirmationId : undefined,
        },
      };
    case "cancel":
      return { ...base, kind: "cancel" };
    case "click":
    case "select":
      // In robot mode, click often means confirm pending action
      if (p.as === "grasp") {
        return {
          ...base,
          kind: "grasp",
          payload: { force: num(p.force, 0.6) },
        };
      }
      return {
        ...base,
        kind: "confirm",
        payload: {},
      };
    case "back":
      return { ...base, kind: "home" };
    case "next":
      return {
        ...base,
        kind: "task",
        payload: {
          task: (typeof p.task === "string" ? p.task : "wave") as TaskName,
          requireConfirm: false,
        },
      };
    case "scroll_up":
      return {
        ...base,
        kind: "modulate",
        payload: { speed: Math.min(1, num(p.speed, 0.7) + 0.1) },
      };
    case "scroll_down":
      return {
        ...base,
        kind: "modulate",
        payload: { speed: Math.max(0.1, num(p.speed, 0.5) - 0.1) },
      };
    case "focus":
      return null; // UI-only
    case "stop":
      return { ...base, kind: "stop" };
    case "home":
      return { ...base, kind: "home" };
    case "grasp":
      return {
        ...base,
        kind: "grasp",
        payload: { force: num(p.force, 0.6) },
      };
    case "release":
      return { ...base, kind: "release", payload: {} };
    case "navigate":
      if (!isVec3(p.goal) && !isVec3(p.position)) return null;
      return {
        ...base,
        kind: "navigate",
        payload: {
          goal: (isVec3(p.goal) ? p.goal : p.position) as {
            x: number;
            y: number;
            z: number;
          },
          yaw: typeof p.yaw === "number" ? p.yaw : undefined,
          speed: typeof p.speed === "number" ? p.speed : undefined,
        },
      };
    case "move":
      return mapMovePayload(base, p);
    case "custom": {
      const cmd = typeof p.command === "string" ? p.command : undefined;
      if (cmd === "stop") return { ...base, kind: "stop" };
      if (cmd === "estop") return { ...base, kind: "stop" };
      return {
        ...base,
        kind: "custom",
        payload: {
          command: cmd ?? "custom",
          params: p,
        },
      };
    }
    default:
      // Pass through known robot kinds if NeuralBridge emits them directly
      if (
        [
          "move",
          "grasp",
          "release",
          "navigate",
          "stop",
          "home",
          "task",
          "modulate",
          "cancel",
          "confirm",
          "reject",
        ].includes(event.type)
      ) {
        return {
          ...base,
          kind: event.type as IntentionKind,
          payload: p as IntentionInput["payload"],
        };
      }
      return null;
  }
}

export function mapNeuralBridgeGesture(
  event: NeuralBridgeGestureLike
): IntentionInput | null {
  const conf = event.confidence;
  const base = {
    confidence: conf,
    timestamp: event.timestamp,
    source: event.source ?? "neuralbridge-gesture",
    meta: { neuralBridgeGesture: event.type },
  };
  const v = event.vector;

  switch (event.type) {
    case "move":
      if (!v) return null;
      return {
        ...base,
        kind: "move",
        payload: {
          target: {
            x: (v.x ?? 0) * 0.08,
            y: (v.y ?? 0) * 0.08,
            z: (v.z ?? 0) * 0.08,
          },
          relative: true,
          speed: 0.45,
        },
      };
    case "hold":
      return {
        ...base,
        kind: "grasp",
        payload: { force: 0.7 },
      };
    case "release":
      return { ...base, kind: "release", payload: {} };
    case "swipe":
      if (!v) return null;
      return {
        ...base,
        kind: "navigate",
        payload: {
          goal: {
            x: (v.x ?? 0) * 0.5,
            y: (v.y ?? 0) * 0.5,
            z: 0,
          },
          speed: 0.35,
        },
      };
    default:
      return null;
  }
}

function mapMovePayload(
  base: Omit<IntentionInput, "kind" | "payload">,
  p: Record<string, unknown>
): IntentionInput | null {
  if (isVec3(p.target) || isVec3(p.position)) {
    const target = (isVec3(p.target) ? p.target : p.position)!;
    const input: IntentionInput = {
      ...base,
      kind: "move",
      payload: {
        target,
        relative: p.relative === true,
        speed: typeof p.speed === "number" ? p.speed : 0.5,
      } as IntentionInput["payload"],
    };
    return input;
  }
  if (typeof p.dx === "number" || typeof p.dy === "number" || typeof p.dz === "number") {
    const input: IntentionInput = {
      ...base,
      kind: "move",
      payload: {
        target: {
          x: num(p.dx, 0),
          y: num(p.dy, 0),
          z: num(p.dz, 0),
        },
        relative: true,
        speed: typeof p.speed === "number" ? p.speed : 0.5,
      } as IntentionInput["payload"],
    };
    return input;
  }
  return null;
}

function isVec3(v: unknown): v is { x: number; y: number; z: number } {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { x: unknown }).x === "number" &&
    typeof (v as { y: unknown }).y === "number" &&
    typeof (v as { z: unknown }).z === "number"
  );
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
