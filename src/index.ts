/**
 * NeuraRoboBridge — BCI-to-Robot connector / middleware.
 *
 * @packageDocumentation
 */

export { NeuraRoboBridge } from "./core/NeuraRoboBridge.js";

export {
  TypedEventEmitter,
  Logger,
  translateIntention,
  createId,
  resolveConfig,
  DEFAULT_SAFETY,
  DEFAULT_WORKSPACE,
  DEFAULT_ARM_JOINT_LIMITS,
  DEFAULT_BCI_SIMULATOR,
  DEFAULT_SIMULATED_ARM,
  DEFAULT_CONFIRM_TASKS,
} from "./core/index.js";

export {
  SafetyEngine,
  extractPosition,
  ConfirmManager,
  Watchdog,
} from "./safety/index.js";
export type { SafetyDecision } from "./safety/index.js";

export {
  registerBciBackend,
  createBciBackend,
  registerBuiltinBciBackends,
  listBciBackends,
  SimulatorBciBackend,
  ManualBciBackend,
  PlaybackBciBackend,
  SCENARIOS,
  resolveScenario,
} from "./bci/index.js";
export type {
  BciBackend,
  BciBackendStatus,
  BciBackendEvents,
  BciBackendFactory,
} from "./bci/index.js";

export {
  registerRobotBackend,
  createRobotBackend,
  registerBuiltinRobotBackends,
  listRobotBackends,
  SimulatedArmBackend,
  SimulatedHumanoidBackend,
  NullRobotBackend,
} from "./robot/index.js";
export type {
  RobotBackend,
  RobotBackendStatus,
  RobotBackendFactory,
} from "./robot/index.js";

export { SessionRecorder } from "./recording/index.js";

export {
  INTENTION_PRIORITY,
  PRIORITY_RANK,
  priorityOf,
  priorityRank,
  armCapabilities,
  humanoidCapabilities,
  nullCapabilities,
} from "./types/index.js";

export type {
  IntentionKind,
  Vec3,
  Quat,
  Pose,
  MovePayload,
  GraspPayload,
  ReleasePayload,
  NavigatePayload,
  CustomPayload,
  ConfirmPayload,
  IntentionPayload,
  NeuralIntention,
  IntentionInput,
  RobotCommandKind,
  RobotCommand,
  JointState,
  GripperState,
  RobotMode,
  RobotState,
  WorkspaceLimits,
  JointLimits,
  SafetyReason,
  SafetySeverity,
  SafetyEvent,
  SafetyConfig,
  SafetyStatus,
  BciBackendId,
  RobotBackendId,
  BciSimulatorConfig,
  ScenarioStep,
  SimulatedArmConfig,
  SimulatedHumanoidConfig,
  RecordingConfig,
  LogLevel,
  NeuraRoboBridgeConfig,
  BridgeStatus,
  BridgeStatusEvent,
  BridgeErrorEvent,
  ControlModeEvent,
  NeuraRoboBridgeEvents,
  NeuraRoboBridgeEventName,
  SessionEventType,
  SessionMarker,
  SessionEvent,
  SessionRecording,
  ControlMode,
  IntentionPriority,
  RobotCapabilities,
  EffectorInfo,
  FeedbackKind,
  RobotFeedback,
  LatencySample,
  TaskName,
  TaskPayload,
  ModulatePayload,
  PendingConfirmation,
  TaskStatus,
  ActiveTask,
} from "./types/index.js";
