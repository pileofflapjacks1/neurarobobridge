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
| Live demo | https://neurarobobridge.vercel.app (also `/demo`) |
| Screenshots | `docs/assets/demo/hero.png`, `docs/assets/demo/architecture.svg` |

## Short description (≤280)

BCI-to-robot middleware for TypeScript: neural intentions → safe robot commands. Simulator arm/humanoid, skill runtime, policy plugins, optional Neurabridge adapter. Computer-side / research only — not implant software.

## Suite role

**Middleware (robot path).** Companion to Neurabridge:

```
NeuraBeach (discover)
    → apps (e.g. NeuraBinder) use Neurabridge for UI intents
    → NeuraRoboBridge turns high-level intents into safe robot actions
    → simulated arm / humanoid today; real backends later
```

| Piece | Relationship |
|-------|----------------|
| **Neurabridge** | Optional upstream for app-level BCI intents (`attachNeurabridge`) |
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

**One-liner for confused users:** *GitHub ≠ Neuralink port. This is computer-side intent→robot middleware with simulators; there is no public implant connect API.* Full FAQ: README → “Can I connect my Neuralink?”

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

`typescript` · `bci` · `middleware` · `robotics` · `simulator` · `safety` · `humanoid` · `neura-suite` · `neurabridge` · `library` · `research_utility`
