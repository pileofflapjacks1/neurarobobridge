# FAQ — NeuraRoboBridge and real implants

> **Canonical short version lives in the [README FAQ](../README.md#faq--can-i-connect-my-neuralink).**  
> This page expands the same ideas for contributors and Beach listings.

## The one sentence

**NeuraRoboBridge is computer-side middleware that turns high-level neural *intentions* into safe *robot commands*. It does not connect to a Neuralink implant, and GitHub is not an implant port.**

## Why people get confused

Neuralink-class devices are often described as “control computers and robots with thought.” That is a **system** goal spanning:

1. Implant + surgery + clinical software (vendor)  
2. Decoding neural signals into usable control (vendor / lab)  
3. **Applications and safety layers that consume those intents** (open source, including this suite)  
4. Robots / OS / UI actuators  

Open-source “Neuralink-type apps” live in **layer 3** (and sometimes 4 with simulators). They are **not** layers 1–2 unless the vendor publishes them.

## Can I connect my Neuralink to this repo?

**No.** There is no public third-party API that lets a random GitHub project stream from “your Neuralink” like a consumer device.

What you *can* do:

- Run the [live demo](https://neurarobobridge.vercel.app) (simulator)  
- Develop against simulators and the plugin backend APIs  
- Later: implement a real BCI backend **if** a computer-side intent stream exists  

## Is this affiliated with Neuralink / Tesla / Optimus?

**No.** Computer-side / research / simulation only. Not implant firmware. Not a medical device.

## What should I reply when someone asks on social media?

See the short answer block in the README FAQ, or:

> You can’t plug a real Neuralink into that GitHub project — it’s computer-side middleware for **intentions → safe robot commands**, with simulators today. No public implant API for third-party apps yet. Try the demo: https://neurarobobridge.vercel.app

## Related docs

- [Architecture](./architecture.md)  
- [Adding backends](./adding-backends.md)  
- [Skills, policies, Neurabridge](./skills-policies-neurabridge.md)  
- [Demo guide](./DEMO.md)  
