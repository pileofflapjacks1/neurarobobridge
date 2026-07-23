# NeuraBeach listing copy

Use this when uploading or seeding **NeuraRoboBridge** on [NeuraBeach](https://neurabeach.vercel.app).

## Basics

| Field | Value |
|-------|--------|
| Title | NeuraRoboBridge |
| Version | 0.3.0 |
| Category | Research Utility |
| License | MIT |
| Language | TypeScript |
| GitHub | https://github.com/pileofflapjacks1/neurarobobridge |
| Manifest | `neurabeach-manifest.json` (v1.0.0) |
| Live demo | *None* — TypeScript library only (like NeuralBridge) |
| Screenshots | `docs/assets/demo/hero.png`, `docs/assets/demo/architecture.svg` |

## Short description (≤280)

BCI-to-robot middleware for TypeScript: neural intentions → safe robot commands. Simulator arm/humanoid, skill runtime, policy plugins, optional NeuralBridge adapter. Computer-side / research only — not implant software.

## Suite role

**Middleware (robot path).** Companion to NeuralBridge:

```
NeuraBeach (discover)
    → apps (e.g. NeuraBinder) use NeuralBridge for UI intents
    → NeuraRoboBridge turns high-level intents into safe robot actions
    → simulated arm / humanoid today; real backends later
```

| Piece | Relationship |
|-------|----------------|
| **NeuralBridge** | Optional upstream for app-level BCI intents (`attachNeuralBridge`) |
| **NeuraBinder** | Product demo for UI intents — not a robot controller |
| **Intent → OS** | OS pointer adapter — parallel path, not a dependency |
| **NeuraRoboBridge** | Robot safety + skills + simulators |

## Safety gate (required on upload)

- [x] Computer-side / simulation / research only  
- [x] Not implant firmware  
- [x] Not a medical device / SaMD  
- [x] Not affiliated with Neuralink, Tesla, or Optimus  
- [x] No real high-bandwidth implant or commercial humanoid API claimed  
- [x] `banned_claims: true` in manifest  

## Entrypoint (install)

```bash
git clone https://github.com/pileofflapjacks1/neurarobobridge
cd neurarobobridge
npm install && npm run build && npm test
npm run example:skills    # skill runtime + policies
npm run example:basic     # pick-place scenario
```

Browser canvas demo (after build): serve repo root and open `examples/browser/index.html`.

## Tags

`typescript` · `bci` · `middleware` · `robotics` · `simulator` · `safety` · `humanoid` · `neura-suite` · `neuralbridge` · `library` · `research_utility`
