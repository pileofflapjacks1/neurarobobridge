import type { RobotBackend } from "./types.js";
import type { NeuraRoboBridgeConfig } from "../types/config.js";
import type { Logger } from "../core/Logger.js";
import { SimulatedArmBackend } from "./SimulatedArmBackend.js";
import { SimulatedHumanoidBackend } from "./SimulatedHumanoidBackend.js";
import { NullRobotBackend } from "./NullRobotBackend.js";

export type RobotBackendFactory = (
  config: NeuraRoboBridgeConfig,
  log: Logger
) => RobotBackend;

const registry = new Map<string, RobotBackendFactory>();

export function registerRobotBackend(
  id: string,
  factory: RobotBackendFactory
): void {
  registry.set(id, factory);
}

export function createRobotBackend(
  config: NeuraRoboBridgeConfig,
  log: Logger
): RobotBackend {
  if (config.backends?.robot && isRobotBackend(config.backends.robot)) {
    return config.backends.robot;
  }

  const id = config.robotBackend ?? "simulated-arm";
  const factory = registry.get(id);
  if (!factory) {
    throw new Error(
      `Unknown robot backend "${id}". Registered: ${[...registry.keys()].join(", ") || "(none)"}`
    );
  }
  return factory(config, log);
}

function isRobotBackend(v: unknown): v is RobotBackend {
  return (
    typeof v === "object" &&
    v !== null &&
    "connect" in v &&
    "execute" in v &&
    "getState" in v &&
    "id" in v
  );
}

export function registerBuiltinRobotBackends(): void {
  if (registry.has("simulated-arm")) return;

  registerRobotBackend("simulated-arm", (config, log) => {
    return new SimulatedArmBackend(config.simulatedArm ?? {}, log);
  });

  registerRobotBackend("simulated-humanoid", (config, log) => {
    return new SimulatedHumanoidBackend(config.simulatedHumanoid ?? {}, log);
  });

  registerRobotBackend("null", (_config, log) => {
    return new NullRobotBackend(log);
  });
}

export function listRobotBackends(): string[] {
  return [...registry.keys()];
}
