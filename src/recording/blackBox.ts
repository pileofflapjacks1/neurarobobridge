/**
 * Black-box session export — audit-friendly summary of why the robot moved.
 */

import type { SessionRecording, SessionEvent } from "../types/session.js";
import { createId } from "../core/id.js";

export interface MotionExplanation {
  /** Offset ms from session start. */
  t: number;
  commandKind: string;
  commandId: string;
  intentionId?: string;
  intentionKind?: string;
  confidence?: number;
  /** Nearby safety events (same window). */
  safetyAround: Array<{ reason: string; message: string; t: number }>;
  summary: string;
}

export interface SessionBlackBox {
  version: 1;
  exportId: string;
  exportedAt: number;
  session: SessionRecording;
  summary: {
    durationMs: number;
    intentionCount: number;
    commandCount: number;
    safetyCount: number;
    rejectedEstimate: number;
    estopCount: number;
    skillMarkers: number;
    topSafetyReasons: Array<{ reason: string; count: number }>;
  };
  /** Human-readable “why did it move?” lines for each motion command. */
  whyItMoved: MotionExplanation[];
  /** Chronological narrative lines for logs / UI. */
  narrative: string[];
}

const MOTION_KINDS = new Set([
  "move_to",
  "move_delta",
  "set_gripper",
  "navigate",
  "home",
  "execute_task",
  "modulate",
]);

/**
 * Build an audit package from a session recording.
 */
export function buildBlackBox(
  session: SessionRecording,
  opts?: { windowMs?: number }
): SessionBlackBox {
  const windowMs = opts?.windowMs ?? 400;
  const events = session.events;
  const endedAt = session.endedAt ?? Date.now();
  const durationMs = Math.max(0, endedAt - session.startedAt);

  const intentions = events.filter((e) => e.type === "intention");
  const commands = events.filter((e) => e.type === "command" && e.command);
  const safety = events.filter((e) => e.type === "safetyEvent" && e.safetyEvent);
  const markers = events.filter((e) => e.type === "marker");

  const reasonCounts = new Map<string, number>();
  for (const e of safety) {
    const r = e.safetyEvent!.reason;
    reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
  }
  const topSafetyReasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const estopCount = safety.filter(
    (e) => e.safetyEvent!.reason === "emergency_stop"
  ).length;
  const rejectedEstimate = safety.filter((e) =>
    [
      "low_confidence",
      "control_disabled",
      "rate_limit",
      "stale_intention",
      "policy_violation",
      "capability_mismatch",
      "mode_forbidden",
      "workspace_violation",
    ].includes(e.safetyEvent!.reason)
  ).length;

  const whyItMoved: MotionExplanation[] = [];
  for (const ev of commands) {
    const cmd = ev.command!;
    if (!MOTION_KINDS.has(cmd.kind) && cmd.kind !== "stop" && cmd.kind !== "estop") {
      continue;
    }
    if (cmd.kind === "stop" || cmd.kind === "estop") {
      // include estop/stop as motion-relevant
    }

    const intention = cmd.intentionId
      ? intentions.find((i) => i.intention?.id === cmd.intentionId)?.intention
      : findNearestIntention(events, ev.t, windowMs);

    const safetyAround = safety
      .filter((s) => Math.abs(s.t - ev.t) <= windowMs)
      .map((s) => ({
        reason: s.safetyEvent!.reason,
        message: s.safetyEvent!.message,
        t: s.t,
      }));

    const conf = intention?.confidence;
    const summary = buildLine(cmd.kind, intention?.kind, conf, safetyAround, cmd.forced);

    whyItMoved.push({
      t: ev.t,
      commandKind: cmd.kind,
      commandId: cmd.id,
      intentionId: intention?.id ?? cmd.intentionId,
      intentionKind: intention?.kind,
      confidence: conf,
      safetyAround,
      summary,
    });
  }

  const narrative: string[] = [
    `Session ${session.id} · ${durationMs}ms · ${intentions.length} intentions · ${commands.length} commands · ${safety.length} safety events`,
  ];
  for (const w of whyItMoved) {
    narrative.push(`t+${w.t}ms  ${w.summary}`);
  }
  if (topSafetyReasons.length) {
    narrative.push(
      `Top safety: ${topSafetyReasons.map((r) => `${r.reason}×${r.count}`).join(", ")}`
    );
  }

  return {
    version: 1,
    exportId: createId("bbox"),
    exportedAt: Date.now(),
    session: {
      ...session,
      endedAt: session.endedAt ?? endedAt,
      meta: {
        ...(session.meta ?? {}),
        blackBoxExport: true,
      },
    },
    summary: {
      durationMs,
      intentionCount: intentions.length,
      commandCount: commands.length,
      safetyCount: safety.length,
      rejectedEstimate,
      estopCount,
      skillMarkers: markers.filter((m) =>
        String(m.marker?.label ?? "").includes("skill")
      ).length,
      topSafetyReasons,
    },
    whyItMoved,
    narrative,
  };
}

/** Pretty text report for download / clipboard. */
export function formatBlackBoxReport(box: SessionBlackBox): string {
  const lines = [
    "NeuraRoboBridge black-box report",
    `exportId: ${box.exportId}`,
    `session:  ${box.session.id}`,
    `exported: ${new Date(box.exportedAt).toISOString()}`,
    "",
    "— Summary —",
    `duration:     ${box.summary.durationMs}ms`,
    `intentions:   ${box.summary.intentionCount}`,
    `commands:     ${box.summary.commandCount}`,
    `safety:       ${box.summary.safetyCount}`,
    `rejections~:  ${box.summary.rejectedEstimate}`,
    `estops:       ${box.summary.estopCount}`,
    "",
    "— Why it moved —",
    ...box.whyItMoved.map((w) => `  +${w.t}ms  ${w.summary}`),
    "",
    "— Narrative —",
    ...box.narrative.map((n) => `  ${n}`),
    "",
    "Computer-side / simulation audit artifact. Not a medical record.",
  ];
  return lines.join("\n");
}

function findNearestIntention(
  events: SessionEvent[],
  t: number,
  windowMs: number
) {
  let best: SessionEvent | undefined;
  let bestDt = Infinity;
  for (const e of events) {
    if (e.type !== "intention" || !e.intention) continue;
    if (e.t > t) continue;
    const dt = t - e.t;
    if (dt <= windowMs && dt < bestDt) {
      bestDt = dt;
      best = e;
    }
  }
  return best?.intention;
}

function buildLine(
  commandKind: string,
  intentionKind: string | undefined,
  confidence: number | undefined,
  safetyAround: Array<{ reason: string; message: string }>,
  forced?: boolean
): string {
  const parts = [`cmd=${commandKind}`];
  if (forced) parts.push("forced");
  if (intentionKind) parts.push(`from intent=${intentionKind}`);
  if (confidence !== undefined) parts.push(`conf=${confidence.toFixed(2)}`);
  if (safetyAround.length) {
    parts.push(
      `safety=[${safetyAround.map((s) => s.reason).join(",")}]`
    );
  }
  return parts.join(" ");
}
