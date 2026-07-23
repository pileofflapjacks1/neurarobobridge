import { describe, it, expect, beforeEach } from "vitest";
import { SafetyEngine } from "../src/safety/SafetyEngine.js";
import { translateIntention } from "../src/core/Translator.js";
import type { NeuralIntention } from "../src/types/intention.js";
import { createId } from "../src/core/id.js";

function intent(
  partial: Partial<NeuralIntention> & Pick<NeuralIntention, "kind">
): NeuralIntention {
  return {
    id: createId("int"),
    confidence: 0.9,
    timestamp: Date.now(),
    ...partial,
  };
}

describe("SafetyEngine", () => {
  let safety: SafetyEngine;

  beforeEach(() => {
    safety = new SafetyEngine({
      minConfidence: 0.75,
      maxIntentionsPerSecond: 10,
      minCommandIntervalMs: 0,
      enableEmergencyStop: true,
      maxIntentionAgeMs: 60_000,
      maxTaskAgeMs: 60_000,
      watchdogTimeoutMs: 0,
      workspaceLimits: {
        min: { x: -0.5, y: -0.5, z: 0 },
        max: { x: 0.5, y: 0.5, z: 1 },
      },
    });
    safety.setControlEnabled(true);
  });

  it("rejects when control is disabled", () => {
    safety.setControlEnabled(false);
    const d = safety.evaluate(
      intent({
        kind: "move",
        payload: { target: { x: 0.1, y: 0, z: 0.3 } },
      }),
      translateIntention
    );
    expect(d.allowed).toBe(false);
    expect(d.event?.reason).toBe("control_disabled");
  });

  it("rejects low confidence", () => {
    const d = safety.evaluate(
      intent({
        kind: "move",
        confidence: 0.2,
        payload: { target: { x: 0.1, y: 0, z: 0.3 } },
      }),
      translateIntention
    );
    expect(d.allowed).toBe(false);
    expect(d.event?.reason).toBe("low_confidence");
  });

  it("accepts high-confidence move and produces command", () => {
    const d = safety.evaluate(
      intent({
        kind: "move",
        confidence: 0.95,
        payload: { target: { x: 0.1, y: 0, z: 0.3 }, speed: 0.5 },
      }),
      translateIntention
    );
    expect(d.allowed).toBe(true);
    expect(d.command?.kind).toBe("move_to");
    expect(d.command?.pose?.position.x).toBeCloseTo(0.1);
  });

  it("clamps workspace violations", () => {
    const d = safety.evaluate(
      intent({
        kind: "move",
        confidence: 0.95,
        payload: { target: { x: 9, y: 0, z: 0.3 } },
      }),
      translateIntention
    );
    expect(d.allowed).toBe(true);
    expect(d.command?.pose?.position.x).toBeLessThanOrEqual(0.5);
    expect(d.event?.reason).toBe("workspace_violation");
  });

  it("emergency stop blocks all subsequent motion", () => {
    safety.emergencyStop("test");
    const d = safety.evaluate(
      intent({
        kind: "move",
        confidence: 0.99,
        payload: { target: { x: 0, y: 0, z: 0.3 } },
      }),
      translateIntention
    );
    expect(d.allowed).toBe(false);
    expect(d.event?.reason).toBe("emergency_stop");
    expect(safety.isControlEnabled()).toBe(false);
  });

  it("allows stop even when control disabled", () => {
    safety.setControlEnabled(false);
    const d = safety.evaluate(intent({ kind: "stop", confidence: 0.99 }), translateIntention);
    expect(d.allowed).toBe(true);
    expect(d.command?.kind).toBe("stop");
  });

  it("rate limits burst of intentions", () => {
    safety.updateConfig({ maxIntentionsPerSecond: 2, minCommandIntervalMs: 0 });
    const make = () =>
      safety.evaluate(
        intent({
          kind: "move",
          confidence: 0.95,
          payload: { target: { x: 0.1, y: 0, z: 0.3 } },
        }),
        translateIntention
      );
    expect(make().allowed).toBe(true);
    expect(make().allowed).toBe(true);
    const third = make();
    expect(third.allowed).toBe(false);
    expect(third.event?.reason).toBe("rate_limit");
  });

  it("clearEmergencyStop leaves control disabled", () => {
    safety.emergencyStop();
    safety.clearEmergencyStop();
    expect(safety.isEmergencyStopActive()).toBe(false);
    expect(safety.isControlEnabled()).toBe(false);
  });
});
