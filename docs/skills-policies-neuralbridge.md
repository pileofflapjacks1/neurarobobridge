# Skills, policies, and NeuralBridge adapter

## Skill runtime (shared autonomy)

High-level `task` intentions are executed by the **SkillRuntime** when a matching skill is registered.

```ts
bridge.injectIntention({
  kind: "task",
  confidence: 0.92,
  payload: {
    task: "pick_object",
    target: "cup",
    position: { x: 0.3, y: 0.1, z: 0.25 },
  },
});
```

Built-in skills: `pick_object`, `place_object`, `hand_over`, `go_to`, `follow_me`, `open_door`, `wait`, `wave`.

### Lifecycle

1. Safety + policy gates accept the task  
2. Skill builds ordered steps (`move_to`, `set_gripper`, `navigate`, …)  
3. Runtime executes steps with delays; emits `skill` + `task` + `command`  
4. Human may **modulate** (`speed` / `force`) mid-skill  
5. **cancel** / e-stop / watchdog preempts the skill  

### Custom skill

```ts
import { registerSkill, type SkillDefinition } from "neurarobobridge";

registerSkill({
  name: "push_button",
  description: "Press a button",
  requiresManipulation: true,
  build(ctx) {
    return [
      {
        id: "approach",
        command: {
          kind: "move_to",
          pose: { position: ctx.position ?? { x: 0.4, y: 0, z: 0.5 } },
          speed: 0.4 * ctx.modulation.speed,
        },
      },
    ];
  },
});
```

Or pass skills in config: `skills: { skills: [mySkill] }`.

Disable with `skills: { enabled: false }` (falls back to raw `execute_task` on the robot backend).

---

## Policy plugins

Policies run **after** core SafetyEngine translation and can deny or patch commands.

```ts
const bridge = new NeuraRoboBridge({
  policies: {
    keepOutZones: [
      { id: "stairs", min: { x: 2, y: -1, z: 0 }, max: { x: 4, y: 1, z: 2 } },
    ],
    homeGeofence: {
      id: "home",
      min: { x: -5, y: -5, z: 0 },
      max: { x: 5, y: 5, z: 2 },
    },
    speedZones: [
      {
        id: "near-human",
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 2 },
        maxSpeed: 0.3,
      },
    ],
    noLocomotionWhileGrasping: true,
    noFreeMoveDuringSkill: true,
  },
});
```

### Built-ins

| Factory | Effect |
|---------|--------|
| `createKeepOutZonesPolicy` | Reject goals inside zones |
| `createHomeGeofencePolicy` | Locomotion goals must stay inside fence |
| `createMaxSpeedByZonePolicy` | Clamp `command.speed` in zones |
| `createNoLocomotionWhileGraspingPolicy` | Block navigate/go_to while holding |
| `createNoFreeMoveDuringSkillPolicy` | Block free `move` during active skill |

### Custom policy

```ts
bridge.addPolicy({
  id: "business-hours",
  name: "Business hours only",
  evaluate(ctx) {
    const hour = new Date().getHours();
    if (hour < 8 || hour > 18) {
      return {
        allow: false,
        reason: "policy_violation",
        message: "Robot motion only 08:00–18:00",
      };
    }
    return { allow: true };
  },
});
```

---

## NeuralBridge adapter

Zero hard dependency on `neuralbridge`. Duck-types any emitter with `on("intention", …)`.

```ts
import { NeuraRoboBridge, attachNeuralBridge } from "neurarobobridge";
import { NeuralBridge } from "neuralbridge";

const neural = new NeuralBridge({ backend: "simulator" });
const robo = new NeuraRoboBridge({
  bciBackend: "manual", // intentions come from NeuralBridge, not internal BCI
  robotBackend: "simulated-arm",
});

await neural.connect();
await robo.connect();
await robo.enableControl("supervised");

const detach = attachNeuralBridge(neural, robo, {
  forwardGestures: true,
  onDrop: (reason, ev) => console.debug("drop", reason, ev),
});

// later
detach();
```

### Mapping highlights

| NeuralBridge | NeuraRoboBridge |
|--------------|----------------|
| `confirm` / `click` / `select` | `confirm` (or grasp if `payload.as === "grasp"`) |
| `cancel` | `cancel` |
| `payload.task` | `task` |
| `payload.robotKind` | direct kind passthrough |
| gesture `move` | relative `move` |
| gesture `hold` / `release` | `grasp` / `release` |

Override with `mapIntention` / `mapGesture` options.

### Suite roles

- **NeuralBridge** — BCI → app/UI intents  
- **NeuraRoboBridge** — intents → safe robot action (skills + policies)  
- **Adapter** — optional glue when one process hosts both  
