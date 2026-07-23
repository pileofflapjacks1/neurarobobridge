import type { BciBackend } from "./types.js";
import type { NeuroBridgeConfig } from "../types/config.js";
import type { Logger } from "../core/Logger.js";
import { SimulatorBciBackend } from "./SimulatorBciBackend.js";
import { PlaybackBciBackend } from "./PlaybackBciBackend.js";
import { ManualBciBackend } from "./ManualBciBackend.js";

export type BciBackendFactory = (
  config: NeuroBridgeConfig,
  log: Logger
) => BciBackend;

const registry = new Map<string, BciBackendFactory>();

export function registerBciBackend(id: string, factory: BciBackendFactory): void {
  registry.set(id, factory);
}

export function createBciBackend(
  config: NeuroBridgeConfig,
  log: Logger
): BciBackend {
  if (config.backends?.bci && isBciBackend(config.backends.bci)) {
    return config.backends.bci;
  }

  const id = config.bciBackend ?? "simulator";
  const factory = registry.get(id);
  if (!factory) {
    throw new Error(
      `Unknown BCI backend "${id}". Registered: ${[...registry.keys()].join(", ") || "(none)"}`
    );
  }
  return factory(config, log);
}

function isBciBackend(v: unknown): v is BciBackend {
  return (
    typeof v === "object" &&
    v !== null &&
    "connect" in v &&
    "onIntention" in v &&
    "id" in v
  );
}

/** Register built-in BCI backends. Idempotent. */
export function registerBuiltinBciBackends(): void {
  if (registry.has("simulator")) return;

  registerBciBackend("simulator", (config, log) => {
    return new SimulatorBciBackend(config.bciSimulator ?? {}, log);
  });

  registerBciBackend("manual", (_config, log) => {
    return new ManualBciBackend(log);
  });

  registerBciBackend("recording", (config, log) => {
    // "recording" as input means playback of a prior session if provided in meta
    return new PlaybackBciBackend(config, log);
  });

  registerBciBackend("playback", (config, log) => {
    return new PlaybackBciBackend(config, log);
  });
}

export function listBciBackends(): string[] {
  return [...registry.keys()];
}
