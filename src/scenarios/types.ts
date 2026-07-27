/**
 * Golden scenario definitions for CI regression of safety + skills.
 */

import type { IntentionInput } from "../types/intention.js";
import type { NeuraRoboBridgeConfig } from "../types/config.js";

/** Expected outcome of a scenario step or whole scenario. */
export type ScenarioExpectation =
  | { type: "command"; kind: string }
  | { type: "rejected"; reasonIncludes?: string }
  | { type: "safety"; reason: string }
  | { type: "skill"; status: string; name?: string }
  | { type: "feedback"; kind: string }
  | { type: "control"; enabled: boolean }
  | { type: "estop"; active: boolean }
  | { type: "mode"; mode: string };

export interface ScenarioStepDef {
  /** Human label for failures. */
  name: string;
  /** Optional delay before this step (ms). */
  delayMs?: number;
  /** Inject this intention (if set). */
  inject?: IntentionInput;
  /** Call bridge API instead of inject. */
  action?:
    | "connect"
    | "enableControl"
    | "disableControl"
    | "emergencyStop"
    | "clearEmergencyStop"
    | "enableShared";
  /** Assertions after the step settles. */
  expect?: ScenarioExpectation[];
  /** Wait for async skill/settling (ms). Default 0; skills use 50–2000. */
  settleMs?: number;
}

export interface GoldenScenario {
  id: string;
  title: string;
  description: string;
  /** Bridge config overrides (merged with safe CI defaults). */
  config?: NeuraRoboBridgeConfig;
  steps: ScenarioStepDef[];
}

export interface ScenarioTraceEvent {
  at: number;
  kind: string;
  detail: string;
}

export interface ScenarioStepResult {
  name: string;
  ok: boolean;
  errors: string[];
  trace: ScenarioTraceEvent[];
}

export interface ScenarioRunResult {
  id: string;
  title: string;
  ok: boolean;
  steps: ScenarioStepResult[];
  durationMs: number;
}
