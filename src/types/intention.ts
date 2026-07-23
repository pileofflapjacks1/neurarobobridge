/**
 * High-level neural intention types.
 * These are abstract intents from a BCI — not raw motor signals.
 */

import type { TaskPayload, ModulatePayload } from "./task.js";

/** Well-known intention kinds for robot control. */
export type IntentionKind =
  | "move"
  | "grasp"
  | "release"
  | "navigate"
  | "stop"
  | "home"
  | "custom"
  /** Semantic task / skill (pick_object, go_to, …). */
  | "task"
  /** Continuous modulation of active motion/task. */
  | "modulate"
  /** Cancel active task or pending confirmation. */
  | "cancel"
  /** Confirm a pending high-risk action. */
  | "confirm"
  /** Explicitly reject a pending confirmation. */
  | "reject";

/** 3D vector / point in meters (or normalized workspace units). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Quaternion orientation (w, x, y, z). */
export interface Quat {
  w: number;
  x: number;
  y: number;
  z: number;
}

/** Cartesian pose for end-effector or body. */
export interface Pose {
  position: Vec3;
  orientation?: Quat;
}

/** Move intention payload. */
export interface MovePayload {
  /** Target pose (absolute) or delta if relative is true. */
  target: Pose | Vec3;
  /** If true, target is a delta from current pose. Default false. */
  relative?: boolean;
  /** Preferred speed scale 0–1. */
  speed?: number;
  /** Optional named frame of reference. */
  frame?: string;
}

/** Grasp intention payload. */
export interface GraspPayload {
  /** Grip force scale 0–1. Default 0.5. */
  force?: number;
  /** Which end-effector / hand if multi-effector. */
  effector?: string;
}

/** Release intention payload. */
export interface ReleasePayload {
  effector?: string;
}

/** Navigate intention (mobile base / humanoid locomotion). */
export interface NavigatePayload {
  /** Goal position in world frame. */
  goal: Vec3;
  /** Optional yaw in radians. */
  yaw?: number;
  /** Speed scale 0–1. */
  speed?: number;
}

/** Custom high-level command (app-defined). */
export interface CustomPayload {
  command: string;
  params?: Record<string, unknown>;
}

/** Confirm/reject payload referring to a pending confirmation id. */
export interface ConfirmPayload {
  /** Pending confirmation id; if omitted, confirms the latest pending. */
  confirmationId?: string;
}

export type IntentionPayload =
  | MovePayload
  | GraspPayload
  | ReleasePayload
  | NavigatePayload
  | CustomPayload
  | TaskPayload
  | ModulatePayload
  | ConfirmPayload
  | Record<string, never>
  | undefined;

/**
 * A high-level neural intention event from the BCI input side.
 * Confidence and quality are first-class — safety gates on them.
 */
export interface NeuralIntention {
  /** Unique id for this intention instance. */
  id: string;
  /** High-level kind. */
  kind: IntentionKind;
  /** Kind-specific payload. */
  payload?: IntentionPayload;
  /**
   * Classifier / decoder confidence in [0, 1].
   * Safety layer rejects below minConfidence.
   */
  confidence: number;
  /**
   * Optional signal quality in [0, 1] (SNR, electrode contact, etc.).
   * If provided, may be used as an additional gate.
   */
  quality?: number;
  /** Wall-clock ms when intention was produced (source clock). */
  timestamp: number;
  /** Optional source backend id. */
  source?: string;
  /** Optional free-form metadata. */
  meta?: Record<string, unknown>;
}

/** Factory input for creating intentions without boilerplate. */
export type IntentionInput = Omit<NeuralIntention, "id" | "timestamp"> & {
  id?: string;
  timestamp?: number;
};
