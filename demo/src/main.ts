/**
 * NeuraRoboBridge hosted browser demo (Vercel).
 * Simulator-only · computer-side · not affiliated with Neuralink / Optimus.
 */

import {
  NeuraRoboBridge,
  type RobotState,
  type ActiveSkill,
  type ControlMode,
} from "neurarobobridge";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="banner">
    <strong>Simulator demo only.</strong>
    Computer-side / research middleware — not implant software, not a medical device,
    not affiliated with Neuralink, Tesla, or Optimus. No real robot hardware is connected.
  </div>

  <header class="top">
    <div>
      <h1>NeuraRoboBridge</h1>
      <p class="tagline">Live demo · neural intention → safe simulated robot action</p>
    </div>
    <div class="header-links">
      <a href="https://github.com/pileofflapjacks1/neurarobobridge" target="_blank" rel="noreferrer">GitHub</a>
      <a href="https://neurabeach.vercel.app/projects/neurarobobridge" target="_blank" rel="noreferrer">NeuraBeach</a>
      <a href="https://neurabeach.vercel.app/collections/col-neura-suite" target="_blank" rel="noreferrer">Neura Suite</a>
    </div>
  </header>

  <div class="layout">
    <aside class="panel">
      <h2>Session</h2>
      <div class="row">
        <button id="btnConnect" class="primary" type="button">Connect</button>
        <button id="btnEnable" type="button" disabled>Enable control</button>
        <button id="btnDisable" type="button" disabled>Disable</button>
      </div>
      <div class="row">
        <button id="btnEstop" class="danger" type="button" disabled>E-STOP</button>
        <button id="btnClear" type="button" disabled>Clear E-Stop</button>
      </div>

      <div class="section-gap">
        <h2>Robot backend</h2>
        <div class="row">
          <button id="btnArm" class="active" type="button">Simulated arm</button>
          <button id="btnHumanoid" type="button">Simulated humanoid</button>
        </div>
        <p class="hint">Switching robot reconnects the bridge (control resets).</p>
      </div>

      <div class="section-gap">
        <h2>Mode</h2>
        <div class="row" id="modeRow">
          <button type="button" data-mode="supervised" disabled>Supervised</button>
          <button type="button" data-mode="shared" disabled>Shared</button>
          <button type="button" data-mode="teleop" disabled>Teleop</button>
        </div>
      </div>

      <div class="section-gap">
        <h2>Skills (shared autonomy)</h2>
        <div class="row">
          <button type="button" class="skill" data-skill="pick_object" disabled>Pick object</button>
          <button type="button" class="skill" data-skill="place_object" disabled>Place</button>
          <button type="button" class="skill" data-skill="wave" disabled>Wave</button>
          <button type="button" class="skill" data-skill="home" data-kind="home" disabled>Home</button>
        </div>
        <div class="row">
          <button type="button" id="btnCancel" disabled>Cancel skill</button>
          <button type="button" id="btnSlower" disabled>Slower</button>
          <button type="button" id="btnFaster" disabled>Faster</button>
        </div>
        <div id="skillStatus" class="status-block">No active skill</div>
        <div class="progress" aria-hidden="true"><i id="skillBar"></i></div>
      </div>

      <div class="section-gap">
        <h2>Manual intentions</h2>
        <div class="row">
          <button type="button" class="intent" data-kind="grasp" disabled>Grasp</button>
          <button type="button" class="intent" data-kind="release" disabled>Release</button>
          <button type="button" class="intent" data-kind="stop" disabled>Stop</button>
        </div>
        <div class="row">
          <button type="button" class="intent" data-kind="move" data-dir="left" disabled>←</button>
          <button type="button" class="intent" data-kind="move" data-dir="up" disabled>↑</button>
          <button type="button" class="intent" data-kind="move" data-dir="down" disabled>↓</button>
          <button type="button" class="intent" data-kind="move" data-dir="right" disabled>→</button>
          <button type="button" class="intent" data-kind="move" data-dir="forward" disabled>Fwd</button>
          <button type="button" class="intent" data-kind="move" data-dir="back" disabled>Back</button>
        </div>
        <div class="row">
          <button type="button" id="btnLowConf" disabled>Low confidence (reject)</button>
          <button type="button" id="btnKeepOut" disabled>Keep-out goal (policy)</button>
        </div>
        <p class="hint">
          Keys: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move ·
          <kbd>G</kbd> grasp · <kbd>R</kbd> release · <kbd>H</kbd> home ·
          <kbd>Space</kbd> stop · <kbd>Esc</kbd> e-stop
        </p>
      </div>

      <div class="section-gap">
        <h2>Status</h2>
        <div class="chip-row" id="chips"></div>
        <div id="statusText" class="status-block" style="margin-top:0.6rem">Disconnected</div>
      </div>
    </aside>

    <section class="panel">
      <h2>Visualization</h2>
      <canvas id="viz" width="900" height="420"></canvas>
      <div class="section-gap">
        <h2>Event log</h2>
        <div id="log"></div>
      </div>
    </section>
  </div>

  <footer class="foot">
    Part of <a href="https://neurabeach.vercel.app/collections/col-neura-suite" target="_blank" rel="noreferrer">Joe’s Neura Suite</a>
    · Companion to NeuralBridge (app intents) · MIT ·
    <a href="https://github.com/pileofflapjacks1/neurarobobridge" target="_blank" rel="noreferrer">Source</a>
  </footer>
`;

// ─── DOM refs ──────────────────────────────────────────────
const logEl = $("#log");
const statusText = $("#statusText");
const chipsEl = $("#chips");
const skillStatus = $("#skillStatus");
const skillBar = $("#skillBar") as HTMLElement;
const canvas = $("#viz") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const btnConnect = $("#btnConnect") as HTMLButtonElement;
const btnEnable = $("#btnEnable") as HTMLButtonElement;
const btnDisable = $("#btnDisable") as HTMLButtonElement;
const btnEstop = $("#btnEstop") as HTMLButtonElement;
const btnClear = $("#btnClear") as HTMLButtonElement;
const btnArm = $("#btnArm") as HTMLButtonElement;
const btnHumanoid = $("#btnHumanoid") as HTMLButtonElement;
const btnCancel = $("#btnCancel") as HTMLButtonElement;
const btnSlower = $("#btnSlower") as HTMLButtonElement;
const btnFaster = $("#btnFaster") as HTMLButtonElement;
const btnLowConf = $("#btnLowConf") as HTMLButtonElement;
const btnKeepOut = $("#btnKeepOut") as HTMLButtonElement;

function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  return app.querySelector(sel) as T;
}

// ─── State ─────────────────────────────────────────────────
let robotBackend: "simulated-arm" | "simulated-humanoid" = "simulated-arm";
let bridge = createBridge();
let lastState: RobotState | null = null;
let modSpeed = 0.55;

function createBridge(): NeuraRoboBridge {
  return new NeuraRoboBridge({
    bciBackend: "manual",
    robotBackend,
    logLevel: "warn",
    safety: {
      minConfidence: 0.75,
      maxIntentionsPerSecond: 20,
      minCommandIntervalMs: 40,
      enableEmergencyStop: true,
      watchdogTimeoutMs: 0, // interactive demo — no silent timeout
      confirmTasks: [],
      confirmNavigate: false,
      defaultControlMode: "supervised",
      maxIntentionAgeMs: 2000,
      maxTaskAgeMs: 5000,
    },
    skills: { enabled: true, defaultStepDelayMs: 180 },
    policies: {
      keepOutZones: [
        {
          id: "no-go-corner",
          min: { x: 0.55, y: 0.55, z: 0 },
          max: { x: 1.2, y: 1.2, z: 1.5 },
        },
      ],
      noFreeMoveDuringSkill: true,
      noLocomotionWhileGrasping: robotBackend === "simulated-humanoid",
    },
    simulatedArm: { tickHz: 30 },
    simulatedHumanoid: { tickHz: 24 },
  });
}

function wireBridge(b: NeuraRoboBridge): void {
  b.on("status", (e) => {
    log(`status ${e.status}${e.message ? ` — ${e.message}` : ""}`, "tag-ok");
    refreshUi();
  });
  b.on("controlMode", (e) => {
    log(`mode ${e.previous} → ${e.mode}`, "tag-skill");
    refreshUi();
  });
  b.on("intention", (i) => log(`intention ${i.kind} conf=${i.confidence.toFixed(2)}`));
  b.on("command", (c) => log(`command ${c.kind}`, "tag-ok"));
  b.on("intentionRejected", (i, r) => log(`rejected ${i.kind}: ${r}`, "tag-warn"));
  b.on("safetyEvent", (e) =>
    log(
      `safety ${e.reason}: ${e.message}`,
      e.severity === "critical" ? "tag-err" : "tag-warn"
    )
  );
  b.on("skill", (s) => {
    updateSkillUi(s);
    if (s.status === "running" || s.status === "succeeded" || s.status === "failed") {
      log(
        `skill ${s.skillName} [${s.status}] ${s.message}`,
        s.status === "failed" ? "tag-err" : "tag-skill"
      );
    }
  });
  b.on("robotState", (s) => {
    lastState = s;
    draw(s);
  });
  b.on("feedback", (f) => {
    if (f.kind !== "task_progress") log(`feedback ${f.kind}: ${f.message}`, "tag-skill");
  });
  b.on("error", (e) => log(`error ${e.context}: ${e.error.message}`, "tag-err"));
}

wireBridge(bridge);

// ─── UI helpers ────────────────────────────────────────────
function log(msg: string, cls = ""): void {
  const line = document.createElement("div");
  line.className = `line ${cls}`.trim();
  line.textContent = `${new Date().toISOString().slice(11, 19)} ${msg}`;
  logEl.prepend(line);
  while (logEl.childElementCount > 200) logEl.lastChild?.remove();
}

function updateSkillUi(s: ActiveSkill | null): void {
  if (!s) {
    skillStatus.textContent = "No active skill";
    skillBar.style.width = "0%";
    return;
  }
  skillStatus.textContent = `${s.skillName} · ${s.status} · step ${Math.min(s.stepIndex + 1, s.stepCount)}/${s.stepCount}\n${s.message}`;
  skillBar.style.width = `${Math.round(s.progress * 100)}%`;
}

function refreshUi(): void {
  const connected = bridge.isConnected();
  const enabled = bridge.isControlEnabled();
  const estop = bridge.isEmergencyStopActive();
  const mode = bridge.getControlMode();

  btnConnect.disabled = connected;
  btnEnable.disabled = !connected || enabled || estop;
  btnDisable.disabled = !connected || (!enabled && mode === "disabled");
  btnEstop.disabled = !connected;
  btnClear.disabled = !connected || !estop;
  btnArm.disabled = false;
  btnHumanoid.disabled = false;
  btnCancel.disabled = !connected;
  btnSlower.disabled = !connected;
  btnFaster.disabled = !connected;
  btnLowConf.disabled = !connected;
  btnKeepOut.disabled = !connected;

  app.querySelectorAll<HTMLButtonElement>(".intent, .skill, [data-mode]").forEach((el) => {
    el.disabled = !connected;
  });

  app.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((el) => {
    el.classList.toggle("active", el.dataset.mode === mode);
  });

  btnArm.classList.toggle("active", robotBackend === "simulated-arm");
  btnHumanoid.classList.toggle("active", robotBackend === "simulated-humanoid");

  const caps = bridge.getCapabilities();
  chipsEl.innerHTML = `
    <span class="chip ${connected ? "ok" : ""}">${connected ? "connected" : "disconnected"}</span>
    <span class="chip ${enabled ? "accent" : "warn"}">${enabled ? "control on" : "control off"}</span>
    <span class="chip ${estop ? "err" : ""}">${estop ? "E-STOP" : mode}</span>
    <span class="chip">${robotBackend === "simulated-arm" ? "arm" : "humanoid"}</span>
    ${caps ? `<span class="chip">${caps.class}</span>` : ""}
  `;

  const pose = lastState?.pose?.position;
  statusText.textContent = [
    `status: ${connected ? "connected" : "disconnected"}`,
    `control: ${enabled} · mode: ${mode} · estop: ${estop}`,
    pose
      ? `ee: (${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}, ${pose.z.toFixed(2)})`
      : "ee: —",
    lastState?.message ? `msg: ${lastState.message}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Canvas ────────────────────────────────────────────────
function draw(state: RobotState): void {
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#0a1018";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#1c2a3a";
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const x = (i / 11) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    const y = (i / 11) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // keep-out zone visual (top-down x/y)
  const zx0 = w / 2 + 0.55 * 280;
  const zy0 = h / 2 - 0.55 * 280;
  const zx1 = w / 2 + 1.2 * 280;
  const zy1 = h / 2 - 1.2 * 280;
  ctx.fillStyle = "rgba(255, 93, 108, 0.08)";
  ctx.strokeStyle = "rgba(255, 93, 108, 0.35)";
  ctx.fillRect(zx0, zy1, zx1 - zx0, zy0 - zy1);
  ctx.strokeRect(zx0, zy1, zx1 - zx0, zy0 - zy1);
  ctx.fillStyle = "#ff5d6c88";
  ctx.font = "11px IBM Plex Mono, monospace";
  ctx.fillText("keep-out", zx0 + 6, zy0 - 8);

  const p = state.pose?.position ?? { x: 0, y: 0, z: 0.3 };
  const base = state.basePose?.position;
  const sx = w / 2 + p.x * 280;
  const sy = h / 2 - p.y * 280;
  const r = 10 + p.z * 16;

  if (base) {
    const bx = w / 2 + base.x * 120;
    const by = h / 2 - base.y * 120;
    ctx.fillStyle = "#2a3a4f";
    ctx.beginPath();
    ctx.arc(bx, by, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3dd6c688";
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(sx, sy);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#243041";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3dd6c6";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(sx, sy);
    ctx.stroke();
  }

  const grip = state.grippers?.[0]?.open ?? 1;
  ctx.fillStyle = grip < 0.3 ? "#f0b429" : "#5ddea0";
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8aa0b8";
  ctx.font = "12px IBM Plex Mono, monospace";
  ctx.fillText(
    `mode=${state.mode}  ee=(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})  grip=${grip.toFixed(2)}`,
    14,
    h - 16
  );

  if (state.mode === "estop") {
    ctx.fillStyle = "#ff5d6c";
    ctx.font = "bold 28px IBM Plex Sans, sans-serif";
    ctx.fillText("E-STOP", w / 2 - 52, 42);
  }
}

draw({
  mode: "disconnected",
  pose: { position: { x: 0.35, y: 0, z: 0.35 } },
  grippers: [{ name: "g", open: 1 }],
  timestamp: Date.now(),
});

// ─── Actions ───────────────────────────────────────────────
async function reconnect(next: "simulated-arm" | "simulated-humanoid"): Promise<void> {
  robotBackend = next;
  try {
    await bridge.disconnect();
  } catch {
    /* ignore */
  }
  bridge.dispose();
  bridge = createBridge();
  wireBridge(bridge);
  lastState = null;
  updateSkillUi(null);
  log(`robot backend → ${robotBackend}`, "tag-skill");
  refreshUi();
  draw({
    mode: "disconnected",
    pose: { position: { x: 0.35, y: 0, z: 0.35 } },
    grippers: [{ name: "g", open: 1 }],
    timestamp: Date.now(),
  });
}

btnConnect.onclick = async () => {
  try {
    await bridge.connect();
    log("Connected — call Enable control before motion", "tag-ok");
  } catch (e) {
    log(String(e), "tag-err");
  }
  refreshUi();
};

btnEnable.onclick = async () => {
  try {
    await bridge.enableControl("supervised");
  } catch (e) {
    log(String(e), "tag-err");
  }
  refreshUi();
};

btnDisable.onclick = async () => {
  await bridge.disableControl();
  refreshUi();
};

btnEstop.onclick = () => {
  bridge.emergencyStop("UI e-stop");
  refreshUi();
};

btnClear.onclick = () => {
  bridge.clearEmergencyStop();
  refreshUi();
};

btnArm.onclick = () => void reconnect("simulated-arm");
btnHumanoid.onclick = () => void reconnect("simulated-humanoid");

app.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) => {
  btn.onclick = () => {
    if (!bridge.isControlEnabled() && btn.dataset.mode !== "disabled") {
      log("Enable control first", "tag-warn");
      return;
    }
    bridge.setControlMode(btn.dataset.mode as ControlMode);
    refreshUi();
  };
});

const dirs: Record<string, { x: number; y: number; z: number }> = {
  left: { x: 0, y: 0.08, z: 0 },
  right: { x: 0, y: -0.08, z: 0 },
  up: { x: 0, y: 0, z: 0.08 },
  down: { x: 0, y: 0, z: -0.08 },
  forward: { x: 0.08, y: 0, z: 0 },
  back: { x: -0.08, y: 0, z: 0 },
};

app.querySelectorAll<HTMLButtonElement>(".intent").forEach((btn) => {
  btn.onclick = () => {
    const kind = btn.dataset.kind!;
    if (kind === "move") {
      const d = dirs[btn.dataset.dir ?? "forward"] ?? dirs.forward!;
      bridge.injectIntention({
        kind: "move",
        confidence: 0.92,
        payload: { target: d, relative: true, speed: modSpeed },
      });
    } else if (kind === "grasp") {
      bridge.injectIntention({
        kind: "grasp",
        confidence: 0.9,
        payload: { force: 0.65 },
      });
    } else if (kind === "release") {
      bridge.injectIntention({ kind: "release", confidence: 0.9, payload: {} });
    } else if (kind === "stop") {
      bridge.injectIntention({ kind: "stop", confidence: 0.99 });
    } else if (kind === "home") {
      bridge.injectIntention({ kind: "home", confidence: 0.95 });
    }
  };
});

app.querySelectorAll<HTMLButtonElement>(".skill").forEach((btn) => {
  btn.onclick = () => {
    if (btn.dataset.kind === "home") {
      bridge.injectIntention({ kind: "home", confidence: 0.95 });
      return;
    }
    const skill = btn.dataset.skill!;
    const positions: Record<string, { x: number; y: number; z: number }> = {
      pick_object: { x: 0.35, y: 0.08, z: 0.22 },
      place_object: { x: -0.25, y: 0.12, z: 0.22 },
      wave: { x: 0.3, y: 0.15, z: 0.55 },
    };
    bridge.injectIntention({
      kind: "task",
      confidence: 0.93,
      payload: {
        task: skill,
        position: positions[skill],
        requireConfirm: false,
      },
    });
  };
});

btnCancel.onclick = () => {
  bridge.injectIntention({ kind: "cancel", confidence: 0.99 });
};

btnSlower.onclick = () => {
  modSpeed = Math.max(0.15, modSpeed - 0.12);
  bridge.injectIntention({
    kind: "modulate",
    confidence: 0.9,
    payload: { speed: modSpeed },
  });
  log(`modulate speed=${modSpeed.toFixed(2)}`, "tag-skill");
};

btnFaster.onclick = () => {
  modSpeed = Math.min(1, modSpeed + 0.12);
  bridge.injectIntention({
    kind: "modulate",
    confidence: 0.9,
    payload: { speed: modSpeed },
  });
  log(`modulate speed=${modSpeed.toFixed(2)}`, "tag-skill");
};

btnLowConf.onclick = () => {
  bridge.injectIntention({
    kind: "move",
    confidence: 0.25,
    payload: { target: { x: 0.2, y: 0, z: 0.3 } },
  });
};

btnKeepOut.onclick = () => {
  bridge.injectIntention({
    kind: "move",
    confidence: 0.95,
    payload: { target: { x: 0.7, y: 0.7, z: 0.4 } },
  });
};

window.addEventListener("keydown", (ev) => {
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) {
    return;
  }
  const map: Record<string, () => void> = {
    w: () =>
      bridge.injectIntention({
        kind: "move",
        confidence: 0.9,
        payload: { target: { x: 0.08, y: 0, z: 0 }, relative: true, speed: modSpeed },
      }),
    s: () =>
      bridge.injectIntention({
        kind: "move",
        confidence: 0.9,
        payload: { target: { x: -0.08, y: 0, z: 0 }, relative: true, speed: modSpeed },
      }),
    a: () =>
      bridge.injectIntention({
        kind: "move",
        confidence: 0.9,
        payload: { target: { x: 0, y: 0.08, z: 0 }, relative: true, speed: modSpeed },
      }),
    d: () =>
      bridge.injectIntention({
        kind: "move",
        confidence: 0.9,
        payload: { target: { x: 0, y: -0.08, z: 0 }, relative: true, speed: modSpeed },
      }),
    g: () =>
      bridge.injectIntention({
        kind: "grasp",
        confidence: 0.9,
        payload: { force: 0.65 },
      }),
    r: () =>
      bridge.injectIntention({ kind: "release", confidence: 0.9, payload: {} }),
    h: () => bridge.injectIntention({ kind: "home", confidence: 0.95 }),
    " ": () => {
      ev.preventDefault();
      bridge.injectIntention({ kind: "stop", confidence: 0.99 });
    },
    Escape: () => {
      bridge.emergencyStop("keyboard");
      refreshUi();
    },
  };
  const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  const fn = map[key];
  if (fn) {
    if (!bridge.isConnected()) return;
    fn();
  }
});

refreshUi();
log("Ready — Connect, then Enable control", "tag-ok");
