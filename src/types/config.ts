/**
 * Top-level NeuraRoboBridge configuration.
 */

import type { SafetyConfig } from "./safety.js";
import type { WorkspaceLimits, JointLimits } from "./robot.js";

/** Built-in BCI backend identifiers. */
export type BciBackendId =
  | "simulator"
  | "recording"
  | "playback"
  | "manual"
  | (string & {});

/** Built-in robot backend identifiers. */
export type RobotBackendId =
  | "simulated-arm"
  | "simulated-humanoid"
  | "null"
  | (string & {});

/** BCI simulator configuration. */
export interface BciSimulatorConfig {
  /** Intention generation rate (Hz) when auto-running. Default 0 (manual only). */
  autoRateHz?: number;
  /** Base confidence for generated intentions. Default 0.9. */
  baseConfidence?: number;
  /** Confidence noise amplitude [0, 1]. Default 0.1. */
  confidenceNoise?: number;
  /** Probability of injecting a low-confidence “glitch”. Default 0.05. */
  glitchProbability?: number;
  /** Enable keyboard / gamepad style input mapping (Node keypress or browser). */
  enableInputMapping?: boolean;
  /** Scenario name or inline steps. */
  scenario?: string | ScenarioStep[];
  /** Random seed for reproducible runs. */
  seed?: number;
}

/** One step in a BCI scenario script. */
export interface ScenarioStep {
  /** Delay before this step (ms). Default 0. */
  delayMs?: number;
  kind: string;
  payload?: Record<string, unknown>;
  confidence?: number;
  quality?: number;
  /** Repeat this step N times. Default 1. */
  repeat?: number;
  /** Gap between repeats (ms). Default 200. */
  repeatGapMs?: number;
}

/** Simulated robot arm configuration. */
export interface SimulatedArmConfig {
  /** Number of revolute joints. Default 6. */
  dof?: number;
  /** Joint names. */
  jointNames?: string[];
  jointLimits?: JointLimits[];
  workspaceLimits?: WorkspaceLimits;
  /** Simulation tick rate (Hz). Default 30. */
  tickHz?: number;
  /** Max joint velocity rad/s. Default 1.5. */
  maxJointVelocity?: number;
  /** Log ASCII pose each N ticks (0 = off). Default 0. */
  textVizInterval?: number;
  /** Initial joint positions. */
  homeJoints?: number[];
}

/** Simulated humanoid (simplified torso + arms + base). */
export interface SimulatedHumanoidConfig {
  tickHz?: number;
  workspaceLimits?: WorkspaceLimits;
  maxBaseSpeed?: number;
  textVizInterval?: number;
}

/** Session recording options. */
export interface RecordingConfig {
  /** Record intentions. Default true when recording enabled. */
  recordIntentions?: boolean;
  /** Record robot state snapshots. Default true. */
  recordRobotState?: boolean;
  /** Record safety events. Default true. */
  recordSafetyEvents?: boolean;
  /** Max events retained in memory. Default 10_000. */
  maxEvents?: number;
}

/** Logging level. */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

/**
 * Primary configuration object for `new NeuraRoboBridge(config)`.
 */
export interface NeuraRoboBridgeConfig {
  /** BCI input backend id or instance. Default "simulator". */
  bciBackend?: BciBackendId;
  /** Robot output backend id or instance. Default "simulated-arm". */
  robotBackend?: RobotBackendId;
  /** Safety policy. */
  safety?: SafetyConfig;
  /** BCI simulator options (when bciBackend is simulator). */
  bciSimulator?: BciSimulatorConfig;
  /** Simulated arm options. */
  simulatedArm?: SimulatedArmConfig;
  /** Simulated humanoid options. */
  simulatedHumanoid?: SimulatedHumanoidConfig;
  /** Enable session recording. Default false. */
  recording?: boolean | RecordingConfig;
  /** Log level. Default "info". */
  logLevel?: LogLevel;
  /** Debug mode — verbose safety + pipeline logs. Default false. */
  debug?: boolean;
  /** Optional custom backend instances (advanced). */
  backends?: {
    bci?: unknown;
    robot?: unknown;
  };
}
