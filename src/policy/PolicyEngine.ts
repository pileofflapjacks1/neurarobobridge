/**
 * Chains SafetyPolicy plugins after core SafetyEngine gates.
 */

import type { SafetyPolicy, PolicyContext, PolicyResult } from "./types.js";
import type { RobotCommand } from "../types/robot.js";
import type { Logger } from "../core/Logger.js";

export class PolicyEngine {
  private policies: SafetyPolicy[] = [];

  constructor(
    policies: SafetyPolicy[] = [],
    private log?: Logger
  ) {
    this.policies = [...policies];
  }

  add(policy: SafetyPolicy): void {
    this.policies = this.policies.filter((p) => p.id !== policy.id);
    this.policies.push(policy);
  }

  remove(id: string): boolean {
    const before = this.policies.length;
    this.policies = this.policies.filter((p) => p.id !== id);
    return this.policies.length < before;
  }

  list(): SafetyPolicy[] {
    return [...this.policies];
  }

  clear(): void {
    this.policies = [];
  }

  /**
   * Run all policies. First deny wins.
   * Allowed patches are merged onto the command.
   */
  evaluate(ctx: PolicyContext): {
    allowed: boolean;
    command: RobotCommand | null;
    result?: PolicyResult;
  } {
    let command = ctx.command;

    for (const policy of this.policies) {
      const result = policy.evaluate({ ...ctx, command });
      result.policyId = policy.id;

      if (!result.allow) {
        this.log?.debug("Policy denied", policy.id, result.message);
        return { allowed: false, command, result };
      }

      if (result.patchCommand && command) {
        command = { ...command, ...result.patchCommand };
        this.log?.debug("Policy patched command", policy.id, result.patchCommand);
      }

      // Soft info patches without deny still surface last advisory
      if (result.message && result.severity === "info") {
        // continue; keep last advisory on command path
      }
    }

    return { allowed: true, command };
  }
}
