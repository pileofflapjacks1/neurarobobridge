import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  NeuraRoboBridge,
  mapNeuralBridgeIntention,
  mapNeuralBridgeGesture,
  NeuralBridgeAdapter,
  createKeepOutZonesPolicy,
  createNoLocomotionWhileGraspingPolicy,
  registerSkill,
  getSkill,
  type SkillDefinition,
  type ActiveSkill,
  type RobotCommand,
  type NeuralBridgeIntentionLike,
} from "../src/index.js";

describe("Skill runtime", () => {
  let bridge: NeuraRoboBridge;

  afterEach(() => {
    bridge?.dispose();
  });

  it("runs pick_object as multi-step skill", async () => {
    bridge = new NeuraRoboBridge({
      bciBackend: "manual",
      robotBackend: "simulated-arm",
      logLevel: "silent",
      safety: {
        watchdogTimeoutMs: 0,
        minCommandIntervalMs: 0,
        confirmTasks: [],
      },
      skills: { enabled: true, defaultStepDelayMs: 30 },
    });
    await bridge.connect();
    await bridge.enableControl();

    const skills: ActiveSkill[] = [];
    const commands: RobotCommand[] = [];
    bridge.on("skill", (s) => skills.push({ ...s }));
    bridge.on("command", (c) => commands.push(c));

    bridge.injectIntention({
      kind: "task",
      confidence: 0.95,
      payload: {
        task: "pick_object",
        target: "cup",
        position: { x: 0.3, y: 0.1, z: 0.25 },
        requireConfirm: false,
      },
    });

    await vi.waitFor(
      () => {
        expect(skills.some((s) => s.status === "succeeded")).toBe(true);
      },
      { timeout: 3000, interval: 30 }
    );

    expect(commands.some((c) => c.kind === "move_to")).toBe(true);
    expect(commands.some((c) => c.kind === "set_gripper")).toBe(true);
    expect(getSkill("pick_object")).toBeDefined();
  });

  it("cancels a running skill", async () => {
    bridge = new NeuraRoboBridge({
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: { watchdogTimeoutMs: 0, minCommandIntervalMs: 0, confirmTasks: [] },
      skills: { enabled: true, defaultStepDelayMs: 200 },
    });
    await bridge.connect();
    await bridge.enableControl();

    bridge.injectIntention({
      kind: "task",
      confidence: 0.95,
      payload: {
        task: "wait",
        params: { durationMs: 2000 },
        requireConfirm: false,
      },
    });

    await new Promise((r) => setTimeout(r, 40));
    expect(bridge.getActiveSkill()?.status).toBe("running");

    bridge.injectIntention({ kind: "cancel", confidence: 0.99 });
    await vi.waitFor(
      () => {
        const s = bridge.getActiveSkill();
        expect(s === null || s.status === "cancelled").toBe(true);
      },
      { timeout: 1000, interval: 20 }
    );
  });

  it("registers a custom skill", async () => {
    const custom: SkillDefinition = {
      name: "custom_nod",
      description: "test skill",
      build: () => [
        {
          id: "s1",
          command: { kind: "home" },
        },
      ],
    };
    registerSkill(custom);

    bridge = new NeuraRoboBridge({
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: { watchdogTimeoutMs: 0, minCommandIntervalMs: 0, confirmTasks: [] },
    });
    await bridge.connect();
    await bridge.enableControl();

    const skills: ActiveSkill[] = [];
    bridge.on("skill", (s) => skills.push({ ...s }));
    bridge.injectIntention({
      kind: "task",
      confidence: 0.95,
      payload: { task: "custom_nod", requireConfirm: false },
    });

    await vi.waitFor(
      () => expect(skills.some((s) => s.status === "succeeded")).toBe(true),
      { timeout: 1500, interval: 20 }
    );
  });
});

describe("Policy plugins", () => {
  let bridge: NeuraRoboBridge;

  afterEach(() => bridge?.dispose());

  it("blocks goals in keep-out zones", async () => {
    bridge = new NeuraRoboBridge({
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: { watchdogTimeoutMs: 0, minCommandIntervalMs: 0 },
      policies: {
        keepOutZones: [
          {
            id: "table",
            min: { x: 0.2, y: -0.2, z: 0 },
            max: { x: 0.5, y: 0.2, z: 1 },
          },
        ],
        noFreeMoveDuringSkill: false,
      },
    });
    await bridge.connect();
    await bridge.enableControl();

    const rejected: string[] = [];
    bridge.on("intentionRejected", (_i, r) => rejected.push(r));
    bridge.injectIntention({
      kind: "move",
      confidence: 0.95,
      payload: { target: { x: 0.3, y: 0, z: 0.4 } },
    });
    expect(rejected.some((r) => /keep-out/i.test(r))).toBe(true);
  });

  it("blocks locomotion while grasping", async () => {
    bridge = new NeuraRoboBridge({
      bciBackend: "manual",
      robotBackend: "simulated-humanoid",
      logLevel: "silent",
      safety: {
        watchdogTimeoutMs: 0,
        minCommandIntervalMs: 0,
        confirmNavigate: false,
        confirmTasks: [],
      },
      policies: {
        noLocomotionWhileGrasping: true,
        noFreeMoveDuringSkill: false,
      },
      skills: { enabled: false },
    });
    await bridge.connect();
    await bridge.enableControl();

    // Close gripper → holding
    bridge.injectIntention({
      kind: "grasp",
      confidence: 0.95,
      payload: { force: 0.9 },
    });
    await new Promise((r) => setTimeout(r, 50));

    const rejected: string[] = [];
    bridge.on("intentionRejected", (_i, r) => rejected.push(r));
    bridge.injectIntention({
      kind: "navigate",
      confidence: 0.95,
      payload: { goal: { x: 1, y: 0, z: 0 } },
    });
    expect(rejected.some((r) => /holding/i.test(r))).toBe(true);
  });

  it("addPolicy works at runtime", async () => {
    bridge = new NeuraRoboBridge({
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: { watchdogTimeoutMs: 0, minCommandIntervalMs: 0 },
      policies: { noFreeMoveDuringSkill: false },
    });
    await bridge.connect();
    await bridge.enableControl();
    bridge.addPolicy(
      createKeepOutZonesPolicy([
        {
          id: "danger",
          min: { x: -10, y: -10, z: -10 },
          max: { x: 10, y: 10, z: 10 },
        },
      ])
    );
    const rejected: string[] = [];
    bridge.on("intentionRejected", (_i, r) => rejected.push(r));
    bridge.injectIntention({
      kind: "move",
      confidence: 0.95,
      payload: { target: { x: 0, y: 0, z: 0.3 } },
    });
    expect(rejected.length).toBeGreaterThan(0);
  });
});

describe("NeuralBridge adapter", () => {
  it("maps confirm/cancel/task payloads", () => {
    expect(mapNeuralBridgeIntention({
      type: "confirm",
      confidence: 0.9,
      timestamp: 1,
    })?.kind).toBe("confirm");

    expect(mapNeuralBridgeIntention({
      type: "cancel",
      confidence: 0.9,
      timestamp: 1,
    })?.kind).toBe("cancel");

    const task = mapNeuralBridgeIntention({
      type: "custom",
      confidence: 0.9,
      timestamp: 1,
      payload: { task: "wave", requireConfirm: false },
    });
    // custom without robotKind - check task path via type with payload.task
    const task2 = mapNeuralBridgeIntention({
      type: "select",
      confidence: 0.9,
      timestamp: 1,
      payload: { task: "wave" },
    });
    // select maps to confirm by default unless task in payload - actually select maps to confirm first in switch. Fix: payload.task is checked before switch.
    expect(task2?.kind).toBe("task");

    const robotKind = mapNeuralBridgeIntention({
      type: "custom",
      confidence: 0.9,
      timestamp: 1,
      payload: { robotKind: "home" },
    });
    expect(robotKind?.kind).toBe("home");
  });

  it("maps gestures to relative move", () => {
    const m = mapNeuralBridgeGesture({
      type: "move",
      confidence: 0.9,
      timestamp: 1,
      vector: { x: 1, y: 0, z: 0 },
    });
    expect(m?.kind).toBe("move");
  });

  it("forwards NeuralBridge-like events into NeuraRoboBridge", async () => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const neural = {
      on(event: string, handler: (...args: never[]) => void) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(handler as (...args: unknown[]) => void);
      },
      off(event: string, handler: (...args: never[]) => void) {
        listeners.get(event)?.delete(handler as (...args: unknown[]) => void);
      },
      emit(event: string, payload: unknown) {
        for (const h of listeners.get(event) ?? []) h(payload);
      },
    };

    const bridge = new NeuraRoboBridge({
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: {
        watchdogTimeoutMs: 0,
        minCommandIntervalMs: 0,
        confirmTasks: [],
      },
      skills: { enabled: true, defaultStepDelayMs: 20 },
      policies: { noFreeMoveDuringSkill: false },
    });
    await bridge.connect();
    await bridge.enableControl();

    const adapter = new NeuralBridgeAdapter();
    const detach = adapter.attach(neural, bridge);

    const skills: ActiveSkill[] = [];
    bridge.on("skill", (s) => skills.push({ ...s }));

    const evt: NeuralBridgeIntentionLike = {
      type: "next",
      confidence: 0.95,
      timestamp: Date.now(),
      payload: { task: "wave" },
    };
    // next maps to task wave - but payload.task is read only when type has task in switch for next. next uses p.task.
    neural.emit("intention", evt);

    await vi.waitFor(
      () => expect(skills.some((s) => s.skillName === "wave")).toBe(true),
      { timeout: 2000, interval: 30 }
    );

    detach();
    bridge.dispose();
  });
});
