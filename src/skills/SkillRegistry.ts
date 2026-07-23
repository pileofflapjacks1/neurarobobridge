import type { SkillDefinition } from "./types.js";
import type { TaskName } from "../types/task.js";
import { BUILTIN_SKILLS } from "./builtinSkills.js";

const registry = new Map<string, SkillDefinition>();

export function registerSkill(skill: SkillDefinition): void {
  registry.set(skill.name, skill);
}

export function unregisterSkill(name: TaskName | string): boolean {
  return registry.delete(name);
}

export function getSkill(name: TaskName | string): SkillDefinition | undefined {
  return registry.get(name);
}

export function listSkills(): SkillDefinition[] {
  return [...registry.values()];
}

export function registerBuiltinSkills(): void {
  for (const s of BUILTIN_SKILLS) {
    if (!registry.has(s.name)) registerSkill(s);
  }
}

/** Reset registry (tests). */
export function clearSkills(): void {
  registry.clear();
}
