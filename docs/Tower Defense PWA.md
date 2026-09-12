---
status: active
started: 2026-07-11
target:
---

# Tower Defense PWA

Canvas tower defense ("ICE Breaker" - defend a corp mainframe from malware), shipped as an installable PWA for desktop + mobile. Learning/portfolio project: engine built from scratch in vanilla TypeScript, no game framework.

**Status**: v1 through v1.7 are live at https://ssvito.github.io/ice-breaker/ - pixel-string sprites from a generator, a virtual-resolution renderer with glitch-scatter kills, a terminal console that reads out towers, enemies and the wave that is coming, a fifteen-wave run in two acts with pause, 2x and a next wave you can call early from the spawn port itself, a board that rotates so the phone can be held upright, and a composed soundtrack on a Web Audio desk that survives being installed and offline. Nine enemy kinds, three of them added to ask questions the other six did not. A run now starts and ends in a shell rather than being the only thing the app can be, which is what gives local records - scoped to a hash of the curve that produced them - somewhere to be read, the soundtrack credit a surface to live on, and a waiting build a seam where taking it costs nothing. Specs in [Sprite Spec](./Design/Sprite%20Spec.md), [Tower Panel](./Design/Tower%20Panel.md), [Run Structure](./Design/Run%20Structure.md), [Portrait Layout](./Design/Portrait%20Layout.md) and [Audio](./Design/Audio.md); build order in [Roadmap](./Roadmap.md).

**Next**: a second map, with the map select the shell unblocked - the order the 08-31 session argued and v1.7 did not change. It is the first content this project adds rather than the first system, and it is the second entry that turns a list of one into a list: `runs.ts` already reads one, and the shell already renders names instead of a start button the moment there is more than one to name. Not planned into steps yet. Two other things v1.7 left standing and deliberately did not take: endless, which is what to build if a fixed curve ever makes records feel like nothing, and tier sprites, which block nothing and are the milestone to take when the next one should be art rather than system.

These notes live in the repo, not in the vault, so a session that changes code updates the docs in the same commit. Don't restate here what git already knows (what is committed, what is deployed) - that is the drift this layout exists to prevent.

## Sub-notes

- [Design](./Design/Design.md) - theme, map layout, architecture, feature specs.
- [Idea Bank](./Idea%20Bank/Idea%20Bank.md) - post-v1 ideas, by category (unprioritized).
- [Log](./Log/Log.md) - dated session history, by month.
- [Roadmap](./Roadmap.md) - direction + build order per milestone.
- [Repo & Deploy](./Repo%20&%20Deploy.md) - repo, GitHub Pages deploy, portfolio link.
