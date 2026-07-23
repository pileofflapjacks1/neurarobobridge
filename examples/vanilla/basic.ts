/**
 * Basic NeuroBridge demo — simulator BCI → simulated arm.
 *
 * Run: npx tsx examples/vanilla/basic.ts
 */

import { NeuroBridge } from "../../src/index.js";

async function main() {
  const bridge = new NeuroBridge({
    bciBackend: "simulator",
    robotBackend: "simulated-arm",
    debug: true,
    safety: {
      minConfidence: 0.75,
      enableEmergencyStop: true,
      workspaceLimits: {
        min: { x: -0.8, y: -0.8, z: 0 },
        max: { x: 0.8, y: 0.8, z: 1.2 },
      },
    },
    bciSimulator: {
      scenario: "pick-place",
      confidenceNoise: 0.05,
      glitchProbability: 0.02,
      seed: 7,
    },
    simulatedArm: {
      tickHz: 20,
      textVizInterval: 20, // log ASCII arm state periodically
    },
    recording: true,
  });

  bridge.on("status", (e) => {
    console.log(`[status] ${e.status}${e.message ? ` — ${e.message}` : ""}`);
  });

  bridge.on("intention", (i) => {
    console.log(
      `[intention] ${i.kind} conf=${i.confidence.toFixed(2)} id=${i.id.slice(0, 12)}…`
    );
  });

  bridge.on("command", (c) => {
    console.log(`[command] ${c.kind} (from ${c.intentionId?.slice(0, 12) ?? "?"}…)`);
  });

  bridge.on("intentionRejected", (i, reason) => {
    console.warn(`[rejected] ${i.kind}: ${reason}`);
  });

  bridge.on("safetyEvent", (e) => {
    console.warn(`[safety:${e.severity}] ${e.reason} — ${e.message}`);
  });

  bridge.on("robotState", (s) => {
    if (s.mode === "ready" || s.mode === "estop") {
      const p = s.pose?.position;
      console.log(
        `[robot] mode=${s.mode}` +
          (p ? ` ee=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)})` : "") +
          (s.message ? ` ${s.message}` : "")
      );
    }
  });

  await bridge.connect();
  // Safety: explicit enable required
  await bridge.enableControl();

  console.log("\n▶ Running pick-place scenario…\n");

  // Scenario already auto-started from config; wait for completion
  await sleep(12_000);

  const rec = bridge.stopRecording();
  console.log(`\nSession recorded: ${rec.id} (${rec.events.length} events)`);

  await bridge.disableControl();
  await bridge.disconnect();
  bridge.dispose();
  console.log("Done.");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
