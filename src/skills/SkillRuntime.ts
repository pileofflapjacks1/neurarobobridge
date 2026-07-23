/**
 * Executes registered skills as ordered robot command steps.
 * Supports modulate mid-run and cancel / preempt.
 */

import { createId } from "../core/id.js";
import type { RobotCommand } from "../types/robot.js";
import type { TaskName, ModulatePayload } from "../types/task.js";
import type { Vec3 } from "../types/intention.js";
import type { RobotState } from "../types/robot.js";
import type { RobotCapabilities } from "../types/capabilities.js";
import type {
  ActiveSkill,
  SkillDefinition,
  SkillModulation,
  SkillRuntimeHandlers,
  SkillRuntimeOptions,
  SkillStep,
} from "./types.js";
import { getSkill } from "./SkillRegistry.js";

const DEFAULT_MOD: SkillModulation = {
  speed: 1,
  force: 1,
  yawDelta: 0,
  channels: {},
};

export class SkillRuntime {
  private active: ActiveSkill | null = null;
  private steps: SkillStep[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private cancelled = false;
  private modulation: SkillModulation = { ...DEFAULT_MOD, channels: {} };
  private opts: Required<SkillRuntimeOptions>;
  private handlers: SkillRuntimeHandlers;
  private intentionId = "";

  constructor(handlers: SkillRuntimeHandlers, opts: SkillRuntimeOptions = {}) {
    this.handlers = handlers;
    this.opts = {
      defaultStepDelayMs: opts.defaultStepDelayMs ?? 120,
      preempt: opts.preempt ?? true,
    };
  }

  getActive(): ActiveSkill | null {
    return this.active ? { ...this.active, modulation: { ...this.modulation } } : null;
  }

  isRunning(): boolean {
    return this.active?.status === "running";
  }

  /**
   * Start a skill by name. Returns false if skill missing or capability mismatch.
   */
  start(input: {
    skillName: TaskName;
    taskId: string;
    intentionId: string;
    target?: string;
    position?: Vec3;
    params?: Record<string, unknown>;
    robotState: RobotState;
    capabilities: RobotCapabilities | null;
    definition?: SkillDefinition;
  }): { ok: true; skill: ActiveSkill } | { ok: false; reason: string } {
    const def = input.definition ?? getSkill(input.skillName);
    if (!def) {
      return { ok: false, reason: `No skill registered for "${input.skillName}"` };
    }

    const caps = input.capabilities;
    if (def.requiresLocomotion && caps && !caps.locomotion) {
      return { ok: false, reason: `Skill "${def.name}" requires locomotion` };
    }
    if (def.requiresManipulation && caps && !caps.manipulation) {
      return { ok: false, reason: `Skill "${def.name}" requires manipulation` };
    }

    if (this.isRunning()) {
      if (!this.opts.preempt) {
        return { ok: false, reason: "Another skill is already running" };
      }
      this.cancel("Preempted by new skill");
    }

    this.clearTimers();
    this.cancelled = false;
    this.intentionId = input.intentionId;
    this.modulation = { ...DEFAULT_MOD, channels: {} };

    const ctx = {
      taskId: input.taskId,
      intentionId: input.intentionId,
      task: def.name,
      target: input.target,
      position: input.position,
      params: input.params,
      robotState: input.robotState,
      capabilities: input.capabilities,
      modulation: this.modulation,
    };

    let steps: SkillStep[];
    try {
      steps = def.build(ctx);
    } catch (err) {
      return {
        ok: false,
        reason: `Skill build failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (!steps.length) {
      return { ok: false, reason: `Skill "${def.name}" produced no steps` };
    }

    this.steps = steps;
    this.active = {
      taskId: input.taskId,
      skillName: def.name,
      intentionId: input.intentionId,
      status: "running",
      stepIndex: 0,
      stepCount: steps.length,
      progress: 0,
      message: `Starting ${def.name}`,
      startedAt: Date.now(),
      modulation: { ...this.modulation },
    };

    this.emitUpdate();
    this.handlers.onFeedback?.(
      "task_started",
      `Skill ${def.name} started (${steps.length} steps)`,
      this.active
    );
    this.scheduleFrom(0);
    return { ok: true, skill: { ...this.active } };
  }

  /** Apply continuous modulation to the active skill. */
  modulate(payload: ModulatePayload): void {
    if (payload.speed !== undefined) {
      this.modulation.speed = clamp01(payload.speed);
    }
    if (payload.force !== undefined) {
      this.modulation.force = clamp01(payload.force);
    }
    if (payload.yawDelta !== undefined) {
      this.modulation.yawDelta = payload.yawDelta;
    }
    if (payload.channels) {
      this.modulation.channels = {
        ...this.modulation.channels,
        ...payload.channels,
      };
    }
    if (this.active) {
      this.active.modulation = { ...this.modulation };
      this.active.message = `Modulated speed=${this.modulation.speed.toFixed(2)}`;
      this.emitUpdate();
    }
  }

  cancel(reason = "Cancelled"): void {
    if (!this.active || this.active.status !== "running") {
      this.clearTimers();
      return;
    }
    this.cancelled = true;
    this.clearTimers();
    this.active = {
      ...this.active,
      status: "cancelled",
      message: reason,
      progress: this.active.progress,
    };
    this.emitUpdate();
    this.handlers.onFeedback?.("task_cancelled", reason, this.active);
    // Issue stop
    void this.handlers.execute({
      id: createId("cmd"),
      kind: "stop",
      timestamp: Date.now(),
      forced: true,
      intentionId: this.intentionId,
      priority: "cancel",
    });
  }

  dispose(): void {
    this.cancel("Disposed");
    this.active = null;
  }

  private scheduleFrom(index: number): void {
    if (this.cancelled || !this.active) return;
    if (index >= this.steps.length) {
      this.finishSuccess();
      return;
    }

    const step = this.steps[index]!;
    const delay =
      step.delayMs ?? (index === 0 ? 0 : this.opts.defaultStepDelayMs);

    const timer = setTimeout(() => {
      void this.runStep(index, step);
    }, delay);
    this.timers.push(timer);
  }

  private async runStep(index: number, step: SkillStep): Promise<void> {
    if (this.cancelled || !this.active) return;

    this.active = {
      ...this.active,
      stepIndex: index,
      currentStepId: step.id,
      progress: index / this.steps.length,
      message: step.label ?? step.id,
      modulation: { ...this.modulation },
    };
    this.emitUpdate();
    this.handlers.onFeedback?.(
      "task_progress",
      this.active.message,
      this.active
    );

    const cmd = this.materializeCommand(step);
    try {
      await this.handlers.execute(cmd);
    } catch (err) {
      this.fail(err instanceof Error ? err.message : String(err));
      return;
    }

    if (this.cancelled || !this.active) return;
    this.scheduleFrom(index + 1);
  }

  private materializeCommand(step: SkillStep): RobotCommand {
    const base = { ...step.command };
    // Apply live speed modulation to motion steps
    if (
      base.speed !== undefined &&
      (base.kind === "move_to" ||
        base.kind === "move_delta" ||
        base.kind === "navigate")
    ) {
      base.speed = Math.min(1, base.speed * this.modulation.speed);
    } else if (
      base.speed === undefined &&
      (base.kind === "move_to" || base.kind === "move_delta" || base.kind === "navigate")
    ) {
      base.speed = Math.min(1, 0.5 * this.modulation.speed);
    }

    return {
      ...base,
      id: createId("cmd"),
      timestamp: Date.now(),
      intentionId: this.intentionId,
      priority: "discrete_task",
    };
  }

  private finishSuccess(): void {
    if (!this.active) return;
    this.active = {
      ...this.active,
      status: "succeeded",
      stepIndex: this.steps.length,
      progress: 1,
      message: `Completed ${this.active.skillName}`,
      currentStepId: undefined,
    };
    this.emitUpdate();
    this.handlers.onFeedback?.(
      "task_completed",
      this.active.message,
      this.active
    );
  }

  private fail(message: string): void {
    this.clearTimers();
    if (!this.active) return;
    this.active = {
      ...this.active,
      status: "failed",
      message,
    };
    this.emitUpdate();
    this.handlers.onFeedback?.("task_failed", message, this.active);
  }

  private emitUpdate(): void {
    if (!this.active) return;
    this.handlers.onUpdate({
      ...this.active,
      modulation: { ...this.modulation },
    });
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
