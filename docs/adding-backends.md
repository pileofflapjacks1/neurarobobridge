# Adding backends to NeuraRoboBridge

NeuraRoboBridge is built so new BCI sources and robot platforms can be added **without changing application code**. Apps keep using `NeuraRoboBridge`; you register a backend and select it by id.

## Adding a BCI backend

### 1. Implement `BciBackend`

```ts
import type { BciBackend, BciBackendStatus } from "neurarobobridge";
import type { NeuralIntention } from "neurarobobridge";
import { createId } from "neurarobobridge";

export class MyDeviceBciBackend implements BciBackend {
  readonly id = "my-device";
  readonly name = "My BCI Device";

  private connected = false;
  private handlers = new Set<(i: NeuralIntention) => void>();

  async connect(): Promise<void> {
    // open device / websocket / shared memory, etc.
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    // tear down
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  onIntention(handler: (i: NeuralIntention) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Call this when your driver decodes a high-level intent. */
  private publish(partial: Omit<NeuralIntention, "id" | "timestamp">) {
    const intention: NeuralIntention = {
      id: createId("int"),
      timestamp: Date.now(),
      source: this.id,
      ...partial,
    };
    for (const h of this.handlers) h(intention);
  }

  dispose(): void {
    this.handlers.clear();
  }
}
```

### Rules for BCI backends

- Emit **high-level** intentions (`move`, `grasp`, …), not raw electrode samples.  
- Always set a real **`confidence`** in `[0, 1]`.  
- Prefer optional **`quality`** when the device provides SNR / contact metrics.  
- Do **not** apply robot safety here — that is `SafetyEngine`’s job.  
- Be honest: if the real vendor API does not exist yet, keep the backend as a stub or simulator and document it.

### 2. Register the factory

```ts
import { registerBciBackend, NeuraRoboBridge } from "neurarobobridge";
import { MyDeviceBciBackend } from "./MyDeviceBciBackend";

registerBciBackend("my-device", (config, log) => {
  // read config.backends or your own options from config
  return new MyDeviceBciBackend(/* … */, log);
});

const bridge = new NeuraRoboBridge({
  bciBackend: "my-device",
  robotBackend: "simulated-arm",
});
```

### 3. Or pass an instance

```ts
const bridge = new NeuraRoboBridge({
  bciBackend: "my-device", // label only
  backends: {
    bci: new MyDeviceBciBackend(),
  },
  robotBackend: "simulated-arm",
});
```

### Future hardware note

When high-bandwidth implants (Neuralink-class and competitors) ship developer APIs, implement them as separate packages that depend on `neurarobobridge` and call `registerBciBackend`. Do not invent fake vendor protocols in core.

---

## Adding a robot backend

### 1. Implement `RobotBackend`

```ts
import type { RobotBackend } from "neurarobobridge";
import type { RobotCommand, RobotState } from "neurarobobridge";

export class MyRobotBackend implements RobotBackend {
  readonly id = "my-robot";
  readonly name = "My Robot Platform";

  private connected = false;
  private state: RobotState = {
    mode: "disconnected",
    timestamp: Date.now(),
  };
  private handlers = new Set<(s: RobotState) => void>();

  async connect(): Promise<void> {
    // connect to driver / ROS / HTTP API
    this.connected = true;
    this.state = { mode: "ready", timestamp: Date.now() };
    this.emit();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.state = { mode: "disconnected", timestamp: Date.now() };
    this.emit();
  }

  isConnected(): boolean {
    return this.connected;
  }

  async execute(command: RobotCommand): Promise<void> {
    // Map RobotCommand → vendor SDK
    switch (command.kind) {
      case "estop":
      case "stop":
        // MUST stop motion immediately
        break;
      case "move_to":
        // command.pose?.position
        break;
      case "set_gripper":
        // command.gripper 0..1
        break;
      // …
    }
    this.state = {
      ...this.state,
      lastCommandId: command.id,
      timestamp: Date.now(),
    };
    this.emit();
  }

  getState(): RobotState {
    return this.state;
  }

  onState(handler: (s: RobotState) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emergencyStop(): void {
    // Hardware e-stop path if available
    this.state = { mode: "estop", timestamp: Date.now(), message: "E-STOP" };
    this.emit();
  }

  private emit() {
    for (const h of this.handlers) h(this.state);
  }
}
```

### Rules for robot backends

- **Trust that commands are already safety-checked** — but still implement a hard `emergencyStop()` / `estop` path.  
- Publish **`robotState` frequently enough** for UI and closed-loop apps (10–50 Hz is typical in sim).  
- Respect **units**: positions in meters, joints in radians (document any exception).  
- Never require apps to import your vendor SDK; keep it inside the backend module.

### 2. Register

```ts
import { registerRobotBackend, NeuraRoboBridge } from "neurarobobridge";
import { MyRobotBackend } from "./MyRobotBackend";

registerRobotBackend("my-robot", (config, log) => new MyRobotBackend(config, log));

const bridge = new NeuraRoboBridge({
  bciBackend: "simulator",
  robotBackend: "my-robot",
});
```

### ROS 2 sketch (future)

A ROS 2 backend would typically:

1. Create a node and publishers for trajectory / gripper topics.  
2. Map `RobotCommand` → trajectory messages.  
3. Subscribe to `/joint_states` (or equivalent) and map into `RobotState`.  
4. Bind `emergencyStop()` to a stop topic or service.

Ship it as an optional package (e.g. `neurarobobridge-ros2`) so core stays browser-safe and dependency-free.

### Humanoid / Optimus-style adapters (future)

Use `simulated-humanoid` as the behavioral stand-in today (`navigate`, dual-arm-ish `move`, gripper). A real adapter should:

- Keep the same `RobotCommand` vocabulary where possible.  
- Map locomotion to `navigate` / `stop`.  
- Map manipulation to `move_*` + `set_gripper`.  
- Surface rich state via `RobotState.meta` until types expand.

---

## Testing a new backend

```ts
import { NeuraRoboBridge } from "neurarobobridge";
import { registerRobotBackend } from "neurarobobridge";

registerRobotBackend("my-robot", () => new MyRobotBackend());

const bridge = new NeuraRoboBridge({
  bciBackend: "manual",
  robotBackend: "my-robot",
  logLevel: "silent",
  safety: { minCommandIntervalMs: 0 },
});

await bridge.connect();
await bridge.enableControl();
bridge.injectIntention({
  kind: "home",
  confidence: 0.99,
});
// assert robot state / mocks
```

Use `robotBackend: "null"` when you only need to test BCI → safety → command translation.

---

## Checklist

- [ ] Implements full interface (`connect`, `disconnect`, `execute` / `onIntention`, …)  
- [ ] Registered under a stable string id  
- [ ] Documented config options  
- [ ] E-stop path tested  
- [ ] No pretend vendor APIs  
- [ ] Unit or integration tests with `manual` / `null` counterparts  
