# Theme

Part of [Design](./Design.md).

## "ICE Breaker"

Player defends a corp mainframe from intrusion. Path = PCB circuit-board trace (right-angle segments on a grid). Towers = security software, enemies = malware. Chosen over two alternatives (Rogue AI: player-as-intrusion with a traceback-meter escalation mechanic; Neon Ward: conventional street-level TD with a cyberpunk paint job) for tightest theme-mechanic coherence and simplest path geometry to implement.

- **Currency**: Cycles.
- **Towers**: Firewall Node (basic single-target), IDS Scanner (off-path area-slow aura, 50% speed, wide range; also reveals stealth), Honeypot (on-path-only chokepoint aura, 30% speed, tight range - redesigned from the original "taunt/reroute" concept, which the fixed-path engine can't support: no pathfinding to reroute, and enemies don't attack anything to be taunted from), AES Turret (high damage, slow fire, expensive). "Reveals stealth" dropped from IDS Scanner since no stealth enemies exist. Overclock = player-triggered ability, not a tower: boosts a tower's fire rate for N seconds then it overheats and goes offline briefly.
- **Enemies**: Worm (fast/weak swarm unit), Trojan (armored/slow tank), Packet Sniffer (very fast, very low HP, large groups), Ransomware (splits into two weaker Encryptors on death), Beacon (keeps its own pace - the slow auras do nothing to it), Packer (a payload in a shell: flat damage off every hit, so small shots do nothing), Rootkit (untargetable unless an IDS Scanner is covering it), Zero-Day (boss, high HP, immune to one tower type's effect). What each one asks of the player, and which tower answers it, is [Roster](./Roster.md).
- **Visual identity**: near-black background; cyan = inactive circuit traces, green/amber = active/powered traces, magenta = damage/glitch effects (4-5 colors total, kept strict). Kill effect = glitch/pixel-scatter burst rather than explosion.
- **DOM chrome** (toolbar + console, 2026-08-23): green-on-black terminal, reusing the powered-trace green rather than introducing a UI palette of its own - the readout is the mainframe reporting, so it glows in the same color as a live trace. See [Tower Panel](./Tower%20Panel.md).
