/**
 * Minimal typed EventEmitter — zero dependencies, works in browser + Node.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (...args: any[]) => void;

export class TypedEventEmitter<Events extends { [K in keyof Events]: Handler }> {
  private listeners = new Map<keyof Events, Set<Handler>>();

  on<K extends keyof Events>(event: K, handler: Events[K]): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler);
    return () => this.off(event, handler);
  }

  once<K extends keyof Events>(event: K, handler: Events[K]): () => void {
    const wrap = ((...args: Parameters<Events[K]>) => {
      this.off(event, wrap as Events[K]);
      (handler as Handler)(...args);
    }) as Events[K];
    return this.on(event, wrap);
  }

  off<K extends keyof Events>(event: K, handler: Events[K]): void {
    this.listeners.get(event)?.delete(handler as Handler);
  }

  emit<K extends keyof Events>(
    event: K,
    ...args: Parameters<Events[K]>
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(...args);
      } catch (err) {
        // Never let a subscriber crash the bus
        console.error(`[NeuroBridge] listener error on "${String(event)}":`, err);
      }
    }
  }

  removeAllListeners(event?: keyof Events): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  listenerCount(event: keyof Events): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
