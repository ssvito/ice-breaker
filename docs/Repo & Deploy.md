# Repo & Deploy

Part of [Tower Defense PWA](./Tower%20Defense%20PWA.md).

`C:\vito\ice-breaker` (git initialized, `main` branch), pushed to `github.com/ssvito/ice-breaker` (public). Deployed standalone via its own GitHub Actions workflow to GitHub Pages (deliberately decoupled from `ssvito.github.io` rather than folded into that repo's `public/`) - live at **https://ssvito.github.io/ice-breaker/**. `vite.config.ts` sets `base: '/ice-breaker/'` for the subpath; `index.html` uses `%BASE_URL%` for icon links so they resolve correctly under that base.

Linked from the portfolio site (`ssvito.github.io`, planned in the vault's own Portfolio Website note) as its first real project card.

## Docs live here, vault holds a junction (2026-08-20, junction created 2026-08-23)

These notes used to live in the Obsidian vault at `C:\vito\secondbrain\01-Projects\Tower Defense PWA\`. They were moved into this repo's `docs/` because the log could never be part of the commit it described, so the notes drifted from the code (the v1.1 sprite pass shipped and deployed while the hub still said "not yet committed").

Now: **`docs/` is the only copy.** The vault path above is a Windows directory junction pointing at it, so Obsidian still sees the project in its graph and `[[Tower Defense PWA]]` still resolves from other vault notes. Consequences worth remembering:

- The junction is git-ignored on the vault side (`01-Projects/Tower Defense PWA/`), otherwise the vault's git would try to swallow this whole repo, `node_modules` included.
- Opening `docs/` directly in Obsidian (rather than reaching it through the vault) makes Obsidian write a `docs/.obsidian/` of its own. That is local editor state, so it is git-ignored here the way `.vscode/` is.
- Internal links are relative markdown links, not `[[wikilinks]]` - they resolve both in Obsidian and on GitHub, where wikilinks render as literal text.
- Links out to vault-only notes can't survive here, so they are written as plain text.
- Archiving this project later means repointing/removing the junction; the notes stay in the repo.
- Claude sessions in the vault can still read the code: the vault's `.claude/settings.local.json` lists `C:\vito\ice-breaker` in `additionalDirectories`.
