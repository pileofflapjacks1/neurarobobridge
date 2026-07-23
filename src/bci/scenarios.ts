/**
 * Built-in BCI scenario scripts for development and demos.
 */

import type { ScenarioStep } from "../types/config.js";

export const SCENARIOS: Record<string, ScenarioStep[]> = {
  /** Simple pick-and-place style sequence. */
  "pick-place": [
    { kind: "home", confidence: 0.95, delayMs: 200 },
    {
      kind: "move",
      confidence: 0.9,
      delayMs: 500,
      payload: {
        target: { x: 0.4, y: 0.1, z: 0.3 },
        speed: 0.6,
      },
    },
    {
      kind: "move",
      confidence: 0.88,
      delayMs: 800,
      payload: {
        target: { x: 0.4, y: 0.1, z: 0.15 },
        speed: 0.4,
      },
    },
    {
      kind: "grasp",
      confidence: 0.92,
      delayMs: 600,
      payload: { force: 0.6 },
    },
    {
      kind: "move",
      confidence: 0.9,
      delayMs: 500,
      payload: {
        target: { x: 0.4, y: 0.1, z: 0.4 },
        speed: 0.5,
      },
    },
    {
      kind: "move",
      confidence: 0.87,
      delayMs: 800,
      payload: {
        target: { x: -0.3, y: 0.2, z: 0.35 },
        speed: 0.55,
      },
    },
    {
      kind: "release",
      confidence: 0.93,
      delayMs: 500,
      payload: {},
    },
    { kind: "home", confidence: 0.95, delayMs: 600 },
  ],

  /** Stress low confidence / glitches for safety demos. */
  "safety-stress": [
    {
      kind: "move",
      confidence: 0.95,
      delayMs: 100,
      payload: { target: { x: 0.2, y: 0, z: 0.4 }, speed: 0.5 },
    },
    {
      kind: "move",
      confidence: 0.4,
      delayMs: 200,
      payload: { target: { x: 0.5, y: 0, z: 0.4 } },
    },
    {
      kind: "move",
      confidence: 0.92,
      delayMs: 200,
      payload: { target: { x: 2.0, y: 0, z: 0.4 } }, // workspace violation
    },
    {
      kind: "grasp",
      confidence: 0.3,
      delayMs: 200,
      payload: { force: 0.8 },
    },
    {
      kind: "stop",
      confidence: 0.99,
      delayMs: 300,
    },
    {
      kind: "move",
      confidence: 0.9,
      delayMs: 200,
      payload: { target: { x: 0.1, y: 0.1, z: 0.3 } },
      repeat: 20,
      repeatGapMs: 20, // rate limit trigger
    },
  ],

  /** Idle / demo loop of small moves. */
  demo: [
    {
      kind: "move",
      confidence: 0.9,
      delayMs: 0,
      payload: { target: { x: 0.3, y: 0.0, z: 0.4 }, speed: 0.5 },
    },
    {
      kind: "move",
      confidence: 0.88,
      delayMs: 1000,
      payload: { target: { x: 0.0, y: 0.3, z: 0.35 }, speed: 0.5 },
    },
    {
      kind: "grasp",
      confidence: 0.91,
      delayMs: 800,
      payload: { force: 0.5 },
    },
    {
      kind: "release",
      confidence: 0.9,
      delayMs: 600,
    },
    {
      kind: "home",
      confidence: 0.95,
      delayMs: 800,
    },
  ],

  /** Navigate-focused (for humanoid / mobile). */
  navigate: [
    {
      kind: "navigate",
      confidence: 0.9,
      delayMs: 200,
      payload: { goal: { x: 1.0, y: 0, z: 0 }, speed: 0.4 },
    },
    {
      kind: "navigate",
      confidence: 0.88,
      delayMs: 1500,
      payload: { goal: { x: 1.0, y: 1.0, z: 0 }, yaw: 1.57, speed: 0.4 },
    },
    {
      kind: "stop",
      confidence: 0.99,
      delayMs: 1500,
    },
  ],
};

export function resolveScenario(
  scenario: string | ScenarioStep[] | undefined
): ScenarioStep[] {
  if (!scenario) return [];
  if (Array.isArray(scenario)) return scenario;
  const steps = SCENARIOS[scenario];
  if (!steps) {
    throw new Error(
      `Unknown scenario "${scenario}". Available: ${Object.keys(SCENARIOS).join(", ")}`
    );
  }
  return steps;
}
