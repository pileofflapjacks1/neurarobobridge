/**
 * Canvas visualizers for the NeuraRoboBridge demo.
 * Generic schematic / 2.5D humanoid — not affiliated with any commercial robot brand.
 */

import type { RobotState } from "neurarobobridge";

export type VizMode = "humanoid" | "schema";

const KEEP_OUT = {
  min: { x: 0.55, y: 0.55 },
  max: { x: 1.2, y: 1.2 },
};

/** Subtle idle animation phase (ms-based). */
function phase(t = Date.now()): number {
  return t / 1000;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = "#0a1018";
  ctx.fillRect(0, 0, w, h);

  // soft ground gradient
  const g = ctx.createLinearGradient(0, h * 0.35, 0, h);
  g.addColorStop(0, "rgba(20, 40, 55, 0)");
  g.addColorStop(1, "rgba(15, 35, 50, 0.55)");
  ctx.fillStyle = g;
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
}

function drawKeepOut(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scale: number,
  ox: number,
  oy: number
): void {
  const zx0 = ox + KEEP_OUT.min.x * scale;
  const zy0 = oy - KEEP_OUT.min.y * scale;
  const zx1 = ox + KEEP_OUT.max.x * scale;
  const zy1 = oy - KEEP_OUT.max.y * scale;
  const left = Math.min(zx0, zx1);
  const top = Math.min(zy0, zy1);
  const width = Math.abs(zx1 - zx0);
  const height = Math.abs(zy1 - zy0);
  ctx.fillStyle = "rgba(255, 93, 108, 0.08)";
  ctx.strokeStyle = "rgba(255, 93, 108, 0.4)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.fillRect(left, top, width, height);
  ctx.strokeRect(left, top, width, height);
  ctx.setLineDash([]);
  ctx.fillStyle = "#ff5d6c99";
  ctx.font = "11px IBM Plex Mono, monospace";
  ctx.fillText("keep-out", left + 6, top + 14);
}

function drawStatusBar(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: RobotState,
  viewLabel: string
): void {
  const p = state.pose?.position ?? { x: 0, y: 0, z: 0.3 };
  const grip = state.grippers?.[0]?.open ?? 1;
  ctx.fillStyle = "#8aa0b8";
  ctx.font = "12px IBM Plex Mono, monospace";
  ctx.fillText(
    `mode=${state.mode}  ee=(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})  grip=${grip.toFixed(2)}  view=${viewLabel}`,
    14,
    h - 16
  );

  if (state.mode === "estop") {
    ctx.fillStyle = "rgba(255, 93, 108, 0.15)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ff5d6c";
    ctx.font = "bold 28px IBM Plex Sans, sans-serif";
    ctx.fillText("E-STOP", w / 2 - 52, 42);
  }
}

/** Original top-down EE schematic. */
export function drawSchema(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: RobotState
): void {
  const w = canvas.width;
  const h = canvas.height;
  drawGrid(ctx, w, h);

  const scale = 280;
  const ox = w / 2;
  const oy = h / 2;
  drawKeepOut(ctx, w, h, scale, ox, oy);

  const p = state.pose?.position ?? { x: 0, y: 0, z: 0.3 };
  const base = state.basePose?.position;
  const sx = ox + p.x * scale;
  const sy = oy - p.y * scale;
  const r = 10 + p.z * 16;

  if (base) {
    const bx = ox + base.x * 120;
    const by = oy - base.y * 120;
    ctx.fillStyle = "#2a3a4f";
    ctx.beginPath();
    ctx.arc(bx, by, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3dd6c688";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(sx, sy);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#243041";
    ctx.beginPath();
    ctx.arc(ox, oy, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3dd6c6";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(sx, sy);
    ctx.stroke();
  }

  const grip = state.grippers?.[0]?.open ?? 1;
  ctx.fillStyle = grip < 0.3 ? "#f0b429" : "#5ddea0";
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();

  drawStatusBar(ctx, w, h, state, "schema");
}

/**
 * 2.5D generic humanoid (front/three-quarter schematic).
 * Driven by basePose, EE pose, gripper, and mode — not a commercial design.
 */
export function drawHumanoid25d(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: RobotState
): void {
  const w = canvas.width;
  const h = canvas.height;
  drawGrid(ctx, w, h);

  const t = phase();
  const p = state.pose?.position ?? { x: 0.3, y: 0.1, z: 0.9 };
  const base = state.basePose?.position ?? { x: 0, y: 0, z: 0 };
  const grip = state.grippers?.[0]?.open ?? 1;
  const mode = state.mode;

  // Ground plane keep-out (perspective-ish: y maps up-screen slightly)
  const gScale = 160;
  const gOx = w * 0.5;
  const gOy = h * 0.78;
  drawKeepOut(ctx, w, h, gScale, gOx, gOy);

  // Floor ellipse under robot
  const rootX = gOx + base.x * gScale;
  const rootY = gOy - base.y * gScale * 0.55;
  ctx.fillStyle = "rgba(61, 214, 198, 0.06)";
  ctx.beginPath();
  ctx.ellipse(rootX, rootY + 8, 70, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(61, 214, 198, 0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Animation cues
  const walking =
    mode === "moving" || mode === "executing_task";
  const bob = walking ? Math.sin(t * 8) * 3 : Math.sin(t * 1.5) * 1.2;
  const sway = walking ? Math.sin(t * 8) * 4 : Math.sin(t * 1.2) * 1.5;
  const estop = mode === "estop";

  // Scale figure
  const S = 1.15;
  const cx = rootX + sway;
  const cy = rootY - 150 * S + bob;

  // Relative reach of "right hand" from torso toward EE delta
  const reachX = clamp((p.x - base.x) * 55, -70, 90);
  const reachY = clamp(-(p.z - 0.9) * 50, -55, 40);
  const reachSide = clamp((p.y - base.y) * 40, -40, 40);

  const body = estop ? "#5a3038" : "#3a4a5c";
  const accent = estop ? "#ff5d6c" : "#3dd6c6";
  const limb = estop ? "#6a4048" : "#4a5d72";
  const joint = estop ? "#ff8a95" : "#5ddea0";

  ctx.save();
  ctx.translate(cx, cy);

  // Shadowed depth offset for 2.5D (draw back limbs first)
  const depth = 6;

  // --- Back (left) leg ---
  drawLimb(
    ctx,
    -12 * S,
    55 * S,
    -18 * S + (walking ? Math.sin(t * 8 + Math.PI) * 12 : 0),
    115 * S,
    11 * S,
    limb,
    true
  );
  // --- Back (left) arm ---
  drawLimb(
    ctx,
    -22 * S,
    8 * S,
    -38 * S + (walking ? Math.sin(t * 8) * 10 : -8),
    48 * S,
    9 * S,
    limb,
    true
  );

  // Torso block (slight perspective: wider top)
  ctx.fillStyle = body;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-22 * S, 5 * S);
  ctx.lineTo(22 * S, 5 * S);
  ctx.lineTo(18 * S, 58 * S);
  ctx.lineTo(-18 * S, 58 * S);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Chest plate highlight (generic, not a brand)
  ctx.fillStyle = "rgba(61, 214, 198, 0.12)";
  roundRect(ctx, -12 * S, 14 * S, 24 * S, 28 * S, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(61, 214, 198, 0.35)";
  ctx.stroke();

  // Pelvis
  ctx.fillStyle = limb;
  roundRect(ctx, -16 * S, 54 * S, 32 * S, 12 * S, 3);
  ctx.fill();

  // --- Front (right) leg ---
  drawLimb(
    ctx,
    12 * S,
    55 * S,
    16 * S + (walking ? Math.sin(t * 8) * 12 : 0),
    115 * S,
    11 * S,
    limb,
    false
  );

  // Neck + head
  ctx.fillStyle = limb;
  ctx.fillRect(-5 * S, -8 * S, 10 * S, 14 * S);
  ctx.fillStyle = body;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  roundRect(ctx, -14 * S, -36 * S, 28 * S, 30 * S, 8);
  ctx.fill();
  ctx.stroke();

  // Visor band
  ctx.fillStyle = estop ? "rgba(255, 93, 108, 0.55)" : "rgba(61, 214, 198, 0.45)";
  roundRect(ctx, -10 * S, -26 * S, 20 * S, 8 * S, 3);
  ctx.fill();

  // --- Front (right) arm — reaches toward EE ---
  const shoulderX = 22 * S;
  const shoulderY = 10 * S;
  const handX = shoulderX + reachX * 0.85 + reachSide * 0.25;
  const handY = shoulderY + 35 * S + reachY;
  const elbowX = lerp(shoulderX, handX, 0.45) + 12 * S;
  const elbowY = lerp(shoulderY, handY, 0.5) + 8 * S;

  // Upper arm
  ctx.strokeStyle = limb;
  ctx.lineWidth = 10 * S;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(elbowX, elbowY);
  ctx.stroke();
  // Forearm
  ctx.beginPath();
  ctx.moveTo(elbowX, elbowY);
  ctx.lineTo(handX, handY);
  ctx.stroke();

  // Shoulder / elbow joints
  for (const [jx, jy] of [
    [shoulderX, shoulderY],
    [elbowX, elbowY],
  ] as const) {
    ctx.fillStyle = joint;
    ctx.beginPath();
    ctx.arc(jx, jy, 5 * S, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hand — open vs closed from gripper
  drawHand(ctx, handX, handY, grip, S, accent, estop);

  // Target ghost: EE world hint on ground
  const eeGx = gOx + p.x * gScale;
  const eeGy = gOy - p.y * gScale * 0.55;
  ctx.strokeStyle = "rgba(93, 222, 160, 0.35)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cx + handX, cy + handY);
  ctx.lineTo(eeGx, eeGy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(93, 222, 160, 0.5)";
  ctx.beginPath();
  ctx.arc(eeGx, eeGy, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Caption
  ctx.fillStyle = "#5a6f85";
  ctx.font = "11px IBM Plex Sans, sans-serif";
  ctx.fillText(
    "Generic humanoid schematic (2.5D) · not affiliated with any commercial robot",
    14,
    22
  );

  drawStatusBar(ctx, w, h, state, "humanoid");

  // depth unused but documents 2.5D intent
  void depth;
}

function drawLimb(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  color: string,
  dim: boolean
): void {
  ctx.strokeStyle = dim ? `${color}99` : color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  // mid joint for knee-ish bend
  const mx = (x0 + x1) / 2 + (dim ? -6 : 6);
  const my = (y0 + y1) / 2 + 4;
  ctx.quadraticCurveTo(mx, my, x1, y1);
  ctx.stroke();
  ctx.fillStyle = dim ? "#5ddea088" : "#5ddea0";
  ctx.beginPath();
  ctx.arc(x0, y0, width * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  open: number,
  S: number,
  accent: string,
  estop: boolean
): void {
  const closed = open < 0.35;
  ctx.fillStyle = closed ? (estop ? "#ff5d6c" : "#f0b429") : accent;
  ctx.beginPath();
  ctx.arc(x, y, 8 * S, 0, Math.PI * 2);
  ctx.fill();

  // Fingers: spread when open, tuck when closed
  const spread = lerp(2, 10, open) * S;
  ctx.strokeStyle = closed ? "#c9a227" : "#7aefd8";
  ctx.lineWidth = 2.5 * S;
  ctx.lineCap = "round";
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(x, y - 2 * S);
    ctx.lineTo(x + i * spread, y - (closed ? 6 : 14) * S);
    ctx.stroke();
  }
}

export function drawViz(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: RobotState,
  mode: VizMode
): void {
  if (mode === "humanoid") drawHumanoid25d(ctx, canvas, state);
  else drawSchema(ctx, canvas, state);
}
