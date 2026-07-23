/**
 * Confirm-to-execute for high-risk intentions / tasks.
 */

import type { NeuralIntention } from "../types/intention.js";
import type { TaskPayload } from "../types/task.js";
import type { PendingConfirmation } from "../types/task.js";
import type { SafetyConfig } from "../types/safety.js";
import { DEFAULT_CONFIRM_TASKS, DEFAULT_SAFETY } from "../core/defaults.js";
import { createId } from "../core/id.js";
import type { ControlMode } from "../types/control.js";

export class ConfirmManager {
  private pending = new Map<string, PendingConfirmation>();
  private config: SafetyConfig;

  constructor(config: SafetyConfig = {}) {
    this.config = config;
  }

  updateConfig(partial: Partial<SafetyConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /**
   * Whether this intention must be confirmed before execution.
   * stop/cancel/confirm/reject never require confirm.
   */
  requiresConfirm(
    intention: NeuralIntention,
    mode: ControlMode
  ): boolean {
    if (
      intention.kind === "stop" ||
      intention.kind === "cancel" ||
      intention.kind === "confirm" ||
      intention.kind === "reject" ||
      intention.kind === "modulate"
    ) {
      return false;
    }

    // teleop skips confirm for continuous research mapping (except explicit list)
    if (mode === "teleop") {
      const kinds = this.config.confirmIntentions ?? [];
      return kinds.includes(intention.kind);
    }

    if (mode === "disabled") return false;

    const confirmKinds = this.config.confirmIntentions ?? [];
    if (confirmKinds.includes(intention.kind)) return true;

    if (intention.kind === "navigate") {
      return this.config.confirmNavigate ?? DEFAULT_SAFETY.confirmNavigate;
    }

    if (intention.kind === "task") {
      const payload = intention.payload as TaskPayload | undefined;
      if (payload?.requireConfirm === false) return false;
      if (payload?.requireConfirm === true) return true;
      const list = this.config.confirmTasks ?? DEFAULT_CONFIRM_TASKS;
      return payload?.task ? list.includes(payload.task) : true;
    }

    // supervised: grasp with high force could be added later; default off
    return false;
  }

  propose(intention: NeuralIntention, message: string): PendingConfirmation {
    const ttl = this.config.confirmTimeoutMs ?? DEFAULT_SAFETY.confirmTimeoutMs;
    const now = Date.now();
    const payload = intention.payload as TaskPayload | undefined;
    const pending: PendingConfirmation = {
      id: createId("cnf"),
      intentionId: intention.id,
      task: payload?.task,
      kind: intention.kind,
      message,
      createdAt: now,
      expiresAt: now + ttl,
      snapshot: {
        id: intention.id,
        kind: intention.kind,
        payload: intention.payload,
        confidence: intention.confidence,
        quality: intention.quality,
        source: intention.source,
        meta: { ...(intention.meta ?? {}), confirmed: true },
      },
    };
    this.pending.set(pending.id, pending);
    return pending;
  }

  /** Confirm by id or latest pending. Returns snapshot intention fields or null. */
  confirm(confirmationId?: string): PendingConfirmation | null {
    this.purgeExpired();
    if (confirmationId) {
      const p = this.pending.get(confirmationId);
      if (!p) return null;
      this.pending.delete(confirmationId);
      return p;
    }
    // Latest by createdAt
    let latest: PendingConfirmation | null = null;
    for (const p of this.pending.values()) {
      if (!latest || p.createdAt > latest.createdAt) latest = p;
    }
    if (latest) this.pending.delete(latest.id);
    return latest;
  }

  reject(confirmationId?: string): PendingConfirmation | null {
    this.purgeExpired();
    if (confirmationId) {
      const p = this.pending.get(confirmationId);
      if (!p) return null;
      this.pending.delete(confirmationId);
      return p;
    }
    let latest: PendingConfirmation | null = null;
    for (const p of this.pending.values()) {
      if (!latest || p.createdAt > latest.createdAt) latest = p;
    }
    if (latest) this.pending.delete(latest.id);
    return latest;
  }

  cancelAll(): PendingConfirmation[] {
    const all = [...this.pending.values()];
    this.pending.clear();
    return all;
  }

  getPending(): PendingConfirmation[] {
    this.purgeExpired();
    return [...this.pending.values()];
  }

  count(): number {
    this.purgeExpired();
    return this.pending.size;
  }

  /** Remove expired; returns list of timed-out confirmations. */
  purgeExpired(): PendingConfirmation[] {
    const now = Date.now();
    const expired: PendingConfirmation[] = [];
    for (const [id, p] of this.pending) {
      if (now >= p.expiresAt) {
        expired.push(p);
        this.pending.delete(id);
      }
    }
    return expired;
  }
}
