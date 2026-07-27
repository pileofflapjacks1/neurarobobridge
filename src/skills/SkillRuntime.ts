/**
 * Executes registered skills as ordered robot command steps.
 * Supports modulate, cancel/preempt, step/skill timeouts, safe-fail recovery.
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
  SkillFailureKind,
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
  private skillDeadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private cancelled = false;
  private modulation: SkillModulation = { ...DEFAULT_MOD, channels: {} };
  private opts: Required<SkillRuntimeOptions>;
  private handlers: SkillRuntimeHandlers;
  private intentionId = "";
  private stepGeneration = 0;

  constructor(handlers: SkillRuntimeHandlers, opts: SkillRuntimeOptions = {}) {
    this.handlers = handlers;
    this.opts = {
      defaultStepDelayMs: opts.defaultStepDelayMs ?? 120,
      defaultStepTimeoutMs: opts.defaultStepTimeoutMs ?? 8000,
      skillTimeoutMs: opts.skillTimeoutMs ?? 60_000,
      preempt: opts.preempt ?? true,
      safeFailRecovery: opts.safeFailRecovery ?? true,
      needsHelpOnFailure: opts.needsHelpOnFailure ?? true,
    };
  }

  getActive(): ActiveSkill | null {
    return this.active
      ? { ...this.active, modulation: { ...this.modulation } }
      : null;
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
    this.stepGeneration += 1;
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

    if (this.opts.skillTimeoutMs > 0) {
      this.skillDeadlineTimer = setTimeout(() => {
        if (this.active?.status === "running") {
          void this.fail(
            `Skill wall-clock timeout after ${this.opts.skillTimeoutMs}ms`,
            "timeout",
            { stepId: this.active.currentStepId }
          );
        }
      }, this.opts.skillTimeoutMs);
    }

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
    if (this.active?.status === "running") {
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
    this.stepGeneration += 1;
    this.clearTimers();
    this.active = {
      ...this.active,
      status: "cancelled",
      message: reason,
      progress: this.active.progress,
      failureKind: "cancelled",
      needsHelp: false,
    };
    this.emitUpdate();
    this.handlers.onFeedback?.("task_cancelled", reason, this.active);
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
    if (this.cancelled || !this.active || this.active.status !== "running") return;
    if (index >= this.steps.length) {
      this.finishSuccess();
      return;
    }

    const step = this.steps[index]!;
    const delay =
      step.delayMs ?? (index === 0 ? 0 : this.opts.defaultStepDelayMs);
    const gen = this.stepGeneration;

    const timer = setTimeout(() => {
      if (gen !== this.stepGeneration) return;
      void this.runStep(index, step, gen);
    }, delay);
    this.timers.push(timer);
  }

  private async runStep(
    index: number,
    step: SkillStep,
    gen: number
  ): Promise<void> {
    if (gen !== this.stepGeneration) return;
    if (this.cancelled || !this.active || this.active.status !== "running") return;

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
      this.active,
      { stepId: step.id, stepIndex: index }
    );

    const cmd = this.materializeCommand(step);
    const timeoutMs =
      step.timeoutMs ?? this.opts.defaultStepTimeoutMs;

    try {
      await this.executeWithTimeout(cmd, timeoutMs, step.id, gen);
    } catch (err) {
      if (gen !== this.stepGeneration) return;
      const msg = err instanceof Error ? err.message : String(err);
      const kind: SkillFailureKind =
        err instanceof SkillStepTimeoutError || isTimeoutMessage(msg)
          ? "timeout"
          : "execute_error";
      await this.fail(msg, kind, { stepId: step.id, stepIndex: index });
      return;
    }

    if (gen !== this.stepGeneration) return;
    if (this.cancelled || !this.active || this.active.status !== "running") return;
    this.scheduleFrom(index + 1);
  }

  private async executeWithTimeout(
    cmd: RobotCommand,
    timeoutMs: number,
    stepId: string,
    gen: number
  ): Promise<void> {
    if (timeoutMs <= 0) {
      await this.handlers.execute(cmd);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve(this.handlers.execute(cmd)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new SkillStepTimeoutError(
                `Step "${stepId}" timed out after ${timeoutMs}ms`
              )
            );
          }, timeoutMs);
          this.timers.push(timer);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      void gen;
    }
  }

  private materializeCommand(step: SkillStep): RobotCommand {
    const base = { ...step.command };
    if (
      base.speed !== undefined &&
      (base.kind === "move_to" ||
        base.kind === "move_delta" ||
        base.kind === "navigate")
    ) {
      base.speed = Math.min(1, base.speed * this.modulation.speed);
    } else if (
      base.speed === undefined &&
      (base.kind === "move_to" ||
        base.kind === "move_delta" ||
        base.kind === "navigate")
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
    this.clearTimers();
    this.active = {
      ...this.active,
      status: "succeeded",
      stepIndex: this.steps.length,
      progress: 1,
      message: `Completed ${this.active.skillName}`,
      currentStepId: undefined,
      needsHelp: false,
    };
    this.emitUpdate();
    this.handlers.onFeedback?.(
      "task_completed",
      this.active.message,
      this.active
    );
  }

  private async fail(
    message: string,
    kind: SkillFailureKind,
    meta?: Record<string, unknown>
  ): Promise<void> {
    this.cancelled = true;
    this.stepGeneration += 1;
    this.clearTimers();
    if (!this.active) return;

    const needsHelp =
      this.opts.needsHelpOnFailure &&
      (kind === "timeout" || kind === "execute_error");

    let recoveryApplied = false;
    if (this.opts.safeFailRecovery) {
      recoveryApplied = true;
      try {
        await this.handlers.execute({
          id: createId("cmd"),
          kind: "stop",
          timestamp: Date.now(),
          forced: true,
          intentionId: this.intentionId,
          priority: "stop",
        });
        await this.handlers.execute({
          id: createId("cmd"),
          kind: "set_gripper",
          gripper: 1,
          timestamp: Date.now(),
          forced: true,
          intentionId: this.intentionId,
          priority: "stop",
        });
      } catch (err) {
        this.handlers.log?.(
          "safe-fail recovery error",
          err instanceof Error ? err.message : err
        );
      }
    }

    this.active = {
      ...this.active,
      status: needsHelp ? "needs_help" : "failed",
      message,
      failureKind: kind,
      needsHelp,
      recoveryApplied,
    };
    this.emitUpdate();

    if (needsHelp) {
      this.handlers.onFeedback?.(
        "needs_help",
        message,
        this.active,
        {
          failureKind: kind,
          recoveryApplied,
          ...meta,
        }
      );
    }

    this.handlers.onFeedback?.(
      "task_failed",
      message,
      this.active,
      {
        failureKind: kind,
        needsHelp,
        recoveryApplied,
        ...meta,
      }
    );
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
    if (this.skillDeadlineTimer) {
      clearTimeout(this.skillDeadlineTimer);
      this.skillDeadlineTimer = null;
    }
  }
}

class SkillStepTimeoutError extends Error {
  readonly isSkillTimeout = true;
  constructor(message: string) {
    super(message);
    this.name = "SkillStepTimeoutError";
  }
}

function isTimeoutMessage(msg: string): boolean {
  return /time\s*out|timed\s*out/i.test(msg);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
