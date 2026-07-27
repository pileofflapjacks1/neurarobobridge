/**
 * CI golden scenario pack — safety + skills regression suite.
 */
import { describe, it, expect } from "vitest";
import {
  GOLDEN_SCENARIOS,
  runGoldenScenario,
  listGoldenScenarioIds,
} from "../src/scenarios/index.js";

describe("Golden scenario pack", () => {
  it("registers the expected scenario set", () => {
    const ids = listGoldenScenarioIds();
    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(ids).toContain("control-disabled-rejects-move");
    expect(ids).toContain("skill-step-timeout-needs-help");
    expect(ids).toContain("pick-object-skill-succeeds");
  });

  it.each(GOLDEN_SCENARIOS.map((s) => [s.id, s] as const))(
    "passes scenario: %s",
    async (_id, scenario) => {
      const result = await runGoldenScenario(scenario);
      if (!result.ok) {
        const detail = result.steps
          .filter((s) => !s.ok)
          .map((s) => `  ✗ ${s.name}: ${s.errors.join("; ")}`)
          .join("\n");
        expect.fail(`${scenario.id} failed:\n${detail}`);
      }
      expect(result.ok).toBe(true);
    },
    20_000
  );
});
