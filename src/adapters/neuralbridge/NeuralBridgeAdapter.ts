/**
 * Attach a NeuralBridge-like emitter to NeuraRoboBridge.
 * Zero hard dependency — works with any object that emits intention events.
 */

import type { NeuraRoboBridge } from "../../core/NeuraRoboBridge.js";
import {
  mapNeuralBridgeIntention,
  mapNeuralBridgeGesture,
  type NeuralBridgeIntentionLike,
  type NeuralBridgeGestureLike,
  type IntentionMapFn,
  type GestureMapFn,
} from "./mapIntention.js";

/** Duck-typed NeuralBridge client surface. */
export interface NeuralBridgeLike {
  on(event: string, handler: (...args: never[]) => void): unknown;
  off?(event: string, handler: (...args: never[]) => void): unknown;
  /** Some versions return unsubscribe from on(). */
}

export interface NeuralBridgeAdapterOptions {
  /** Custom intention mapper. Return null to drop. */
  mapIntention?: IntentionMapFn;
  /** Custom gesture mapper. */
  mapGesture?: GestureMapFn;
  /** Forward NeuralBridge gestures (default true). */
  forwardGestures?: boolean;
  /** Only forward when robo bridge control is enabled (default false — still useful for confirm while enabled). */
  requireControlEnabled?: boolean;
  /** Optional filter after mapping. */
  filter?: (input: import("../../types/intention.js").IntentionInput) => boolean;
  onDrop?: (reason: string, event: unknown) => void;
}

/**
 * Bidirectional-ish glue: NeuralBridge events → NeuraRoboBridge.injectIntention.
 */
export class NeuralBridgeAdapter {
  private unsubs: Array<() => void> = [];
  private attached = false;

  constructor(private options: NeuralBridgeAdapterOptions = {}) {}

  /**
   * Wire neural → robo. Returns detach function.
   */
  attach(neural: NeuralBridgeLike, robo: NeuraRoboBridge): () => void {
    this.detach();
    this.attached = true;

    const mapI = this.options.mapIntention ?? mapNeuralBridgeIntention;
    const mapG = this.options.mapGesture ?? mapNeuralBridgeGesture;
    const forwardGestures = this.options.forwardGestures !== false;

    const onIntention = ((event: NeuralBridgeIntentionLike) => {
      if (
        this.options.requireControlEnabled &&
        !robo.isControlEnabled() &&
        event.type !== "cancel" &&
        event.type !== "confirm"
      ) {
        this.options.onDrop?.("control_disabled", event);
        return;
      }
      const mapped = mapI(event);
      if (!mapped) {
        this.options.onDrop?.("unmapped_intention", event);
        return;
      }
      if (this.options.filter && !this.options.filter(mapped)) {
        this.options.onDrop?.("filtered", event);
        return;
      }
      robo.injectIntention(mapped);
    }) as (...args: never[]) => void;

    const onGesture = ((event: NeuralBridgeGestureLike) => {
      if (!forwardGestures) return;
      if (this.options.requireControlEnabled && !robo.isControlEnabled()) {
        this.options.onDrop?.("control_disabled", event);
        return;
      }
      const mapped = mapG(event);
      if (!mapped) {
        this.options.onDrop?.("unmapped_gesture", event);
        return;
      }
      if (this.options.filter && !this.options.filter(mapped)) {
        this.options.onDrop?.("filtered", event);
        return;
      }
      robo.injectIntention(mapped);
    }) as (...args: never[]) => void;

    neural.on("intention", onIntention);
    this.unsubs.push(() => neural.off?.("intention", onIntention));

    if (forwardGestures) {
      neural.on("gesture", onGesture);
      this.unsubs.push(() => neural.off?.("gesture", onGesture));
    }

    return () => this.detach();
  }

  detach(): void {
    for (const u of this.unsubs) {
      try {
        u();
      } catch {
        /* ignore */
      }
    }
    this.unsubs = [];
    this.attached = false;
  }

  isAttached(): boolean {
    return this.attached;
  }
}

/**
 * Convenience: attach once and return detach.
 */
export function attachNeuralBridge(
  neural: NeuralBridgeLike,
  robo: NeuraRoboBridge,
  options?: NeuralBridgeAdapterOptions
): () => void {
  const adapter = new NeuralBridgeAdapter(options);
  return adapter.attach(neural, robo);
}
