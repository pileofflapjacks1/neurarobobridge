/**
 * Bidirectional feedback from robot / pipeline to the human application.
 * Foundation for future haptics, AR overlays, and audio prompts.
 */

/** High-level feedback categories. */
export type FeedbackKind =
  | "task_started"
  | "task_progress"
  | "task_completed"
  | "task_failed"
  | "task_cancelled"
  | "blocked"
  | "needs_help"
  | "contact"
  | "awaiting_confirm"
  | "confirm_timeout"
  | "mode_changed"
  | "watchdog"
  | "latency"
  | "info";

export interface RobotFeedback {
  id: string;
  kind: FeedbackKind;
  /** Human-readable summary. */
  message: string;
  /** Related task id if any. */
  taskId?: string;
  /** Related intention / command ids. */
  intentionId?: string;
  commandId?: string;
  /** Progress 0–1 for long tasks. */
  progress?: number;
  /** Severity for UI. */
  severity?: "info" | "warning" | "critical";
  timestamp: number;
  meta?: Record<string, unknown>;
}

/** Pipeline latency sample (ms). */
export interface LatencySample {
  intentionId: string;
  /** Intention timestamp → safety accept/reject. */
  gateMs: number;
  /** Safety accept → robot.execute returned. */
  executeMs?: number;
  /** Total intention timestamp → execute done. */
  endToEndMs?: number;
  timestamp: number;
}
