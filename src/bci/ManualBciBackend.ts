/**
 * Manual BCI backend — intentions only via inject().
 * Useful for unit tests and app-driven control.
 */

import type { BciBackend, BciBackendStatus } from "./types.js";
import type { NeuralIntention } from "../types/intention.js";
import { createId } from "../core/id.js";
import type { Logger } from "../core/Logger.js";

type IntentionHandler = (i: NeuralIntention) => void;

export class ManualBciBackend implements BciBackend {
  readonly id = "manual";
  readonly name = "Manual BCI";

  private connected = false;
  private handlers = new Set<IntentionHandler>();
  private statusHandlers = new Set<(s: BciBackendStatus, m?: string) => void>();

  constructor(private log?: Logger) {}

  async connect(): Promise<void> {
    this.connected = true;
    this.statusHandlers.forEach((h) => h("connected"));
    this.log?.info("Manual BCI connected");
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.statusHandlers.forEach((h) => h("disconnected"));
  }

  isConnected(): boolean {
    return this.connected;
  }

  onIntention(handler: IntentionHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onStatus(handler: (s: BciBackendStatus, m?: string) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  inject(
    partial: Omit<NeuralIntention, "id" | "timestamp"> &
      Partial<Pick<NeuralIntention, "id" | "timestamp">>
  ): void {
    if (!this.connected) return;
    const intention: NeuralIntention = {
      id: partial.id ?? createId("int"),
      kind: partial.kind,
      payload: partial.payload,
      confidence: partial.confidence,
      quality: partial.quality,
      timestamp: partial.timestamp ?? Date.now(),
      source: this.id,
      meta: partial.meta,
    };
    for (const h of this.handlers) h(intention);
  }

  dispose(): void {
    this.handlers.clear();
    this.statusHandlers.clear();
    this.connected = false;
  }
}
