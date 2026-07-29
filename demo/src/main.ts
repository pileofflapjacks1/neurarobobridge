/**
 * NeuraRoboBridge hosted browser demo (Vercel).
 * Simulator-only · computer-side · not affiliated with Neuralink / Optimus.
 */

import {
  NeuraRoboBridge,
  registerSkill,
  type RobotState,
  type ActiveSkill,
  type ControlMode,
  type RobotCommand,
  type SkillDefinition,
} from "neurarobobridge";
import { drawViz, type VizMode } from "./viz";
import "./styles.css";

const hangSkill: SkillDefinition = {
  name: "demo_hang",
  description: "Demo skill that hangs until step timeout",
  build: () => [
    {
      id: "hang",
      label: "Simulated stuck step",
      timeoutMs: 700,
      command: { kind: "home" },
    },
  ],
};
registerSkill(hangSkill);

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="banner">
    <strong>Simulator demo only — not a Neuralink connection.</strong>
    This is computer-side middleware (intentions → safe robot commands).
    You cannot attach a real implant to this app or the GitHub repo.
    Not implant firmware, not a medical device, not affiliated with Neuralink, Tesla, or Optimus.
    <a href="https://github.com/pileofflapjacks1/neurarobobridge#faq--can-i-connect-my-neuralink" target="_blank" rel="noreferrer">FAQ: Can I connect my Neuralink?</a>
  </div>

  <div id="helpBanner" class="help-banner" role="alert">
    <strong>needs_help</strong> — <span id="helpText">Skill timed out. Recovery: stop + open gripper.</span>
    <div class="help-actions">
      <button type="button" id="btnHelpDismiss">Dismiss</button>
      <button type="button" id="btnHelpHome">Home</button>
      <button type="button" id="btnHelpExport">Export black-box</button>
    </div>
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
        <div class="row">
          <button type="button" id="btnForceTimeout" class="danger" disabled>Force step timeout</button>
        </div>
        <p class="hint">Force timeout demos <code>needs_help</code> + safe-fail recovery (stop + open gripper).</p>
        <div id="skillStatus" class="status-block">No active skill</div>
        <div class="progress" aria-hidden="true"><i id="skillBar"></i></div>
      </div>

      <div class="section-gap">
        <h2>Audit</h2>
        <div class="row">
          <button type="button" id="btnExportJson" disabled>Export black-box JSON</button>
          <button type="button" id="btnExportText" disabled>Export report (.txt)</button>
        </div>
        <p class="hint">Downloads a session black-box: commands, safety, and “why it moved”.</p>
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
      <div class="row" style="margin-bottom:0.65rem">
        <button type="button" id="btnVizHumanoid" class="active">Humanoid 2.5D</button>
        <button type="button" id="btnVizSchema">Schema (top-down)</button>
      </div>
      <p class="hint" style="margin-top:0;margin-bottom:0.55rem">
        Generic humanoid schematic for the sim — not affiliated with Optimus or any commercial robot.
      </p>
      <canvas id="viz" width="900" height="420"></canvas>
      <div class="section-gap">
        <h2>Event log</h2>
        <div id="log"></div>
      </div>
    </section>
  </div>

  <footer class="foot">
    Part of <a href="https://neurabeach.vercel.app/collections/col-neura-suite" target="_blank" rel="noreferrer">Joe’s Neura Suite</a>
    · Companion to Neurabridge (app intents) · MIT ·
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
const btnForceTimeout = $("#btnForceTimeout") as HTMLButtonElement;
const btnExportJson = $("#btnExportJson") as HTMLButtonElement;
const btnExportText = $("#btnExportText") as HTMLButtonElement;
const helpBanner = $("#helpBanner");
const helpText = $("#helpText");
const btnHelpDismiss = $("#btnHelpDismiss") as HTMLButtonElement;
const btnHelpHome = $("#btnHelpHome") as HTMLButtonElement;
const btnHelpExport = $("#btnHelpExport") as HTMLButtonElement;
const btnVizHumanoid = $("#btnVizHumanoid") as HTMLButtonElement;
const btnVizSchema = $("#btnVizSchema") as HTMLButtonElement;

function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  return app.querySelector(sel) as T;
}

// ─── State ─────────────────────────────────────────────────
let robotBackend: "simulated-arm" | "simulated-humanoid" = "simulated-arm";
let bridge = createBridge();
let lastState: RobotState | null = null;
let modSpeed = 0.55;
let hangPatch: ((cmd: RobotCommand) => Promise<void> | void) | null = null;
let vizMode: VizMode = "humanoid";
let rafId = 0;

function createBridge(): NeuraRoboBridge {
  return new NeuraRoboBridge({
    bciBackend: "manual",
    robotBackend,
    logLevel: "warn",
    recording: true,
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
    skills: {
      enabled: true,
      defaultStepDelayMs: 180,
      defaultStepTimeoutMs: 8000,
      skillTimeoutMs: 60_000,
      safeFailRecovery: true,
      needsHelpOnFailure: true,
    },
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

function showNeedsHelp(message: string): void {
  helpText.textContent = message;
  helpBanner.classList.add("visible");
}

function hideNeedsHelp(): void {
  helpBanner.classList.remove("visible");
}

function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJson(): void {
  const box = bridge.exportBlackBox({
    meta: { source: "demo", robotBackend },
  });
  downloadBlob(
    `neurarobobridge-blackbox-${box.session.id}.json`,
    JSON.stringify(box, null, 2),
    "application/json"
  );
  log(`Exported black-box JSON (${box.summary.commandCount} cmds)`, "tag-ok");
}

function exportText(): void {
  const report = bridge.exportBlackBoxReport({
    meta: { source: "demo", robotBackend },
  });
  downloadBlob(
    `neurarobobridge-report-${Date.now()}.txt`,
    report,
    "text/plain"
  );
  log("Exported black-box text report", "tag-ok");
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
    if (
      s.status === "running" ||
      s.status === "succeeded" ||
      s.status === "failed" ||
      s.status === "needs_help" ||
      s.status === "cancelled"
    ) {
      log(
        `skill ${s.skillName} [${s.status}] ${s.message}`,
        s.status === "failed" || s.status === "needs_help" ? "tag-err" : "tag-skill"
      );
    }
    if (s.status === "needs_help") {
      showNeedsHelp(
        `${s.message}${s.recoveryApplied ? " · recovery applied (stop + open gripper)" : ""}`
      );
    }
  });
  b.on("robotState", (s) => {
    lastState = s;
    // rAF loop also paints for idle bob; keep lastState fresh
  });
  b.on("feedback", (f) => {
    if (f.kind === "needs_help") {
      showNeedsHelp(f.message);
      log(`needs_help: ${f.message}`, "tag-err");
      return;
    }
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
  const help =
    s.needsHelp || s.status === "needs_help"
      ? ` · needs_help (${s.failureKind ?? "?"})`
      : "";
  skillStatus.textContent = `${s.skillName} · ${s.status}${help} · step ${Math.min(s.stepIndex + 1, s.stepCount)}/${s.stepCount}\n${s.message}`;
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
  btnForceTimeout.disabled = !connected || !enabled;
  btnExportJson.disabled = !connected;
  btnExportText.disabled = !connected;

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
function paint(): void {
  const state: RobotState = lastState ?? {
    mode: "disconnected",
    pose: { position: { x: 0.3, y: 0.1, z: 0.95 } },
    basePose: { position: { x: 0, y: 0, z: 0 } },
    grippers: [{ name: "g", open: 1 }],
    timestamp: Date.now(),
  };
  drawViz(ctx, canvas, state, vizMode);
}

function startPaintLoop(): void {
  cancelAnimationFrame(rafId);
  const tick = () => {
    paint();
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function setVizMode(mode: VizMode): void {
  vizMode = mode;
  btnVizHumanoid.classList.toggle("active", mode === "humanoid");
  btnVizSchema.classList.toggle("active", mode === "schema");
}

btnVizHumanoid.onclick = () => setVizMode("humanoid");
btnVizSchema.onclick = () => setVizMode("schema");

startPaintLoop();

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
  paint();
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

btnForceTimeout.onclick = () => {
  hideNeedsHelp();
  const robot = bridge.getRobotBackend();
  const original = robot.execute.bind(robot);
  hangPatch = async (cmd: RobotCommand) => {
    if (cmd.forced || cmd.kind === "stop" || cmd.kind === "estop" || cmd.kind === "set_gripper") {
      return original(cmd);
    }
    // Never resolve — skill step timeout wins
    await new Promise<void>(() => {
      /* hang */
    });
  };
  robot.execute = hangPatch;

  log("Forcing hanging skill step (timeout ~700ms)…", "tag-warn");
  bridge.injectIntention({
    kind: "task",
    confidence: 0.95,
    payload: { task: "demo_hang", requireConfirm: false },
  });

  // Restore execute after timeout window
  window.setTimeout(() => {
    if (robot.execute === hangPatch) {
      robot.execute = original;
      hangPatch = null;
      log("Restored robot.execute after hang demo", "tag-skill");
    }
  }, 2500);
};

btnExportJson.onclick = () => exportJson();
btnExportText.onclick = () => exportText();
btnHelpExport.onclick = () => exportJson();
btnHelpDismiss.onclick = () => hideNeedsHelp();
btnHelpHome.onclick = () => {
  hideNeedsHelp();
  bridge.injectIntention({ kind: "home", confidence: 0.95 });
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
