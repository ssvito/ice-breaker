---
status: active
started: 2026-07-11
target:
---

# Tower Defense PWA

Canvas tower defense ("ICE Breaker" - defend a corp mainframe from malware), shipped as an installable PWA for desktop + mobile. Learning/portfolio project: engine built from scratch in vanilla TypeScript, no game framework.

**Status**: v1 through v1.5 are live at https://ssvito.github.io/ice-breaker/ - pixel-string sprites from a generator, a virtual-resolution renderer with glitch-scatter kills, a terminal console that reads out towers, enemies and the wave that is coming, a ten-wave run with pause, 2x and an early-call bonus, a board that rotates so the phone can be held upright, and a composed soundtrack on a Web Audio desk that survives being installed and offline. Specs in [Sprite Spec](./Design/Sprite%20Spec.md), [Tower Panel](./Design/Tower%20Panel.md), [Run Structure](./Design/Run%20Structure.md), [Portrait Layout](./Design/Portrait%20Layout.md) and [Audio](./Design/Audio.md); build order in [Roadmap](./Roadmap.md).

**Next**: v1.6 - enemies and pressure. Players say the ten-wave curve is too easy and the harness agrees for reasons that are not the obvious one, worked out in [Difficulty](./Idea%20Bank/Difficulty.md): difficulty has one knob and it is the wrong one, nothing accumulates against the player because the countdown waits for the board to clear, and six enemy kinds only ask two distinct questions. So the run gets **three new kinds that each demand a different answer**, a longer curve with more than one scaling axis, and **overlapping waves** - the countdown starts when a wave finishes spawning, which turns a leak into a debt and finally gives calling early a cost. Plus a way to call the next wave from the board itself. Roster in [Roster](./Design/Roster.md), build order in [Roadmap](./Roadmap.md).

These notes live in the repo, not in the vault, so a session that changes code updates the docs in the same commit. Don't restate here what git already knows (what is committed, what is deployed) - that is the drift this layout exists to prevent.

## Sub-notes

- [Design](./Design/Design.md) - theme, map layout, architecture, feature specs.
- [Idea Bank](./Idea%20Bank/Idea%20Bank.md) - post-v1 ideas, by category (unprioritized).
- [Log](./Log/Log.md) - dated session history, by month.
- [Roadmap](./Roadmap.md) - direction + build order per milestone.
- [Repo & Deploy](./Repo%20&%20Deploy.md) - repo, GitHub Pages deploy, portfolio link.
