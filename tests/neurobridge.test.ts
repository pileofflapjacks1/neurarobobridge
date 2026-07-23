import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NeuroBridge } from "../src/core/NeuroBridge.js";
import type { NeuralIntention } from "../src/types/intention.js";
import type { RobotCommand } from "../src/types/robot.js";
import type { SafetyEvent } from "../src/types/safety.js";

describe("NeuroBridge", () => {
  let bridge: NeuroBridge;

  beforeEach(() => {
    bridge = new NeuroBridge({
      bciBackend: "manual",
      robotBackend: "simulated-arm",
      logLevel: "silent",
      safety: {
        minConfidence: 0.75,
        minCommandIntervalMs: 0,
        maxIntentionsPerSecond: 100,
        watchdogTimeoutMs: 0,
      },
      simulatedArm: { tickHz: 50 },
    });
  });

  afterEach(async () => {
    bridge.dispose();
  });

  it("connects with control disabled by default", async () => {
    await bridge.connect();
    expect(bridge.isConnected()).toBe(true);
    expect(bridge.isControlEnabled()).toBe(false);
  });

  it("requires enableControl before accepting motion", async () => {
    await bridge.connect();
    const rejected: string[] = [];
    bridge.on("intentionRejected", (_i, reason) => rejected.push(reason));

    bridge.injectIntention({
      kind: "move",
      confidence: 0.95,
      payload: { target: { x: 0.2, y: 0, z: 0.3 } },
    });

    expect(rejected.length).toBe(1);
    expect(rejected[0]).toMatch(/disabled/i);
  });

  it("accepts intentions after enableControl", async () => {
    await bridge.connect();
    await bridge.enableControl();

    const commands: RobotCommand[] = [];
    bridge.on("command", (c) => commands.push(c));

    bridge.injectIntention({
      kind: "move",
      confidence: 0.95,
      payload: { target: { x: 0.2, y: 0.1, z: 0.35 }, speed: 0.5 },
    });

    expect(commands.length).toBe(1);
    expect(commands[0]?.kind).toBe("move_to");
  });

  it("emits safetyEvent on low confidence", async () => {
    await bridge.connect();
    await bridge.enableControl();

    const events: SafetyEvent[] = [];
    bridge.on("safetyEvent", (e) => events.push(e));

    bridge.injectIntention({
      kind: "grasp",
      confidence: 0.1,
      payload: { force: 0.5 },
    });

    expect(events.some((e) => e.reason === "low_confidence")).toBe(true);
  });

  it("emergencyStop disables control and latches", async () => {
    await bridge.connect();
    await bridge.enableControl();
    bridge.emergencyStop("unit test");
    expect(bridge.isEmergencyStopActive()).toBe(true);
    expect(bridge.isControlEnabled()).toBe(false);

    await expect(bridge.enableControl()).rejects.toThrow(/emergency stop/i);

    bridge.clearEmergencyStop();
    expect(bridge.isEmergencyStopActive()).toBe(false);
    await bridge.enableControl();
    expect(bridge.isControlEnabled()).toBe(true);
  });

  it("records a session", async () => {
    bridge = new NeuroBridge({
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      recording: true,
      safety: { minCommandIntervalMs: 0, watchdogTimeoutMs: 0 },
    });
    await bridge.connect();
    await bridge.enableControl();
    bridge.injectIntention({
      kind: "home",
      confidence: 0.99,
    });
    const rec = bridge.stopRecording();
    expect(rec.events.length).toBeGreaterThan(0);
    expect(rec.events.some((e) => e.type === "intention")).toBe(true);
    expect(rec.events.some((e) => e.type === "command")).toBe(true);
  });

  it("playScenario runs pick-place on simulator", async () => {
    bridge = new NeuroBridge({
      bciBackend: "simulator",
      robotBackend: "null",
      logLevel: "silent",
      safety: {
        minCommandIntervalMs: 0,
        maxIntentionsPerSecond: 50,
        watchdogTimeoutMs: 0,
      },
      bciSimulator: { confidenceNoise: 0, glitchProbability: 0, seed: 1 },
    });
    await bridge.connect();
    await bridge.enableControl();

    const intentions: NeuralIntention[] = [];
    bridge.on("intention", (i) => intentions.push(i));

    bridge.playScenario("pick-place");

    await vi.waitFor(
      () => {
        expect(intentions.length).toBeGreaterThanOrEqual(5);
      },
      { timeout: 8000, interval: 50 }
    );

    expect(intentions.some((i) => i.kind === "grasp")).toBe(true);
  }, 10_000);

  it("emits robotState from simulated arm", async () => {
    await bridge.connect();
    const states: string[] = [];
    bridge.on("robotState", (s) => states.push(s.mode));
    await bridge.enableControl();
    bridge.injectIntention({ kind: "home", confidence: 0.99 });
    await new Promise((r) => setTimeout(r, 80));
    expect(states.length).toBeGreaterThan(0);
  });
});
