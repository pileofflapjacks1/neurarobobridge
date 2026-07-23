/**
 * Robot backend plugin contract.
 */

import type { RobotCommand, RobotState } from "../types/robot.js";
import type { RobotCapabilities } from "../types/capabilities.js";
import type { RobotFeedback } from "../types/feedback.js";

export type RobotBackendStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "estop";

/**
 * All robot output backends implement this interface.
 * New platforms (ROS 2, future humanoids, etc.) plug in here.
 */
export interface RobotBackend {
  readonly id: string;
  readonly name: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  /** Capability handshake — required after connect for safety gates. */
  getCapabilities(): RobotCapabilities;

  /** Execute a validated command from the safety engine. */
  execute(command: RobotCommand): Promise<void> | void;

  /** Current state snapshot. */
  getState(): RobotState;

  /**
   * Subscribe to state updates.
   * Returns unsubscribe function.
   */
  onState(handler: (state: RobotState) => void): () => void;

  /**
   * Optional task/contact/blocked feedback channel.
   */
  onFeedback?(handler: (feedback: RobotFeedback) => void): () => void;

  onStatus?(handler: (status: RobotBackendStatus, message?: string) => void): () => void;
  onError?(handler: (error: Error) => void): () => void;

  /** Instant stop — must be safe and synchronous if possible. */
  emergencyStop(): void;

  dispose?(): void;
}
