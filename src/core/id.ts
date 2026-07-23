/** Lightweight unique id (no crypto dependency required for browser/node). */
let counter = 0;

export function createId(prefix = "nb"): string {
  counter = (counter + 1) % 1_000_000;
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t}_${r}_${counter.toString(36)}`;
}
