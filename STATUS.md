# STATUS — Stage B (exporter + Export UI) — done

Stage A (editor, renderer, skins, templates, persistence) and Stage B (exporter, demo CLI, Export dialog) are
implemented. The exporter is a TypeScript port of `reference/spike/spike_gen.py` and follows `docs/VERIFIED.md`.
Nothing here was run in Minecraft (rule: never launch the game); Hermes tests the exports.

## How to run and test (exact commands)

```bash
npm install
npm run dev            # editor at http://localhost:3737 (匯出 button opens the Export dialog)
npm run lint           # eslint
npm run typecheck      # tsc --noEmit, strict
npm test               # vitest: 75 tests, ~2.5 s
npm run build          # production build
npm run demo:export -- --mode both --autotest   # -> exports/demo/{registry,functions}/ + exports/demo/HANDOFF.md
npm run preview:skins  # PNG previews of templates/icons/game mock -> exports/previews/
```

Last run (this stage): lint ✓, typecheck ✓, test ✓ (75/75), build ✓, demo export ✓ (0.7 s; two runs give identical
SHA-1 for all six zips), dev server ✓ (GET / 200, all chunks 200, the Export dialog code is in the served editor
chunk, no errors in the server log; server stopped afterwards).

Demo export summary (`--mode both --autotest`): 9 pages (`calibration`, `lobby`, `lobby_rules`, `rules`,
`rules_welcome`, `shop`, `quick`, `settings`, `notice`), 604 tiles of 32 px → 458 unique, 15 sheets (2 tile sheets +
13 hit sizes), 471 private-use glyphs, 26 `y<N>` fonts (max N = 192), 53 regions → 59 hit glyphs;
resourcepack.zip 89 KB (identical bytes for both modes), datapack.zip 8.4 KB (registry) / 8.1 KB (functions),
autotest.zip 1.9 KB. Numbers come from the local fonts (text is rasterised with "Heiti TC" in Node on macOS).

## What works (Stage B)

**Exporter core (`src/core/export/`, pure TS, same code in Node and the browser)**
- `constants.ts`: the only place with client-metric assumptions, each tagged VERIFIED / DECOMPILED / WIKI / TEST.
- `tiles.ts`: splits the page RGBA into 32 px tiles (option 8–128), skips fully transparent tiles, normalises
  alpha-0 pixels, dedupes identical tiles across all pages (hash + byte compare), measures the client's actual width.
- `sheets.ts`: packs unique tiles into PNG sheets (≤ 16 × 16 cells, chars grid padded with U+0000); code points from
  U+E100 upward, never in U+E000–U+E02F; supplementary private use (U+F0000…) only after 6144 glyphs (warning).
  One single-cell sheet per hit-glyph size (alpha 1/255 pixels).
- `png.ts`: deterministic RGBA PNG encoder (adaptive filter by minimum sum, fflate level 9) + decoder for tests.
- `layout.ts`: run list of the first line exactly like the spike: tiles in raster order with the move inside the
  `y<N>` run, then hit glyphs (z-order, after all visuals) each in its own run with the move in a separate space-font
  run, final move to exactly W, `ceil(H/9)` newlines. Binary space encoding (one sign, largest first, so the running
  advance never overshoots). Merges neighbouring non-interactive runs. Checks the wrap rule
  (`plain_message.width = W + 12`, running advance ≤ width − 8; peak is W + 1) and throws if violated.
  Regions > 128 px per side are split into balanced cells; a cell ending above y = 7 is extended to the baseline.
- `dialogs.ts`: text components (`color #ffffff`, `shadow_color 0` on every run), click/hover events only on hit
  runs, `notice` dialog (`pause:false`, `after_action` option, footer label/width 150), function source
  `dialog show @s {SNBT}`. Actions: page → `show_dialog` (registry) or `run_command function <ns>:show_<key>`
  (functions); command → `run_command` (no leading slash); url → `open_url`; copy → `copy_to_clipboard`;
  close → `run_command dialog clear @s`; tooltip → `show_text`.
- `snbt.ts`: JSON → SNBT (quoted keys, `"` `\` `\n` escaped, raw private-use/CJK characters, mixed lists).
- `pack.ts`: resource pack (`pack.mcmeta` 97, `space.json`, `y<N>.json` with only the sheets drawn at N, sheets),
  data pack (121; registry: `dialog/<key>.json` + optional `quick_actions` tag; functions: `function/show_<key>.mcfunction`),
  autotest pack, and byte-reproducible zips (sorted names, explicit directory entries, fixed UTC timestamp, fixed
  deflate level, PNG/zip entries stored). JSON is written with `\uXXXX` escapes (like the verified spike).
- `readme.ts` (README_zh-TW.txt), `project.ts` (Project → pages via the shared `renderPage`, link → key, export
  checks), `calibration.ts` (256×160 grid page with 6 test regions), `demo.ts` (demo page set), `index.ts`
  (`buildExport`, `zipExport`, `zipBundle`).

**CLI**: `npm run demo:export -- [--mode registry|functions|both] [--out exports/demo] [--autotest]` (tsx +
@napi-rs/canvas). Demo = `calibration` first (its bottom-left square links to `lobby`), then every template page
(each rendered with its own template project/skin; keys `lobby`, `lobby_rules`, `rules`, `rules_welcome`, …).
Writes `<out>/<mode>/{resourcepack.zip,datapack.zip,README_zh-TW.txt[,autotest.zip]}` and `<out>/HANDOFF.md`
(page table, auto-test ticks, what to check). Autotest: `load` creates/resets objective `mcms_t`; `tick` adds 1 per
player and at tick 120 + 800·k runs `say PAGE <key>` then shows page k; `say AUTOTEST DONE` after the last page.

**Export dialog (匯出 button)**: namespace + menu name, mode cards with plain zh-TW explanations (registry: servers,
G key, singleplayer shows Minecraft's experimental-settings screen each time the world opens; functions: no warning,
needs cheats/OP, no G key), G-key toggle (registry only), footer-button behaviour (close / keep open, marked 尚待實機驗證),
checks (errors block the download; warnings/info and build warnings listed), statistics, downloads (resource pack,
data pack, "全部下載" bundle = both zips + README_zh-TW.txt), step-by-step guides for singleplayer and servers, notes
(static picture, what is verified vs 尚待實機驗證, permissions, font licensing). The build runs in the browser
(debounced, cancels stale builds, waits for images to decode). Mode/G-key/footer choices are remembered.

**Model**: `settings.footerLabel` (default 關閉) and `page.footerLabel` (null = project default); older JSON gets the
defaults; inspector fields (project + page), validation (empty / probably too long for the 150 px button), used by
the in-game mock and the exporter (`effectiveFooterLabel`).

**Game mock**: `GAME_CHROME` now uses the measured values (picture top 67, footer button 150×20 ending 6 px above the
bottom, title baseline ~16) and marks the rest as estimates; the widget width is W + 12; fit checks share
`fitProblem()`.

**Tests** (75): golden client simulation (`src/core/__tests__/helpers/clientSim.ts`) re-reads the GENERATED font
JSON, sheet PNGs and dialogs (JSON, or SNBT parsed back from the .mcfunction), lays the line out with the client's
advance model (space table, actual width + 1, ascent offsets, running-width check against width − 8) and asserts:
every tile pixel lands at its source position (exact RGBA), the line ends at W with `ceil(H/9)` newlines, every hit
box ≤ 128 px and the union of hit boxes per event equals its region, "last glyph wins" gives the topmost region at
every sampled point, events only on single-glyph runs, white + shadow 0 everywhere. Run for synthetic pages
(opaque/duplicate/empty/partial/edge/translucent tiles, overlapping, split, clipped, hover-only, top-band regions),
the calibration page, and all 8 template pages rendered by the shared renderer, in both modes. Mutation checks done
while writing: dropping the +1 advance or reversing hit order makes the golden test fail. Units: space encoding,
dedupe, actual width, sheets, code point allocation, PNG round trip, SNBT (escapes, private use, emoji, mixed lists,
round trip), event mapping, splitting, wrap rule, autotest schedule, zip determinism (names, dirs, dates), both
modes, identical resource pack across modes, determinism over fresh renders, one page/no regions, 24 linked pages,
invalid input. UI: jsdom smoke test opens the dialog; a second jsdom test builds with @napi-rs/canvas, checks the
stats, switches modes and verifies the downloaded zips' contents.

## Known gaps

- Not seen in a real browser by me (no browser automation per the rules): the Export dialog was checked by two jsdom
  tests, the production build and the dev server (chunks load). Please click through it once at http://localhost:3737.
- Exported pictures depend on the fonts of the machine that exports (browser export = exact WYSIWYG of the editor;
  Node export uses Skia with the local fonts, slightly different text). No fonts are bundled (owner decision).
- The browser build runs on the main thread (a few hundred ms for typical projects; large projects may stutter).
- No per-page skins, no "trigger mode" for non-op players (Stage C idea), no pause-screen (`pause_screen_additions`)
  option, the G key always opens the first page.
- The editor mock treats the topmost region as blocking; in the client a hover-only region does not block clicks of
  a clickable region below it (only glyphs with a click event take part in the click walk, VERIFIED §10).
- Regions that end above y = 7 get a hit box extended down to y = 7 (warning shown); unavoidable with `ascent ≤ height`.

## Assumptions to verify in game

All exporter numbers are in `src/core/export/constants.ts`; mock metrics in `GAME_CHROME` (`src/core/game/chrome.ts`).

1. `shadow_color: 0` removes the 1 px dark band on the right/bottom of the picture (VERIFIED §9 says documented, not seen).
2. Hit glyphs (every pixel alpha 1/255) are invisible and their click box is the full cell. NOT TESTED.
3. `click_event`/`hover_event` on glyph runs inside a `plain_message` work (run_command, show_dialog, open_url,
   copy_to_clipboard, show_text incl. multi-line tooltips). NOT TESTED.
4. `run_command` without a leading slash (wiki: optional; the spike used none).
5. **`after_action` default changed to `close`** (the spike used `none`). Per the wiki, `none` "does nothing, keeps the
   dialog open", so a footer button labelled 關閉 would not close the dialog; `close` is the safer default and `none`
   stays selectable. To check: does `close` also close the dialog after a body click (text click events)?
6. The 「關閉選單」 action runs `dialog clear @s` (needs permission level 2; fails for normal players on servers).
7. functions mode navigation `function <ns>:show_<key>` from a click (permission level 2; singleplayer with cheats).
8. A single-entry `quick_actions` tag opens the dialog directly with G.
9. Vertical offsets above 288 (pages taller than ~300 px; the model allows 600) and supplementary private-use code
   points (> 6144 glyphs) are untested; the exporter warns in both cases.
10. Picture placement in the mock is measured only at GUI 3 / 853×480 GUI px (top 67). Other GUI scales/windows, and
    whether the top stays at 67 when the picture is taller than the window (scrolling), are not measured.
11. The footer label width estimate (CJK ≈ 9 px, others ≈ 6 px; warn above 140 px) is a guess.
12. From Stage A, still open: glyph pixels with alpha < 10 % are discarded by the shader [GW]; chat commands
    (say/tell/msg/me…) do not run from clicks; command length > 256 may be rejected; `open_url` http(s) only.

## Deviations from the spike (none from VERIFIED.md)

- Tiles are deduped across all pages and packed into shared sheets; each `y<N>` font lists only the sheets drawn at N
  (the spike listed every sheet in every font). Same rendering, smaller fonts.
- Moves before hit glyphs always go into a separate space-font run (the spike kept negative moves inside the event
  run); VERIFIED §10 says spaces must not carry events.
- Regions > 128 px are split (the spike had no large regions); `after_action` default `close` (see 5 above).

## Open questions (Stage C)

- Should exports bundle an OFL font (e.g. Noto Sans TC) so browser and Node exports are identical and licensing is
  simple? (Currently: user's own fonts, with a zh-TW note.)
- Trigger mode (`/trigger` + tick function) so normal players can press buttons that run privileged commands?
- G-key target page selectable? `pause_screen_additions` option?
- Move the browser build into a Web Worker if projects get large.
