/**
 * Built-in shared-autonomy skills for arm + humanoid simulators.
 */

import type { SkillDefinition, SkillContext, SkillStep } from "./types.js";
import type { Vec3 } from "../types/intention.js";

function pos(ctx: SkillContext, fallback: Vec3): Vec3 {
  return ctx.position ?? fallback;
}

function speed(ctx: SkillContext, base = 0.5): number {
  return Math.min(1, Math.max(0.05, base * ctx.modulation.speed));
}

function gripOpen(ctx: SkillContext, closedness = 0.85): number {
  // closedness 1 → fully closed; force modulation tightens grasp
  const c = Math.min(1, closedness * (0.5 + 0.5 * ctx.modulation.force));
  return Math.max(0, 1 - c);
}

export const pickObjectSkill: SkillDefinition = {
  name: "pick_object",
  description: "Approach target, grasp, lift",
  requiresManipulation: true,
  build(ctx): SkillStep[] {
    const target = pos(ctx, { x: 0.35, y: 0.1, z: 0.25 });
    const approach = { ...target, z: target.z + 0.12 };
    const lift = { ...target, z: target.z + 0.2 };
    const s = speed(ctx, 0.55);
    return [
      {
        id: "approach",
        label: "Approach above object",
        delayMs: 0,
        command: {
          kind: "move_to",
          pose: { position: approach },
          speed: s,
        },
      },
      {
        id: "descend",
        label: "Descend to object",
        delayMs: 280,
        command: {
          kind: "move_to",
          pose: { position: target },
          speed: s * 0.7,
        },
      },
      {
        id: "grasp",
        label: "Grasp",
        delayMs: 220,
        command: {
          kind: "set_gripper",
          gripper: gripOpen(ctx, 0.9),
        },
      },
      {
        id: "lift",
        label: "Lift object",
        delayMs: 250,
        command: {
          kind: "move_to",
          pose: { position: lift },
          speed: s * 0.6,
        },
      },
    ];
  },
};

export const placeObjectSkill: SkillDefinition = {
  name: "place_object",
  description: "Move to place pose and release",
  requiresManipulation: true,
  build(ctx): SkillStep[] {
    const target = pos(ctx, { x: -0.25, y: 0.15, z: 0.25 });
    const approach = { ...target, z: target.z + 0.12 };
    const s = speed(ctx, 0.5);
    return [
      {
        id: "approach_place",
        label: "Approach place pose",
        command: {
          kind: "move_to",
          pose: { position: approach },
          speed: s,
        },
      },
      {
        id: "descend_place",
        label: "Descend to place",
        delayMs: 280,
        command: {
          kind: "move_to",
          pose: { position: target },
          speed: s * 0.7,
        },
      },
      {
        id: "release",
        label: "Release",
        delayMs: 200,
        command: { kind: "set_gripper", gripper: 1 },
      },
      {
        id: "retreat",
        label: "Retreat",
        delayMs: 200,
        command: {
          kind: "move_to",
          pose: { position: approach },
          speed: s,
        },
      },
    ];
  },
};

export const handOverSkill: SkillDefinition = {
  name: "hand_over",
  description: "Present object for human hand-over",
  requiresManipulation: true,
  build(ctx): SkillStep[] {
    const present = pos(ctx, { x: 0.35, y: 0.0, z: 0.55 });
    const s = speed(ctx, 0.4);
    return [
      {
        id: "present",
        label: "Present to human",
        command: {
          kind: "move_to",
          pose: { position: present },
          speed: s,
        },
      },
      {
        id: "open",
        label: "Open gripper for hand-over",
        delayMs: 500,
        command: { kind: "set_gripper", gripper: 1 },
      },
    ];
  },
};

export const goToSkill: SkillDefinition = {
  name: "go_to",
  description: "Navigate base to a goal pose",
  requiresLocomotion: true,
  build(ctx): SkillStep[] {
    const goal = pos(ctx, { x: 1, y: 0, z: 0 });
    return [
      {
        id: "navigate",
        label: `Go to (${goal.x.toFixed(2)}, ${goal.y.toFixed(2)})`,
        command: {
          kind: "navigate",
          goal,
          speed: speed(ctx, 0.45),
        },
      },
    ];
  },
};

export const followMeSkill: SkillDefinition = {
  name: "follow_me",
  description: "Follow human path offset (simplified)",
  requiresLocomotion: true,
  build(ctx): SkillStep[] {
    const base = ctx.robotState.basePose?.position ?? { x: 0, y: 0, z: 0 };
    const goal = pos(ctx, { x: base.x + 1, y: base.y, z: 0 });
    return [
      {
        id: "follow",
        label: "Follow offset",
        command: {
          kind: "navigate",
          goal,
          speed: speed(ctx, 0.35),
        },
      },
    ];
  },
};

export const openDoorSkill: SkillDefinition = {
  name: "open_door",
  description: "Approach and open (abstracted)",
  requiresManipulation: true,
  build(ctx): SkillStep[] {
    const handle = pos(ctx, { x: 0.45, y: 0.0, z: 0.9 });
    const s = speed(ctx, 0.35);
    return [
      {
        id: "approach_handle",
        label: "Approach door handle",
        command: {
          kind: "move_to",
          pose: { position: handle },
          speed: s,
        },
      },
      {
        id: "grasp_handle",
        label: "Grasp handle",
        delayMs: 300,
        command: { kind: "set_gripper", gripper: gripOpen(ctx, 0.85) },
      },
      {
        id: "pull",
        label: "Pull door",
        delayMs: 300,
        command: {
          kind: "move_delta",
          pose: { position: { x: -0.15, y: 0, z: 0 } },
          speed: s * 0.5,
        },
      },
      {
        id: "release_handle",
        label: "Release handle",
        delayMs: 250,
        command: { kind: "set_gripper", gripper: 1 },
      },
    ];
  },
};

export const waitSkill: SkillDefinition = {
  name: "wait",
  description: "Hold position briefly",
  build(ctx): SkillStep[] {
    const ms = Number(ctx.params?.durationMs ?? 400);
    return [
      {
        id: "wait",
        label: `Wait ${ms}ms`,
        delayMs: 0,
        command: { kind: "stop" },
      },
      {
        // noop second step creates duration via delay
        id: "wait_end",
        label: "Wait complete",
        delayMs: Number.isFinite(ms) ? ms : 400,
        command: { kind: "stop" },
      },
    ];
  },
};

export const waveSkill: SkillDefinition = {
  name: "wave",
  description: "Simple wave gesture",
  requiresManipulation: true,
  build(ctx): SkillStep[] {
    const base = ctx.robotState.pose?.position ?? { x: 0.3, y: 0.2, z: 1.0 };
    const up = { ...base, z: base.z + 0.12 };
    const side = { ...base, y: base.y + 0.08, z: base.z + 0.1 };
    const s = speed(ctx, 0.55);
    return [
      {
        id: "raise",
        label: "Raise hand",
        command: { kind: "move_to", pose: { position: up }, speed: s },
      },
      {
        id: "wave1",
        label: "Wave",
        delayMs: 200,
        command: { kind: "move_to", pose: { position: side }, speed: s },
      },
      {
        id: "wave2",
        label: "Wave back",
        delayMs: 200,
        command: { kind: "move_to", pose: { position: up }, speed: s },
      },
      {
        id: "rest",
        label: "Rest",
        delayMs: 200,
        command: { kind: "move_to", pose: { position: base }, speed: s },
      },
    ];
  },
};

export const BUILTIN_SKILLS: SkillDefinition[] = [
  pickObjectSkill,
  placeObjectSkill,
  handOverSkill,
  goToSkill,
  followMeSkill,
  openDoorSkill,
  waitSkill,
  waveSkill,
];
