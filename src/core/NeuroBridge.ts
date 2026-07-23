/**
 * NeuroBridge — public API façade.
 *
 * Apps never talk to raw BCI hardware or robot drivers.
 * NeuroBridge is the safety-conscious translation layer between
 * human neural intention and physical robot action.
 */

import { TypedEventEmitter } from "./EventEmitter.js";
import { Logger } from "./Logger.js";
import { resolveConfig, DEFAULT_SAFETY } from "./defaults.js";
import { translateIntention } from "./Translator.js";
import { createId } from "./id.js";
import { SafetyEngine } from "../safety/SafetyEngine.js";
import { ConfirmManager } from "../safety/ConfirmManager.js";
import { Watchdog } from "../safety/Watchdog.js";
import {
  registerBuiltinBciBackends,
  createBciBackend,
  type BciBackend,
} from "../bci/index.js";
import {
  registerBuiltinRobotBackends,
  createRobotBackend,
  type RobotBackend,
} from "../robot/index.js";
import { SessionRecorder } from "../recording/SessionRecorder.js";
import { SimulatorBciBackend } from "../bci/SimulatorBciBackend.js";
import { PlaybackBciBackend } from "../bci/PlaybackBciBackend.js";
import { resolveScenario } from "../bci/scenarios.js";
import { SimulatedArmBackend } from "../robot/SimulatedArmBackend.js";
import { SimulatedHumanoidBackend } from "../robot/SimulatedHumanoidBackend.js";
import type { NeuroBridgeConfig, ScenarioStep } from "../types/config.js";
import type { NeuroBridgeEvents, BridgeStatus } from "../types/events.js";
import type { NeuralIntention, IntentionInput, ConfirmPayload } from "../types/intention.js";
import type { RobotState, RobotCommand } from "../types/robot.js";
import type { SafetyConfig, SafetyStatus } from "../types/safety.js";
import type { SessionRecording } from "../types/session.js";
import type { ControlMode } from "../types/control.js";
import type { RobotCapabilities } from "../types/capabilities.js";
import type { RobotFeedback, LatencySample } from "../types/feedback.js";
import type { ActiveTask, PendingConfirmation, TaskPayload } from "../types/task.js";

registerBuiltinBciBackends();
registerBuiltinRobotBackends();

export class NeuroBridge extends TypedEventEmitter<NeuroBridgeEvents> {
  private config: ReturnType<typeof resolveConfig>;
  private log: Logger;
  private safety: SafetyEngine;
  private confirmMgr: ConfirmManager;
  private watchdog: Watchdog;
  private bci: BciBackend;
  private robot: RobotBackend;
  private recorder: SessionRecorder | null = null;
  private unsubs: Array<() => void> = [];
  private connected = false;
  private disposed = false;
  private capabilities: RobotCapabilities | null = null;
  private activeTask: ActiveTask | null = null;
  private confirmTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: NeuroBridgeConfig = {}) {
    super();
    this.config = resolveConfig(config);
    this.log = new Logger(
      this.config.debug ? "debug" : this.config.logLevel,
      "[NeuroBridge]"
    );
    const safetyCfg = this.config.safety ?? {};
    this.safety = new SafetyEngine(safetyCfg, this.log.child(":safety"));
    this.confirmMgr = new ConfirmManager(safetyCfg);
    this.watchdog = new Watchdog(
      safetyCfg,
      (idleMs) => this.onWatchdogTimeout(idleMs),
      this.log.child(":watchdog")
    );
    this.bci = createBciBackend(this.config, this.log.child(":bci"));
    this.robot = createRobotBackend(this.config, this.log.child(":robot"));

    if (this.config.recording) {
      this.recorder = new SessionRecorder(this.config.recording);
    }
  }

  // ─── Lifecycle ───────────────────────────────────────────

  async connect(): Promise<void> {
    this.assertAlive();
    if (this.connected) return;

    this.emitStatus("connecting", "Connecting backends…");

    try {
      this.wireBackends();
      await this.bci.connect();
      await this.robot.connect();
      this.capabilities = this.robot.getCapabilities();
      this.safety.setCapabilities(this.capabilities);
      this.emit("capabilities", this.capabilities);
      this.connected = true;
      this.startConfirmSweeper();
      this.recorder?.start({
        bciBackend: this.bci.id,
        robotBackend: this.robot.id,
        capabilities: this.capabilities,
      });
      this.emitStatus(
        "connected",
        `Connected (${this.capabilities.model}) — control disabled until enableControl()`
      );
      this.log.info(
        `Connected (bci=${this.bci.id}, robot=${this.robot.id}, class=${this.capabilities.class}). Call enableControl() to allow motion.`
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit("error", { error, context: "connect", timestamp: Date.now() });
      this.emitStatus("error", error.message);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    this.watchdog.stop();
    this.stopConfirmSweeper();
    this.safety.setControlEnabled(false);
    // Fail-safe: stop robot on disconnect
    if (this.robot.isConnected()) {
      try {
        await this.robot.execute({
          id: createId("cmd"),
          kind: "stop",
          timestamp: Date.now(),
          forced: true,
          priority: "stop",
        });
      } catch {
        /* ignore */
      }
    }
    for (const u of this.unsubs) u();
    this.unsubs = [];
    try {
      await this.bci.disconnect();
    } catch (err) {
      this.log.warn("BCI disconnect error", err);
    }
    try {
      await this.robot.disconnect();
    } catch (err) {
      this.log.warn("Robot disconnect error", err);
    }
    this.connected = false;
    this.capabilities = null;
    this.emitStatus("disconnected");
    this.log.info("Disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  getCapabilities(): RobotCapabilities | null {
    return this.capabilities;
  }

  /**
   * Explicit enable — required before motion commands are accepted.
   * Enters defaultControlMode (supervised unless configured otherwise).
   */
  async enableControl(mode?: ControlMode): Promise<void> {
    this.assertAlive();
    if (!this.connected) {
      throw new Error("Cannot enable control while disconnected — call connect() first");
    }
    if (this.safety.isEmergencyStopActive()) {
      throw new Error(
        "Cannot enable control while emergency stop is active — call clearEmergencyStop() first"
      );
    }
    const event = this.safety.setControlEnabled(true);
    if (event) {
      this.emitSafety(event);
    }
    if (!this.safety.isControlEnabled()) {
      throw new Error("Control enable blocked (e-stop still active?)");
    }
    const targetMode =
      mode ??
      this.config.safety?.defaultControlMode ??
      DEFAULT_SAFETY.defaultControlMode;
    this.setControlMode(targetMode);
    this.clearRobotEstop();
    this.watchdog.start();
    this.safety.setWatchdogAlive(true);
    this.emit("control", true);
    this.emitStatus("control_enabled", `Control enabled (${targetMode})`);
    this.emitSafetyStatus();
    this.log.info("Control ENABLED", targetMode);
  }

  async disableControl(): Promise<void> {
    this.watchdog.stop();
    this.confirmMgr.cancelAll();
    const event = this.safety.setControlEnabled(false);
    if (event) this.emitSafety(event);
    if (this.connected) {
      await this.safeExecute({
        id: createId("cmd"),
        kind: "stop",
        timestamp: Date.now(),
        forced: true,
        priority: "stop",
      });
    }
    this.emit("control", false);
    this.emitStatus("control_disabled", "Control disabled");
    this.emitSafetyStatus();
    this.log.info("Control DISABLED");
  }

  isControlEnabled(): boolean {
    return this.safety.isControlEnabled();
  }

  getControlMode(): ControlMode {
    return this.safety.getControlMode();
  }

  /**
   * Switch authority mode while control is enabled.
   * Setting `disabled` is equivalent to disableControl() without stop wait.
   */
  setControlMode(mode: ControlMode): void {
    const previous = this.safety.getControlMode();
    if (mode === "disabled") {
      this.watchdog.stop();
    } else if (this.connected && previous === "disabled") {
      this.watchdog.start();
    }
    this.safety.setControlMode(mode);
    this.emit("controlMode", { mode, previous, timestamp: Date.now() });
    this.emitFeedback({
      kind: "mode_changed",
      message: `Control mode ${previous} → ${mode}`,
      meta: { mode, previous },
    });
    this.emitSafetyStatus();
  }

  emergencyStop(reason?: string): void {
    this.watchdog.stop();
    this.confirmMgr.cancelAll();
    const { event, command } = this.safety.emergencyStop(reason);
    this.emitSafety(event);
    this.robot.emergencyStop();
    void this.safeExecute(command);
    this.emit("control", false);
    this.emitStatus("estop", event.message);
    this.emitSafetyStatus();
  }

  clearEmergencyStop(): void {
    const event = this.safety.clearEmergencyStop();
    this.emitSafety(event);
    this.clearRobotEstop();
    this.emitSafetyStatus();
    this.emitStatus("connected", "E-stop cleared — enable control to resume");
  }

  isEmergencyStopActive(): boolean {
    return this.safety.isEmergencyStopActive();
  }

  // ─── Intention I/O ───────────────────────────────────────

  injectIntention(input: IntentionInput): void {
    this.assertAlive();
    const intention: NeuralIntention = {
      id: input.id ?? createId("int"),
      kind: input.kind,
      payload: input.payload,
      confidence: input.confidence,
      quality: input.quality,
      timestamp: input.timestamp ?? Date.now(),
      source: input.source ?? "manual",
      meta: input.meta,
    };
    this.handleIntention(intention);
  }

  /** Explicit BCI liveness heartbeat (when no intention is flowing). */
  heartbeat(): void {
    this.watchdog.beat();
    this.safety.setWatchdogAlive(true);
  }

  getRobotState(): RobotState {
    return this.robot.getState();
  }

  getSafetyStatus(): SafetyStatus {
    const s = this.safety.getStatus();
    return {
      ...s,
      pendingConfirmations: this.confirmMgr.count(),
    };
  }

  getPendingConfirmations(): PendingConfirmation[] {
    return this.confirmMgr.getPending();
  }

  getActiveTask(): ActiveTask | null {
    return this.activeTask;
  }

  updateSafety(partial: Partial<SafetyConfig>): void {
    this.safety.updateConfig(partial);
    this.confirmMgr.updateConfig(partial);
    this.watchdog.updateConfig(partial);
    this.emitSafetyStatus();
  }

  // ─── Session recording ───────────────────────────────────

  startRecording(meta?: Record<string, unknown>): void {
    if (!this.recorder) {
      this.recorder = new SessionRecorder(true);
    }
    this.recorder.start(meta);
    this.log.info("Session recording started");
  }

  stopRecording(): SessionRecording {
    if (!this.recorder) {
      return {
        version: 1,
        id: createId("session"),
        startedAt: Date.now(),
        endedAt: Date.now(),
        events: [],
      };
    }
    const rec = this.recorder.stop();
    this.log.info(`Session recording stopped (${rec.events.length} events)`);
    return rec;
  }

  getRecording(): SessionRecording | null {
    return this.recorder?.toJSON() ?? null;
  }

  getBciBackend(): BciBackend {
    return this.bci;
  }

  getRobotBackend(): RobotBackend {
    return this.robot;
  }

  playScenario(nameOrSteps?: string | ScenarioStep[]): void {
    if (this.bci instanceof SimulatorBciBackend) {
      if (nameOrSteps === undefined) {
        this.bci.startScenario();
      } else if (typeof nameOrSteps === "string") {
        this.bci.startScenario(resolveScenario(nameOrSteps));
      } else {
        this.bci.startScenario(nameOrSteps);
      }
      return;
    }
    if (this.bci instanceof PlaybackBciBackend) {
      this.bci.start();
      return;
    }
    this.bci.start?.();
  }

  loadPlayback(recording: SessionRecording): void {
    if (this.bci instanceof PlaybackBciBackend) {
      this.bci.loadRecording(recording);
      return;
    }
    throw new Error(
      `loadPlayback requires bciBackend "playback" or "recording" (got ${this.bci.id})`
    );
  }

  dispose(): void {
    this.watchdog.dispose();
    this.stopConfirmSweeper();
    void this.disconnect();
    this.bci.dispose?.();
    this.robot.dispose?.();
    this.removeAllListeners();
    this.disposed = true;
  }

  // ─── Internals ───────────────────────────────────────────

  private wireBackends(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];

    this.unsubs.push(
      this.bci.onIntention((intention) => this.handleIntention(intention))
    );

    this.unsubs.push(
      this.robot.onState((state) => {
        this.emit("robotState", state);
        this.recorder?.recordRobotState(state);
      })
    );

    if (this.robot.onFeedback) {
      this.unsubs.push(
        this.robot.onFeedback((fb) => {
          this.emit("feedback", fb);
          this.syncTaskFromFeedback(fb);
        })
      );
    }

    if (this.bci.onError) {
      this.unsubs.push(
        this.bci.onError((error) => {
          this.emit("error", { error, context: "bci", timestamp: Date.now() });
        })
      );
    }
    if (this.robot.onError) {
      this.unsubs.push(
        this.robot.onError((error) => {
          this.emit("error", { error, context: "robot", timestamp: Date.now() });
        })
      );
    }
  }

  private handleIntention(intention: NeuralIntention): void {
    this.watchdog.beat(intention.timestamp || Date.now());
    this.safety.setWatchdogAlive(true);

    this.emit("intention", intention);
    this.recorder?.recordIntention(intention);

    // Confirm / reject are special
    if (intention.kind === "confirm") {
      this.handleConfirm(intention);
      return;
    }
    if (intention.kind === "reject") {
      this.handleReject(intention);
      return;
    }

    // Pre-gate: does this need confirm?
    const mode = this.safety.getControlMode();
    if (
      this.safety.isControlEnabled() &&
      this.confirmMgr.requiresConfirm(intention, mode) &&
      !intention.meta?.confirmed
    ) {
      // Still run confidence/age gates lightly via evaluate with a no-op path
      // Use evaluate first to reject low confidence before proposing
      const pre = this.safety.evaluate(intention, translateIntention);
      if (!pre.allowed) {
        if (pre.event) this.emitSafety(pre.event);
        this.emit("intentionRejected", intention, pre.event?.message ?? "rejected");
        this.emitLatency(intention, pre.gateMs ?? 0);
        return;
      }
      // Don't execute — propose confirm instead
      // Undo accept side-effects by not executing; rate limit already counted which is fine
      const taskName =
        intention.kind === "task"
          ? (intention.payload as TaskPayload | undefined)?.task
          : intention.kind;
      const pending = this.confirmMgr.propose(
        intention,
        `Confirm ${taskName ?? intention.kind}?`
      );
      const event = this.safety.record(
        "confirm_required",
        "info",
        pending.message,
        intention.id,
        undefined,
        { confirmationId: pending.id }
      );
      this.emitSafety(event);
      this.emit("pendingConfirm", pending);
      this.emitFeedback({
        kind: "awaiting_confirm",
        message: pending.message,
        intentionId: intention.id,
        meta: { confirmationId: pending.id },
      });
      this.emitLatency(intention, pre.gateMs ?? 0);
      return;
    }

    const decision = this.safety.evaluate(intention, translateIntention);

    if (decision.event) {
      this.emitSafety(decision.event);
    }

    this.emitLatency(intention, decision.gateMs ?? 0);

    if (!decision.allowed || !decision.command) {
      // cancel may be allowed without command if only clearing confirmations
      if (intention.kind === "cancel") {
        this.confirmMgr.cancelAll();
        if (this.activeTask) {
          this.activeTask = {
            ...this.activeTask,
            status: "cancelled",
            message: "Cancelled",
          };
          this.emit("task", this.activeTask);
        }
        if (decision.command) {
          this.emit("command", decision.command);
          this.recorder?.recordCommand(decision.command);
          void this.safeExecute(decision.command, intention, decision.gateMs);
        }
        return;
      }
      const reason = decision.event?.message ?? "rejected";
      this.emit("intentionRejected", intention, reason);
      return;
    }

    if (decision.command.kind === "execute_task" && decision.command.task) {
      this.activeTask = {
        id: decision.command.task.taskId ?? createId("task"),
        task: decision.command.task.name,
        status: "running",
        intentionId: intention.id,
        startedAt: Date.now(),
        progress: 0,
        message: `Running ${decision.command.task.name}`,
      };
      this.emit("task", this.activeTask);
    }

    if (decision.command.kind === "cancel_task") {
      this.confirmMgr.cancelAll();
      if (this.activeTask) {
        this.activeTask = { ...this.activeTask, status: "cancelled" };
        this.emit("task", this.activeTask);
        this.activeTask = null;
      }
    }

    this.emit("command", decision.command);
    this.recorder?.recordCommand(decision.command);
    void this.safeExecute(decision.command, intention, decision.gateMs);
  }

  private handleConfirm(intention: NeuralIntention): void {
    const payload = intention.payload as ConfirmPayload | undefined;
    // Gate confidence
    const minConf =
      this.config.safety?.minConfidence ?? DEFAULT_SAFETY.minConfidence;
    if (intention.confidence < minConf) {
      const event = this.safety.record(
        "low_confidence",
        "info",
        `Confirm confidence ${intention.confidence} < ${minConf}`,
        intention.id
      );
      this.emitSafety(event);
      this.emit("intentionRejected", intention, event.message);
      return;
    }

    const pending = this.confirmMgr.confirm(payload?.confirmationId);
    if (!pending) {
      const event = this.safety.record(
        "invalid_payload",
        "warning",
        "No pending confirmation to confirm",
        intention.id
      );
      this.emitSafety(event);
      this.emit("intentionRejected", intention, event.message);
      return;
    }

    const snap = pending.snapshot;
    const confirmed: NeuralIntention = {
      id: createId("int"),
      kind: snap.kind as NeuralIntention["kind"],
      payload: snap.payload as NeuralIntention["payload"],
      confidence: typeof snap.confidence === "number" ? snap.confidence : intention.confidence,
      quality: snap.quality as number | undefined,
      timestamp: Date.now(), // fresh timestamp so TTL passes
      source: (snap.source as string) ?? "confirm",
      meta: { ...(snap.meta as object), confirmed: true, confirmationId: pending.id },
    };

    this.emitFeedback({
      kind: "info",
      message: `Confirmed ${pending.kind}`,
      intentionId: confirmed.id,
      meta: { confirmationId: pending.id },
    });

    // Re-enter pipeline with confirmed flag (skip confirm gate)
    this.handleIntention(confirmed);
  }

  private handleReject(intention: NeuralIntention): void {
    const payload = intention.payload as ConfirmPayload | undefined;
    const pending = this.confirmMgr.reject(payload?.confirmationId);
    if (!pending) {
      this.emit("intentionRejected", intention, "No pending confirmation to reject");
      return;
    }
    const event = this.safety.record(
      "manual_override",
      "info",
      `Rejected confirmation ${pending.id}`,
      intention.id
    );
    this.emitSafety(event);
    this.emitFeedback({
      kind: "task_cancelled",
      message: `Rejected: ${pending.message}`,
      intentionId: intention.id,
      meta: { confirmationId: pending.id },
    });
  }

  private async safeExecute(
    command: RobotCommand,
    intention?: NeuralIntention,
    gateMs?: number
  ): Promise<void> {
    const t0 = Date.now();
    try {
      await this.robot.execute(command);
      if (intention) {
        const executeMs = Date.now() - t0;
        const sample: LatencySample = {
          intentionId: intention.id,
          gateMs: gateMs ?? 0,
          executeMs,
          endToEndMs: Date.now() - intention.timestamp,
          timestamp: Date.now(),
        };
        this.emit("latency", sample);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.log.error("Robot execute failed", error);
      this.emit("error", {
        error,
        context: "robot.execute",
        timestamp: Date.now(),
      });
      const event = this.safety.record(
        "backend_error",
        "critical",
        error.message,
        intention?.id,
        command.id
      );
      this.emitSafety(event);
    }
  }

  private onWatchdogTimeout(idleMs: number): void {
    const action =
      this.config.safety?.watchdogAction ?? DEFAULT_SAFETY.watchdogAction;
    this.safety.setWatchdogAlive(false);
    this.emitFeedback({
      kind: "watchdog",
      message: `BCI liveness timeout (${idleMs}ms)`,
      severity: "critical",
      meta: { idleMs, action },
    });

    if (action === "estop") {
      this.emergencyStop(`Watchdog timeout (${idleMs}ms)`);
    } else {
      const { event, command } = this.safety.failSafeStop(
        `Watchdog timeout — no intention for ${idleMs}ms`
      );
      this.emitSafety(event);
      this.confirmMgr.cancelAll();
      void this.safeExecute(command);
      this.emit("control", false);
      this.emitStatus("watchdog_timeout", event.message);
      this.emitSafetyStatus();
    }
  }

  private syncTaskFromFeedback(fb: RobotFeedback): void {
    if (!this.activeTask || !fb.taskId) return;
    if (fb.taskId !== this.activeTask.id && this.activeTask.id !== fb.taskId) {
      // still update if we only have one active
    }
    if (fb.kind === "task_completed") {
      this.activeTask = {
        ...this.activeTask,
        status: "succeeded",
        progress: 1,
        message: fb.message,
      };
      this.emit("task", this.activeTask);
      this.activeTask = null;
    } else if (fb.kind === "task_failed") {
      this.activeTask = {
        ...this.activeTask,
        status: "failed",
        message: fb.message,
      };
      this.emit("task", this.activeTask);
      this.activeTask = null;
    } else if (fb.kind === "task_cancelled") {
      this.activeTask = {
        ...this.activeTask,
        status: "cancelled",
        message: fb.message,
      };
      this.emit("task", this.activeTask);
      this.activeTask = null;
    } else if (fb.kind === "task_progress" && fb.progress !== undefined) {
      this.activeTask = {
        ...this.activeTask,
        progress: fb.progress,
        message: fb.message,
      };
      this.emit("task", this.activeTask);
    }
  }

  private startConfirmSweeper(): void {
    this.stopConfirmSweeper();
    this.confirmTimer = setInterval(() => {
      const expired = this.confirmMgr.purgeExpired();
      for (const p of expired) {
        const event = this.safety.record(
          "confirm_timeout",
          "warning",
          `Confirmation timed out: ${p.message}`,
          p.intentionId,
          undefined,
          { confirmationId: p.id }
        );
        this.emitSafety(event);
        this.emitFeedback({
          kind: "confirm_timeout",
          message: `Confirmation timed out for ${p.kind}`,
          intentionId: p.intentionId,
          meta: { confirmationId: p.id },
        });
      }
    }, 200);
  }

  private stopConfirmSweeper(): void {
    if (this.confirmTimer) {
      clearInterval(this.confirmTimer);
      this.confirmTimer = null;
    }
  }

  private clearRobotEstop(): void {
    if (this.robot instanceof SimulatedArmBackend) {
      this.robot.clearEstop();
    }
    if (this.robot instanceof SimulatedHumanoidBackend) {
      this.robot.clearEstop();
    }
  }

  private emitStatus(status: BridgeStatus, message?: string): void {
    this.emit("status", { status, message, timestamp: Date.now() });
  }

  private emitSafety(event: import("../types/safety.js").SafetyEvent): void {
    this.emit("safetyEvent", event);
    this.recorder?.recordSafetyEvent(event);
  }

  private emitSafetyStatus(): void {
    this.emit("safetyStatus", this.getSafetyStatus());
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
    this.emit("feedback", fb);
  }

  private emitLatency(
    intention: NeuralIntention,
    gateMs: number
  ): void {
    this.emit("latency", {
      intentionId: intention.id,
      gateMs,
      timestamp: Date.now(),
    });
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error("NeuroBridge has been disposed");
    }
  }
}
