---
status: active
started: 2026-07-11
target:
---

# Tower Defense PWA

Canvas tower defense ("ICE Breaker" - defend a corp mainframe from malware), shipped as an installable PWA for desktop + mobile. Learning/portfolio project: engine built from scratch in vanilla TypeScript, no game framework.

**Status**: v1, the v1.1 entity sprite pass and v1.2's tower console are all done and live at https://ssvito.github.io/ice-breaker/ - pixel-string sprites via a generator, virtual-resolution renderer, glitch-scatter kills, and a terminal console that reads out towers, enemies and the tower you are about to build. Specs in [Sprite Spec](./Design/Sprite%20Spec.md) and [Tower Panel](./Design/Tower%20Panel.md), build order in [Roadmap](./Roadmap.md).

**Next**: v1.3 - the run. A run is four waves long and cannot pay for the upgrade ladder v1.2 just built, so this milestone gives it a shape: pause and 2x, the simulation lifted out of `main.ts`, a headless balance harness, a ~10-wave curve tuned with it, and a wave preview you can call early for Cycles. Spec in [Run Structure](./Design/Run%20Structure.md), build order in [Roadmap](./Roadmap.md). Nothing built yet.

These notes live in the repo, not in the vault, so a session that changes code updates the docs in the same commit. Don't restate here what git already knows (what is committed, what is deployed) - that is the drift this layout exists to prevent.

## Sub-notes

- [Design](./Design/Design.md) - theme, map layout, architecture, feature specs.
- [Idea Bank](./Idea%20Bank/Idea%20Bank.md) - post-v1 ideas, by category (unprioritized).
- [Log](./Log/Log.md) - dated session history, by month.
- [Roadmap](./Roadmap.md) - direction + build order per milestone (v1 and v1.1 complete, v1.2 open).
- [Repo & Deploy](./Repo%20&%20Deploy.md) - repo, GitHub Pages deploy, portfolio link.
