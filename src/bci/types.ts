/**
 * BCI backend plugin contract.
 */

import type { NeuralIntention } from "../types/intention.js";

export type BciBackendStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "streaming"
  | "error";

export interface BciBackendEvents {
  intention: (intention: NeuralIntention) => void;
  status: (status: BciBackendStatus, message?: string) => void;
  error: (error: Error) => void;
}

/**
 * All BCI input backends implement this interface.
 * New backends (future Neuralink-class, OpenBCI, etc.) plug in here.
 */
export interface BciBackend {
  readonly id: string;
  readonly name: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  /**
   * Subscribe to intention events.
   * Returns unsubscribe function.
   */
  onIntention(handler: (intention: NeuralIntention) => void): () => void;

  onStatus?(handler: (status: BciBackendStatus, message?: string) => void): () => void;
  onError?(handler: (error: Error) => void): () => void;

  /**
   * Optional: inject an intention (manual / test / keyboard).
   */
  inject?(intention: Omit<NeuralIntention, "id" | "timestamp"> & Partial<Pick<NeuralIntention, "id" | "timestamp">>): void;

  /**
   * Optional lifecycle for auto-scenarios.
   */
  start?(): void;
  stop?(): void;

  dispose?(): void;
}
