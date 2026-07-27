/**
 * Run a GoldenScenario against a real NeuraRoboBridge instance.
 */

import { NeuraRoboBridge } from "../core/NeuraRoboBridge.js";
import type {
  GoldenScenario,
  ScenarioExpectation,
  ScenarioRunResult,
  ScenarioStepResult,
  ScenarioTraceEvent,
} from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface Collector {
  commands: string[];
  rejected: string[];
  safety: string[];
  skills: Array<{ status: string; name: string }>;
  feedback: string[];
  control: boolean[];
  modes: string[];
  estop: boolean[];
  events: ScenarioTraceEvent[];
}

function attachCollector(bridge: NeuraRoboBridge): Collector {
  const c: Collector = {
    commands: [],
    rejected: [],
    safety: [],
    skills: [],
    feedback: [],
    control: [],
    modes: [],
    estop: [],
    events: [],
  };
  const t0 = Date.now();
  const push = (kind: string, detail: string) => {
    c.events.push({ at: Date.now() - t0, kind, detail });
  };

  bridge.on("command", (cmd) => {
    c.commands.push(cmd.kind);
    push("command", cmd.kind);
  });
  bridge.on("intentionRejected", (_i, reason) => {
    c.rejected.push(reason);
    push("rejected", reason);
  });
  bridge.on("safetyEvent", (e) => {
    c.safety.push(e.reason);
    push("safety", e.reason);
  });
  bridge.on("skill", (s) => {
    c.skills.push({ status: s.status, name: s.skillName });
    push("skill", `${s.skillName}:${s.status}`);
  });
  bridge.on("feedback", (f) => {
    c.feedback.push(f.kind);
    push("feedback", f.kind);
  });
  bridge.on("control", (enabled) => {
    c.control.push(enabled);
    push("control", String(enabled));
  });
  bridge.on("controlMode", (e) => {
    c.modes.push(e.mode);
    push("mode", e.mode);
  });
  bridge.on("status", (e) => {
    if (e.status === "estop") {
      c.estop.push(true);
      push("estop", "true");
    }
  });

  return c;
}

function checkExpect(
  bridge: NeuraRoboBridge,
  c: Collector,
  expects: ScenarioExpectation[]
): string[] {
  const errors: string[] = [];
  for (const exp of expects) {
    switch (exp.type) {
      case "command":
        if (!c.commands.includes(exp.kind)) {
          errors.push(
            `expected command "${exp.kind}", got [${c.commands.join(", ")}]`
          );
        }
        break;
      case "rejected":
        if (c.rejected.length === 0) {
          errors.push("expected intentionRejected, got none");
        } else if (
          exp.reasonIncludes &&
          !c.rejected.some((r) =>
            r.toLowerCase().includes(exp.reasonIncludes!.toLowerCase())
          )
        ) {
          errors.push(
            `expected rejection including "${exp.reasonIncludes}", got [${c.rejected.join(" | ")}]`
          );
        }
        break;
      case "safety":
        if (!c.safety.includes(exp.reason)) {
          errors.push(
            `expected safety reason "${exp.reason}", got [${c.safety.join(", ")}]`
          );
        }
        break;
      case "skill": {
        const match = c.skills.some(
          (s) =>
            s.status === exp.status &&
            (exp.name === undefined || s.name === exp.name)
        );
        if (!match) {
          errors.push(
            `expected skill status="${exp.status}"${exp.name ? ` name=${exp.name}` : ""}, got ${JSON.stringify(c.skills)}`
          );
        }
        break;
      }
      case "feedback":
        if (!c.feedback.includes(exp.kind)) {
          errors.push(
            `expected feedback "${exp.kind}", got [${c.feedback.join(", ")}]`
          );
        }
        break;
      case "control":
        if (bridge.isControlEnabled() !== exp.enabled) {
          // also accept last control event
          const last = c.control[c.control.length - 1];
          if (last !== exp.enabled && bridge.isControlEnabled() !== exp.enabled) {
            errors.push(
              `expected control enabled=${exp.enabled}, got ${bridge.isControlEnabled()}`
            );
          }
        }
        break;
      case "estop":
        if (bridge.isEmergencyStopActive() !== exp.active) {
          errors.push(
            `expected estop=${exp.active}, got ${bridge.isEmergencyStopActive()}`
          );
        }
        break;
      case "mode":
        if (bridge.getControlMode() !== exp.mode) {
          errors.push(
            `expected mode=${exp.mode}, got ${bridge.getControlMode()}`
          );
        }
        break;
      default:
        break;
    }
  }
  return errors;
}

function resetCollector(c: Collector): void {
  c.commands = [];
  c.rejected = [];
  c.safety = [];
  // keep skill history for multi-step; but also track latest — for per-step expects we slice
  // For expects we need events *during this step*, so clear all transient channels.
  // Skills: keep full history is better for final status — clear and re-check after settle.
  c.skills = [];
  c.feedback = [];
  c.control = [];
  c.modes = [];
  c.estop = [];
  c.events = [];
}

/**
 * Execute one golden scenario. Always disposes the bridge.
 */
export async function runGoldenScenario(
  scenario: GoldenScenario
): Promise<ScenarioRunResult> {
  const t0 = Date.now();
  const bridge = new NeuraRoboBridge({
    logLevel: "silent",
    ...scenario.config,
    safety: {
      watchdogTimeoutMs: 0,
      minCommandIntervalMs: 0,
      ...scenario.config?.safety,
    },
  });
  const collector = attachCollector(bridge);
  const stepResults: ScenarioStepResult[] = [];

  try {
    for (const step of scenario.steps) {
      resetCollector(collector);
      const errors: string[] = [];

      if (step.delayMs) await sleep(step.delayMs);

      try {
        switch (step.action) {
          case "connect":
            await bridge.connect();
            break;
          case "enableControl":
            await bridge.enableControl();
            break;
          case "enableShared":
            await bridge.enableControl("shared");
            break;
          case "disableControl":
            await bridge.disableControl();
            break;
          case "emergencyStop":
            bridge.emergencyStop("scenario");
            break;
          case "clearEmergencyStop":
            bridge.clearEmergencyStop();
            break;
          default:
            break;
        }
        if (step.inject) {
          bridge.injectIntention(step.inject);
        }
      } catch (err) {
        errors.push(
          `action threw: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      const settle = step.settleMs ?? 20;
      if (settle > 0) await sleep(settle);

      // Skill expectations: also peek current skill if still active
      const active = bridge.getActiveSkill();
      if (active) {
        collector.skills.push({
          status: active.status,
          name: active.skillName,
        });
      }

      if (step.expect?.length) {
        errors.push(...checkExpect(bridge, collector, step.expect));
      }

      stepResults.push({
        name: step.name,
        ok: errors.length === 0,
        errors,
        trace: [...collector.events],
      });
    }
  } finally {
    bridge.dispose();
  }

  const ok = stepResults.every((s) => s.ok);
  return {
    id: scenario.id,
    title: scenario.title,
    ok,
    steps: stepResults,
    durationMs: Date.now() - t0,
  };
}

/** Run all scenarios; returns aggregate results. */
export async function runAllGoldenScenarios(
  scenarios: GoldenScenario[]
): Promise<ScenarioRunResult[]> {
  const out: ScenarioRunResult[] = [];
  for (const s of scenarios) {
    out.push(await runGoldenScenario(s));
  }
  return out;
}
