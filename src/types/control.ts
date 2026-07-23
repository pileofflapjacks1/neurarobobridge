/**
 * Control authority modes and intention priority for humanoid-class robots.
 */

/**
 * Who is allowed to drive the robot, and how.
 * Default after connect is always `disabled`.
 */
export type ControlMode =
  /** No motion except forced stop / e-stop. */
  | "disabled"
  /** Human intents execute only after policy + optional confirm. */
  | "supervised"
  /** Human intent + robot local assistance (skills may complete). */
  | "shared"
  /** Closer mapping for research; still safety-gated. */
  | "teleop"
  /** Human selects a task; robot executes with human cancel. */
  | "autonomous_task";

/** Fixed priority bands — higher wins / preempts lower. */
export type IntentionPriority =
  | "estop"
  | "stop"
  | "cancel"
  | "confirm"
  | "discrete_task"
  | "continuous"
  | "background";

/**
 * Map intention kinds to priority for arbitration.
 * estop > stop > cancel > confirm > discrete_task > continuous > background
 */
export const INTENTION_PRIORITY: Record<string, IntentionPriority> = {
  // Emergency / hard stop (forced commands use estop separately)
  stop: "stop",
  cancel: "cancel",
  confirm: "confirm",
  reject: "confirm",
  // Discrete high-level
  task: "discrete_task",
  home: "discrete_task",
  grasp: "discrete_task",
  release: "discrete_task",
  navigate: "discrete_task",
  custom: "discrete_task",
  // Continuous modulation
  move: "continuous",
  modulate: "continuous",
};

export const PRIORITY_RANK: Record<IntentionPriority, number> = {
  estop: 100,
  stop: 90,
  cancel: 80,
  confirm: 70,
  discrete_task: 50,
  continuous: 30,
  background: 10,
};

export function priorityOf(kind: string): IntentionPriority {
  return INTENTION_PRIORITY[kind] ?? "background";
}

export function priorityRank(kind: string): number {
  return PRIORITY_RANK[priorityOf(kind)];
}
