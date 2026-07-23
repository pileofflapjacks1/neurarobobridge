# Demo guide — NeuraRoboBridge

Library-only package (no hosted Vercel demo). Use these paths for screenshots, reviews, and NeuraBeach listings.

## 1. Skill runtime + policies (recommended)

```bash
git clone https://github.com/pileofflapjacks1/neurarobobridge
cd neurarobobridge
npm install && npm run build
npm run example:skills
```

You should see:

1. Keep-out policy **reject** a bad Cartesian goal  
2. `pick_object` skill steps: approach → descend → grasp → lift  
3. Mid-skill **modulate**  
4. NeuralBridge-style map → `home`  

## 2. Pick-and-place scenario

```bash
npm run example:basic
```

Simulator BCI plays `pick-place`; safety gates low confidence; arm returns home.

## 3. Safety stress

```bash
npm run example:safety
```

Control-disabled, low confidence, workspace clamp, rate limit, e-stop latch.

## 4. Browser canvas (local)

```bash
npm run build
npx --yes serve .
# open http://localhost:3000/examples/browser/
```

Connect → Enable control → arrow buttons / WASD → E-STOP.

## 5. Unit suite (CI-style)

```bash
npm test
# 52 tests (skills, policies, adapter, safety, arm, bridge)
```

## Listing assets

| File | Use |
|------|-----|
| [`docs/assets/demo/architecture.svg`](./assets/demo/architecture.svg) | Architecture diagram (exact labels) |
| [`docs/assets/demo/hero.png`](./assets/demo/hero.png) | Storefront hero / OG-style image |
| [`docs/assets/demo/terminal-skills.txt`](./assets/demo/terminal-skills.txt) | Captured CLI output from `example:skills` |

## Honesty checklist for demos

- Show **simulator** backends only unless a real adapter exists  
- Do **not** claim Neuralink implant control or Optimus API access  
- Label e-stop / enableControl as required safety UX  
