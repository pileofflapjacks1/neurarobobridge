/**
 * High-quality BCI Simulator backend.
 * - Scenario scripting
 * - Configurable noise / confidence
 * - Manual intention injection (keyboard mapping hooks)
 * - Deterministic seed support
 */

import type { BciBackend, BciBackendStatus } from "./types.js";
import type { BciSimulatorConfig, ScenarioStep } from "../types/config.js";
import type {
  NeuralIntention,
  IntentionKind,
  IntentionPayload,
} from "../types/intention.js";
import { DEFAULT_BCI_SIMULATOR } from "../core/defaults.js";
import { createId } from "../core/id.js";
import type { Logger } from "../core/Logger.js";
import { resolveScenario } from "./scenarios.js";

type IntentionHandler = (i: NeuralIntention) => void;
type StatusHandler = (s: BciBackendStatus, message?: string) => void;
type ErrorHandler = (e: Error) => void;

/** Simple mulberry32 PRNG for reproducible noise. */
function createRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export class SimulatorBciBackend implements BciBackend {
  readonly id = "simulator";
  readonly name = "BCI Simulator";

  private connected = false;
  private config: BciSimulatorConfig;
  private intentionHandlers = new Set<IntentionHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private errorHandlers = new Set<ErrorHandler>();
  private rng: () => number;
  private scenarioTimer: ReturnType<typeof setTimeout> | null = null;
  private autoTimer: ReturnType<typeof setInterval> | null = null;
  private scenarioRunning = false;
  private disposed = false;

  constructor(
    config: BciSimulatorConfig = {},
    private log?: Logger
  ) {
    this.config = { ...DEFAULT_BCI_SIMULATOR, ...config };
    this.rng = createRng(this.config.seed ?? Date.now());
  }

  async connect(): Promise<void> {
    if (this.disposed) throw new Error("Simulator disposed");
    this.emitStatus("connecting");
    await delay(10);
    this.connected = true;
    this.emitStatus("connected", "BCI Simulator ready");
    this.log?.info("BCI Simulator connected");

    if (this.config.scenario) {
      // Auto-start scenario after connect
      queueMicrotask(() => this.startScenario());
    }
    if ((this.config.autoRateHz ?? 0) > 0) {
      this.startAuto();
    }
  }

  async disconnect(): Promise<void> {
    this.stop();
    this.connected = false;
    this.emitStatus("disconnected");
    this.log?.info("BCI Simulator disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  onIntention(handler: IntentionHandler): () => void {
    this.intentionHandlers.add(handler);
    return () => this.intentionHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  inject(
    partial: Omit<NeuralIntention, "id" | "timestamp"> &
      Partial<Pick<NeuralIntention, "id" | "timestamp">>
  ): void {
    if (!this.connected) {
      this.log?.warn("inject() called while disconnected — ignored");
      return;
    }
    const intention = this.buildIntention(partial);
    this.emitIntention(intention);
  }

  start(): void {
    if (this.config.scenario) this.startScenario();
    if ((this.config.autoRateHz ?? 0) > 0) this.startAuto();
  }

  stop(): void {
    if (this.scenarioTimer) {
      clearTimeout(this.scenarioTimer);
      this.scenarioTimer = null;
    }
    if (this.autoTimer) {
      clearInterval(this.autoTimer);
      this.autoTimer = null;
    }
    this.scenarioRunning = false;
  }

  /** Run (or re-run) the configured scenario. */
  startScenario(steps?: ScenarioStep[]): void {
    if (!this.connected) return;
    this.stop();
    let resolved: ScenarioStep[];
    try {
      resolved = steps ?? resolveScenario(this.config.scenario);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.errorHandlers.forEach((h) => h(e));
      return;
    }
    if (resolved.length === 0) return;
    this.scenarioRunning = true;
    this.emitStatus("streaming", "Scenario playing");
    this.runScenarioSteps(resolved, 0);
  }

  dispose(): void {
    this.stop();
    this.connected = false;
    this.disposed = true;
    this.intentionHandlers.clear();
    this.statusHandlers.clear();
    this.errorHandlers.clear();
  }

  private runScenarioSteps(steps: ScenarioStep[], index: number): void {
    if (!this.scenarioRunning || !this.connected || index >= steps.length) {
      this.scenarioRunning = false;
      this.emitStatus("connected", "Scenario complete");
      return;
    }

    const step = steps[index]!;
    const delayMs = step.delayMs ?? 0;

    this.scenarioTimer = setTimeout(() => {
      const repeats = step.repeat ?? 1;
      const gap = step.repeatGapMs ?? 200;
      let r = 0;

      const fireOne = () => {
        if (!this.scenarioRunning || !this.connected) return;
        this.emitIntention(this.intentionFromStep(step));
        r++;
        if (r < repeats) {
          this.scenarioTimer = setTimeout(fireOne, gap);
        } else {
          this.runScenarioSteps(steps, index + 1);
        }
      };
      fireOne();
    }, delayMs);
  }

  private startAuto(): void {
    const hz = this.config.autoRateHz ?? 0;
    if (hz <= 0) return;
    const period = Math.max(20, 1000 / hz);
    this.autoTimer = setInterval(() => {
      if (!this.connected) return;
      this.emitIntention(
        this.buildIntention({
          kind: "move",
          confidence: this.sampleConfidence(),
          payload: {
            target: {
              x: (this.rng() - 0.5) * 0.6,
              y: (this.rng() - 0.5) * 0.6,
              z: 0.2 + this.rng() * 0.4,
            },
            speed: 0.3 + this.rng() * 0.4,
            relative: false,
          },
        })
      );
    }, period);
    this.emitStatus("streaming", `Auto intentions @ ${hz} Hz`);
  }

  private intentionFromStep(step: ScenarioStep): NeuralIntention {
    return this.buildIntention({
      kind: step.kind as IntentionKind,
      confidence: step.confidence ?? this.sampleConfidence(),
      quality: step.quality,
      payload: step.payload as IntentionPayload,
    });
  }

  private buildIntention(
    partial: Omit<NeuralIntention, "id" | "timestamp"> &
      Partial<Pick<NeuralIntention, "id" | "timestamp">>
  ): NeuralIntention {
    let confidence = partial.confidence;
    // Apply glitch / noise unless confidence was explicitly very low for testing
    if (partial.confidence === undefined || partial.confidence >= 0.5) {
      confidence = this.sampleConfidence(partial.confidence);
    }
    return {
      id: partial.id ?? createId("int"),
      kind: partial.kind,
      payload: partial.payload,
      confidence: clamp01(confidence),
      quality: partial.quality,
      timestamp: partial.timestamp ?? Date.now(),
      source: this.id,
      meta: partial.meta,
    };
  }

  private sampleConfidence(base?: number): number {
    const b = base ?? this.config.baseConfidence ?? 0.9;
    const noise = this.config.confidenceNoise ?? 0.1;
    const glitchP = this.config.glitchProbability ?? 0.05;
    if (this.rng() < glitchP) {
      return this.rng() * 0.5; // low confidence glitch
    }
    const c = b + (this.rng() * 2 - 1) * noise;
    return clamp01(c);
  }

  private emitIntention(intention: NeuralIntention): void {
    this.log?.debug("Simulator intention", intention.kind, intention.confidence);
    for (const h of this.intentionHandlers) {
      try {
        h(intention);
      } catch (err) {
        this.log?.error("intention handler error", err);
      }
    }
  }

  private emitStatus(status: BciBackendStatus, message?: string): void {
    for (const h of this.statusHandlers) h(status, message);
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
