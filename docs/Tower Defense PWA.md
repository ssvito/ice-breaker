---
status: active
started: 2026-07-11
target:
---

# Tower Defense PWA

Canvas tower defense ("ICE Breaker" - defend a corp mainframe from malware), shipped as an installable PWA for desktop + mobile. Learning/portfolio project: engine built from scratch in vanilla TypeScript, no game framework.

**Status**: v1 through v1.7 are live at https://ssvito.github.io/ice-breaker/ - pixel-string sprites from a generator, a virtual-resolution renderer with glitch-scatter kills, a terminal console that reads out towers, enemies and the wave that is coming, a fifteen-wave run in two acts with pause, 2x and a next wave you can call early from the spawn port itself, a board that rotates so the phone can be held upright, and a composed soundtrack on a Web Audio desk that survives being installed and offline. Nine enemy kinds, three of them added to ask questions the other six did not. A run now starts and ends in a shell rather than being the only thing the app can be, which is what gives local records - scoped to a hash of the curve that produced them - somewhere to be read, the soundtrack credit a surface to live on, and a waiting build a seam where taking it costs nothing. Specs in [Sprite Spec](./Design/Sprite%20Spec.md), [Tower Panel](./Design/Tower%20Panel.md), [Run Structure](./Design/Run%20Structure.md), [Portrait Layout](./Design/Portrait%20Layout.md) and [Audio](./Design/Audio.md); build order in [Roadmap](./Roadmap.md).

**Next**: v1.8 - the second board, chosen 2026-09-12. The first content this project adds rather than the first system, and the thing v1.7 left a line of data away. It has an axis rather than a new squiggle: **the trace folds back on itself**, with the return leg two rows from the outbound one, so a tower standing between them covers both and the question turns from how many into where. Same 16x9 grid, so the shape carries the difference and the viewport debt stays out of scope. The fold costs trace length, which on a fixed curve is difficulty, so the harness is pointed at the new board as a step rather than trusted to be fine - and the record key finally takes `RunDescriptor.id`, without which two boards would share one "fastest". Build order in [Roadmap](./Roadmap.md).

These notes live in the repo, not in the vault, so a session that changes code updates the docs in the same commit. Don't restate here what git already knows (what is committed, what is deployed) - that is the drift this layout exists to prevent.

## Sub-notes

- [Design](./Design/Design.md) - theme, map layout, architecture, feature specs.
- [Idea Bank](./Idea%20Bank/Idea%20Bank.md) - post-v1 ideas, by category (unprioritized).
- [Log](./Log/Log.md) - dated session history, by month.
- [Roadmap](./Roadmap.md) - direction + build order per milestone.
- [Repo & Deploy](./Repo%20&%20Deploy.md) - repo, GitHub Pages deploy, portfolio link.
