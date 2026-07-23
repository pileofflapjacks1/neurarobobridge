/**
 * Playback BCI backend — replays intentions from a SessionRecording.
 * Configure via config.backends or by calling loadRecording().
 */

import type { BciBackend, BciBackendStatus } from "./types.js";
import type { NeuroBridgeConfig } from "../types/config.js";
import type { NeuralIntention } from "../types/intention.js";
import type { SessionRecording } from "../types/session.js";
import type { Logger } from "../core/Logger.js";

type IntentionHandler = (i: NeuralIntention) => void;

export class PlaybackBciBackend implements BciBackend {
  readonly id = "playback";
  readonly name = "Session Playback";

  private connected = false;
  private recording: SessionRecording | null = null;
  private handlers = new Set<IntentionHandler>();
  private statusHandlers = new Set<(s: BciBackendStatus, m?: string) => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private playing = false;

  constructor(
    _config: NeuroBridgeConfig,
    private log?: Logger
  ) {
    // Optional: load from config.meta if present later
    void _config;
  }

  loadRecording(recording: SessionRecording): void {
    this.recording = recording;
    this.log?.info(
      `Playback loaded session ${recording.id} (${recording.events.length} events)`
    );
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.statusHandlers.forEach((h) => h("connected"));
    this.log?.info("Playback BCI connected");
  }

  async disconnect(): Promise<void> {
    this.stop();
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

  start(): void {
    if (!this.recording || !this.connected) {
      this.log?.warn("Playback start ignored — no recording or not connected");
      return;
    }
    this.stop();
    this.playing = true;
    this.statusHandlers.forEach((h) => h("streaming", "Playing session"));

    for (const event of this.recording.events) {
      if (event.type !== "intention" || !event.intention) continue;
      const intention = event.intention;
      const timer = setTimeout(() => {
        if (!this.playing) return;
        for (const h of this.handlers) {
          h({ ...intention, timestamp: Date.now() });
        }
      }, event.t);
      this.timers.push(timer);
    }

    const endT =
      this.recording.events.reduce((m, e) => Math.max(m, e.t), 0) + 50;
    this.timers.push(
      setTimeout(() => {
        this.playing = false;
        this.statusHandlers.forEach((h) => h("connected", "Playback complete"));
      }, endT)
    );
  }

  stop(): void {
    this.playing = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  inject(
    partial: Omit<NeuralIntention, "id" | "timestamp"> &
      Partial<Pick<NeuralIntention, "id" | "timestamp">>
  ): void {
    // Allow manual inject during playback for hybrid tests
    if (!this.connected) return;
    const intention: NeuralIntention = {
      id: partial.id ?? `pb_${Date.now()}`,
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
    this.stop();
    this.handlers.clear();
    this.statusHandlers.clear();
    this.connected = false;
  }
}
