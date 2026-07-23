/**
 * Skill runtime + policy plugins demo.
 *
 * Run: npx tsx examples/vanilla/skills-and-policies.ts
 */

import {
  NeuraRoboBridge,
  mapNeuralBridgeIntention,
  type NeuralBridgeIntentionLike,
} from "../../src/index.js";

async function main() {
  const bridge = new NeuraRoboBridge({
    bciBackend: "manual",
    robotBackend: "simulated-arm",
    logLevel: "info",
    safety: {
      minConfidence: 0.75,
      minCommandIntervalMs: 0,
      watchdogTimeoutMs: 0,
      confirmTasks: [],
    },
    skills: {
      enabled: true,
      defaultStepDelayMs: 150,
    },
    policies: {
      keepOutZones: [
        {
          id: "no-go-corner",
          min: { x: 0.55, y: 0.55, z: 0 },
          max: { x: 1, y: 1, z: 1.2 },
        },
      ],
      noFreeMoveDuringSkill: true,
      noLocomotionWhileGrasping: false,
    },
  });

  bridge.on("skill", (s) => {
    console.log(
      `  skill ${s.skillName} [${s.status}] step ${s.stepIndex + 1}/${s.stepCount} — ${s.message}`
    );
  });
  bridge.on("command", (c) => {
    console.log(`  → cmd ${c.kind}`);
  });
  bridge.on("intentionRejected", (i, r) => {
    console.log(`  ✗ rejected ${i.kind}: ${r}`);
  });
  bridge.on("safetyEvent", (e) => {
    if (e.reason === "policy_violation") {
      console.log(`  🛡 policy: ${e.message}`);
    }
  });

  await bridge.connect();
  await bridge.enableControl("shared");
  console.log("Policies:", bridge.listPolicies().map((p) => p.id).join(", "));

  console.log("\n1) Keep-out policy blocks a bad move:");
  bridge.injectIntention({
    kind: "move",
    confidence: 0.95,
    payload: { target: { x: 0.7, y: 0.7, z: 0.4 } },
  });

  console.log("\n2) pick_object skill (shared autonomy steps):");
  bridge.injectIntention({
    kind: "task",
    confidence: 0.94,
    payload: {
      task: "pick_object",
      target: "cup",
      position: { x: 0.35, y: 0.05, z: 0.22 },
      requireConfirm: false,
    },
  });

  // Mid-skill modulate
  await sleep(200);
  bridge.injectIntention({
    kind: "modulate",
    confidence: 0.9,
    payload: { speed: 0.4 },
  });

  await sleep(1500);

  console.log("\n3) Simulated NeuralBridge intention → adapter map → inject:");
  const nbEvent: NeuralBridgeIntentionLike = {
    type: "custom",
    confidence: 0.92,
    timestamp: Date.now(),
    payload: { robotKind: "home" },
  };
  const mapped = mapNeuralBridgeIntention(nbEvent);
  console.log("   mapped:", mapped?.kind);
  if (mapped) bridge.injectIntention(mapped);

  await sleep(400);
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
