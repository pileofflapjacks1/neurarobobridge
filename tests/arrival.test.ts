import { describe, it, expect, afterEach, vi } from "vitest";
import { NeuraRoboBridge } from "../src/index.js";
import { SimulatedArmBackend } from "../src/robot/SimulatedArmBackend.js";
import type { Vec3 } from "../src/types/intention.js";

function hypot2(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function hypot3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe("Arrival wait", () => {
  let bridge: NeuraRoboBridge;

  afterEach(() => {
    bridge?.dispose();
  });

  it("keeps go_to running until the base arrives", async () => {
    bridge = new NeuraRoboBridge({
      bciBackend: "manual",
      robotBackend: "simulated-humanoid",
      logLevel: "silent",
      safety: {
        watchdogTimeoutMs: 0,
        minCommandIntervalMs: 0,
        confirmTasks: [],
        confirmNavigate: false,
      },
      skills: { enabled: true },
      simulatedHumanoid: { maxBaseSpeed: 0.8, tickHz: 20 },
    });
    await bridge.connect();
    await bridge.enableControl();

    const goal: Vec3 = { x: 0.62, y: -0.36, z: 0 };
    bridge.injectIntention({
      kind: "task",
      confidence: 0.95,
      payload: { task: "go_to", position: goal, requireConfirm: false },
    });

    await vi.waitFor(() => {
      expect(bridge.getActiveSkill()?.status).toBe("running");
    });

    const early = bridge.getRobotBackend().getState().basePose?.position;
    expect(early).toBeDefined();
    expect(hypot2(early!, goal)).toBeGreaterThan(0.2);

    await vi.waitFor(
      () => {
        expect(bridge.getActiveSkill()?.status).toBe("succeeded");
      },
      { timeout: 4000, interval: 20 }
    );

    const base = bridge.getRobotBackend().getState().basePose?.position;
    expect(base).toBeDefined();
    expect(hypot2(base!, goal)).toBeLessThanOrEqual(0.03);
  });

  it("times out into needs_help when the base never arrives", async () => {
    bridge = new NeuraRoboBridge({
      bciBackend: "manual",
      robotBackend: "simulated-humanoid",
      logLevel: "silent",
      safety: {
        watchdogTimeoutMs: 0,
        minCommandIntervalMs: 0,
        confirmTasks: [],
        confirmNavigate: false,
      },
      skills: { enabled: true, defaultStepTimeoutMs: 200 },
      simulatedHumanoid: { maxBaseSpeed: 0.0001, tickHz: 20 },
    });
    await bridge.connect();
    await bridge.enableControl();

    bridge.injectIntention({
      kind: "task",
      confidence: 0.95,
      payload: {
        task: "go_to",
        position: { x: 1, y: 0, z: 0 },
        requireConfirm: false,
      },
    });

    await vi.waitFor(
      () => {
        expect(bridge.getActiveSkill()?.status).toBe("needs_help");
      },
      { timeout: 2000, interval: 20 }
    );

    const base = bridge.getRobotBackend().getState().basePose?.position;
    expect(base).toBeDefined();
    expect(Math.hypot(base!.x, base!.y)).toBeLessThan(0.05);
    expect(bridge.getActiveSkill()?.status).not.toBe("succeeded");
  });

  it("keeps hand_over running until the gripper pose settles", async () => {
    bridge = new NeuraRoboBridge({
      bciBackend: "manual",
      robotBackend: "simulated-humanoid",
      logLevel: "silent",
      safety: {
        watchdogTimeoutMs: 0,
        minCommandIntervalMs: 0,
        confirmTasks: [],
        confirmNavigate: false,
      },
      skills: { enabled: true },
      simulatedHumanoid: { tickHz: 30 },
    });
    await bridge.connect();
    await bridge.enableControl();

    const present: Vec3 = { x: 0.28, y: 0, z: 0.62 };
    bridge.injectIntention({
      kind: "task",
      confidence: 0.95,
      payload: {
        task: "hand_over",
        position: present,
        requireConfirm: false,
      },
    });

    await vi.waitFor(() => {
      expect(bridge.getActiveSkill()?.status).toBe("running");
    });

    const early = bridge.getRobotBackend().getState().pose?.position;
    expect(early).toBeDefined();
    expect(hypot3(early!, present)).toBeGreaterThan(0.05);

    await vi.waitFor(
      () => {
        expect(bridge.getActiveSkill()?.status).toBe("succeeded");
      },
      { timeout: 5000, interval: 20 }
    );

    const ee = bridge.getRobotBackend().getState().pose?.position;
    expect(ee).toBeDefined();
    expect(hypot3(ee!, present)).toBeLessThanOrEqual(0.03);
  });

  it("does not succeed a go_to stopped mid-walk", async () => {
    bridge = new NeuraRoboBridge({
      bciBackend: "manual",
      robotBackend: "simulated-humanoid",
      logLevel: "silent",
      safety: {
        watchdogTimeoutMs: 0,
        minCommandIntervalMs: 0,
        confirmTasks: [],
        confirmNavigate: false,
      },
      skills: { enabled: true, defaultStepTimeoutMs: 20_000 },
      simulatedHumanoid: { maxBaseSpeed: 0.15, tickHz: 30 },
    });
    await bridge.connect();
    await bridge.enableControl();

    bridge.injectIntention({
      kind: "task",
      confidence: 0.95,
      payload: {
        task: "go_to",
        position: { x: 1.2, y: 0, z: 0 },
        requireConfirm: false,
      },
    });

    await vi.waitFor(
      () => {
        const x = bridge.getRobotBackend().getState().basePose?.position.x ?? 0;
        expect(x).toBeGreaterThan(0.02);
      },
      { timeout: 2000, interval: 20 }
    );

    bridge.injectIntention({ kind: "stop", confidence: 0.99 });

    await vi.waitFor(
      () => {
        expect(bridge.getActiveSkill()?.status).toBe("cancelled");
      },
      { timeout: 1000, interval: 20 }
    );

    const base = bridge.getRobotBackend().getState().basePose?.position;
    expect(base).toBeDefined();
    expect(base!.x).toBeLessThan(0.6);
    expect(bridge.getActiveSkill()?.status).not.toBe("succeeded");
  });
});

describe("Simulated arm arrival", () => {
  let arm: SimulatedArmBackend;

  afterEach(() => {
    arm?.dispose();
  });

  it("resolves move_to when the arm reaches the pose", async () => {
    arm = new SimulatedArmBackend({ tickHz: 60, maxJointVelocity: 3 });
    await arm.connect();
    await arm.execute({
      id: "m1",
      kind: "move_to",
      pose: { position: { x: 0.3, y: 0.1, z: 0.4 } },
      timestamp: Date.now(),
    });
    expect(arm.getState().mode).toBe("ready");
    expect(arm.getState().message).toMatch(/At Cartesian|Settled/);
  });

  it("settles an unreachable pose instead of hanging", async () => {
    arm = new SimulatedArmBackend({ tickHz: 60, maxJointVelocity: 3 });
    await arm.connect();
    await arm.execute({
      id: "m2",
      kind: "move_to",
      pose: { position: { x: 5, y: 5, z: 5 } },
      timestamp: Date.now(),
    });
    expect(arm.getState().mode).toBe("ready");
    expect(arm.getState().message).toMatch(/At Cartesian|Settled/);
  });
});
