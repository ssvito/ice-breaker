---
status: active
started: 2026-07-11
target:
---

# Tower Defense PWA

Canvas tower defense ("ICE Breaker" - defend a corp mainframe from malware), shipped as an installable PWA for desktop + mobile. Learning/portfolio project: engine built from scratch in vanilla TypeScript, no game framework.

**Status**: v1, the v1.1 entity sprite pass and v1.2's tower console are all done and live at https://ssvito.github.io/ice-breaker/ - pixel-string sprites via a generator, virtual-resolution renderer, glitch-scatter kills, and a terminal console that reads out towers, enemies and the tower you are about to build. Specs in [Sprite Spec](./Design/Sprite%20Spec.md) and [Tower Panel](./Design/Tower%20Panel.md), build order in [Roadmap](./Roadmap.md).

**Next**: v1.4 - portrait. The game is 16x9 and has only ever been held that way; upright it runs at a quarter of the board's area with 21px tiles, and the console is pinned to the bottom of the window rather than to the board. So the board **rotates 90 degrees** instead of shrinking, which gets the full landscape size back on an upright phone - and eats the empty band the chrome was going to move into, which is why the console and the build menu both become drawers that collapse into an 81px strip. Plus the manifest orientation unlock, fullscreen, and a screen orientation lock. Spec in [Portrait Layout](./Design/Portrait%20Layout.md), build order in [Roadmap](./Roadmap.md). v1.3's verify step closes first.

These notes live in the repo, not in the vault, so a session that changes code updates the docs in the same commit. Don't restate here what git already knows (what is committed, what is deployed) - that is the drift this layout exists to prevent.

## Sub-notes

- [Design](./Design/Design.md) - theme, map layout, architecture, feature specs.
- [Idea Bank](./Idea%20Bank/Idea%20Bank.md) - post-v1 ideas, by category (unprioritized).
- [Log](./Log/Log.md) - dated session history, by month.
- [Roadmap](./Roadmap.md) - direction + build order per milestone.
- [Repo & Deploy](./Repo%20&%20Deploy.md) - repo, GitHub Pages deploy, portfolio link.
