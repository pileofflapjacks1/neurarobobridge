/**
 * SafetyEngine — non-negotiable gates between neural intent and robot action.
 *
 * Order of checks:
 * 1. Emergency stop
 * 2. Stale intention (TTL)
 * 3. Control enable / mode
 * 4. Confidence / quality thresholds
 * 5. Allowed intention kinds
 * 6. Rate limiting
 * 7. Capability match
 * 8. Payload validation + workspace / joint limits
 */

import type { NeuralIntention, MovePayload, Vec3 } from "../types/intention.js";
import type {
  SafetyConfig,
  SafetyEvent,
  SafetyReason,
  SafetySeverity,
  SafetyStatus,
} from "../types/safety.js";
import type { RobotCommand, WorkspaceLimits } from "../types/robot.js";
import type { RobotCapabilities } from "../types/capabilities.js";
import type { ControlMode } from "../types/control.js";
import { priorityOf, priorityRank } from "../types/control.js";
import { DEFAULT_SAFETY } from "../core/defaults.js";
import { createId } from "../core/id.js";
import type { Logger } from "../core/Logger.js";

const DISCRETE_KINDS = new Set([
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

function isDiscreteKind(kind: string): boolean {
  return DISCRETE_KINDS.has(kind);
}

export interface SafetyDecision {
  allowed: boolean;
  /** Present when allowed (possibly modified for maxSpeed etc.). */
  command?: RobotCommand;
  event?: SafetyEvent;
  /** Intention needs human confirm before execution. */
  needsConfirm?: boolean;
  /** Gate latency ms from intention timestamp to decision. */
  gateMs?: number;
}

export class SafetyEngine {
  private config: SafetyConfig;
  private controlEnabled = false;
  private emergencyStopActive = false;
  private controlMode: ControlMode = "disabled";
  private intentionTimestamps: number[] = [];
  private lastCommandAt = 0;
  private lastAcceptedPriority = 0;
  private recentInterventions: SafetyEvent[] = [];
  private readonly maxRecent = 100;
  private capabilities: RobotCapabilities | null = null;
  private lastIntentionAt?: number;
  private watchdogAlive = true;

  constructor(
    config: SafetyConfig = {},
    private log?: Logger
  ) {
    this.config = { ...DEFAULT_SAFETY, ...config };
  }

  updateConfig(partial: Partial<SafetyConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  getConfig(): SafetyConfig {
    return { ...this.config };
  }

  setCapabilities(caps: RobotCapabilities | null): void {
    this.capabilities = caps;
    if (caps?.workspaceLimits && !this.config.workspaceLimits) {
      this.config = { ...this.config, workspaceLimits: caps.workspaceLimits };
    }
    if (caps?.jointLimits && !this.config.jointLimits) {
      this.config = { ...this.config, jointLimits: caps.jointLimits };
    }
    if (caps?.maxSpeed !== undefined) {
      const cur = this.config.maxSpeed ?? 1;
      this.config = {
        ...this.config,
        maxSpeed: Math.min(cur, caps.maxSpeed),
      };
    }
  }

  getCapabilities(): RobotCapabilities | null {
    return this.capabilities;
  }

  setWatchdogAlive(alive: boolean): void {
    this.watchdogAlive = alive;
  }

  noteIntention(at = Date.now()): void {
    this.lastIntentionAt = at;
  }

  getStatus(): SafetyStatus {
    return {
      controlEnabled: this.controlEnabled && !this.emergencyStopActive,
      emergencyStopActive: this.emergencyStopActive,
      controlMode: this.controlMode,
      watchdogAlive: this.watchdogAlive,
      lastIntentionAt: this.lastIntentionAt,
      pendingConfirmations: 0, // filled by NeuroBridge if needed
      recentInterventions: this.recentInterventions.length,
      lastIntervention: this.recentInterventions[this.recentInterventions.length - 1],
      config: {
        minConfidence: this.config.minConfidence ?? DEFAULT_SAFETY.minConfidence,
        maxIntentionsPerSecond:
          this.config.maxIntentionsPerSecond ?? DEFAULT_SAFETY.maxIntentionsPerSecond,
        minCommandIntervalMs:
          this.config.minCommandIntervalMs ?? DEFAULT_SAFETY.minCommandIntervalMs,
        enableEmergencyStop:
          this.config.enableEmergencyStop ?? DEFAULT_SAFETY.enableEmergencyStop,
        maxIntentionAgeMs:
          this.config.maxIntentionAgeMs ?? DEFAULT_SAFETY.maxIntentionAgeMs,
        watchdogTimeoutMs:
          this.config.watchdogTimeoutMs ?? DEFAULT_SAFETY.watchdogTimeoutMs,
        ...this.config,
      },
    };
  }

  getControlMode(): ControlMode {
    return this.controlMode;
  }

  setControlMode(mode: ControlMode): ControlMode {
    const prev = this.controlMode;
    this.controlMode = mode;
    if (mode === "disabled") {
      this.controlEnabled = false;
    } else {
      this.controlEnabled = true;
    }
    this.log?.info(`Control mode → ${mode}`);
    return prev;
  }

  setControlEnabled(enabled: boolean): SafetyEvent | undefined {
    if (!enabled) {
      this.controlEnabled = false;
      this.controlMode = "disabled";
      return this.record(
        "manual_override",
        "info",
        "Control disabled — motion commands will be blocked"
      );
    }
    if (this.emergencyStopActive) {
      this.log?.warn("Control enable requested while e-stop active; still blocked");
      return this.record(
        "emergency_stop",
        "warning",
        "Cannot enable control while emergency stop is active — call clearEmergencyStop() first"
      );
    }
    this.controlEnabled = true;
    if (this.controlMode === "disabled") {
      this.controlMode =
        this.config.defaultControlMode ?? DEFAULT_SAFETY.defaultControlMode;
    }
    this.log?.info("Control enabled", this.controlMode);
    return undefined;
  }

  isControlEnabled(): boolean {
    return this.controlEnabled && !this.emergencyStopActive && this.controlMode !== "disabled";
  }

  emergencyStop(reason = "Emergency stop activated"): {
    event: SafetyEvent;
    command: RobotCommand;
  } {
    this.emergencyStopActive = true;
    this.controlEnabled = false;
    this.controlMode = "disabled";
    const event = this.record("emergency_stop", "critical", reason);
    const command: RobotCommand = {
      id: createId("cmd"),
      kind: "estop",
      timestamp: Date.now(),
      forced: true,
      priority: "estop",
    };
    this.log?.error("EMERGENCY STOP:", reason);
    return { event, command };
  }

  clearEmergencyStop(): SafetyEvent {
    this.emergencyStopActive = false;
    this.log?.warn("Emergency stop cleared — control remains disabled until enableControl()");
    return this.record(
      "manual_override",
      "warning",
      "Emergency stop cleared; control still disabled"
    );
  }

  isEmergencyStopActive(): boolean {
    return this.emergencyStopActive;
  }

  /**
   * Soft fail-safe (watchdog): stop motion + disable control without e-stop latch
   * (unless action is estop — caller handles that).
   */
  failSafeStop(reason: string): { event: SafetyEvent; command: RobotCommand } {
    this.controlEnabled = false;
    this.controlMode = "disabled";
    const event = this.record("watchdog_timeout", "critical", reason);
    const command: RobotCommand = {
      id: createId("cmd"),
      kind: "stop",
      timestamp: Date.now(),
      forced: true,
      priority: "stop",
    };
    this.log?.error("FAIL-SAFE STOP:", reason);
    return { event, command };
  }

  /**
   * Validate an intention and translate to a robot command if safe.
   */
  evaluate(
    intention: NeuralIntention,
    translate: (i: NeuralIntention) => RobotCommand | null,
    opts?: { skipConfirmGate?: boolean }
  ): SafetyDecision {
    const now = Date.now();
    const gateStart = now;
    this.noteIntention(intention.timestamp || now);

    // 1. E-stop
    if (this.emergencyStopActive) {
      return this.reject(intention, "emergency_stop", "critical", "Emergency stop is active", gateStart);
    }

    // 2. Stale intention (TTL) — stop/cancel/confirm always allowed through age gate for safety
    const alwaysFresh = intention.kind === "stop" || intention.kind === "cancel" || intention.kind === "confirm" || intention.kind === "reject";
    if (!alwaysFresh && intention.timestamp) {
      const age = now - intention.timestamp;
      const maxAge = isDiscreteKind(intention.kind)
        ? (this.config.maxTaskAgeMs ?? DEFAULT_SAFETY.maxTaskAgeMs)
        : (this.config.maxIntentionAgeMs ?? DEFAULT_SAFETY.maxIntentionAgeMs);
      if (age > maxAge) {
        return this.reject(
          intention,
          "stale_intention",
          "warning",
          `Intention age ${age}ms > max ${maxAge}ms`,
          gateStart,
          { age, maxAge }
        );
      }
    }

    // 3. Control enable / mode (stop always allowed)
    const bypassEnable =
      intention.kind === "stop" ||
      intention.kind === "cancel" ||
      intention.kind === "confirm" ||
      intention.kind === "reject";

    if (!this.controlEnabled && !bypassEnable) {
      return this.reject(
        intention,
        "control_disabled",
        "warning",
        "Control is disabled — call enableControl() first",
        gateStart
      );
    }

    if (this.controlMode === "disabled" && !bypassEnable) {
      return this.reject(
        intention,
        "mode_forbidden",
        "warning",
        "Control mode is disabled",
        gateStart
      );
    }

    // Continuous motion only in teleop / shared / supervised (not pure autonomous_task for free move)
    if (
      intention.kind === "move" &&
      this.controlMode === "autonomous_task" &&
      !bypassEnable
    ) {
      return this.reject(
        intention,
        "mode_forbidden",
        "info",
        "Continuous move not allowed in autonomous_task mode — use task or modulate",
        gateStart
      );
    }

    // 4. Confidence (confirm/reject/stop still need min confidence for integrity)
    const minConf = this.config.minConfidence ?? DEFAULT_SAFETY.minConfidence;
    const confFloor =
      intention.kind === "stop" || intention.kind === "cancel"
        ? Math.min(minConf, 0.5)
        : minConf;
    if (intention.confidence < confFloor) {
      return this.reject(
        intention,
        "low_confidence",
        "info",
        `Confidence ${intention.confidence.toFixed(3)} < min ${confFloor}`,
        gateStart
      );
    }

    // 5. Quality
    if (this.config.requireQuality && intention.quality === undefined) {
      return this.reject(
        intention,
        "low_quality",
        "warning",
        "Signal quality required but not provided",
        gateStart
      );
    }
    if (
      this.config.minQuality !== undefined &&
      intention.quality !== undefined &&
      intention.quality < this.config.minQuality
    ) {
      return this.reject(
        intention,
        "low_quality",
        "info",
        `Quality ${intention.quality.toFixed(3)} < min ${this.config.minQuality}`,
        gateStart
      );
    }

    // 6. Allowed kinds
    if (
      this.config.allowedIntentions &&
      this.config.allowedIntentions.length > 0 &&
      !this.config.allowedIntentions.includes(intention.kind)
    ) {
      return this.reject(
        intention,
        "unknown_intention",
        "warning",
        `Intention kind "${intention.kind}" is not in allowedIntentions`,
        gateStart
      );
    }

    // 7. Rate limiting (stop/cancel bypass interval)
    const maxPerSec =
      this.config.maxIntentionsPerSecond ?? DEFAULT_SAFETY.maxIntentionsPerSecond;
    this.intentionTimestamps = this.intentionTimestamps.filter((t) => now - t < 1000);
    if (this.intentionTimestamps.length >= maxPerSec && !bypassEnable) {
      return this.reject(
        intention,
        "rate_limit",
        "warning",
        `Rate limit: >${maxPerSec} intentions/sec`,
        gateStart
      );
    }

    const minInterval =
      this.config.minCommandIntervalMs ?? DEFAULT_SAFETY.minCommandIntervalMs;
    if (
      now - this.lastCommandAt < minInterval &&
      !bypassEnable &&
      intention.kind !== "modulate"
    ) {
      return this.reject(
        intention,
        "rate_limit",
        "info",
        `Command interval ${now - this.lastCommandAt}ms < min ${minInterval}ms`,
        gateStart
      );
    }

    // 8. Confirm/reject/cancel short-circuit (caller handles confirm manager)
    if (
      intention.kind === "confirm" ||
      intention.kind === "reject" ||
      intention.kind === "cancel"
    ) {
      // Still translate cancel; confirm/reject return needsConfirm false and null command
      if (intention.kind === "cancel") {
        const command = translate(intention);
        if (command) {
          this.markAccepted(now, intention.kind);
          return {
            allowed: true,
            command,
            gateMs: Date.now() - gateStart,
          };
        }
      }
      return {
        allowed: true,
        gateMs: Date.now() - gateStart,
      };
    }

    // 9. Translate
    let command: RobotCommand | null;
    try {
      command = translate(intention);
    } catch (err) {
      return this.reject(
        intention,
        "invalid_payload",
        "warning",
        `Translation failed: ${err instanceof Error ? err.message : String(err)}`,
        gateStart
      );
    }

    if (!command) {
      return this.reject(
        intention,
        "unknown_intention",
        "warning",
        `No translation for intention kind "${intention.kind}"`,
        gateStart
      );
    }

    // 10. Capability match
    if (this.capabilities && !command.forced) {
      const supported = this.capabilities.supportedCommands;
      if (!supported.includes(command.kind)) {
        return this.reject(
          intention,
          "capability_mismatch",
          "warning",
          `Robot does not support command "${command.kind}"`,
          gateStart
        );
      }
      if (command.kind === "navigate" && !this.capabilities.locomotion) {
        return this.reject(
          intention,
          "capability_mismatch",
          "warning",
          "Robot does not support locomotion/navigate",
          gateStart
        );
      }
      if (
        (command.kind === "set_gripper" || command.kind === "execute_task") &&
        command.kind === "set_gripper" &&
        !this.capabilities.manipulation
      ) {
        return this.reject(
          intention,
          "capability_mismatch",
          "warning",
          "Robot does not support manipulation",
          gateStart
        );
      }
    }

    // 11. Needs confirm? (caller creates pending confirmation)
    if (!opts?.skipConfirmGate) {
      // Marker only — ConfirmManager consulted by NeuroBridge
      // We expose via optional flag from outside; here just continue
    }

    // 12. Workspace limits on move commands
    const ws = this.config.workspaceLimits ?? this.capabilities?.workspaceLimits;
    if (ws && command.pose?.position) {
      const clipped = this.clipToWorkspace(command.pose.position, ws);
      if (clipped.violated) {
        if (clipped.position) {
          command = {
            ...command,
            pose: { ...command.pose, position: clipped.position },
          };
          const event = this.record(
            "workspace_violation",
            "warning",
            `Target clamped to workspace limits`,
            intention.id,
            command.id,
            { original: clipped.original, clamped: clipped.position }
          );
          this.markAccepted(now, intention.kind);
          this.applyMaxSpeed(command);
          return {
            allowed: true,
            command,
            event,
            gateMs: Date.now() - gateStart,
          };
        }
        return this.reject(
          intention,
          "workspace_violation",
          "warning",
          "Target outside workspace and could not be clamped",
          gateStart
        );
      }
    }

    // 13. Joint limits
    if (command.joints && this.config.jointLimits) {
      for (let i = 0; i < command.joints.length; i++) {
        const limit = this.config.jointLimits[i];
        const q = command.joints[i];
        if (limit === undefined || q === undefined) continue;
        if (q < limit.min || q > limit.max) {
          return this.reject(
            intention,
            "joint_limit",
            "warning",
            `Joint ${limit.name} target ${q.toFixed(3)} outside [${limit.min}, ${limit.max}]`,
            gateStart
          );
        }
      }
    }

    // 14. Priority note (preemption of lower continuous by discrete is advisory)
    command.priority = priorityOf(intention.kind);
    const rank = priorityRank(intention.kind);
    if (rank < this.lastAcceptedPriority && intention.kind === "move") {
      // Lower priority continuous while a higher discrete just fired — still allow
      // but log; hard preempt is cancel/stop only
    }

    this.applyMaxSpeed(command);
    this.markAccepted(now, intention.kind);

    this.log?.debug("Safety accepted", intention.kind, command.kind);
    return {
      allowed: true,
      command,
      gateMs: Date.now() - gateStart,
    };
  }

  private markAccepted(now: number, kind: string): void {
    this.intentionTimestamps.push(now);
    this.lastCommandAt = now;
    this.lastAcceptedPriority = priorityRank(kind);
  }

  private applyMaxSpeed(command: RobotCommand): void {
    const maxSpeed = this.config.maxSpeed ?? 1;
    if (command.speed !== undefined) {
      command.speed = Math.min(command.speed, maxSpeed);
    } else if (maxSpeed < 1) {
      command.speed = maxSpeed;
    }
  }

  private clipToWorkspace(
    p: Vec3,
    ws: WorkspaceLimits
  ): { violated: boolean; position?: Vec3; original?: Vec3 } {
    const clamped: Vec3 = {
      x: Math.min(Math.max(p.x, ws.min.x), ws.max.x),
      y: Math.min(Math.max(p.y, ws.min.y), ws.max.y),
      z: Math.min(Math.max(p.z, ws.min.z), ws.max.z),
    };
    const violated =
      clamped.x !== p.x || clamped.y !== p.y || clamped.z !== p.z;
    if (!violated) return { violated: false };
    return { violated: true, position: clamped, original: { ...p } };
  }

  private reject(
    intention: NeuralIntention,
    reason: SafetyReason,
    severity: SafetySeverity,
    message: string,
    gateStart: number,
    meta?: Record<string, unknown>
  ): SafetyDecision {
    const event = this.record(reason, severity, message, intention.id, undefined, meta);
    this.log?.debug("Safety rejected:", reason, message);
    return {
      allowed: false,
      event,
      gateMs: Date.now() - gateStart,
    };
  }

  record(
    reason: SafetyReason,
    severity: SafetySeverity,
    message: string,
    intentionId?: string,
    commandId?: string,
    meta?: Record<string, unknown>
  ): SafetyEvent {
    const event: SafetyEvent = {
      id: createId("saf"),
      reason,
      severity,
      message,
      intentionId,
      commandId,
      timestamp: Date.now(),
      meta,
    };
    this.recentInterventions.push(event);
    if (this.recentInterventions.length > this.maxRecent) {
      this.recentInterventions.shift();
    }
    return event;
  }
}

/** Extract a Vec3 position from a MovePayload target. */
export function extractPosition(payload: MovePayload | undefined): Vec3 | null {
  if (!payload?.target) return null;
  const t = payload.target;
  if ("position" in t && t.position) return t.position;
  if ("x" in t && "y" in t && "z" in t) return t as Vec3;
  return null;
}
