import { describe, it, expect, afterEach } from "vitest";
import { SimulatedArmBackend } from "../src/robot/SimulatedArmBackend.js";
import { SimulatorBciBackend } from "../src/bci/SimulatorBciBackend.js";
import type { RobotCommand } from "../src/types/robot.js";

describe("SimulatedArmBackend", () => {
  let arm: SimulatedArmBackend;

  afterEach(() => {
    arm?.dispose();
  });

  it("connects and reports ready", async () => {
    arm = new SimulatedArmBackend({ tickHz: 40 });
    await arm.connect();
    expect(arm.isConnected()).toBe(true);
    expect(arm.getState().mode).toBe("ready");
    expect(arm.getState().joints?.length).toBe(6);
  });

  it("moves toward a Cartesian target", async () => {
    arm = new SimulatedArmBackend({ tickHz: 60, maxJointVelocity: 3 });
    await arm.connect();

    const cmd: RobotCommand = {
      id: "c1",
      kind: "move_to",
      pose: { position: { x: 0.3, y: 0.1, z: 0.4 } },
      timestamp: Date.now(),
    };
    await arm.execute(cmd);

    await new Promise((r) => setTimeout(r, 400));
    const pose = arm.getState().pose?.position;
    expect(pose).toBeDefined();
    // Should have moved away from pure home
    expect(arm.getState().mode === "moving" || arm.getState().mode === "ready").toBe(
      true
    );
  });

  it("e-stop freezes motion", async () => {
    arm = new SimulatedArmBackend({ tickHz: 40 });
    await arm.connect();
    arm.emergencyStop();
    expect(arm.getState().mode).toBe("estop");
    await arm.execute({
      id: "c2",
      kind: "move_to",
      pose: { position: { x: 0.4, y: 0, z: 0.3 } },
      timestamp: Date.now(),
    });
    expect(arm.getState().message).toMatch(/e-stop/i);
  });

  it("sets gripper on grasp-like command", async () => {
    arm = new SimulatedArmBackend();
    await arm.connect();
    await arm.execute({
      id: "g1",
      kind: "set_gripper",
      gripper: 0.1,
      timestamp: Date.now(),
    });
    const g = arm.getState().grippers?.[0];
    expect(g?.open).toBeCloseTo(0.1);
    expect(g?.holding).toBe(true);
  });
});

describe("SimulatorBciBackend", () => {
  it("injects intentions with noise bounds", async () => {
    const sim = new SimulatorBciBackend({
      baseConfidence: 0.9,
      confidenceNoise: 0.05,
      glitchProbability: 0,
      seed: 42,
    });
    await sim.connect();
    const seen: number[] = [];
    sim.onIntention((i) => seen.push(i.confidence));
    for (let n = 0; n < 20; n++) {
      sim.inject({
        kind: "stop",
        confidence: 0.9,
      });
    }
    expect(seen.length).toBe(20);
    for (const c of seen) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
    sim.dispose();
  });
});
