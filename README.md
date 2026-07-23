# NeuraRoboBridge

**Production-quality BCI-to-Robot connector / middleware for TypeScript.**

NeuraRoboBridge translates high-level **neural intentions** (from a Brain-Computer Interface) into **safe, reliable robot control commands** — for robotic arms, simplified humanoids, teleoperated platforms, and multi-robot systems (as the ecosystem grows).

Applications and robot stacks should **never** talk directly to raw BCI hardware. NeuraRoboBridge is the intelligent, safety-conscious layer in the middle.

> **Simulator-first.** The primary backends today are a high-quality **BCI Simulator** and **Simulated Robot** (arm + simplified humanoid). There is **no real Neuralink access** and **no real commercial humanoid API** in v0.1 — those surfaces are designed so adapters can plug in later without rewriting application code.

Companion to **[NeuralBridge](../neuralbridge)** (BCI connector / intent middleware) in Joe’s Neura Suite. NeuralBridge focuses on neural intent delivery to apps; NeuraRoboBridge focuses on **intent → safe robot action**.

Not affiliated with Neuralink, Tesla Optimus, or any implant/robot vendor.

---

## Why NeuraRoboBridge?

| Problem | NeuraRoboBridge approach |
|---------|----------------------|
| Apps wire BCI hardware straight to robots | Stable API + modular backends on both sides |
| Neural signals are noisy and intermittent | Confidence / quality gates, rate limits, explicit enable |
| A mistaken command can cause real harm | Safety engine designed in from day one (e-stop, workspace, joints) |
| Hardware is scarce during development | Simulator BCI + simulated arm/humanoid |
| Robot platforms will churn | Plugin robot backends; apps depend only on NeuraRoboBridge |
| Need browser *and* Node | Universal TypeScript, ESM + CJS builds |

---

## Quick start

```bash
cd /Users/joe/Projects/neurarobobridge
npm install
npm run build
npm test
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
    enableInputMapping: true,
  },
});

bridge.on("intention", (intent) => {
  console.log("intention", intent.kind, intent.confidence);
});

bridge.on("robotState", (state) => {
  console.log("robot", state.mode, state.pose?.position);
});

bridge.on("safetyEvent", (event) => {
  console.warn("safety", event.reason, event.message);
});

await bridge.connect();
await bridge.enableControl(); // explicit enable — required for motion

// Manual intention (keyboard, UI, tests)
bridge.injectIntention({
  kind: "move",
  confidence: 0.92,
  payload: { target: { x: 0.3, y: 0.1, z: 0.4 }, speed: 0.5 },
});

// Instant e-stop
// bridge.emergencyStop("operator");
```

### Examples

```bash
npm run example:basic       # pick-place scenario → simulated arm
npm run example:safety     # confidence, workspace, rate limit, e-stop
npm run example:humanoid   # modes, confirm-to-execute, tasks, feedback
npm run example:skills     # skill runtime + policy plugins + NeuralBridge map
```

Browser demo: build first, then serve the repo and open `examples/browser/index.html` (uses `dist/index.js` via import map).

```bash
npm run build
npx serve .   # or any static server from the package root
# open http://localhost:3000/examples/browser/
```

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────┐
│   BCI Input Side    │     │  Safety & Translation    │     │  Robot Output Side  │
│                     │     │         Engine           │     │                     │
│  • Simulator        │────▶│  • confidence / quality  │────▶│  • Simulated arm    │
│  • Manual / inject  │     │  • rate limiting         │     │  • Simulated humanoid│
│  • Playback         │     │  • control enable        │     │  • Null (tests)     │
│  • (future HW)      │     │  • workspace / joints    │     │  • (future ROS 2 /  │
│                     │     │  • emergency stop        │     │     humanoid APIs)  │
└─────────────────────┘     │  • intention → command   │     └─────────────────────┘
                            └──────────────────────────┘
                                         │
                                         ▼
                               Public NeuraRoboBridge API
                          (events: intention, command,
                           robotState, safetyEvent, …)
```

**Core principle:** robot backends never see raw `NeuralIntention`. They only execute validated `RobotCommand` objects produced after safety checks.

See **[docs/architecture.md](./docs/architecture.md)** for module layout, data flow, and extension points.  
See **[docs/adding-backends.md](./docs/adding-backends.md)** for step-by-step plugin guides.

---

## Public API (essentials)

| Method | Purpose |
|--------|---------|
| `connect()` / `disconnect()` | Open / close BCI + robot backends |
| `enableControl()` / `disableControl()` | Explicit motion gate (off by default) |
| `emergencyStop(reason?)` | Latch e-stop; force robot stop |
| `clearEmergencyStop()` | Unlatch e-stop (control still off) |
| `injectIntention(input)` | Push a high-level intention through the pipeline |
| `playScenario(name \| steps)` | Run built-in or custom BCI scenarios |
| `on("intention" \| "command" \| "robotState" \| "safetyEvent" \| …)` | Typed events |
| `startRecording()` / `stopRecording()` | Session capture for playback / analysis |
| `updateSafety(partial)` | Hot-update safety policy |
| `getRobotState()` / `getSafetyStatus()` | Snapshots |

### Intention kinds

`move` · `grasp` · `release` · `navigate` · `stop` · `home` · `custom`

Each intention carries `confidence` (required) and optional `quality`, plus a kind-specific payload.

### Built-in backends

**BCI:** `simulator` · `manual` · `playback` / `recording`  

**Robot:** `simulated-arm` · `simulated-humanoid` · `null`

Register more with `registerBciBackend` / `registerRobotBackend`.

### Built-in scenarios

`pick-place` · `demo` · `safety-stress` · `navigate`

---

## Safety model

Safety is **not optional** and is **not bolted on**:

1. **Emergency stop** — highest priority; latches until cleared  
2. **Control enable + modes** — motion blocked until `enableControl()`; modes: `disabled` · `supervised` · `shared` · `teleop` · `autonomous_task`  
3. **BCI liveness watchdog** — if intentions stop flowing, fail-safe stop (or e-stop)  
4. **Stale intention TTL** — drop late continuous (default 250ms) and discrete (default 2s) intents  
5. **Confidence / quality thresholds**  
6. **Confirm-to-execute** — high-risk tasks (`go_to`, `open_door`, …) and navigate require confirm  
7. **Robot capabilities handshake** — reject commands the body cannot run  
8. **Rate limiting** (per-second + min interval)  
9. **Workspace clamp** and **joint limit** checks  
10. **Max speed** enforcement  
11. **Priority bands** — `estop > stop > cancel > confirm > discrete_task > continuous`  

Every intervention emits a `safetyEvent`. Pipeline **latency** samples and **feedback** (task started/completed, blocked, needs_help, awaiting_confirm) support closed-loop UIs and future haptics.

### Task-level intentions + skill runtime (humanoid-class)

```ts
bridge.injectIntention({
  kind: "task",
  confidence: 0.92,
  payload: { task: "pick_object", position: { x: 0.3, y: 0.1, z: 0.25 } },
});
// → SkillRuntime runs approach → grasp → lift (shared autonomy)
// modulate / cancel work mid-skill
```

Built-in skills: `pick_object`, `place_object`, `hand_over`, `follow_me`, `go_to`, `open_door`, `wait`, `wave`.  
Register more with `registerSkill` or `skills.skills` in config.  
See **[docs/skills-policies-neuralbridge.md](./docs/skills-policies-neuralbridge.md)**.

### Policy plugins

```ts
new NeuraRoboBridge({
  policies: {
    keepOutZones: [{ id: "stairs", min: {…}, max: {…} }],
    noLocomotionWhileGrasping: true,
    noFreeMoveDuringSkill: true,
  },
});
```

### NeuralBridge adapter

```ts
import { attachNeuralBridge } from "neurarobobridge";
// neural = NeuralBridge instance (peer); no hard dependency
attachNeuralBridge(neural, robo);
```

---

## Project layout

```
neurarobobridge/
├── src/
│   ├── index.ts              # public exports
│   ├── types/                # intentions, robot, safety, config, events, session
│   ├── core/                 # NeuraRoboBridge, Translator, EventEmitter, Logger
│   ├── safety/               # SafetyEngine
│   ├── bci/                  # BCI backends + registry + scenarios
│   ├── robot/                # Robot backends + registry
│   └── recording/            # SessionRecorder
├── tests/                    # Vitest
├── examples/
│   ├── vanilla/              # Node demos
│   └── browser/              # Canvas + keyboard demo
└── docs/                     # architecture + extension guides
```

---

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev          # tsup watch
```

- **Language:** TypeScript strict  
- **Tests:** Vitest  
- **Bundler:** tsup (ESM + CJS + `.d.ts`)  
- **Runtime:** Node ≥ 18 and modern browsers  
- **Dependencies:** none in production (zero runtime deps)

---

## Future-proofing

Designed for growth without API breakage:

| Direction | Design hook |
|-----------|-------------|
| High-bandwidth BCI (Neuralink-class) | `BciBackend` interface + registry |
| ROS 2 | `RobotBackend` emitting/subscribing to topics |
| Humanoid platforms (Optimus-style) | `simulated-humanoid` as behavioral stand-in; real adapter later |
| Multi-robot | Multiple bridge instances or a future orchestrator |
| Haptics / proprioception | `robotState` + future bidirectional channels |
| NeuralBridge integration | Shared intention vocabulary; NeuraRoboBridge consumes high-level intents |

Placeholders for vendor hardware will **not** pretend real APIs exist. When drivers are available, they plug in as backends.

---

## Package

```json
{
  "name": "neurarobobridge",
  "version": "0.1.0"
}
```

```ts
import { NeuraRoboBridge } from "neurarobobridge";
```

---

## License

MIT — see [LICENSE](./LICENSE).
