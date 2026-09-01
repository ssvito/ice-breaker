---
status: active
started: 2026-07-11
target:
---

# Tower Defense PWA

Canvas tower defense ("ICE Breaker" - defend a corp mainframe from malware), shipped as an installable PWA for desktop + mobile. Learning/portfolio project: engine built from scratch in vanilla TypeScript, no game framework.

**Status**: v1 through v1.6 are live at https://ssvito.github.io/ice-breaker/ - pixel-string sprites from a generator, a virtual-resolution renderer with glitch-scatter kills, a terminal console that reads out towers, enemies and the wave that is coming, a fifteen-wave run in two acts with pause, 2x and a next wave you can call early from the spawn port itself, a board that rotates so the phone can be held upright, and a composed soundtrack on a Web Audio desk that survives being installed and offline. Nine enemy kinds, three of them added to ask questions the other six did not. Specs in [Sprite Spec](./Design/Sprite%20Spec.md), [Tower Panel](./Design/Tower%20Panel.md), [Run Structure](./Design/Run%20Structure.md), [Portrait Layout](./Design/Portrait%20Layout.md) and [Audio](./Design/Audio.md); build order in [Roadmap](./Roadmap.md).

**Next**: v1.7 - the shell, the screen that comes before a run. Chosen 2026-08-31 on the player's call that it is critical, and the argument in [Before the Run](./Idea%20Bank/Before%20the%20Run.md) is that it is not a feature at all: the game boots straight into a run and has no moment that is *not* one, and that single fact is what five filed items are stuck behind - endless, difficulty modes, local records, the update prompt, and a second map, none of which has anywhere to be chosen or read. So the milestone builds the before and nothing else, as a state rather than a splash, with a start button rather than a menu of one. It is also where the soundtrack credit finally has a surface to live on. Build order in [Roadmap](./Roadmap.md).

These notes live in the repo, not in the vault, so a session that changes code updates the docs in the same commit. Don't restate here what git already knows (what is committed, what is deployed) - that is the drift this layout exists to prevent.

## Sub-notes

- [Design](./Design/Design.md) - theme, map layout, architecture, feature specs.
- [Idea Bank](./Idea%20Bank/Idea%20Bank.md) - post-v1 ideas, by category (unprioritized).
- [Log](./Log/Log.md) - dated session history, by month.
- [Roadmap](./Roadmap.md) - direction + build order per milestone.
- [Repo & Deploy](./Repo%20&%20Deploy.md) - repo, GitHub Pages deploy, portfolio link.
