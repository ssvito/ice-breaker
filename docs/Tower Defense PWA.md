---
status: active
started: 2026-07-11
target:
---

# Tower Defense PWA

Canvas tower defense ("ICE Breaker" - defend a corp mainframe from malware), shipped as an installable PWA for desktop + mobile. Learning/portfolio project: engine built from scratch in vanilla TypeScript, no game framework.

**Status**: v1 and the v1.1 entity sprite pass are both done and live at https://ssvito.github.io/ice-breaker/ - pixel-string sprites via a generator, virtual-resolution renderer, glitch-scatter kills. Spec in [Sprite Spec](./Design/Sprite%20Spec.md), build order in [Roadmap](./Roadmap.md).

**Next**: v1.2 - tower selection panel, upgrade tiers, sell, and Overclock without a mode. Spec in [Tower Panel](./Design/Tower%20Panel.md), build order in [Roadmap](./Roadmap.md). Five of six steps are built; the sixth is verification, and it is **blocked on a human**: a full playthrough plus the multi-size/DPR and physical-device QA carried over from v1.1. Nothing in v1.2 has been seen running yet - only `tsc` and `vite build`.

These notes live in the repo, not in the vault, so a session that changes code updates the docs in the same commit. Don't restate here what git already knows (what is committed, what is deployed) - that is the drift this layout exists to prevent.

## Sub-notes

- [Design](./Design/Design.md) - theme, map layout, architecture, feature specs.
- [Idea Bank](./Idea%20Bank/Idea%20Bank.md) - post-v1 ideas, by category (unprioritized).
- [Log](./Log/Log.md) - dated session history, by month.
- [Roadmap](./Roadmap.md) - direction + build order per milestone (v1 and v1.1 complete, v1.2 open).
- [Repo & Deploy](./Repo%20&%20Deploy.md) - repo, GitHub Pages deploy, portfolio link.
