# Roster

Part of [Design](./Design.md). What each enemy kind asks the player, and which tower answers it.

**This note does not hold stat blocks.** HP, speed, bounty and breach cost live in `ENEMY_STATS` and `TOWER_DEFS`, with the reasoning in the docblock next to the numbers, and the v1.6 retune is going to move most of them. A page that restates those numbers is a page that is wrong one milestone from now - the drift [Tower Defense PWA](../Tower%20Defense%20PWA.md) already warns about, in its second-most-tempting form. What lives here is the part that does not change when a number does: the question a kind poses, and what counts as an answer.

## The rule

**Every kind must ask a question no other kind asks.** A kind that is another kind with different numbers is content, not design: it lengthens the run without widening it, and the player answers it with what they already built.

The curve enforces a companion rule that this one depends on - every kind gets a wave to itself before it appears in a mix ([Run Structure](./Run%20Structure.md), gated by `tests/wave.test.ts`). Teaching a question under load teaches nothing, and a kind whose question is never taught is a kind the player experiences as an unfair number.

## The six today, and the four that are one question

[Difficulty](../Idea%20Bank/Difficulty.md) put it in one line: only two of the six ask for a different answer rather than more of the same one. Spelled out:

| Kind | Question | Answer |
| --- | --- | --- |
| **WORM** | none - it is the baseline the others are read against | anything |
| **TROJAN** | can you put enough damage on one target before it crosses? | damage per shot, or slow to buy time |
| **PACKET SNIFFER** | can you cover the trace at all? | fire rate and coverage; chip damage is fine |
| **ENCRYPTOR** | none of its own - it exists as what a Ransomware leaves behind | whatever killed the parent, again, twice |
| **RANSOMWARE** | can you kill it early enough that the split does not reach the core? | kill position, not kill speed |
| **ZERO-DAY** | did you answer everything with one weapon? | anything that is not an AES Turret |

Four rows with no question of their own. That is the hole this milestone is filling, and it is worth being precise about what "filling" means: the four are not mistakes and are not being replaced. WORM and PACKET SNIFFER are the curve's vocabulary - a wave is written out of them - and a game where every kind is a special rule is a game with no baseline for the special rules to be special against.

## The four answers

Towers as the questions they answer, with the numbers that matter to the argument below (tier 1 to tier 3):

- **FIREWALL NODE** - off-path, 1.67 to 6.25 damage per second, cheap. The volume answer: many small hits.
- **AES TURRET** - off-path, 2.67 to 8.46 damage per second, slow and heavy. The single-target answer, and the one the Zero-Day ignores.
- **IDS SCANNER** - off-path, wide, slows to 50% down to 30%. Buys time for whatever is shooting, and after this milestone it also **reveals**.
- **HONEYPOT** - on-path, tight, slows to 30% down to 15%. A chokepoint, deliberately narrow: a wide Honeypot is just an IDS Scanner ([Tower Panel](./Tower%20Panel.md)).

Two of the four deal no damage at all, which is why every new kind below is really a question about the same thing: what happens when the thing you built to buy time stops working.

## The three arriving in v1.6

Names are proposals and the [Theme](./Theme.md) note owns them.

### BEACON - the one the auras cannot touch

**Asks**: does your defense work when it cannot slow anything down? Punishes the IDS/Honeypot build the way the Zero-Day punishes the all-turret build - the whole point of adding it, since the aura build is currently unpunished by anything in ten waves.

**Trait**: fixed movement. Not "immune to slow" as a list of effects it resists, which is the important distinction and the reason this is the cheapest of the three to build. Slow is produced in `stepGame`, where a nested pass over aura towers and enemies collects a `slowFactor` per enemy; it is *consumed* in one place, `stepEnemy`'s `speedMultiplier`. **The trait belongs where speed is consumed, not where each slow is produced**: one check instead of a check inside a nested loop, and any future source of slow is covered the day it is written rather than the day someone remembers to add it to a list.

**A trap this creates, and the reason it is written down here rather than discovered later**: v1.6 also adds a wave-level speed axis. If that axis is implemented as a per-tick multiplier it will pass through the same parameter a BEACON is defined to ignore, and the kind will silently opt out of the difficulty curve. So the wave's speed axis is applied **at birth, in `createEnemy`, exactly like `hpScale`** - it sets what the enemy *is*, while `speedMultiplier` is what is being *done to it*. Fixed movement then means precisely "nothing done to it changes its speed", which is a rule that can be stated in one sentence and holds for anything added later, haste included.

### PACKER - the one that makes small hits worthless

**Asks**: is your damage in the right shape? Not "do you have enough damage" - `hpScale` already asks that, and [Difficulty](../Idea%20Bank/Difficulty.md) is the note explaining why asking it harder does not work, since damage per tier climbs faster than the multiplier does.

**Trait**: flat reduction per hit, applied where a projectile lands. One point, and one point is enough, because the gradient it produces is the design:

| | no armor | armor 1 | change |
| --- | --- | --- | --- |
| Firewall Node T1 | 1.67 dps | **0** | erased |
| Firewall Node T2 | 3.70 dps | 1.85 | -50% |
| Firewall Node T3 | 6.25 dps | 4.17 | -33% |
| AES Turret T1 | 2.67 dps | 2.00 | -25% |
| AES Turret T3 | 8.46 dps | 7.69 | -9% |

**The floor is zero, not one.** A minimum of one damage would keep every board working and turn armor into a tax; at zero, a tier-1 Firewall board is not slowed against a PACKER, it is *useless* against it, and that is a question rather than a number. And the answer is deliberately not a single tower: upgrading a Firewall Node to tier 2 answers it as well as buying an AES Turret does. That matters more than it looks - it prices the tier ladder in the late run, which is the exact place [Difficulty](../Idea%20Bank/Difficulty.md) says the player stops choosing and starts watching.

### ROOTKIT - the one the towers cannot see

**Asks**: did you buy detection, and did you put it where your damage is? The only one of the three whose answer is a specific tower.

**Trait**: cannot be targeted unless revealed. **Revealed only inside an IDS Scanner's radius**, which resurrects the ability that was cut on 2026-07-12 for the reason recorded then - there were no stealth enemies, so the ability had nothing to do. The dependency is deliberate and runs both ways: the kind justifies the ability, and the ability is what stops the kind from being a wall.

Four decisions, so the implementation does not have to make them:

- **The IDS Scanner reveals; the Honeypot does not.** Both are slow auras, and giving reveal to both erases the one difference between them. Detection is what the letters in IDS stand for, and the Honeypot's identity is a tight on-path chokepoint.
- **Reveal does not persist outside the radius.** A reveal that sticks makes one Scanner anywhere solve stealth for the rest of the run, which converts a placement decision into a purchase decision - and placement is the decision this game is made of.
- **Reveal rides the pass that already exists.** The aura loop in `stepGame` already visits every aura-tower and enemy pair to build `slowFactor`; the revealed set is built in the same pass, and `findTarget` skips an unrevealed ROOTKIT. No new traversal.
- **The player can see it; the towers cannot.** Drawn ghosted rather than absent, and solid once revealed. An enemy that is genuinely invisible is not a question, it is a surprise bill - and the console can still be tapped on it, because selection is the player's eye and has never been the towers'.

## The wall problem

Two of the three can reach the core untouched by a board that did not prepare: a PACKER against tier-1 Firewalls, a ROOTKIT against anything without an IDS Scanner. That is a hard counter, and hard counters are in-genre here - the Zero-Day already is one - but the Zero-Day's immunity is to one of four towers, while these two demand a specific answer. Three things keep that from being unfair, and all three are already in the project rather than being invented for this:

1. **The introduction rule.** Each arrives alone, in its own wave, where the only thing on the board is the thing being taught.
2. **The wave preview.** The console reads out the composition of what is coming, during a countdown the early-call bonus makes it worth spending. A hard counter announced a wave in advance is a decision; the same counter unannounced is the surprise bill above.
3. **Introduction late enough to be affordable.** A ROOTKIT wave before the run can afford 30 Cycles of Scanner is not a question. The floor is a purchase, so the curve owes each kind a wave where its answer is already buyable, which is a constraint on the retune step and not a wish.

The one thing none of that covers is a player who reads the preview and cannot afford the answer *because they already spent it*. That is a real losing state and it is the correct one: it is the run's first decision that can be lost several waves before it is paid for, which is the kind of decision the run currently does not have.

## What this note owes

The kinds above have no sprites, and the sprite is the part that makes a question legible before it is explained - a PACKER has to *look* armored or the player learns the rule by losing to it. Sizes and ratios are [Sprite Spec](./Sprite%20Spec.md)'s, authored in `scripts/gen-sprites.mjs`.
