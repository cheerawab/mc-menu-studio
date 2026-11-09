# MC Menu Studio (選單工坊)

Next.js (App Router, TypeScript strict) visual editor. Exports a Minecraft Java 26.3 resource pack + data pack that
renders pixel-positioned, clickable menus inside the vanilla Dialog screen. See `BRIEF.md` (what to build) and
`docs/TECHNIQUE.md` (how the in-game rendering works; contains unverified assumptions marked [GW]/[TEST]).

## Commands (keep these working)
- `npm run dev`        dev server on **port 3737** (`next dev -p 3737`)
- `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` (vitest)
- `npm run demo:export -- [--mode registry|functions|both] [--out exports/demo] [--autotest]` writes
  `exports/demo/<mode>/{resourcepack.zip,datapack.zip,README_zh-TW.txt[,autotest.zip]}` + `exports/demo/HANDOFF.md` headlessly (Node)

## Layout
- `src/core/`  pure TypeScript, no React/DOM: scene model, rasteriser, exporter. Must run in Node AND the browser.
- `src/app/`   Next.js UI. All user-facing strings are Traditional Chinese (zh-TW). Code and comments are English.
- `scripts/`   node scripts. `docs/`  documentation. `reference/` READ-ONLY (gitignored): Glyphwork source, vanilla fonts, wiki dumps.

## Rules
1. Read `BRIEF.md` and `docs/TECHNIQUE.md` first.
2. Independent implementation. Glyphwork (reference/glyphwork, MIT) is a reference for the idea; write your own code and
   credit it in the README. Never copy its code, themes or assets.
3. Never launch Minecraft, never touch files outside this directory, never kill processes you did not start.
   Hermes (the orchestrator) tests in the real game.
4. Weekly model quota is limited: be frugal. No Playwright/Puppeteer/browser downloads. Do not re-read large files
   repeatedly. Keep command output short (pipe through `tail`/`head`). Prefer unit tests over manual exploration.
5. Commit after each meaningful step (`git` is initialised; identity already configured).
6. Dev server only on port 3737; stop any server you start before finishing.
7. When a stage ends, write/refresh `STATUS.md`: what works, what does not, exact commands to test, open questions.
