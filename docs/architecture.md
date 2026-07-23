# NeuroBridge Architecture

This document is the contributor map for NeuroBridge: data flow, module boundaries, and how safety sits in the middle.

## Goals (non-negotiable)

1. **Apps never talk to raw BCI hardware or raw robot drivers.**
2. **Safety is a first-class pipeline stage**, not a decorator.
3. **Both sides are pluggable** (BCI backends, robot backends).
4. **Simulator-first** development path that stays useful after hardware arrives.
5. **Universal TypeScript** (browser + Node), minimal dependencies.

## High-level data flow

```
BCI Backend                Core                         Robot Backend
───────────                ────                         ─────────────
NeuralIntention ──onIntention──▶ NeuroBridge
                                      │
                                      ├─ emit("intention")
                                      ├─ SessionRecorder.recordIntention
                                      │
                                      ▼
                                 SafetyEngine.evaluate
                                      │
                         ┌────────────┴────────────┐
                         │ reject                  │ accept
                         ▼                         ▼
                  emit safetyEvent          Translator → RobotCommand
                  intentionRejected               │
                                                  ├─ emit("command")
                                                  ▼
                                           robot.execute(cmd)
                                                  │
                                                  ▼
                                           onState → emit("robotState")
```

### Invariants

- `RobotBackend.execute` only receives `RobotCommand` values that passed safety (or forced `estop` / `stop`).
- `enableControl()` is **never** implied by `connect()`.
- `emergencyStop()` disables control and latches until `clearEmergencyStop()`.
- Subscriber exceptions must not crash the event bus (`TypedEventEmitter` isolates handlers).

## Module map

| Path | Responsibility |
|------|----------------|
| `src/types/` | Shared contracts: intentions, robot commands/state, safety, config, events, session |
| `src/core/NeuroBridge.ts` | Public façade, wiring, lifecycle |
| `src/core/Translator.ts` | Pure intention → command mapping |
| `src/core/EventEmitter.ts` | Typed pub/sub (zero deps) |
| `src/core/Logger.ts` | Level-filtered console logging |
| `src/core/defaults.ts` | Default safety, workspace, arm, simulator configs |
| `src/safety/SafetyEngine.ts` | Gates, e-stop, rate limits, workspace clamp |
| `src/bci/` | BCI backend interface, registry, simulator, manual, playback, scenarios |
| `src/robot/` | Robot backend interface, registry, arm, humanoid, null |
| `src/recording/` | In-memory session capture |

## Key types

### `NeuralIntention`

High-level neural intent (not raw spikes / motor units):

- `kind`: `move | grasp | release | navigate | stop | home | custom`
- `confidence`: `[0, 1]` — primary safety gate
- `quality?`: optional signal quality gate
- `payload?`: kind-specific structure
- `id`, `timestamp`, `source?`, `meta?`

### `RobotCommand`

Validated command for backends:

- `kind`: `move_to | move_delta | set_gripper | navigate | stop | home | estop | custom`
- Optional `pose`, `joints`, `gripper`, `goal`, `speed`, …
- `intentionId` for traceability
- `forced` for e-stop / system stops

### `RobotState`

Feedback snapshot: `mode`, `pose`, `joints`, `grippers`, `basePose`, messages.

### `SafetyEvent`

Every intervention: `reason`, `severity`, `message`, optional ids.

## Safety evaluation order

Implemented in `SafetyEngine.evaluate` (+ NeuroBridge confirm/watchdog layers):

1. Emergency stop latch  
2. **Stale intention TTL** (`maxIntentionAgeMs` / `maxTaskAgeMs`)  
3. Control enable + **control mode** gates  
4. `minConfidence`  
5. `minQuality` / `requireQuality`  
6. `allowedIntentions` allow-list  
7. Rate limit (`maxIntentionsPerSecond`, `minCommandIntervalMs`)  
8. Translation (`translateIntention`)  
9. **Capability match** (`RobotCapabilities.supportedCommands`, locomotion, …)  
10. Workspace clamp on Cartesian targets  
11. Joint limit rejection (joint-space commands)  
12. `maxSpeed` clamp  

**Outside evaluate (NeuroBridge):**

- **ConfirmManager** — high-risk task / navigate → `pendingConfirm` → `confirm` / `reject` / timeout  
- **Watchdog** — BCI silence while control enabled → fail-safe stop or e-stop  
- **Disconnect** — issues stop before tearing down backends  
- **Latency** — `gateMs` / `executeMs` / `endToEndMs` on `latency` events  
- **Feedback** — task lifecycle, blocked, mode changes  

Accepted commands may still carry a non-critical `safetyEvent` (e.g. workspace clamp).

## Backend contracts

### BCI (`BciBackend`)

```ts
interface BciBackend {
  readonly id: string;
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  onIntention(handler: (i: NeuralIntention) => void): () => void;
  inject?(partial): void;
  start?(): void;
  stop?(): void;
  dispose?(): void;
}
```

Register with `registerBciBackend(id, factory)`.

### Robot (`RobotBackend`)

```ts
interface RobotBackend {
  readonly id: string;
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  execute(command: RobotCommand): Promise<void> | void;
  getState(): RobotState;
  onState(handler: (s: RobotState) => void): () => void;
  emergencyStop(): void;
  dispose?(): void;
}
```

Register with `registerRobotBackend(id, factory)`.

## Simulated arm model

`SimulatedArmBackend` is intentionally **approximate** (not industrial-grade IK):

- Configurable DOF (default 6), joint limits, workspace box  
- Tick loop at `tickHz` with velocity-limited joint steps  
- Simplified planar-ish FK/IK for Cartesian targets  
- Gripper open fraction + holding flag  
- Optional ASCII text visualization (`textVizInterval`)  
- Instant e-stop clears targets and freezes mode  

Good enough for application development and safety testing; not a substitute for a physics engine or vendor SDK.

## Session recording

`SessionRecorder` stores timeline events (`intention`, `command`, `robotState`, `safetyEvent`, `marker`) with offsets from session start.  
`PlaybackBciBackend` can replay intention streams for regression tests and demos.

## Relationship to NeuralBridge

| | NeuralBridge | NeuroBridge |
|--|--------------|-------------|
| Focus | BCI → application intents / UI actions | BCI intentions → **robot** commands |
| Safety | Policies / cooldowns for app actions | Physical safety (e-stop, workspace, joints) |
| Output | App events / vocabulary | `RobotCommand` + robot state |

A production stack may use NeuralBridge (or similar) for decoding/classification, then feed high-level intents into NeuroBridge for robot execution. NeuroBridge can also stand alone with its own simulator.

## Testing strategy

- **Unit:** SafetyEngine, Translator, individual backends  
- **Integration:** `NeuroBridge` with `manual` BCI + `simulated-arm` / `null`  
- **Scenarios:** simulator `pick-place`, `safety-stress`  

Prefer deterministic seeds (`bciSimulator.seed`) in tests.

## Versioning posture

- Public API surface is `src/index.ts` exports.  
- Backend plugin interfaces are semver-stable contracts; prefer additive changes.  
- Vendor-specific backends should live as optional packages or `register*` plugins so the core stays dependency-free.
