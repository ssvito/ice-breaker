# Map Layout

Part of [Design](./Design.md).

## v1 map

Landscape-only, 16x9 grid. Free tower placement on any off-path tile (no fixed slots) - simpler than a maze-TD despite free placement, since the path is fixed and towers never need to block/reroute enemies, only mark their own tile unbuildable.

Single serpentine PCB trace, 4 turns, spawn at left edge, core (mainframe) at right edge:

```
. . . . . . . . . . . . . . . .
. . . . . . . . . . . . . . . .
S P P P P . . . . . . . . . . .
. . . . P . . . . . . . . . . .
. . . . P P P P P P . . . . . .
. . . . . . . . . . P . . . . .
. . . . . . . . . . P P P P P C
. . . . . . . . . . . . . . . .
. . . . . . . . . . . . . . . .
```

Data model: store levels as a **waypoint list** only (corner coords: `(0,2)→(4,2)→(4,4)→(9,4)→(9,6)→(15,6)`), not a full tile list. Enemies lerp along the resulting polyline; buildable tiles = grid minus the rasterized path. Keeps level files small and hand-writable, so adding map 2+ later is cheap.
