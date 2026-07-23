import type { NeuraRoboBridgeConfig, BciSimulatorConfig, SimulatedArmConfig } from "../types/config.js";
import type { SafetyConfig } from "../types/safety.js";
import type { WorkspaceLimits, JointLimits } from "../types/robot.js";

export const DEFAULT_WORKSPACE: WorkspaceLimits = {
  min: { x: -0.8, y: -0.8, z: 0.0 },
  max: { x: 0.8, y: 0.8, z: 1.2 },
};

export const DEFAULT_ARM_JOINT_LIMITS: JointLimits[] = [
  { name: "joint_1", min: -Math.PI, max: Math.PI, maxVelocity: 1.5 },
  { name: "joint_2", min: -Math.PI / 2, max: Math.PI / 2, maxVelocity: 1.5 },
  { name: "joint_3", min: -Math.PI, max: Math.PI, maxVelocity: 1.5 },
  { name: "joint_4", min: -Math.PI, max: Math.PI, maxVelocity: 2.0 },
  { name: "joint_5", min: -Math.PI / 2, max: Math.PI / 2, maxVelocity: 2.0 },
  { name: "joint_6", min: -Math.PI, max: Math.PI, maxVelocity: 2.0 },
];

/** Default high-risk tasks that require confirm-to-execute. */
export const DEFAULT_CONFIRM_TASKS = [
  "open_door",
  "hand_over",
  "follow_me",
  "go_to",
];

export const DEFAULT_SAFETY: Required<
  Pick<
    SafetyConfig,
    | "minConfidence"
    | "maxIntentionsPerSecond"
    | "minCommandIntervalMs"
    | "enableEmergencyStop"
    | "maxSpeed"
    | "requireQuality"
    | "maxIntentionAgeMs"
    | "maxTaskAgeMs"
    | "watchdogTimeoutMs"
    | "watchdogPollMs"
    | "watchdogAction"
    | "confirmTimeoutMs"
    | "confirmNavigate"
    | "defaultControlMode"
  >
> &
  SafetyConfig = {
  minConfidence: 0.75,
  maxIntentionsPerSecond: 10,
  minCommandIntervalMs: 50,
  enableEmergencyStop: true,
  maxSpeed: 1.0,
  requireQuality: false,
  workspaceLimits: DEFAULT_WORKSPACE,
  jointLimits: DEFAULT_ARM_JOINT_LIMITS,
  maxIntentionAgeMs: 250,
  maxTaskAgeMs: 2000,
  watchdogTimeoutMs: 1500,
  watchdogPollMs: 100,
  watchdogAction: "stop",
  confirmTasks: DEFAULT_CONFIRM_TASKS,
  confirmIntentions: [],
  confirmTimeoutMs: 5000,
  confirmNavigate: true,
  defaultControlMode: "supervised",
};

export const DEFAULT_BCI_SIMULATOR: Required<
  Pick<
    BciSimulatorConfig,
    | "autoRateHz"
    | "baseConfidence"
    | "confidenceNoise"
    | "glitchProbability"
    | "enableInputMapping"
  >
> &
  BciSimulatorConfig = {
  autoRateHz: 0,
  baseConfidence: 0.9,
  confidenceNoise: 0.1,
  glitchProbability: 0.05,
  enableInputMapping: true,
};

export const DEFAULT_SIMULATED_ARM: Required<
  Pick<
    SimulatedArmConfig,
    "dof" | "tickHz" | "maxJointVelocity" | "textVizInterval"
  >
> &
  SimulatedArmConfig = {
  dof: 6,
  tickHz: 30,
  maxJointVelocity: 1.5,
  textVizInterval: 0,
  jointNames: [
    "joint_1",
    "joint_2",
    "joint_3",
    "joint_4",
    "joint_5",
    "joint_6",
  ],
  jointLimits: DEFAULT_ARM_JOINT_LIMITS,
  workspaceLimits: DEFAULT_WORKSPACE,
  homeJoints: [0, 0, 0, 0, 0, 0],
};

export function resolveConfig(
  partial: NeuraRoboBridgeConfig = {}
): Required<
  Pick<
    NeuraRoboBridgeConfig,
    "bciBackend" | "robotBackend" | "logLevel" | "debug" | "recording"
  >
> &
  NeuraRoboBridgeConfig {
  return {
    bciBackend: partial.bciBackend ?? "simulator",
    robotBackend: partial.robotBackend ?? "simulated-arm",
    safety: { ...DEFAULT_SAFETY, ...partial.safety },
    bciSimulator: { ...DEFAULT_BCI_SIMULATOR, ...partial.bciSimulator },
    simulatedArm: { ...DEFAULT_SIMULATED_ARM, ...partial.simulatedArm },
    simulatedHumanoid: partial.simulatedHumanoid ?? {},
    recording: partial.recording ?? false,
    logLevel: partial.debug ? "debug" : (partial.logLevel ?? "info"),
    debug: partial.debug ?? false,
    backends: partial.backends,
  };
}
