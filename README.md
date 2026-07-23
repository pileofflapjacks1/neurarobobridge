# NeuraRoboBridge

**Production-quality BCI-to-Robot connector / middleware for TypeScript.**

NeuraRoboBridge translates high-level **neural intentions** into **safe robot control commands** — for simulated robotic arms, simplified humanoids, and future real platforms.

Applications and robot stacks should **never** talk directly to raw BCI hardware. NeuraRoboBridge is the safety-conscious translation layer in the middle.

[![GitHub](https://img.shields.io/badge/github-neurarobobridge-181717?logo=github)](https://github.com/pileofflapjacks1/neurarobobridge)
[![NeuraBeach](https://img.shields.io/badge/NeuraBeach-listing-1d9bf0)](https://neurabeach.vercel.app/projects/neurarobobridge)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

![Architecture](./docs/assets/demo/architecture.svg)

> **Simulator-first.** Primary backends today: **BCI Simulator** + **Simulated Robot** (arm / humanoid).  
> There is **no real Neuralink access** and **no real commercial humanoid (e.g. Optimus) API**. Those surfaces are plugin-ready for later — we do not invent vendor protocols.

### Safety & claims (read this)

- **Computer-side / research / simulation only.** Not implant firmware. Not a medical device (SaMD). Not therapy software.
- **Not affiliated with Neuralink, Tesla, Optimus, or any implant/robot vendor.**
- Default under uncertainty: **do not move** (explicit `enableControl()`, e-stop, watchdog, confirm for high-risk tasks).
- Package asserts `banned_claims: true` in [`neurabeach-manifest.json`](./neurabeach-manifest.json).

### Joe’s Neura Suite

| Piece | Role |
|-------|------|
| **[NeuraBeach](https://neurabeach.vercel.app)** | Discover / catalog |
| **[NeuralBridge](https://github.com/pileofflapjacks1/neuralbridge)** | BCI → app/UI intents (middleware) |
| **NeuraRoboBridge** (this repo) | High-level intents → **safe robot** commands (middleware, robot path) |
| **[NeuraBinder](https://github.com/pileofflapjacks1/neurabinder)** | Reference app demo (UI) |
| **Intent → OS** | OS pointer adapter (parallel path) |

```
NeuralBridge (optional)  ──adapter──▶  NeuraRoboBridge  ──▶  simulated arm / humanoid
        UI / app intents              safety · skills · policies
```

NeuralBridge focuses on delivering neural intent to **applications**.  
NeuraRoboBridge focuses on turning intent into **physical (or simulated) robot action** with safety designed in.

Catalog: [NeuraBeach · col-neura-suite](https://neurabeach.vercel.app/collections/col-neura-suite) · Upload notes: [`LISTING.md`](./LISTING.md) · Demo guide: [`docs/DEMO.md`](./docs/DEMO.md)

---

## Why NeuraRoboBridge?

| Problem | Approach |
|---------|----------|
| Apps wire BCI hardware straight to robots | Stable API + modular backends |
| Neural signals are noisy | Confidence gates, rate limits, stale TTL, watchdog |
| Mistaken commands can cause harm | E-stop, enable gate, confirm, policy plugins |
| Hardware is scarce | Simulator BCI + simulated arm/humanoid |
| Humanoid use is task-level | Skill runtime (shared autonomy) |
| Robot platforms will churn | Plugin robot backends |

---

## Quick start

```bash
git clone https://github.com/pileofflapjacks1/neurarobobridge
cd neurarobobridge
npm install
npm run build
npm test
npm run example:skills
```

```ts
import { NeuraRoboBridge } from "neurarobobridge";

const bridge = new NeuraRoboBridge({
  bciBackend: "simulator",
  robotBackend: "simulated-arm",
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
  },
  skills: { enabled: true },
  policies: {
    noFreeMoveDuringSkill: true,
  },
});

bridge.on("intention", (intent) => {
  console.log("intention", intent.kind, intent.confidence);
});
bridge.on("skill", (s) => console.log("skill", s.skillName, s.status, s.message));
bridge.on("robotState", (state) => console.log("robot", state.mode));
bridge.on("safetyEvent", (event) => console.warn("safety", event.reason, event.message));

await bridge.connect();
await bridge.enableControl(); // explicit enable — required for motion
```

### Examples

```bash
npm run example:basic       # pick-place scenario → simulated arm
npm run example:safety      # confidence, workspace, rate limit, e-stop
npm run example:humanoid    # modes, confirm-to-execute, tasks
npm run example:skills      # skill runtime + policy plugins + NeuralBridge map
```

Browser demo (local): `npm run build && npx serve .` → `examples/browser/`.  
**No hosted live demo** — this is a library (same class as NeuralBridge).

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────┐
│   BCI Input Side    │     │  Safety & Translation    │     │  Robot Output Side  │
│  Simulator / Manual │────▶│  modes · watchdog · TTL  │────▶│  Simulated arm      │
│  Playback           │     │  policies · skills       │     │  Simulated humanoid │
│  NeuralBridge adapt.│     │  confirm · e-stop        │     │  Null / future ROS  │
└─────────────────────┘     └──────────────────────────┘     └─────────────────────┘
```

Docs: [`docs/architecture.md`](./docs/architecture.md) · [`docs/adding-backends.md`](./docs/adding-backends.md) · [`docs/skills-policies-neuralbridge.md`](./docs/skills-policies-neuralbridge.md)

---

## Safety model

1. **Emergency stop** — highest priority; latches until cleared  
2. **Control enable + modes** — `disabled` · `supervised` · `shared` · `teleop` · `autonomous_task`  
3. **BCI liveness watchdog** — silence → fail-safe stop  
4. **Stale intention TTL**  
5. **Confidence / quality thresholds**  
6. **Confirm-to-execute** for high-risk tasks / navigate  
7. **Robot capabilities** handshake  
8. **Policy plugins** — keep-out, geofence, speed zones, no loco while grasping  
9. **Skill runtime** — multi-step shared autonomy with modulate / cancel  
10. **Rate limiting**, workspace / joint limits, max speed  

---

## Skills, policies, NeuralBridge

```ts
// Shared-autonomy skill
bridge.injectIntention({
  kind: "task",
  confidence: 0.92,
  payload: { task: "pick_object", position: { x: 0.3, y: 0.1, z: 0.25 } },
});

// Policies
new NeuraRoboBridge({
  policies: {
    keepOutZones: [{ id: "stairs", min: { x: 2, y: -1, z: 0 }, max: { x: 4, y: 1, z: 2 } }],
    noLocomotionWhileGrasping: true,
  },
});

// Optional NeuralBridge glue (zero hard dependency)
import { attachNeuralBridge } from "neurarobobridge";
attachNeuralBridge(neuralBridgeInstance, bridge);
```

Built-in skills: `pick_object`, `place_object`, `hand_over`, `follow_me`, `go_to`, `open_door`, `wait`, `wave`.

---

## Project layout

```
neurarobobridge/
├── src/          # core, safety, skills, policy, bci, robot, adapters
├── tests/        # Vitest (52+)
├── examples/     # vanilla Node + browser
├── docs/         # architecture, demo, assets
├── LISTING.md    # NeuraBeach upload helper
└── neurabeach-manifest.json
```

---

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

- **Language:** TypeScript strict  
- **Tests:** Vitest  
- **Bundler:** tsup (ESM + CJS + `.d.ts`)  
- **Runtime:** Node ≥ 18 and modern browsers  
- **Dependencies:** none in production  

---

## Package

```ts
import { NeuraRoboBridge } from "neurarobobridge";
```

Version **0.3.0** · package name `neurarobobridge`.

---

## License

MIT — see [LICENSE](./LICENSE).
