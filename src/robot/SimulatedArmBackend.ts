/**
 * Simulated 6-DOF robotic arm with joint limits, workspace awareness,
 * simple Jacobian-free Cartesian tracking, and text visualization.
 */

import type { RobotBackend, RobotBackendStatus } from "./types.js";
import type { SimulatedArmConfig } from "../types/config.js";
import type {
  RobotCommand,
  RobotState,
  JointState,
  GripperState,
  RobotMode,
} from "../types/robot.js";
import type { Vec3, Pose } from "../types/intention.js";
import type { RobotCapabilities } from "../types/capabilities.js";
import type { RobotFeedback } from "../types/feedback.js";
import { armCapabilities } from "../types/capabilities.js";
import { DEFAULT_SIMULATED_ARM, DEFAULT_WORKSPACE } from "../core/defaults.js";
import { createId } from "../core/id.js";
import type { Logger } from "../core/Logger.js";

type StateHandler = (s: RobotState) => void;
type FeedbackHandler = (f: RobotFeedback) => void;

export class SimulatedArmBackend implements RobotBackend {
  readonly id = "simulated-arm";
  readonly name = "Simulated Robotic Arm";

  private connected = false;
  private config: Required<
    Pick<SimulatedArmConfig, "dof" | "tickHz" | "maxJointVelocity" | "textVizInterval">
  > &
    SimulatedArmConfig;
  private joints: number[];
  private jointNames: string[];
  private gripperOpen = 1;
  private holding = false;
  private mode: RobotMode = "disconnected";
  private targetPose: Pose | null = null;
  private targetJoints: number[] | null = null;
  private lastCommandId?: string;
  private message?: string;
  private handlers = new Set<StateHandler>();
  private feedbackHandlers = new Set<FeedbackHandler>();
  private statusHandlers = new Set<(s: RobotBackendStatus, m?: string) => void>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private estop = false;
  private linkLength: number;
  private activeTaskId?: string;

  constructor(
    config: SimulatedArmConfig = {},
    private log?: Logger
  ) {
    this.config = { ...DEFAULT_SIMULATED_ARM, ...config };
    this.jointNames =
      this.config.jointNames ??
      Array.from({ length: this.config.dof }, (_, i) => `joint_${i + 1}`);
    this.joints = [...(this.config.homeJoints ?? this.jointNames.map(() => 0))];
    // Approximate planar arm link length for FK
    this.linkLength = 0.25;
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.mode = "ready";
    this.estop = false;
    this.startTick();
    this.statusHandlers.forEach((h) => h("connected"));
    this.emitState();
    this.log?.info("Simulated arm connected");
  }

  async disconnect(): Promise<void> {
    this.stopTick();
    this.connected = false;
    this.mode = "disconnected";
    this.statusHandlers.forEach((h) => h("disconnected"));
    this.emitState();
  }

  isConnected(): boolean {
    return this.connected;
  }

  getCapabilities(): RobotCapabilities {
    return armCapabilities(this.id, {
      dof: this.config.dof,
      workspaceLimits: this.config.workspaceLimits ?? DEFAULT_WORKSPACE,
      jointLimits: this.config.jointLimits,
      maxSpeed: 1,
    });
  }

  onFeedback(handler: FeedbackHandler): () => void {
    this.feedbackHandlers.add(handler);
    return () => this.feedbackHandlers.delete(handler);
  }

  async execute(command: RobotCommand): Promise<void> {
    if (!this.connected) {
      throw new Error("Simulated arm not connected");
    }
    if (this.estop && command.kind !== "estop") {
      this.message = "Ignored command — e-stop active";
      this.emitState();
      return;
    }

    this.lastCommandId = command.id;
    this.log?.debug("Arm execute", command.kind);

    switch (command.kind) {
      case "estop":
        this.emergencyStop();
        break;
      case "stop":
        this.targetPose = null;
        this.targetJoints = null;
        this.mode = "ready";
        this.message = "Stopped";
        break;
      case "home":
        this.targetJoints = [...(this.config.homeJoints ?? this.joints.map(() => 0))];
        this.targetPose = null;
        this.mode = "moving";
        this.message = "Homing";
        break;
      case "move_to":
        if (command.pose) {
          this.targetPose = command.pose;
          this.targetJoints = null;
          this.mode = "moving";
          this.message = `Moving to (${fmt(command.pose.position)})`;
        }
        break;
      case "move_delta":
        if (command.pose) {
          const cur = this.forwardKinematics();
          this.targetPose = {
            position: {
              x: cur.position.x + command.pose.position.x,
              y: cur.position.y + command.pose.position.y,
              z: cur.position.z + command.pose.position.z,
            },
          };
          this.targetJoints = null;
          this.mode = "moving";
          this.message = `Delta move`;
        }
        break;
      case "set_gripper":
        if (command.gripper !== undefined) {
          this.mode = "grasping";
          this.gripperOpen = clamp(command.gripper, 0, 1);
          this.holding = this.gripperOpen < 0.3;
          this.message = this.holding ? "Grasping" : "Gripper open";
          // Return to ready after brief grasp
          setTimeout(() => {
            if (this.mode === "grasping" && !this.estop) {
              this.mode = "ready";
              this.emitState();
            }
          }, 200);
        }
        break;
      case "navigate":
        this.emitFeedback({
          kind: "blocked",
          message: "Navigate not supported on fixed-base arm",
          severity: "warning",
          commandId: command.id,
        });
        this.message = "Navigate not supported on arm";
        this.log?.warn("Navigate command ignored on simulated-arm");
        break;
      case "execute_task": {
        const name = command.task?.name ?? "task";
        this.activeTaskId = command.task?.taskId ?? createId("task");
        this.mode = "executing_task";
        this.message = `Task: ${name}`;
        this.emitFeedback({
          kind: "task_started",
          message: `Starting task ${name}`,
          taskId: this.activeTaskId,
          commandId: command.id,
          progress: 0,
        });
        // Simplified skill simulation
        if (name === "pick_object" || name === "place_object" || name === "hand_over") {
          this.gripperOpen = name === "place_object" ? 1 : 0.15;
          this.holding = name !== "place_object";
        }
        if (command.task?.position) {
          this.targetPose = { position: command.task.position };
          this.targetJoints = null;
        }
        setTimeout(() => {
          if (this.estop) return;
          this.mode = "ready";
          this.message = `Task complete: ${name}`;
          this.emitFeedback({
            kind: "task_completed",
            message: `Completed ${name}`,
            taskId: this.activeTaskId,
            progress: 1,
          });
          this.activeTaskId = undefined;
          this.emitState();
        }, 400);
        break;
      }
      case "cancel_task":
        this.targetPose = null;
        this.targetJoints = null;
        if (this.activeTaskId) {
          this.emitFeedback({
            kind: "task_cancelled",
            message: "Task cancelled",
            taskId: this.activeTaskId,
          });
        }
        this.activeTaskId = undefined;
        this.mode = "ready";
        this.message = "Task cancelled";
        break;
      case "modulate":
        if (command.modulate?.speed !== undefined) {
          this.message = `Modulate speed=${command.modulate.speed}`;
        }
        break;
      case "custom":
        this.message = `Custom: ${command.custom?.command ?? "?"}`;
        break;
      default:
        this.message = `Unknown command kind`;
    }
    this.emitState();
  }

  getState(): RobotState {
    return this.buildState();
  }

  onState(handler: StateHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onStatus(handler: (s: RobotBackendStatus, m?: string) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  emergencyStop(): void {
    this.estop = true;
    this.targetPose = null;
    this.targetJoints = null;
    this.mode = "estop";
    this.message = "EMERGENCY STOP";
    this.statusHandlers.forEach((h) => h("estop", "Emergency stop"));
    this.emitState();
    this.log?.error("Simulated arm E-STOP");
  }

  /** Clear e-stop for recovery (called when bridge clears e-stop + re-enables). */
  clearEstop(): void {
    this.estop = false;
    if (this.connected) {
      this.mode = "ready";
      this.message = "E-stop cleared";
      this.statusHandlers.forEach((h) => h("connected", "E-stop cleared"));
      this.emitState();
    }
  }

  dispose(): void {
    this.stopTick();
    this.handlers.clear();
    this.statusHandlers.clear();
    this.connected = false;
  }

  // --- Simulation internals ---

  private startTick(): void {
    this.stopTick();
    const hz = this.config.tickHz ?? 30;
    const dt = 1 / hz;
    this.tickTimer = setInterval(() => this.tick(dt), 1000 / hz);
  }

  private stopTick(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private tick(dt: number): void {
    if (!this.connected || this.estop) return;
    this.tickCount++;

    const maxVel = this.config.maxJointVelocity ?? 1.5;
    let moving = false;

    if (this.targetJoints) {
      moving = this.stepTowardJoints(this.targetJoints, maxVel * dt);
      if (!moving) {
        this.targetJoints = null;
        this.mode = "ready";
        this.message = "At joint target";
      }
    } else if (this.targetPose) {
      // Inverse-ish: map Cartesian to first 3 joints simply
      const targetJ = this.inverseApproximate(this.targetPose.position);
      moving = this.stepTowardJoints(targetJ, maxVel * dt);
      const cur = this.forwardKinematics().position;
      const err = dist(cur, this.targetPose.position);
      if (err < 0.01 && !moving) {
        this.targetPose = null;
        this.mode = "ready";
        this.message = "At Cartesian target";
      } else if (err < 0.01) {
        this.targetPose = null;
        this.mode = "ready";
        this.message = "At Cartesian target";
      }
    }

    if (moving && this.mode !== "grasping") {
      this.mode = "moving";
    }

    // Joint limit enforcement
    const limits = this.config.jointLimits ?? [];
    for (let i = 0; i < this.joints.length; i++) {
      const lim = limits[i];
      if (!lim) continue;
      this.joints[i] = clamp(this.joints[i]!, lim.min, lim.max);
    }

    const vizEvery = this.config.textVizInterval ?? 0;
    if (vizEvery > 0 && this.tickCount % vizEvery === 0) {
      this.log?.info(this.renderTextState());
    }

    this.emitState();
  }

  private stepTowardJoints(target: number[], maxStep: number): boolean {
    let any = false;
    for (let i = 0; i < this.joints.length; i++) {
      const t = target[i] ?? this.joints[i]!;
      const d = t - this.joints[i]!;
      if (Math.abs(d) > 1e-4) {
        any = true;
        this.joints[i] = this.joints[i]! + clamp(d, -maxStep, maxStep);
      }
    }
    return any;
  }

  /**
   * Very simplified FK: planar arm in XZ with base yaw.
   * Good enough for development feedback, not real kinematics.
   */
  forwardKinematics(): Pose {
    const j = this.joints;
    const L = this.linkLength;
    const baseYaw = j[0] ?? 0;
    const s1 = j[1] ?? 0;
    const s2 = j[2] ?? 0;
    const reach = L * (Math.cos(s1) + Math.cos(s1 + s2));
    const height = L * (Math.sin(s1) + Math.sin(s1 + s2)) + 0.3;
    return {
      position: {
        x: reach * Math.cos(baseYaw),
        y: reach * Math.sin(baseYaw),
        z: Math.max(0, height),
      },
    };
  }

  /**
   * Approximate IK for the simplified model.
   * Clamps into workspace before solving.
   */
  inverseApproximate(p: Vec3): number[] {
    const ws = this.config.workspaceLimits ?? DEFAULT_WORKSPACE;
    const x = clamp(p.x, ws.min.x, ws.max.x);
    const y = clamp(p.y, ws.min.y, ws.max.y);
    const z = clamp(p.z, ws.min.z, ws.max.z);

    const baseYaw = Math.atan2(y, x);
    const r = Math.hypot(x, y);
    const L = this.linkLength;
    const zOff = z - 0.3;
    const d = clamp(Math.hypot(r, zOff), 0.01, 2 * L - 0.01);
    // Two-link IK
    let cosElbow = (d * d - L * L - L * L) / (2 * L * L);
    cosElbow = clamp(cosElbow, -1, 1);
    const elbow = Math.acos(cosElbow);
    const alpha = Math.atan2(zOff, r);
    const beta = Math.acos(clamp((d * d + L * L - L * L) / (2 * d * L), -1, 1));
    const shoulder = alpha + beta;

    const out = [...this.joints];
    out[0] = baseYaw;
    out[1] = shoulder;
    out[2] = -(Math.PI - elbow);
    // Keep wrist-ish joints near zero for simplicity
    return out;
  }

  renderTextState(): string {
    const pose = this.forwardKinematics().position;
    const j = this.joints.map((q) => q.toFixed(2)).join(", ");
    const g = this.gripperOpen.toFixed(2);
    return [
      `┌─ ${this.name} ─────────────────────`,
      `│ mode=${this.mode}  grip=${g}${this.holding ? " (holding)" : ""}`,
      `│ ee=(${pose.x.toFixed(3)}, ${pose.y.toFixed(3)}, ${pose.z.toFixed(3)})`,
      `│ joints=[${j}]`,
      `│ ${this.message ?? ""}`,
      `└────────────────────────────────`,
    ].join("\n");
  }

  private buildState(): RobotState {
    const pose = this.forwardKinematics();
    const limits = this.config.jointLimits ?? [];
    const joints: JointState[] = this.joints.map((position, i) => {
      const lim = limits[i];
      const atLimit =
        lim !== undefined &&
        (position <= lim.min + 1e-3 || position >= lim.max - 1e-3);
      return {
        name: this.jointNames[i] ?? `joint_${i + 1}`,
        position,
        atLimit,
      };
    });
    const grippers: GripperState[] = [
      {
        name: "gripper",
        open: this.gripperOpen,
        holding: this.holding,
      },
    ];
    return {
      mode: this.mode,
      pose,
      joints,
      grippers,
      lastCommandId: this.lastCommandId,
      activeTaskId: this.activeTaskId,
      message: this.message,
      timestamp: Date.now(),
    };
  }

  private emitState(): void {
    const state = this.buildState();
    for (const h of this.handlers) {
      try {
        h(state);
      } catch {
        /* ignore */
      }
    }
  }

  private emitFeedback(
    partial: Omit<RobotFeedback, "id" | "timestamp"> &
      Partial<Pick<RobotFeedback, "id" | "timestamp">>
  ): void {
    const fb: RobotFeedback = {
      id: partial.id ?? createId("fb"),
      kind: partial.kind,
      message: partial.message,
      taskId: partial.taskId,
      intentionId: partial.intentionId,
      commandId: partial.commandId,
      progress: partial.progress,
      severity: partial.severity ?? "info",
      timestamp: partial.timestamp ?? Date.now(),
      meta: partial.meta,
    };
    for (const h of this.feedbackHandlers) {
      try {
        h(fb);
      } catch {
        /* ignore */
      }
    }
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function fmt(p: Vec3): string {
  return `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;
}
