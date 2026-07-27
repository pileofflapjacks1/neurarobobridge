import { describe, it, expect, afterEach } from "vitest";
import {
  NeuraRoboBridge,
  buildBlackBox,
  formatBlackBoxReport,
} from "../src/index.js";

describe("Black-box session export", () => {
  let bridge: NeuraRoboBridge;

  afterEach(() => {
    bridge?.dispose();
  });

  it("summarizes motions and safety from a short session", async () => {
    bridge = new NeuraRoboBridge({
      bciBackend: "manual",
      robotBackend: "null",
      logLevel: "silent",
      recording: true,
      safety: {
        minCommandIntervalMs: 0,
        watchdogTimeoutMs: 0,
        maxIntentionAgeMs: 60_000,
      },
      skills: { enabled: false },
      policies: { noFreeMoveDuringSkill: false },
    });

    await bridge.connect();
    await bridge.enableControl();

    bridge.injectIntention({
      kind: "move",
      confidence: 0.2,
      payload: { target: { x: 0.1, y: 0, z: 0.3 } },
    });
    bridge.injectIntention({
      kind: "move",
      confidence: 0.95,
      payload: { target: { x: 0.15, y: 0, z: 0.35 } },
    });
    bridge.injectIntention({ kind: "home", confidence: 0.95 });

    const box = bridge.exportBlackBox({
      meta: { test: true },
    });

    expect(box.version).toBe(1);
    expect(box.summary.intentionCount).toBeGreaterThanOrEqual(3);
    expect(box.summary.commandCount).toBeGreaterThanOrEqual(1);
    expect(box.summary.safetyCount).toBeGreaterThanOrEqual(1);
    expect(box.whyItMoved.length).toBeGreaterThanOrEqual(1);
    expect(box.narrative.length).toBeGreaterThan(0);

    const text = formatBlackBoxReport(box);
    expect(text).toContain("black-box report");
    expect(text).toContain("Why it moved");

    // Pure function path
    const again = buildBlackBox(box.session);
    expect(again.summary.intentionCount).toBe(box.summary.intentionCount);
  });
});
