/**
 * Simplified simulated humanoid: mobile base + dual arm stubs.
 * Designed as a stand-in for future Optimus-style adapters — not a real API.
 */

import type { RobotBackend, RobotBackendStatus } from "./types.js";
import type { SimulatedHumanoidConfig } from "../types/config.js";
import type { RobotCommand, RobotState, RobotMode } from "../types/robot.js";
import type { Vec3, Pose } from "../types/intention.js";
import type { RobotCapabilities } from "../types/capabilities.js";
import type { RobotFeedback } from "../types/feedback.js";
import { humanoidCapabilities } from "../types/capabilities.js";
import { createId } from "../core/id.js";
import type { Logger } from "../core/Logger.js";
import { ArrivalGate } from "./ArrivalGate.js";

type StateHandler = (s: RobotState) => void;
type FeedbackHandler = (f: RobotFeedback) => void;

export class SimulatedHumanoidBackend implements RobotBackend {
  readonly id = "simulated-humanoid";
  readonly name = "Simulated Humanoid (simplified)";

  private connected = false;
  private config: SimulatedHumanoidConfig;
  private mode: RobotMode = "disconnected";
  private base: Pose = { position: { x: 0, y: 0, z: 0 } };
  private baseYaw = 0;
  private targetBase: Vec3 | null = null;
  private targetYaw: number | null = null;
  private targetEe: Vec3 | null = null;
  private eeSpeed = 0.35;
  private arrivedMessage = "At goal";
  private readonly arrival = new ArrivalGate();
  private eePose: Pose = { position: { x: 0.3, y: 0.2, z: 1.0 } };
  private gripperOpen = 1;
  private lastCommandId?: string;
  private message?: string;
  private handlers = new Set<StateHandler>();
  private feedbackHandlers = new Set<FeedbackHandler>();
  private statusHandlers = new Set<(s: RobotBackendStatus, m?: string) => void>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private estop = false;
  private maxSpeed: number;
  private activeTaskId?: string;

  constructor(
    config: SimulatedHumanoidConfig = {},
    private log?: Logger
  ) {
    this.config = config;
    this.maxSpeed = config.maxBaseSpeed ?? 0.8;
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.mode = "ready";
    this.estop = false;
    const hz = this.config.tickHz ?? 20;
    this.tickTimer = setInterval(() => this.tick(1 / hz), 1000 / hz);
    this.statusHandlers.forEach((h) => h("connected"));
    this.emitState();
    this.log?.info("Simulated humanoid connected");
  }

  async disconnect(): Promise<void> {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.clearTargets();
    this.arrival.release();
    this.connected = false;
    this.mode = "disconnected";
    this.statusHandlers.forEach((h) => h("disconnected"));
    this.emitState();
  }

  isConnected(): boolean {
    return this.connected;
  }

  getCapabilities(): RobotCapabilities {
    return humanoidCapabilities(this.id, {
      maxBaseSpeedMs: this.maxSpeed,
      maxSpeed: 0.8,
    });
  }

  onFeedback(handler: FeedbackHandler): () => void {
    this.feedbackHandlers.add(handler);
    return () => this.feedbackHandlers.delete(handler);
  }

  async execute(command: RobotCommand): Promise<void> {
    if (!this.connected) throw new Error("Humanoid not connected");
    if (this.estop && command.kind !== "estop") {
      this.message = "Ignored — e-stop";
      this.emitState();
      return;
    }
    this.lastCommandId = command.id;

    switch (command.kind) {
      case "estop":
        this.emergencyStop();
        break;
      case "stop":
        this.clearTargets();
        this.mode = "ready";
        this.message = "Stopped";
        this.arrival.release();
        break;
      case "home":
        this.targetBase = { x: 0, y: 0, z: 0 };
        this.targetYaw = 0;
        this.targetEe = { x: 0.3, y: 0.2, z: 1.0 };
        this.eeSpeed = 0.35;
        if (await this.trackUntilArrived("Homing", "At goal")) return;
        break;
      case "navigate":
        if (command.goal) {
          this.targetBase = { ...command.goal };
          this.targetYaw = command.yaw ?? null;
          if (
            await this.trackUntilArrived(
              `Navigating to (${command.goal.x.toFixed(2)}, ${command.goal.y.toFixed(2)})`,
              "At goal"
            )
          ) {
            return;
          }
        }
        break;
      case "move_to":
      case "move_delta":
        if (command.pose) {
          const goal =
            command.kind === "move_delta"
              ? {
                  x: this.eePose.position.x + command.pose.position.x,
                  y: this.eePose.position.y + command.pose.position.y,
                  z: this.eePose.position.z + command.pose.position.z,
                }
              : { ...command.pose.position };
          this.targetEe = goal;
          this.eeSpeed = eeMetersPerSec(command.speed);
          if (await this.trackUntilArrived("Arm motion", "At pose")) return;
        }
        break;
      case "set_gripper":
        if (command.gripper !== undefined) {
          this.gripperOpen = command.gripper;
          this.mode = "grasping";
          this.message = "Gripper";
          setTimeout(() => {
            if (!this.estop) {
              this.mode = "ready";
              this.emitState();
            }
          }, 200);
        }
        break;
      case "execute_task": {
        const name = command.task?.name ?? "task";
        this.activeTaskId = command.task?.taskId ?? createId("task");
        this.mode = "executing_task";
        this.message = `Task: ${name}`;
        this.emitFeedback({
          kind: "task_started",
          message: `Starting ${name}`,
          taskId: this.activeTaskId,
          commandId: command.id,
          progress: 0,
        });
        if (name === "go_to" || name === "follow_me") {
          if (command.task?.position) {
            this.targetBase = { ...command.task.position };
          } else if (name === "follow_me") {
            this.targetBase = {
              x: this.base.position.x + 1,
              y: this.base.position.y,
              z: 0,
            };
          }
        }
        if (name === "wave") {
          this.eePose = {
            position: {
              x: this.eePose.position.x,
              y: this.eePose.position.y,
              z: this.eePose.position.z + 0.15,
            },
          };
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
        }, 500);
        break;
      }
      case "cancel_task":
        this.clearTargets();
        this.arrival.release();
        if (this.activeTaskId) {
          this.emitFeedback({
            kind: "task_cancelled",
            message: "Task cancelled",
            taskId: this.activeTaskId,
          });
        }
        this.activeTaskId = undefined;
        this.mode = "ready";
        this.message = "Cancelled";
        break;
      case "modulate":
        if (command.modulate?.speed !== undefined) {
          this.maxSpeed = Math.max(0.05, command.modulate.speed * (this.config.maxBaseSpeed ?? 0.8));
        }
        if (command.modulate?.yawDelta) {
          this.baseYaw += command.modulate.yawDelta;
        }
        this.message = "Modulating";
        break;
      default:
        this.message = `Command ${command.kind}`;
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
    this.clearTargets();
    this.arrival.release();
    this.mode = "estop";
    this.message = "EMERGENCY STOP";
    this.statusHandlers.forEach((h) => h("estop"));
    this.emitState();
  }

  clearEstop(): void {
    this.estop = false;
    if (this.connected) {
      this.mode = "ready";
      this.message = "E-stop cleared";
      this.emitState();
    }
  }

  dispose(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.clearTargets();
    this.arrival.release();
    this.handlers.clear();
    this.connected = false;
  }

  private tick(dt: number): void {
    if (!this.connected || this.estop) return;
    let moving = false;
    const speed = this.maxSpeed;

    if (this.targetBase) {
      const dx = this.targetBase.x - this.base.position.x;
      const dy = this.targetBase.y - this.base.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.02) {
        moving = true;
        const step = Math.min(speed * dt, dist);
        this.base.position.x += (dx / dist) * step;
        this.base.position.y += (dy / dist) * step;
      } else {
        this.targetBase = null;
      }
    }

    if (this.targetYaw !== null) {
      const dyaw = yawError(this.targetYaw, this.baseYaw);
      if (Math.abs(dyaw) > 0.02) {
        moving = true;
        const step = Math.sign(dyaw) * Math.min(1.5 * dt, Math.abs(dyaw));
        this.baseYaw += step;
      } else {
        this.baseYaw = this.targetYaw;
        this.targetYaw = null;
      }
    }

    if (this.targetEe) {
      const dx = this.targetEe.x - this.eePose.position.x;
      const dy = this.targetEe.y - this.eePose.position.y;
      const dz = this.targetEe.z - this.eePose.position.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 0.02) {
        moving = true;
        const step = Math.min(this.eeSpeed * dt, dist);
        this.eePose.position.x += (dx / dist) * step;
        this.eePose.position.y += (dy / dist) * step;
        this.eePose.position.z += (dz / dist) * step;
      } else {
        this.eePose = { position: { ...this.targetEe } };
        this.targetEe = null;
      }
    }

    if (moving) {
      this.mode = "moving";
    } else if (this.mode === "moving") {
      this.mode = "ready";
      this.message = this.arrivedMessage;
    }

    const viz = this.config.textVizInterval ?? 0;
    if (viz > 0 && Math.random() < 0.05) {
      this.log?.info(this.renderText());
    }

    this.emitState();
    if (!this.targetBase && this.targetYaw === null && !this.targetEe) {
      this.arrival.release();
    }
  }

  /**
   * Wait until base, yaw, and end-effector targets are clear.
   * Returns true when this call owned the wait and the caller should return.
   * Already-there motions resolve immediately and fall through to emitState.
   */
  private async trackUntilArrived(
    movingMessage: string,
    arrivedMessage: string
  ): Promise<boolean> {
    this.arrivedMessage = arrivedMessage;
    if (!this.motionPending()) {
      this.clearTargets();
      if (!this.estop) this.mode = "ready";
      this.message = arrivedMessage;
      this.arrival.release();
      return false;
    }
    this.mode = "moving";
    this.message = movingMessage;
    this.emitState();
    await this.arrival.wait();
    return true;
  }

  private motionPending(): boolean {
    if (this.targetBase && hypot2(this.targetBase, this.base.position) > 0.02) {
      return true;
    }
    if (
      this.targetYaw !== null &&
      Math.abs(yawError(this.targetYaw, this.baseYaw)) > 0.02
    ) {
      return true;
    }
    if (this.targetEe && hypot3(this.targetEe, this.eePose.position) > 0.02) {
      return true;
    }
    return false;
  }

  private clearTargets(): void {
    this.targetBase = null;
    this.targetYaw = null;
    this.targetEe = null;
  }

  renderText(): string {
    const b = this.base.position;
    return `Humanoid mode=${this.mode} base=(${b.x.toFixed(2)},${b.y.toFixed(2)}) yaw=${this.baseYaw.toFixed(2)} ee.z=${this.eePose.position.z.toFixed(2)}`;
  }

  private buildState(): RobotState {
    return {
      mode: this.mode,
      pose: this.eePose,
      basePose: {
        position: { ...this.base.position },
        orientation: {
          w: Math.cos(this.baseYaw / 2),
          x: 0,
          y: 0,
          z: Math.sin(this.baseYaw / 2),
        },
      },
      grippers: [{ name: "right_hand", open: this.gripperOpen }],
      lastCommandId: this.lastCommandId,
      activeTaskId: this.activeTaskId,
      message: this.message,
      timestamp: Date.now(),
      meta: { baseYaw: this.baseYaw },
    };
  }

  private emitState(): void {
    const s = this.buildState();
    for (const h of this.handlers) {
      try {
        h(s);
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

function hypot2(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function hypot3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function yawError(target: number, current: number): number {
  let dyaw = target - current;
  while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
  while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
  return dyaw;
}

/** Command speed is 0–1. Map it to m/s with a floor so short poses still settle visibly. */
function eeMetersPerSec(speed?: number): number {
  const s = speed === undefined ? 0.4 : Math.min(1, Math.max(0, speed));
  return Math.max(0.3, s * 0.8);
}
