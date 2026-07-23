import { describe, it, expect } from "vitest";
import { translateIntention } from "../src/core/Translator.js";
import type { NeuralIntention } from "../src/types/intention.js";

function i(
  kind: NeuralIntention["kind"],
  payload?: NeuralIntention["payload"],
  confidence = 0.9
): NeuralIntention {
  return {
    id: "t1",
    kind,
    payload,
    confidence,
    timestamp: 1,
  };
}

describe("translateIntention", () => {
  it("maps move absolute to move_to", () => {
    const cmd = translateIntention(
      i("move", { target: { x: 1, y: 2, z: 3 }, speed: 0.4 })
    );
    expect(cmd?.kind).toBe("move_to");
    expect(cmd?.pose?.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(cmd?.speed).toBe(0.4);
  });

  it("maps relative move to move_delta", () => {
    const cmd = translateIntention(
      i("move", { target: { x: 0.1, y: 0, z: 0 }, relative: true })
    );
    expect(cmd?.kind).toBe("move_delta");
  });

  it("maps grasp to closed gripper", () => {
    const cmd = translateIntention(i("grasp", { force: 0.8 }));
    expect(cmd?.kind).toBe("set_gripper");
    expect(cmd?.gripper).toBeCloseTo(0.2);
  });

  it("maps release to open gripper", () => {
    const cmd = translateIntention(i("release", {}));
    expect(cmd?.kind).toBe("set_gripper");
    expect(cmd?.gripper).toBe(1);
  });

  it("maps navigate", () => {
    const cmd = translateIntention(
      i("navigate", { goal: { x: 1, y: 2, z: 0 }, yaw: 0.5 })
    );
    expect(cmd?.kind).toBe("navigate");
    expect(cmd?.goal).toEqual({ x: 1, y: 2, z: 0 });
    expect(cmd?.yaw).toBe(0.5);
  });

  it("maps stop and home", () => {
    expect(translateIntention(i("stop"))?.kind).toBe("stop");
    expect(translateIntention(i("home"))?.kind).toBe("home");
  });

  it("maps custom commands", () => {
    const cmd = translateIntention(
      i("custom", { command: "wave", params: { hand: "right" } })
    );
    expect(cmd?.kind).toBe("custom");
    expect(cmd?.custom?.command).toBe("wave");
  });

  it("returns null for navigate without goal", () => {
    expect(translateIntention(i("navigate", {}))).toBeNull();
  });

  it("maps task to execute_task", () => {
    const cmd = translateIntention(
      i("task", { task: "pick_object", target: "cup" })
    );
    expect(cmd?.kind).toBe("execute_task");
    expect(cmd?.task?.name).toBe("pick_object");
    expect(cmd?.task?.target).toBe("cup");
  });

  it("maps cancel to cancel_task", () => {
    expect(translateIntention(i("cancel"))?.kind).toBe("cancel_task");
  });

  it("maps modulate", () => {
    const cmd = translateIntention(i("modulate", { speed: 0.3, force: 0.2 }));
    expect(cmd?.kind).toBe("modulate");
    expect(cmd?.modulate?.speed).toBe(0.3);
  });
});
