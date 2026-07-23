/**
 * Humanoid-oriented demo: control modes, confirm-to-execute, tasks, watchdog.
 *
 * Run: npx tsx examples/vanilla/humanoid-tasks.ts
 */

import { NeuroBridge } from "../../src/index.js";

async function main() {
  const bridge = new NeuroBridge({
    bciBackend: "manual",
    robotBackend: "simulated-humanoid",
    logLevel: "info",
    safety: {
      minConfidence: 0.75,
      minCommandIntervalMs: 0,
      confirmNavigate: true,
      confirmTasks: ["go_to", "follow_me", "open_door", "hand_over"],
      confirmTimeoutMs: 8000,
      watchdogTimeoutMs: 0, // disable for scripted demo
      defaultControlMode: "supervised",
    },
  });

  bridge.on("capabilities", (c) => {
    console.log(`Capabilities: ${c.model} (${c.class}) locomotion=${c.locomotion}`);
  });
  bridge.on("controlMode", (e) => {
    console.log(`Mode: ${e.previous} → ${e.mode}`);
  });
  bridge.on("pendingConfirm", (p) => {
    console.log(`  ⏳ AWAITING CONFIRM [${p.id.slice(0, 12)}…] ${p.message}`);
  });
  bridge.on("command", (c) => {
    console.log(`  ✓ command ${c.kind}${c.task ? ` task=${c.task.name}` : ""}`);
  });
  bridge.on("feedback", (f) => {
    console.log(`  ↩ feedback ${f.kind}: ${f.message}`);
  });
  bridge.on("safetyEvent", (e) => {
    if (e.reason !== "confirm_required") {
      console.log(`  ⚠ safety ${e.reason}: ${e.message}`);
    }
  });
  bridge.on("latency", (s) => {
    if (s.executeMs !== undefined) {
      console.log(`  ⏱ latency gate=${s.gateMs}ms exec=${s.executeMs}ms e2e=${s.endToEndMs}ms`);
    }
  });

  await bridge.connect();
  await bridge.enableControl("supervised");

  console.log("\n1) Low-risk wave task (no confirm if not in list):");
  bridge.injectIntention({
    kind: "task",
    confidence: 0.92,
    payload: { task: "wave", requireConfirm: false },
  });
  await sleep(600);

  console.log("\n2) High-risk go_to — held for confirm:");
  bridge.injectIntention({
    kind: "task",
    confidence: 0.93,
    payload: {
      task: "go_to",
      position: { x: 1.2, y: 0.5, z: 0 },
    },
  });
  await sleep(100);
  const pending = bridge.getPendingConfirmations();
  console.log(`   pending count=${pending.length}`);
  if (pending[0]) {
    console.log("\n3) Confirm go_to:");
    bridge.injectIntention({
      kind: "confirm",
      confidence: 0.95,
      payload: { confirmationId: pending[0].id },
    });
  }
  await sleep(700);

  console.log("\n4) Switch to teleop and small arm move:");
  bridge.setControlMode("teleop");
  bridge.injectIntention({
    kind: "move",
    confidence: 0.9,
    payload: {
      target: { x: 0.05, y: 0, z: 0.05 },
      relative: true,
      speed: 0.4,
    },
  });
  await sleep(200);

  console.log("\n5) Cancel + stop:");
  bridge.injectIntention({ kind: "cancel", confidence: 0.99 });
  bridge.injectIntention({ kind: "stop", confidence: 0.99 });
  await sleep(100);

  console.log("\nSafety:", {
    mode: bridge.getControlMode(),
    enabled: bridge.isControlEnabled(),
    caps: bridge.getCapabilities()?.class,
  });

  await bridge.disableControl();
  await bridge.disconnect();
  bridge.dispose();
  console.log("\nDone.");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
