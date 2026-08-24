# ICE Breaker

Canvas tower defense PWA in vanilla TypeScript, no game framework - a deliberate learning/portfolio choice (game loop, spatial logic, entity management built from scratch rather than abstracted away).

## Docs

Design, roadmap, and session history live in `docs/`. Start at `docs/Tower Defense PWA.md`, which links to everything else: design notes (theme, map layout, architecture, sprite spec), the roadmap, the idea bank of post-v1 ideas, and the dated log.

These notes are read and edited in an Obsidian vault through a directory junction, which is why the filenames have spaces and read like notes rather than like docs. Keep that style; use relative markdown links (never `[[wikilinks]]`, which don't render on GitHub).

## Working rule: log in the same commit

**A session that changes code updates `docs/` in the same commit.** Append a dated line to the current month's note in `docs/Log/`, and tick the matching `docs/Roadmap.md` item. Record deviations from the plan and their reasons, not just what shipped - the log is the point of the project, not bookkeeping.

Don't restate in prose what git already knows (what is committed, what is deployed). The notes drifted from reality once already by doing exactly that.

## Sprites

`src/sprite-data.ts` is AUTO-GENERATED - don't hand-edit it. Sprites are drawn from primitives in `scripts/gen-sprites.mjs`; run `node scripts/gen-sprites.mjs` to regenerate, `--preview` to print ASCII. The dev gallery at `?gallery` shows every sprite and frame at 8x.

## Commands

`npm run dev` (Vite dev server), `npm run build` (`tsc && vite build`), `npm run preview`. Pushing to `main` deploys to GitHub Pages via Actions.

`npm test` runs the headless simulation tests on Node's own runner (no framework). `npm run balance` runs the wave curve headless against the declared tower layouts and prints leaks, core HP and Cycles wave by wave - the tuning instrument for the curve; `npm run balance -- --help` lists the layouts.
