/**
 * Attach a Neurabridge-like emitter to NeuraRoboBridge.
 * Zero hard dependency — works with any object that emits intention events.
 */

import type { NeuraRoboBridge } from "../../core/NeuraRoboBridge.js";
import {
  mapNeurabridgeIntention,
  mapNeurabridgeGesture,
  type NeurabridgeIntentionLike,
  type NeurabridgeGestureLike,
  type IntentionMapFn,
  type GestureMapFn,
} from "./mapIntention.js";

/** Duck-typed Neurabridge client surface. */
export interface NeurabridgeLike {
  on(event: string, handler: (...args: never[]) => void): unknown;
  off?(event: string, handler: (...args: never[]) => void): unknown;
  /** Some versions return unsubscribe from on(). */
}

export interface NeurabridgeAdapterOptions {
  /** Custom intention mapper. Return null to drop. */
  mapIntention?: IntentionMapFn;
  /** Custom gesture mapper. */
  mapGesture?: GestureMapFn;
  /** Forward Neurabridge gestures (default true). */
  forwardGestures?: boolean;
  /** Only forward when robo bridge control is enabled (default false — still useful for confirm while enabled). */
  requireControlEnabled?: boolean;
  /** Optional filter after mapping. */
  filter?: (input: import("../../types/intention.js").IntentionInput) => boolean;
  onDrop?: (reason: string, event: unknown) => void;
}

/**
 * Bidirectional-ish glue: Neurabridge events → NeuraRoboBridge.injectIntention.
 */
export class NeurabridgeAdapter {
  private unsubs: Array<() => void> = [];
  private attached = false;

  constructor(private options: NeurabridgeAdapterOptions = {}) {}

  /**
   * Wire neural → robo. Returns detach function.
   */
  attach(neural: NeurabridgeLike, robo: NeuraRoboBridge): () => void {
    this.detach();
    this.attached = true;

    const mapI = this.options.mapIntention ?? mapNeurabridgeIntention;
    const mapG = this.options.mapGesture ?? mapNeurabridgeGesture;
    const forwardGestures = this.options.forwardGestures !== false;

    const onIntention = ((event: NeurabridgeIntentionLike) => {
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

    const onGesture = ((event: NeurabridgeGestureLike) => {
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
export function attachNeurabridge(
  neural: NeurabridgeLike,
  robo: NeuraRoboBridge,
  options?: NeurabridgeAdapterOptions
): () => void {
  const adapter = new NeurabridgeAdapter(options);
  return adapter.attach(neural, robo);
}
