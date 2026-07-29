# AGENTS.md — NeuraRoboBridge

You are working on **NeuraRoboBridge only** unless the user asks to edit another suite repo.

## Product

TypeScript **BCI → robot** middleware: high-level neural intentions → **safe** robot commands (sim arm / humanoid today; real backends later via plugins).

- **Suite role:** `middleware` (robot path) — companion to Neurabridge, not a UI app
- Computer-side / research / simulation only
- **Not** implant software · **not** medical · **not** affiliated with Neuralink / Tesla / Optimus

## Safety (non-negotiable)

- Default under uncertainty: **do not move**
- Explicit control enable, e-stop, watchdog, confirm for high-risk tasks
- Simulator-first; do not invent real Optimus/Neuralink vendor protocols
- `banned_claims: true` in `neurabeach-manifest.json` — keep it

## Boundaries

- Do **not** fold Binder/Shell UI into this package or claim implant connectivity from GitHub.
- Neurabridge is an **optional** upstream adapter for app-level intents — keep coupling soft.
- On version / demo / description change: update `LISTING.md` + `neurabeach-manifest.json`.

## Layout

```
src/
  bci/ robot/ safety/ policy/ skills/ scenarios/
  adapters/ core/ types/ recording/
demo/                   Vite live demo
examples/
tests/
docs/
LISTING.md
neurabeach-manifest.json
```

## Commands

```bash
npm install
npm run build
npm test
npm run test:scenarios
npm run typecheck
npm run demo            # local demo UI
npm run build:demo
```

## Commits

Author: Joe \<pileofflapjacks1@gmail.com\>  
Repo: https://github.com/pileofflapjacks1/neurarobobridge  
Demo: https://neurarobobridge.vercel.app
