/**
 * Safety-focused demo — shows confidence gating, workspace clamp, rate limit, e-stop.
 *
 * Run: npx tsx examples/vanilla/safety-demo.ts
 */

import { NeuraRoboBridge } from "../../src/index.js";

async function main() {
  const bridge = new NeuraRoboBridge({
    bciBackend: "manual",
    robotBackend: "simulated-arm",
    logLevel: "info",
    safety: {
      minConfidence: 0.75,
      maxIntentionsPerSecond: 5,
      minCommandIntervalMs: 50,
      enableEmergencyStop: true,
      workspaceLimits: {
        min: { x: -0.4, y: -0.4, z: 0.05 },
        max: { x: 0.4, y: 0.4, z: 0.8 },
      },
      maxSpeed: 0.6,
    },
  });

  bridge.on("safetyEvent", (e) => {
    console.log(`  ⚠ safety [${e.severity}] ${e.reason}: ${e.message}`);
  });
  bridge.on("command", (c) => {
    const pos = c.pose?.position;
    console.log(
      `  ✓ command ${c.kind}` +
        (pos ? ` → (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})` : "")
    );
  });
  bridge.on("intentionRejected", (i, reason) => {
    console.log(`  ✗ rejected ${i.kind} conf=${i.confidence.toFixed(2)} — ${reason}`);
  });

  await bridge.connect();
  console.log("Connected. Control still disabled.\n");

  console.log("1) Motion while control disabled (should reject):");
  bridge.injectIntention({
    kind: "move",
    confidence: 0.99,
    payload: { target: { x: 0.2, y: 0, z: 0.3 } },
  });

  console.log("\n2) Enable control, then low-confidence grasp (should reject):");
  await bridge.enableControl();
  bridge.injectIntention({
    kind: "grasp",
    confidence: 0.4,
    payload: { force: 0.7 },
  });

  console.log("\n3) High-confidence move inside workspace (should accept):");
  bridge.injectIntention({
    kind: "move",
    confidence: 0.92,
    payload: { target: { x: 0.2, y: 0.1, z: 0.4 }, speed: 0.8 },
  });

  console.log("\n4) Move far outside workspace (should clamp + safety event):");
  await sleep(60);
  bridge.injectIntention({
    kind: "move",
    confidence: 0.95,
    payload: { target: { x: 5, y: 5, z: 3 } },
  });

  console.log("\n5) Burst of commands (rate limit):");
  for (let n = 0; n < 12; n++) {
    bridge.injectIntention({
      kind: "move",
      confidence: 0.9,
      payload: { target: { x: 0.1, y: 0, z: 0.3 } },
    });
  }

  console.log("\n6) Emergency stop, then attempt motion:");
  bridge.emergencyStop("Demo e-stop");
  bridge.injectIntention({
    kind: "move",
    confidence: 0.99,
    payload: { target: { x: 0.1, y: 0, z: 0.3 } },
  });

  console.log("\n7) Clear e-stop, re-enable, home:");
  bridge.clearEmergencyStop();
  await bridge.enableControl();
  await sleep(80); // clear rate-limit window after the burst above
  bridge.injectIntention({ kind: "home", confidence: 0.99 });

  await sleep(500);
  console.log("\nFinal robot state:", bridge.getRobotState().mode);
  console.log("Safety status:", {
    control: bridge.isControlEnabled(),
    estop: bridge.isEmergencyStopActive(),
    interventions: bridge.getSafetyStatus().recentInterventions,
  });

  await bridge.disconnect();
  bridge.dispose();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
