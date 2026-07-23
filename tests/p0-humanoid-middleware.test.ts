import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NeuroBridge } from "../src/core/NeuroBridge.js";
import type { RobotCommand } from "../src/types/robot.js";
import type { PendingConfirmation } from "../src/types/task.js";
import type { RobotFeedback } from "../src/types/feedback.js";
import type { SafetyEvent } from "../src/types/safety.js";

describe("P0 humanoid middleware features", () => {
  let bridge: NeuroBridge;

  afterEach(() => {
    bridge?.dispose();
  });

  describe("RobotCapabilities handshake", () => {
    it("emits capabilities on connect for simulated arm", async () => {
      bridge = new NeuroBridge({
        bciBackend: "manual",
        robotBackend: "simulated-arm",
        logLevel: "silent",
        safety: { watchdogTimeoutMs: 0, minCommandIntervalMs: 0 },
      });
      let capsModel = "";
      bridge.on("capabilities", (c) => {
        capsModel = c.model;
      });
      await bridge.connect();
      expect(capsModel).toMatch(/Arm/i);
      expect(bridge.getCapabilities()?.locomotion).toBe(false);
      expect(bridge.getCapabilities()?.manipulation).toBe(true);
    });

    it("rejects navigate on arm via capability_mismatch", async () => {
      bridge = new NeuroBridge({
        bciBackend: "manual",
        robotBackend: "simulated-arm",
        logLevel: "silent",
        safety: {
          watchdogTimeoutMs: 0,
          minCommandIntervalMs: 0,
          confirmNavigate: false,
        },
      });
      await bridge.connect();
      await bridge.enableControl();
      const reasons: string[] = [];
      bridge.on("safetyEvent", (e) => reasons.push(e.reason));
      bridge.injectIntention({
        kind: "navigate",
        confidence: 0.95,
        payload: { goal: { x: 1, y: 0, z: 0 } },
      });
      expect(reasons).toContain("capability_mismatch");
    });
  });

  describe("Control modes", () => {
    beforeEach(async () => {
      bridge = new NeuroBridge({
        bciBackend: "manual",
        robotBackend: "null",
        logLevel: "silent",
        safety: {
          watchdogTimeoutMs: 0,
          minCommandIntervalMs: 0,
          defaultControlMode: "supervised",
        },
      });
      await bridge.connect();
    });

    it("starts disabled and enters supervised on enableControl", async () => {
      expect(bridge.getControlMode()).toBe("disabled");
      await bridge.enableControl();
      expect(bridge.getControlMode()).toBe("supervised");
      expect(bridge.isControlEnabled()).toBe(true);
    });

    it("emits controlMode on change", async () => {
      await bridge.enableControl();
      const modes: string[] = [];
      bridge.on("controlMode", (e) => modes.push(`${e.previous}->${e.mode}`));
      bridge.setControlMode("teleop");
      expect(modes).toContain("supervised->teleop");
      expect(bridge.getControlMode()).toBe("teleop");
    });

    it("blocks free move in autonomous_task mode", async () => {
      await bridge.enableControl("autonomous_task");
      const rejected: string[] = [];
      bridge.on("intentionRejected", (_i, r) => rejected.push(r));
      bridge.injectIntention({
        kind: "move",
        confidence: 0.95,
        payload: { target: { x: 0.1, y: 0, z: 0.3 } },
      });
      expect(rejected.some((r) => /autonomous_task/i.test(r))).toBe(true);
    });
  });

  describe("Stale intention TTL", () => {
    it("rejects continuous move older than maxIntentionAgeMs", async () => {
      bridge = new NeuroBridge({
        bciBackend: "manual",
        robotBackend: "null",
        logLevel: "silent",
        safety: {
          watchdogTimeoutMs: 0,
          minCommandIntervalMs: 0,
          maxIntentionAgeMs: 50,
          maxTaskAgeMs: 5000,
        },
      });
      await bridge.connect();
      await bridge.enableControl();
      const events: SafetyEvent[] = [];
      bridge.on("safetyEvent", (e) => events.push(e));
      bridge.injectIntention({
        kind: "move",
        confidence: 0.95,
        timestamp: Date.now() - 500,
        payload: { target: { x: 0.1, y: 0, z: 0.3 } },
      });
      expect(events.some((e) => e.reason === "stale_intention")).toBe(true);
    });
  });

  describe("Watchdog fail-safe", () => {
    it("disables control after BCI silence", async () => {
      bridge = new NeuroBridge({
        bciBackend: "manual",
        robotBackend: "null",
        logLevel: "silent",
        safety: {
          watchdogTimeoutMs: 80,
          watchdogPollMs: 20,
          watchdogAction: "stop",
          minCommandIntervalMs: 0,
        },
      });
      await bridge.connect();
      await bridge.enableControl();
      expect(bridge.isControlEnabled()).toBe(true);

      await vi.waitFor(
        () => {
          expect(bridge.isControlEnabled()).toBe(false);
        },
        { timeout: 2000, interval: 20 }
      );
      expect(bridge.getControlMode()).toBe("disabled");
    });
  });

  describe("Confirm-to-execute", () => {
    it("holds navigate until confirm", async () => {
      bridge = new NeuroBridge({
        bciBackend: "manual",
        robotBackend: "simulated-humanoid",
        logLevel: "silent",
        safety: {
          watchdogTimeoutMs: 0,
          minCommandIntervalMs: 0,
          confirmNavigate: true,
        },
      });
      await bridge.connect();
      await bridge.enableControl();

      const pending: PendingConfirmation[] = [];
      const commands: RobotCommand[] = [];
      bridge.on("pendingConfirm", (p) => pending.push(p));
      bridge.on("command", (c) => commands.push(c));

      bridge.injectIntention({
        kind: "navigate",
        confidence: 0.95,
        payload: { goal: { x: 0.5, y: 0, z: 0 } },
      });

      expect(pending.length).toBe(1);
      expect(commands.filter((c) => c.kind === "navigate").length).toBe(0);

      bridge.injectIntention({
        kind: "confirm",
        confidence: 0.95,
        payload: { confirmationId: pending[0]!.id },
      });

      expect(commands.some((c) => c.kind === "navigate")).toBe(true);
    });

    it("requires confirm for high-risk go_to task", async () => {
      bridge = new NeuroBridge({
        bciBackend: "manual",
        robotBackend: "simulated-humanoid",
        logLevel: "silent",
        safety: { watchdogTimeoutMs: 0, minCommandIntervalMs: 0 },
      });
      await bridge.connect();
      await bridge.enableControl();
      const pending: PendingConfirmation[] = [];
      bridge.on("pendingConfirm", (p) => pending.push(p));
      bridge.injectIntention({
        kind: "task",
        confidence: 0.95,
        payload: {
          task: "go_to",
          position: { x: 1, y: 0, z: 0 },
        },
      });
      expect(pending.length).toBe(1);
      expect(pending[0]?.task).toBe("go_to");
    });
  });

  describe("Task + feedback", () => {
    it("runs pick_object task on arm and emits feedback", async () => {
      bridge = new NeuroBridge({
        bciBackend: "manual",
        robotBackend: "simulated-arm",
        logLevel: "silent",
        safety: {
          watchdogTimeoutMs: 0,
          minCommandIntervalMs: 0,
          confirmTasks: [], // pick_object not gated
        },
      });
      await bridge.connect();
      await bridge.enableControl();

      const feedback: RobotFeedback[] = [];
      bridge.on("feedback", (f) => feedback.push(f));

      bridge.injectIntention({
        kind: "task",
        confidence: 0.95,
        payload: {
          task: "pick_object",
          target: "cup",
          position: { x: 0.3, y: 0.1, z: 0.35 },
          requireConfirm: false,
        },
      });

      await vi.waitFor(
        () => {
          expect(feedback.some((f) => f.kind === "task_started")).toBe(true);
        },
        { timeout: 1000, interval: 20 }
      );

      await vi.waitFor(
        () => {
          expect(feedback.some((f) => f.kind === "task_completed")).toBe(true);
        },
        { timeout: 1500, interval: 30 }
      );
    });
  });

  describe("Latency samples", () => {
    it("emits latency on accepted intention", async () => {
      bridge = new NeuroBridge({
        bciBackend: "manual",
        robotBackend: "null",
        logLevel: "silent",
        safety: { watchdogTimeoutMs: 0, minCommandIntervalMs: 0 },
      });
      await bridge.connect();
      await bridge.enableControl();
      const samples: number[] = [];
      bridge.on("latency", (s) => samples.push(s.gateMs));
      bridge.injectIntention({ kind: "home", confidence: 0.99 });
      expect(samples.length).toBeGreaterThanOrEqual(1);
      expect(samples[0]).toBeGreaterThanOrEqual(0);
    });
  });
});
