import { describe, it, expect, afterEach, vi } from "vitest";
import {
  NeuraRoboBridge,
  registerSkill,
  type SkillDefinition,
  type ActiveSkill,
  type RobotFeedback,
  type RobotCommand,
} from "../src/index.js";

const hangSkill: SkillDefinition = {
  name: "unit_hang",
  description: "never resolves",
  build: () => [
    {
      id: "hang",
      timeoutMs: 60,
      command: { kind: "home" },
    },
  ],
};

describe("Skill timeout and needs_help", () => {
  let bridge: NeuraRoboBridge;

  afterEach(() => {
    bridge?.dispose();
  });

  it("times out a hanging step, emits needs_help, and runs safe recovery", async () => {
    registerSkill(hangSkill);
    bridge = new NeuraRoboBridge({
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: {
        minCommandIntervalMs: 0,
        watchdogTimeoutMs: 0,
        confirmTasks: [],
      },
      skills: {
        enabled: true,
        defaultStepDelayMs: 0,
        defaultStepTimeoutMs: 60,
        skillTimeoutMs: 5000,
        safeFailRecovery: true,
        needsHelpOnFailure: true,
      },
      policies: { noFreeMoveDuringSkill: false },
    });

    // Make null backend hang on home to trigger timeout
    const robot = bridge.getRobotBackend();
    const original = robot.execute.bind(robot);
    robot.execute = async (cmd: RobotCommand) => {
      if (cmd.kind === "home" && !cmd.forced) {
        await new Promise(() => {
          /* never resolve */
        });
        return;
      }
      return original(cmd);
    };

    await bridge.connect();
    await bridge.enableControl();

    const skills: ActiveSkill[] = [];
    const feedback: RobotFeedback[] = [];
    const commands: string[] = [];
    bridge.on("skill", (s) => skills.push({ ...s }));
    bridge.on("feedback", (f) => feedback.push(f));
    bridge.on("command", (c) => commands.push(c.kind));

    bridge.injectIntention({
      kind: "task",
      confidence: 0.95,
      payload: { task: "unit_hang", requireConfirm: false },
    });

    await vi.waitFor(
      () => {
        expect(skills.some((s) => s.status === "needs_help")).toBe(true);
      },
      { timeout: 2000, interval: 20 }
    );

    const failed = skills.find((s) => s.status === "needs_help");
    expect(failed?.failureKind).toBe("timeout");
    expect(failed?.needsHelp).toBe(true);
    expect(failed?.recoveryApplied).toBe(true);

    expect(feedback.some((f) => f.kind === "needs_help")).toBe(true);
    expect(feedback.some((f) => f.kind === "task_failed")).toBe(true);
    expect(commands).toContain("stop");
    expect(commands).toContain("set_gripper");
  });

  it("skill wall-clock timeout fails the run", async () => {
    const slow: SkillDefinition = {
      name: "unit_slow",
      description: "many delays",
      build: () =>
        Array.from({ length: 5 }, (_, i) => ({
          id: `s${i}`,
          delayMs: 100,
          timeoutMs: 5000,
          command: { kind: "stop" },
        })),
    };
    registerSkill(slow);

    bridge = new NeuraRoboBridge({
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: {
        minCommandIntervalMs: 0,
        watchdogTimeoutMs: 0,
        confirmTasks: [],
      },
      skills: {
        enabled: true,
        defaultStepDelayMs: 0,
        skillTimeoutMs: 120,
        defaultStepTimeoutMs: 5000,
        needsHelpOnFailure: true,
      },
      policies: { noFreeMoveDuringSkill: false },
    });

    await bridge.connect();
    await bridge.enableControl();

    const skills: ActiveSkill[] = [];
    bridge.on("skill", (s) => skills.push({ ...s }));

    bridge.injectIntention({
      kind: "task",
      confidence: 0.95,
      payload: { task: "unit_slow", requireConfirm: false },
    });

    await vi.waitFor(
      () => {
        expect(
          skills.some(
            (s) =>
              (s.status === "needs_help" || s.status === "failed") &&
              s.failureKind === "timeout"
          )
        ).toBe(true);
      },
      { timeout: 2000, interval: 20 }
    );
  });
});
