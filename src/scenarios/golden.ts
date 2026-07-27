/**
 * Built-in golden scenarios — safety gates, policies, skills, e-stop, needs_help.
 */

import type { GoldenScenario } from "./types.js";
import type { SkillDefinition } from "../skills/types.js";
import type { RobotBackend } from "../robot/types.js";
import type { RobotCommand, RobotState } from "../types/robot.js";
import { nullCapabilities } from "../types/capabilities.js";

/** Skill that hangs forever on first step (for timeout CI). */
export const hangingSkill: SkillDefinition = {
  name: "ci_hang",
  description: "Test skill that never resolves execute",
  build: () => [
    {
      id: "hang",
      label: "Hang forever",
      timeoutMs: 80,
      command: { kind: "home" },
    },
  ],
};

/**
 * Robot backend that never resolves non-forced execute — for timeout tests.
 * Forced stop / estop / set_gripper complete immediately (recovery path).
 */
export function createHangingRobotBackend(): RobotBackend {
  const handlers = new Set<(s: RobotState) => void>();
  let connected = false;
  let lastCommandId: string | undefined;

  const state = (): RobotState => ({
    mode: connected ? "ready" : "disconnected",
    lastCommandId,
    timestamp: Date.now(),
    message: "hanging backend",
  });

  return {
    id: "hanging",
    name: "Hanging Robot (CI)",
    async connect() {
      connected = true;
    },
    async disconnect() {
      connected = false;
    },
    isConnected: () => connected,
    getCapabilities: () => nullCapabilities("hanging"),
    execute(command: RobotCommand) {
      lastCommandId = command.id;
      if (command.forced || command.kind === "estop" || command.kind === "stop" || command.kind === "set_gripper") {
        return;
      }
      // Never resolve — step timeout must win
      return new Promise<void>(() => {
        /* hang */
      });
    },
    getState: state,
    onState(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    emergencyStop() {
      /* no-op */
    },
  };
}

export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  {
    id: "control-disabled-rejects-move",
    title: "Control disabled rejects motion",
    description: "Move while control is off must be rejected.",
    config: {
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: {
        minCommandIntervalMs: 0,
        watchdogTimeoutMs: 0,
        maxIntentionAgeMs: 60_000,
      },
      skills: { enabled: false },
      policies: { noFreeMoveDuringSkill: false },
    },
    steps: [
      { name: "connect", action: "connect" },
      {
        name: "move while disabled",
        inject: {
          kind: "move",
          confidence: 0.95,
          payload: { target: { x: 0.2, y: 0, z: 0.3 } },
        },
        expect: [
          { type: "rejected", reasonIncludes: "disabled" },
          { type: "safety", reason: "control_disabled" },
        ],
      },
    ],
  },
  {
    id: "low-confidence-rejected",
    title: "Low confidence rejected",
    description: "Confidence below minConfidence is gated.",
    config: {
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: {
        minConfidence: 0.75,
        minCommandIntervalMs: 0,
        watchdogTimeoutMs: 0,
        maxIntentionAgeMs: 60_000,
      },
      skills: { enabled: false },
      policies: { noFreeMoveDuringSkill: false },
    },
    steps: [
      { name: "connect", action: "connect" },
      { name: "enable", action: "enableControl" },
      {
        name: "low conf grasp",
        inject: {
          kind: "grasp",
          confidence: 0.2,
          payload: { force: 0.5 },
        },
        expect: [
          { type: "rejected" },
          { type: "safety", reason: "low_confidence" },
        ],
      },
    ],
  },
  {
    id: "keep-out-policy-blocks-goal",
    title: "Keep-out policy blocks goal",
    description: "Policy plugin rejects Cartesian goals inside keep-out zone.",
    config: {
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: {
        minCommandIntervalMs: 0,
        watchdogTimeoutMs: 0,
        maxIntentionAgeMs: 60_000,
      },
      skills: { enabled: false },
      policies: {
        noFreeMoveDuringSkill: false,
        keepOutZones: [
          {
            id: "danger",
            min: { x: 0.2, y: -0.2, z: 0 },
            max: { x: 0.5, y: 0.2, z: 1 },
          },
        ],
      },
    },
    steps: [
      { name: "connect", action: "connect" },
      { name: "enable", action: "enableControl" },
      {
        name: "move into keep-out",
        inject: {
          kind: "move",
          confidence: 0.95,
          payload: { target: { x: 0.3, y: 0, z: 0.4 } },
        },
        expect: [
          { type: "rejected", reasonIncludes: "keep-out" },
          { type: "safety", reason: "policy_violation" },
        ],
      },
    ],
  },
  {
    id: "high-confidence-move-accepted",
    title: "High confidence move accepted",
    description: "Valid move produces move_to command.",
    config: {
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: {
        minCommandIntervalMs: 0,
        watchdogTimeoutMs: 0,
        maxIntentionAgeMs: 60_000,
      },
      skills: { enabled: false },
      policies: { noFreeMoveDuringSkill: false },
    },
    steps: [
      { name: "connect", action: "connect" },
      { name: "enable", action: "enableControl" },
      {
        name: "good move",
        inject: {
          kind: "move",
          confidence: 0.95,
          payload: { target: { x: 0.15, y: 0.05, z: 0.35 }, speed: 0.5 },
        },
        expect: [{ type: "command", kind: "move_to" }],
      },
    ],
  },
  {
    id: "estop-latches-and-blocks",
    title: "E-stop latches and blocks motion",
    description: "Emergency stop disables control and rejects further motion.",
    config: {
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: {
        minCommandIntervalMs: 0,
        watchdogTimeoutMs: 0,
        maxIntentionAgeMs: 60_000,
      },
      skills: { enabled: false },
      policies: { noFreeMoveDuringSkill: false },
    },
    steps: [
      { name: "connect", action: "connect" },
      { name: "enable", action: "enableControl" },
      {
        name: "estop",
        action: "emergencyStop",
        expect: [
          { type: "estop", active: true },
          { type: "control", enabled: false },
          { type: "safety", reason: "emergency_stop" },
        ],
      },
      {
        name: "move after estop",
        inject: {
          kind: "move",
          confidence: 0.99,
          payload: { target: { x: 0.1, y: 0, z: 0.3 } },
        },
        expect: [
          { type: "rejected" },
          { type: "safety", reason: "emergency_stop" },
        ],
      },
    ],
  },
  {
    id: "stale-intention-ttl",
    title: "Stale continuous intention rejected",
    description: "Old timestamps fail maxIntentionAgeMs gate.",
    config: {
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: {
        minCommandIntervalMs: 0,
        watchdogTimeoutMs: 0,
        maxIntentionAgeMs: 50,
        maxTaskAgeMs: 5000,
      },
      skills: { enabled: false },
      policies: { noFreeMoveDuringSkill: false },
    },
    steps: [
      { name: "connect", action: "connect" },
      { name: "enable", action: "enableControl" },
      {
        name: "stale move",
        inject: {
          kind: "move",
          confidence: 0.95,
          timestamp: Date.now() - 500,
          payload: { target: { x: 0.1, y: 0, z: 0.3 } },
        },
        expect: [
          { type: "rejected" },
          { type: "safety", reason: "stale_intention" },
        ],
      },
    ],
  },
  {
    id: "pick-object-skill-succeeds",
    title: "pick_object skill completes",
    description: "Shared-autonomy pick skill reaches succeeded.",
    config: {
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: {
        minCommandIntervalMs: 0,
        watchdogTimeoutMs: 0,
        maxIntentionAgeMs: 60_000,
        maxTaskAgeMs: 60_000,
        confirmTasks: [],
      },
      skills: {
        enabled: true,
        defaultStepDelayMs: 15,
        defaultStepTimeoutMs: 5000,
        skillTimeoutMs: 15_000,
      },
      policies: { noFreeMoveDuringSkill: false },
    },
    steps: [
      { name: "connect", action: "connect" },
      { name: "enable", action: "enableControl" },
      {
        name: "pick skill",
        inject: {
          kind: "task",
          confidence: 0.95,
          payload: {
            task: "pick_object",
            position: { x: 0.3, y: 0.1, z: 0.25 },
            requireConfirm: false,
          },
        },
        settleMs: 1200,
        expect: [
          { type: "skill", status: "succeeded", name: "pick_object" },
          { type: "feedback", kind: "task_completed" },
        ],
      },
    ],
  },
  {
    id: "skill-step-timeout-needs-help",
    title: "Skill step timeout → needs_help + recovery",
    description:
      "Hanging step times out, emits needs_help, applies safe-fail recovery.",
    config: {
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: {
        minCommandIntervalMs: 0,
        watchdogTimeoutMs: 0,
        maxIntentionAgeMs: 60_000,
        maxTaskAgeMs: 60_000,
        confirmTasks: [],
      },
      skills: {
        enabled: true,
        defaultStepDelayMs: 0,
        defaultStepTimeoutMs: 80,
        skillTimeoutMs: 5000,
        safeFailRecovery: true,
        needsHelpOnFailure: true,
        skills: [hangingSkill],
      },
      policies: { noFreeMoveDuringSkill: false },
      backends: {
        robot: createHangingRobotBackend(),
      },
    },
    steps: [
      { name: "connect", action: "connect" },
      { name: "enable", action: "enableControl" },
      {
        name: "hanging skill",
        inject: {
          kind: "task",
          confidence: 0.95,
          payload: { task: "ci_hang", requireConfirm: false },
        },
        settleMs: 400,
        expect: [
          { type: "skill", status: "needs_help", name: "ci_hang" },
          { type: "feedback", kind: "needs_help" },
          { type: "feedback", kind: "task_failed" },
          { type: "command", kind: "stop" },
          { type: "command", kind: "set_gripper" },
        ],
      },
    ],
  },
  {
    id: "cancel-running-skill",
    title: "Cancel running skill",
    description: "cancel intention stops an in-flight wait skill.",
    config: {
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      safety: {
        minCommandIntervalMs: 0,
        watchdogTimeoutMs: 0,
        maxIntentionAgeMs: 60_000,
        maxTaskAgeMs: 60_000,
        confirmTasks: [],
      },
      skills: {
        enabled: true,
        defaultStepDelayMs: 200,
        defaultStepTimeoutMs: 10_000,
      },
      policies: { noFreeMoveDuringSkill: false },
    },
    steps: [
      { name: "connect", action: "connect" },
      { name: "enable", action: "enableControl" },
      {
        name: "start wait",
        inject: {
          kind: "task",
          confidence: 0.95,
          payload: {
            task: "wait",
            params: { durationMs: 3000 },
            requireConfirm: false,
          },
        },
        settleMs: 50,
        expect: [{ type: "skill", status: "running", name: "wait" }],
      },
      {
        name: "cancel",
        inject: { kind: "cancel", confidence: 0.99 },
        settleMs: 100,
        expect: [
          { type: "skill", status: "cancelled" },
          { type: "command", kind: "cancel_task" },
        ],
      },
    ],
  },
  {
    id: "navigate-capability-mismatch-on-arm",
    title: "Navigate rejected on fixed-base arm",
    description: "Capability gate blocks navigate on simulated-arm.",
    config: {
      bciBackend: "manual",
      robotBackend: "simulated-arm",
      logLevel: "silent",
      safety: {
        minCommandIntervalMs: 0,
        watchdogTimeoutMs: 0,
        maxIntentionAgeMs: 60_000,
        confirmNavigate: false,
      },
      skills: { enabled: false },
      policies: { noFreeMoveDuringSkill: false },
      simulatedArm: { tickHz: 20 },
    },
    steps: [
      { name: "connect", action: "connect" },
      { name: "enable", action: "enableControl" },
      {
        name: "navigate",
        inject: {
          kind: "navigate",
          confidence: 0.95,
          payload: { goal: { x: 1, y: 0, z: 0 } },
        },
        expect: [
          { type: "rejected" },
          { type: "safety", reason: "capability_mismatch" },
        ],
      },
    ],
  },
];

export function getGoldenScenario(id: string): GoldenScenario | undefined {
  return GOLDEN_SCENARIOS.find((s) => s.id === id);
}

export function listGoldenScenarioIds(): string[] {
  return GOLDEN_SCENARIOS.map((s) => s.id);
}
