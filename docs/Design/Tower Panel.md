# Tower Panel

Part of [Design](./Design.md). Spec for tower interaction - chosen as the v1.2 milestone 2026-08-23; build order in [Roadmap](../Roadmap.md). Drafted 2026-08-23.

The problem: a placed tower is currently a dead object. You can build it and you can aim Overclock at it, and that is all. There is no way to see what it does, improve it, or undo the placement, and the one interaction that exists ("press Q to arm, then click a tower") is a keyboard-first flow bolted onto a game that is supposed to be playable on a phone.

The fix is one selection model that everything else hangs off, which is why [Idea Bank](../Idea%20Bank/Idea%20Bank.md) already called the panel the foundation under upgrades, sell, and touch-friendly Overclock.

## Selection model

Tap a placed tower to select it; tap anywhere else, or press Escape, to deselect. No mode to arm first, no long-press.

This does not collide with placement because the two targets are disjoint by construction: `isPlaceable` already rejects any tile in `occupied`, so a tile either holds a tower (selects) or can take one (places). The `pointerdown` handler in `main.ts` gets one branch ahead of the placement branch, and the `overclockArmed` branch disappears.

A selected tower draws a selection ring plus its range circle in the world canvas, reusing the circle already drawn by `drawPlacementPreview`. That range circle is the honest answer to the "what does this thing cover" question, and it is the same affordance the player already learned while placing.

## Panel

DOM, not canvas - same reasoning as the toolbar in v1: real buttons get native touch handling, focus, and disabled states for free, and hand-rolled canvas hit-testing bought nothing.

**Anchoring reversed 2026-08-23.** The panel first sat in the top-right corner, opposite the toolbar, on the theory that the two should never fight for the same edge. Wrong instinct: they are one control surface, and splitting them across opposite corners made the player's eyes cross the whole board to go from "which tower" to "what does it do". They now stack in one bottom-centered dock, panel above toolbar, sharing a single width and one safe-area rule. The dock itself is `pointer-events: none` so the gap between the two does not eat taps meant for the board.

The cost of the move is real and should be watched: the dock is now taller and covers more of the bottom-center of the board, which is why the panel collapses.

## Console styling (2026-08-23)

The panel is a green-on-black terminal: dot leaders between label and value, a scanline overlay, a blinking cursor after the tower name, `[-]`/`[+]` to collapse.

This is theme, not decoration. [Theme](./Theme.md) already assigns green to *powered/active* traces, so a green console reads as the mainframe reporting its own state, next to the cyan board it is reporting on. No new colors were introduced: green `#39ff88` for live values, amber `#ffe27d` for the next tier (the upgrade preview is a thing being powered up), magenta `#ff2fd1` for "cannot afford", all already in the palette.

Font stays the system monospace stack. A real terminal face would be a downloaded font, and this is an offline-first PWA - one webfont would be the only asset in the project that can fail to load.

The whole header bar is the collapse button rather than a small `[-]` in the corner, so the one control that is not a 44px target does not become the one thing on screen needing a precise tap. Collapsed state is per-session and in memory: it survives a restart within the session but not a reload. Persisting it means starting the localStorage story that [Idea Bank](../Idea%20Bank/Idea%20Bank.md) files under Meta / persistence, and that is a milestone, not a side effect of a style pass.

Contents:

- Tower name and tier (`FIREWALL NODE - TIER 2`).
- Current stats, and for an upgradeable tower the next tier's values alongside them, so the price has something to argue against.
- `UPGRADE` with its cost, disabled when short on Cycles or at max tier.
- `SELL` with the refund it pays.
- `OC` for attack towers, disabled while boosted or overheated. Aura towers have no Overclock, so the button is absent rather than disabled.

## Build mode (added 2026-08-23, after the panel existed)

The panel started as a readout for a tower you already own. Seeing it work made the gap obvious: the four towers are opaque until you have spent 20 to 45 Cycles finding out what one does, and the stats existed the whole time - they were just being withheld until after the purchase.

So the panel has two modes and is on screen whenever the game is playing. With a tower selected it shows that tower. Otherwise it shows the kind currently armed in the toolbar: name, cost, stats, and the placement rule.

The placement rule appears only in build mode, and only on the tower where it is an exception. Three of the four towers go off-path, so printing `OFF PATH` on all of them was noise burying the one line worth reading: Honeypot is on-path only, otherwise discoverable just by trying to place it somewhere sensible and getting a red tile with no explanation.

One consequence worth stating because it looks like a regression: toolbar buttons no longer go `disabled` when Cycles are short. A disabled button swallows its own click, which would mean the one tower you cannot afford is the one whose stats you cannot read - exactly backwards, since that is the tower you are saving for. They grey out through a class instead, and `isPlaceable` still refuses the placement.

## Inspecting enemies (2026-08-23)

The console reads three things now: a selected tower, a selected **enemy**, or - with nothing selected - the tower about to be built. Tapping an enemy shows its name, live HP in the header, speed, bounty, and whichever of its two special rules applies (`IMMUNE AES TURRET` on the Zero-Day, `SPLITS 2x ENCRYPTOR` on Ransomware).

Both of those rules were previously invisible. A player watching AES Turrets retarget away from the boss had no way to learn why, and a Ransomware doubling on death just looked like a bug.

Selection became one union - a tower or an enemy, never both - rather than two variables that could disagree. A selected enemy is cleared when it leaves play; kill and core-breach both set `removed`, so one check covers both.

**Tap order: tower, then build, then enemy, then clear.** Building deliberately outranks inspecting. The Zero-Day sprite is 40px in a 32px trace and overhangs onto buildable tiles, so resolving enemies first would mean losing a placement because a boss walked past. Enemies stay tappable everywhere they actually are, which is over the trace, where nothing is placeable.

Hit-testing needed a continuous world coordinate, so `clientToGrid` was split: `clientToWorld` returns the fractional position and `clientToGrid` floors it. The hit radius is the sprite's larger half-side, floored at a third of a tile - a Packet Sniffer is 10x6 virtual pixels and would otherwise be a target no thumb can hit.

## Tiers

Three tiers per tower: the placed tower is tier 1, two upgrades above it. Two is enough to teach the decision (go wide with more towers, or go tall on the ones already covering the choke) without turning balance into a spreadsheet.

Data-driven, extending the existing per-kind stats table in `tower.ts` rather than adding a parallel system - the same shape that already carries enemy splits and boss immunity. `TOWER_STATS` becomes a per-kind array of tier stats; `towerStats(kind)` becomes `towerStats(kind, tier)`, and the `Tower` entity gains `tier` and `invested`.

What a tier buys, per archetype:

- Attack towers (Firewall Node, AES Turret): damage and fire rate, with a smaller range bump. Damage is the stat the player can see working.
- Aura towers (IDS Scanner, Honeypot): slow strength and radius. Honeypot's radius stays tight on purpose - it is a chokepoint, and growing it into a second IDS Scanner would erase the distinction the two towers were designed around.

Upgrade cost climbs faster than the effect so late tiers stay a real choice.

## Sell

Refunds a fraction of everything invested in the tower, placement plus upgrades, tracked on the entity as `invested` rather than recomputed from the tier table (recomputing would quietly break the moment a cost is rebalanced).

A partial refund, not a full one: full refunds make repositioning free and delete the cost of a bad placement, which is the decision the game is made of. A too-small refund makes selling a trap. Start at 60% and let the wave-design pass argue with the number.

Selling frees the tile (`occupied.delete`) and clears the selection.

## Overclock migration

Overclock moves into the panel and stops being a mode. The toolbar's `OC` button and the `overclockArmed` flag both go; `Q` stays as a shortcut that fires on the currently selected tower, since it costs nothing to keep and desktop players will have learned it.

This is the actual mobile fix. "Arm, then aim" was two taps with an invisible state in between, and nothing on screen said the game was waiting for a target.

## Deliberately not in scope

- **Tier art.** [Sprite Spec](./Sprite%20Spec.md) has no tier variants and inventing three sprites per tower would swallow the milestone. Tiers read procedurally for now (pips on the tower, or an outline that brightens), and graduate to real sprites only if the procedural tell looks cheap in play.
- **Rebalancing the four waves.** Upgrades change the economy's shape, so the numbers will be wrong afterwards. That is the wave-design pass's job, not this one.
