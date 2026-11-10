# STATUS — Stage F (phones and tablets) — done

## Stage F: what changed

Owner's request: 「新增可以對手機友善」. The editor now adapts to phones and tablets; desktop (>= 1280 px wide) keeps
the same DOM structure and look. Exporter, renderer, data model and persistence format are untouched (one store action
added: `cancelGesture`). No new dependencies. Commits: fe465b5 (tiers, shell, sheets), 7a07ba4 (touch canvas),
626a42f (dialogs, preview, viewport), plus the docs commit.

**Layout tiers** (`src/app/editor/layoutTier.ts`, the single source of truth): `useLayoutTier()` = matchMedia +
useSyncExternalStore: `compact` < 900 px, `medium` 900-1279 px, `desktop` >= 1280 px; on the server and without
matchMedia (jsdom) it is `desktop`. Editor computes `LayoutInfo { tier, coarse, landscape, touchUi }` once
(`(pointer: coarse)`, `(orientation: landscape)`, `touchUi = compact || coarse`) and provides it through
`LayoutContext`; the root has `data-layout="compact|medium|desktop"`. Shell: `.app-shell` (100dvh; Lightning CSS drops
the 100vh fallback because every default Next browser target supports dvh), no minimum width, `touch-action:
manipulation`; `overscroll-behavior: none` on html/body.
- medium: the three columns with 208 / 264 px side panels (canvas column 426 px at 900 px), logo mark only, project
  name 144 px, no GUI scale / window size in the top bar (they move into the game preview's header), canvas toolbar
  scrolls sideways.
- compact (`CompactShell.tsx`): top bar = project name (moves into the ⋯ menu below 360 px), icon-only 編輯 / 遊戲預覽,
  復原, 重做, 匯出 (label from 440 px), ⋯ menu (範本庫…, 新專案, 匯入 / 匯出專案 JSON; in edit mode 顯示格線, 顯示點擊區域,
  吸附 1/2/4/8). Bottom tab bar 元件 頁面 圖層 屬性 更多 (`role="tablist"` / `role="tab"`, `aria-selected`,
  `aria-controls="sheet-<id>"`, icon-only with aria-labels in landscape, error/warning badge on 更多). One sheet at a
  time (`role="dialog"`, `id="sheet-<id>"`), part of the layout (the canvas shrinks, zoom/pan kept): portrait = lower
  half (flex-basis 50 %), landscape = docked right (min(380 px, 50 %)). Close: the active tab again, 關閉面板 (×), Esc.
  Sheets reuse the panel contents: `Palette`, `Pages`, `Layers` (exported from LeftPanel), `Inspector`, `LinkMap`,
  `IssuesPanel` (exported from RightPanel); 更多 = segmented 連結 / 檢查 (uses `rightTab`).
- `src/app/state/mobile.ts`: tiny zustand store for touch-only UI state (open sheet, 多選, nudge step); not persisted,
  not in the undo history.

**Touch on the canvas** (`CanvasView.tsx`; pure math in `src/core/gestures.ts`): touch pointers are tracked apart from
mouse/pen. One finger: tap selects (tap on empty space deselects), drag on an element moves it (8 px tap slop, snapping
as before, one undo step), drag on a handle resizes, drag on empty space pans; double tap on empty space = fit, double
tap on an element = edit its text (opens 屬性). Two fingers: pinch zoom around the midpoint (whole zoom steps, clamped
1-8) plus two-finger pan in one formula; a second finger cancels a move/resize in progress (`store.cancelGesture`: back
to the gesture snapshot, no history entry); remaining fingers are ignored until all are lifted. Mouse/pen unchanged
(marquee, Space / middle-button pan, Shift/Cmd/Ctrl additive, wheel zoom). Long press does not open the browser menu
(contextmenu prevented for touch, `-webkit-touch-callout: none`). `(pointer: coarse)`: handles get a 28 px hit area
around a 12 px square; edge handles are hidden when they would overlap the corners, tiny elements keep only `se`.
Compact: floating 縮小 / zoom % / 放大 / 符合視窗 buttons instead of the toolbar; when the stage resizes (sheet opens or
closes) the view keeps its centre and the selection stays in view.

**Selection bar** (`TouchControls.tsx`, shown while something is selected in compact, and in any tier with a coarse
pointer; hidden while a sheet is open): 多選, 往左 / 往上 / 往下 / 往右, step button (`移動距離 N 像素`: 1 → 8 → 16),
複製, 刪除, 上移, 下移, 對齊與排列 (a second row with the 6 align, 2 distribute, top/bottom buttons). 44 px buttons,
wraps to two rows on phones. Uses the existing store actions (nudge, duplicateSelected, deleteSelected, zOrder, align,
distribute).

**Reorder without DnD** (touch UI): the current page's row shows 頁面上移 / 頁面下移 / 複製頁面 / 刪除頁面, selected layer
rows show 圖層上移 / 圖層下移 and the eye/lock buttons (also shown whenever hidden/locked is on); rows are 44 px and not
`draggable`. Desktop DnD rows unchanged. Layer-row taps toggle while 多選 is on.

**Dialogs, menus, toasts**: `Modal` in compact = sheet from the bottom edge, full width, at most the screen height minus
the top safe area, content scrolls, 44 px close button; the backdrop closes on a click whose pointerdown was also on
the backdrop (desktop: was mousedown). Confirm buttons share the width; templates one column (two from 600 px); export
dialog one column. Menus close on outside `pointerdown` (desktop 檔案 menu too). Toasts sit under the top bar in compact.

**Game preview**: touch tap = the simulated click (the compatibility click that follows is ignored), long press 400 ms =
tooltip, which stays until the next pointerdown anywhere; outside desktop the header wraps and contains the window size
select and the GUI 1-4 buttons (44 px in compact); compact uses 8 px padding and puts the hint text under the preview.

**Sizes**: compact `Button` 44 px, `IconButton` xs/sm/md → 32/40/40 px, new `lg` = 44 px, `Segmented` 40 px (+ frame),
color swatch 40 px; `[data-layout="compact"]` CSS: base text 14 px, inputs/selects/textareas 16 px and >= 40 px tall
(no iOS focus zoom), switches >= 40 px, arbitrary text classes bumped (12/12.5/13 → 14, 11.5 → 13, 10.5/11 → 12.5).
`NumberInput` `inputMode`: numeric (integers >= 0), decimal (fractions >= 0), none where negatives are allowed (X/Y).
Viewport: `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`, page pinch-zoom
not disabled; safe-area padding on the top bar, tab bar, sheets row and compact dialogs. The new sheet animation
(140 ms) is off with `prefers-reduced-motion: reduce`. Inspector: on touch layouts a 觸控操作 list replaces 快速鍵.

**Tests** (+39, 135 total): `src/core/__tests__/gestures.test.ts` (tap, double tap, pinch, pan, handles, keep-in-view),
`layoutTier.test.tsx` (width mapping, no-matchMedia fallback, live changes), `CompactShell.test.tsx` (shell, sheets
open/close via tab / × / Esc, add from 元件, Enter opens 屬性, ⋯ menu, tier switching), `CanvasTouch.test.tsx`
(simulated touch pointer events: tap, drag, pan, pinch, second-finger cancel, 多選, handles + resize, zoom buttons,
selection bar actions, layer/page up-down, medium + coarse), `CompactDialogs.test.tsx` (dialog sheets, backdrop, confirm,
templates, toasts, preview tap / long press / navigation, viewport, shell CSS), store `cancelGesture`. `mediaMock.ts`
is the matchMedia stub. `Editor.test.tsx` is unchanged and passes (no matchMedia → desktop).

Desktop DOM differences (no visual change intended): root `data-layout="desktop"` + `app-shell` instead of
`h-screen min-w-[1280px]`; a few added no-op classes (`shrink-0` on icons / separators / the toolbar's page size,
`no-callout` on the stage, `select-none no-callout touch-manipulation` on the preview canvas, `min-h-0 overflow-y-auto`
on the confirm text, `px-4` on the empty-page hint); number inputs have `inputmode="numeric"` or none instead of
`decimal`; the modal backdrop closes on click instead of mousedown.

### Stage F decisions (nobody could be asked)

- Breakpoints by width only (900 / 1280). Pointer type is a second axis: `touchUi = compact || (pointer: coarse)` turns
  on the selection bar, touch rows, up/down reorder and disables HTML5 drag on rows and the palette; the larger handles
  follow `(pointer: coarse)` only. So a touch tablet in landscape (medium) also gets the selection bar.
- Landscape phone: a side sheet instead of a short bottom sheet (at 844 x 390 a bottom sheet that leaves the canvas 180
  px would show about 100 px of content); the canvas keeps the full height between the bars (about 280 px).
- Selecting never opens a sheet; double tap on an element and Enter open 屬性 (text edit, like double click).
- Adding an element from 元件 closes the sheet (the new element is selected and visible with the selection bar).
- The selection bar hides while a sheet is open (the sheet has the same actions; keeps the shrunken canvas visible).
- Nudge step cycles 1 → 8 → 16 px per tap (keyboard keeps 1 / Shift 8).
- 多選: a tap toggles; dragging a selected element moves the whole selection; tap on empty space still deselects all;
  多選 turns off when the selection becomes empty or the touch UI goes away.
- Pinch zoom snaps to whole zoom levels (the editor only uses integer zoom: square pixels, rulers, grid).
- A touch on an element selects it at once (like mouse down), so a pinch that starts on an element selects it.
- Game preview: long press (400 ms) for the tooltip, not the first tap; a tap is always the click, as in the game.
- Compact dialogs: natural height up to the screen (export / templates nearly full height, confirm stays short).
- Compact toasts at the top (bottom has the tab bar and the selection bar).
- Page pinch-zoom stays allowed (accessibility); only the canvas stage uses `touch-action: none`.
- Drag-down-to-close for sheets: skipped (optional).

### Stage F: not verified

- Nothing ran in a real browser or on a real device (rules: no browser, no dev server needed; Hermes tests with a phone
  viewport and touch emulation): actual layout and sheet heights, safe areas / notch, iOS Safari and Android Chrome
  specifics (on-screen keyboard with 100dvh, `interactive-widget` is ignored by iOS Safari, long-press and double-tap
  behaviour, `-webkit-touch-callout`), real multi-touch, blob downloads on phones.
- The pointer tests run in jsdom: no layout (the stage sits at 0,0, so client px = page px at zoom 1), simulated
  PointerEvents.
- Opening the editor from a phone: `npm run dev` binds to the network, but Next 16 blocks cross-origin requests to
  `/_next` dev resources unless `allowedDevOrigins` lists the host. Same-origin page loads should pass (no Origin
  header on same-origin GETs) and the HMR websocket would be blocked; `npm run build` + `npm start` avoids the check.
  The README gives both and says it is untested.

### Stage F: known gaps (left alone on purpose)

- HTML5 drag and drop stays mouse-only: palette → canvas (touch: tap adds), layer/page reorder (touch: up/down
  buttons), image files dropped on the canvas (touch: add an 圖片 element and use its upload button in 屬性).
- Medium tier on a touch tablet keeps desktop-sized panel controls apart from the touch rows (most buttons 24-28 px);
  only compact enlarges everything.
- Compact leftovers below 44 px: inspector icon picker cells (32 px tall), the 20 px rulers (kept).
- Desktop hover-only helpers (hover outline, cursor readout) simply do nothing on touch; the cursor readout is hidden in
  compact.

**Stage E: git history rewritten (2026-11-10):**
At the owner's request every commit's author/committer is now the repo
owner and every commit message ends with a `Co-authored-by: Claude <noreply@anthropic.com>` trailer. File contents are
unchanged except `LICENSE` (copyright holder `Cheerawab` in every commit that has the file; a second rewrite), so all
commit hashes changed; the commit references in the docs (and one test comment) were updated.

Stage A (editor, renderer, skins, templates, persistence), Stage B (exporter, demo CLI, Export dialog) and Stage C
(trigger command mode, footer/after_action corrections from the decompiled client) are implemented. The exporter
follows `docs/VERIFIED.md` (§13 for Stage C). Nothing here was run in Minecraft by me (rule: never launch the game);
Hermes tests the exports.

## Stage D: what changed

- `README.md` rewritten for players / server admins (zh-TW): what it is, 8 screenshots in `docs/images/` (real in-game
  shots + editor shots), step-by-step install → design → export → use (single-player and server; the steps follow the
  exporter's `README_zh-TW.txt`), tested vs untested list, limits, size limits (formula + table from VERIFIED §16-18),
  the RPG-style PoC pages (marked as not buildable with the editor), FAQ. Developer commands and layout are in a
  `<details>` block at the end.
- `src/app/editor/ui.tsx` (commit bd26c48): the `Toggle` knob was drawn outside its track, over the label (the
  `<button>`'s `text-align: center` set the knob's static position to the middle of the track); `left-0` + `shrink-0`.
- No exporter, renderer or in-app wording change; exports not regenerated. lint ✓, typecheck ✓, test ✓ (96/96).

Current verification state (supersedes the Stage C list below): VERIFIED in the real 26.3 client (single-player,
functions mode, VERIFIED §12, §14-18): picture placement of all 9 demo pages; the /trigger chain (the autotest sent
the same `/trigger` a button sends, `time set day` ran, a navigation id opened the next page; simulated, not a mouse
click); hover tooltips; size limits at GUI 480x270 and 853x480. NOT TESTED: real mouse clicks (incl. copy/URL, footer
button, Esc), registry mode + G key, dedicated servers, other game versions, the editor on Windows/Linux.

In-app texts and estimates that are now behind the README / the game (open; next stage):
- Export dialog 注意事項 still says 「尚待實機驗證：按鈕點擊、滑鼠提示文字、頁面切換、底部按鈕與 /trigger 的實際執行」;
  tooltips, trigger execution and trigger navigation are verified (§14-15). Same outdated line in the generated
  `README_zh-TW.txt` (`src/core/export/readme.ts`).
- `chrome.ts` fit check: height uses `S - 100` (the game has `S - 66`, so the editor warns early); width uses
  `W + 12 <= GUI width` while the game crops beyond `GUI width - 32` (the editor shows 可完整顯示 for pages up to
  20 px too wide). The README documents both.
- Inspector 頁面 → 檔名 hint always shows the registry command `/dialog show @s ns:key`, also for functions exports.
- The preview offers GUI 1-4 only; a 2560x1440 screen on "auto" uses scale 6 (GUI about 427x240).

## How to run and test (exact commands)

```bash
npm install
npm run dev            # editor at http://localhost:3737 (匯出 button opens the Export dialog)
npm run lint           # eslint
npm run typecheck      # tsc --noEmit, strict
npm test               # vitest: 135 tests, ~4 s
npm run build          # production build
npm run demo:export -- --mode both --autotest                    # trigger mode (default) -> exports/demo/ + HANDOFF.md
npm run demo:export -- --mode both --autotest --commands direct --out exports/direct   # Stage B behaviour
npm run preview:skins  # PNG previews of templates/icons/game mock -> exports/previews/
```

Phone check (Hermes): any browser's device mode, e.g. 390x844, 844x390, 768x1024 with touch emulation, and 1024x768;
`[data-layout]` on the editor root tells the tier.

Last run (Stage F): `npm run lint`, `npm run typecheck`, `npm test` (135/135) and `npm run build` all exit 0. Demo export
not re-run (exporter, renderer and data model untouched; the golden export tests pass).

Last run (Stage C/D): lint ✓, typecheck ✓, test ✓ (96/96), build ✓, demo export ✓ (0.7 s; two runs give identical
SHA-1 for all six zips and the READMEs). `--commands direct` reproduces the Stage B demo zips byte for byte (resource
pack, data pack and autotest of both modes, compared by SHA-1 against an export made with the Stage B code before any
change); a unit test pins the same property on a synthetic fixture. The resource pack is identical in all four
combinations (registry/functions × trigger/direct). Dev server not started this stage (the dialog is covered by two
jsdom tests and the production build).

Demo export (trigger, `--mode both --autotest`): 9 pages, resource pack 89.0 KB (unchanged), datapack.zip 9.7 KB
(registry, 27 ids) / 9.6 KB (functions, 30 ids: + 3 navigation ids), autotest.zip 2.1 KB.

## Stage C: what changed

**Trigger mode** (`ExportOptions.commandMode: 'trigger' | 'direct'`; the export dialog and the CLI default to
`trigger`; the core treats an omitted value as `direct`, so pre-Stage-C callers and the golden tests keep their bytes).
Why (VERIFIED §13): a `run_command` click that needs permissions opens Minecraft's confirm screen on every click and
does not work for normal players; `/trigger` needs no permission.
- Objective `mcms_<namespace>` (type `trigger`). Code: `src/core/export/triggers.ts`.
- Ids ≥ 1 for every `command` action, every `close` action and (functions mode only) every page link, in order of first
  appearance (pages in export order, regions in z-order); identical actions share an id (commands compared after
  normalisation, so `/time set day` and `time set day` are one id). Registry navigation stays `show_dialog`; `copy` and
  `url` are unchanged. The click becomes `run_command` `trigger mcms_<ns> set <N>`.
- Data pack (both packaging modes, only when at least one id exists): `data/<ns>/function/trigger_load.mcfunction`
  (`scoreboard objectives add <obj> trigger`) and `trigger_tick.mcfunction` (one
  `execute as @a[scores={<obj>=<N>}] at @s run <command>` per id, then `scoreboard players set @a[scores={<obj>=1..}] <obj> 0`,
  then `scoreboard players enable @a <obj>`), registered in `data/minecraft/tags/function/{load,tick}.json`. Tag entries
  are `{"id": ..., "required": false}`: a missing required entry fails the whole merged tag, so a broken trigger_tick
  would otherwise also stop every other pack's load/tick functions (and Hermes' autotest).
- Commands go in verbatim (no escaping). Validation: newline → error (cannot happen after normalisation), trailing `\`
  → error (mcfunction line continuation would glue it to the next line), > 256 characters → warning. Leading slashes
  and spaces are stripped (they would not parse after `run `).
- Footer with `after_action: none` (DECOMPILED §13: the footer then does nothing): the footer button gets the close
  action of the command mode (`trigger <obj> set <close id>` or `dialog clear @s` in direct mode). If no button uses
  close, its id is appended after all buttons, so switching the footer setting never renumbers buttons. `close` keeps
  today's footer (no action). Esc always closes.
- `buildExport` returns `triggers: { objective, actions: [{ id, kind, command, target?, firstPage, footerOnly }] }`
  (null in direct mode). The CLI prints it, HANDOFF.md has one table per mode, README_zh-TW.txt lists it as
  「按鈕編號對照」 with the warnings below.

**Auto-test** (`--autotest`, trigger mode only; page schedule 120 + 800·k unchanged): at T+40, T+120, T+200 (T = tick of
the last page) `say TRIGGER <label> id <N>` then `trigger <obj> set <N>` as the player, for the `time set day` id, the
`weather clear` id, and the navigation id that opens `lobby` (functions) / the close id (registry). Because tick
functions run silently, the time test sets midnight first and logs `TRIGGER CHECK time_day OK|FAIL` 20 ticks later
(`time query minecraft:day` in 1000..1100). `say AUTOTEST DONE` stays at 120 + 800·pages. Expected log lines: HANDOFF.md.

**Export dialog**: new section 「指令執行方式」 with two cards (「/trigger（建議）」 / 「直接執行」), the line
「這個專案有 N 個指令動作」 (+ number of ids after the build), 尚待實機驗證 marker; the checks list now shows the
export-only notes (`export-trigger` info: anyone can run the actions with /trigger; `export-direct` warning: confirm
screen / normal players). Footer select is now 「點擊選單後」: 「點擊後關閉（建議）」 (any click closes; navigation opens
the next page) / 「保持開啟」 (the footer button closes, Esc too). Functions-mode texts say that only opening the menu needs
/function when trigger mode is on. The choice is remembered with the other export prefs.

**Checks**: `checkExport(project, { mode, commandMode })`; `countCommandActions(project, mode)`; the `command-chat`
warning (say/tell…) is dropped in trigger mode (functions run them) and its text now matches §13 (direct mode → confirm
screen). **CLI**: `--commands trigger|direct` (parser in `scripts/demo-args.ts`, unit-tested).

**Docs**: README (usage, both command modes), CLAUDE.md (command line), this file, HANDOFF.md (generated).

**Tests** (+21): id assignment/dedupe/order (both modes), exact `trigger_tick`/`trigger_load` text, tags only in trigger
mode and only with ids, click events per action type, direct mode = Stage B bytes (pinned hashes) and identical resource
pack, footer action for `close`/`none` × trigger/direct incl. the footer-only id, autotest lines and schedule,
README table, zip determinism in trigger mode, a trigger-mode client simulation of all demo pages (same pixels and hit
boxes as direct, every click mapped through the id table), export checks, CLI flag parsing, a jsdom test of the new
dialog section (default trigger, count, checks entry, data pack contents, switch to direct, remembered pref).
The existing golden tests are unchanged and pass.

## Verified / not verified

- VERIFIED in game (§12, Stage B, functions mode): every demo page renders pixel-exactly; `shadow_color: 0` works;
  inline `dialog show @s {SNBT}` works; packs load without warnings.
- DECOMPILED (§13), not clicked: click hit-testing; `after_action` semantics; the confirm screen for privileged
  `run_command`; `/trigger` parses without permissions and should run silently.
- NOT TESTED: any click in the game (including that a `/trigger` click shows no confirm screen), hover tooltips, the
  footer button with an action under `after_action: none`, Esc, G key, registry mode in game, servers.
- To be tested by Hermes with `--autotest` (no mouse needed): the server side of trigger mode (trigger → `trigger_tick`
  → command as the player). `TRIGGER CHECK time_day OK` in the log proves the chain; weather/close/navigation are
  visual checks (see HANDOFF.md).

## Known gaps and risks

- **One bad command disables every trigger button**: all commands are lines of one `trigger_tick` file; if any line
  does not parse (typo, wrong item id), Minecraft does not load the function (`Failed to load function
  <ns>:trigger_tick` in the log). The README/UI say so. Alternative: one function per id (open question below).
- Commands run from a tick function are silent: feedback-only commands (`random value`, `list`, `time query`) show
  nothing to the player in trigger mode (the demo's calibration dice buttons look dead; expected). Use `tellraw @s`.
- Anyone can type `/trigger mcms_<ns> set <N>` to run any menu action without the menu (by design; documented).
- Functions mode: opening the first page still needs `/function` (cheats/OP); there is no "open menu" id.
- Navigation in functions + trigger + `after_action: close`: the click closes the dialog, the server opens the next page
  one tick later (a brief flash of the game is expected). Registry navigation is unchanged (`show_dialog`).
- Values set by hand that are ≤ 0 (`/trigger … set -5`) are not reset (harmless: no id ≤ 0).
- From Stage B: exported pictures depend on the exporting machine's fonts; the browser build runs on the main thread; no
  per-page skins; no `pause_screen_additions`; the G key always opens the first page; the editor mock treats the topmost
  region as blocking (in the client a hover-only region does not block clicks below it, §10); regions ending above
  y = 7 get a hit box extended to y = 7 (warning).

## Assumptions to verify in game

All exporter numbers are in `src/core/export/constants.ts`; mock metrics in `GAME_CHROME` (`src/core/game/chrome.ts`).

1. ~~`shadow_color: 0` removes the dark band~~ — VERIFIED (§12).
2. Hit glyphs (every pixel alpha 1/255) are invisible and their click box is the full cell. NOT TESTED.
3. `click_event`/`hover_event` on glyph runs inside a `plain_message` work (run_command, show_dialog, open_url,
   copy_to_clipboard, show_text incl. multi-line tooltips). NOT TESTED.
4. `run_command` without a leading slash (wiki: optional; the spike used none).
5. ~~`after_action` semantics~~ — **RESOLVED by decompilation, see VERIFIED §13**: `close` closes after any body click
   (navigation still opens the next dialog); `none` keeps the dialog and the footer button only runs its own action,
   so the exporter now gives the footer the close action under `none`.
6. The 「關閉選單」 action runs `dialog clear @s` (permission level 2): direct mode → confirm screen / fails for normal
   players (§13); trigger mode → runs from `trigger_tick`. Trigger path NOT TESTED.
7. Functions-mode navigation from a click: direct → confirm screen on every click (§13); trigger → `function
   <ns>:show_<key>` from `trigger_tick`. NOT TESTED.
8. A single-entry `quick_actions` tag opens the dialog directly with G. NOT TESTED.
9. Vertical offsets above 288 (pages taller than ~300 px; the model allows 600) and supplementary private-use code
   points (> 6144 glyphs) are untested; the exporter warns in both cases.
10. Picture placement in the mock is measured only at GUI 3 / 853×480 GUI px (top 67). Other GUI scales/windows, and
    whether the top stays at 67 when the picture is taller than the window (scrolling), are not measured.
11. The footer label width estimate (CJK ≈ 9 px, others ≈ 6 px; warn above 140 px) is a guess.
12. From Stage A, still open: glyph pixels with alpha < 10 % are discarded by the shader [GW]; command length > 256 may be
    rejected in direct mode (warning in both modes); `open_url` http(s) only. Chat commands (say/tell…): direct → confirm
    screen (§13), trigger → run by the function (NOT TESTED).
13. A `trigger <obj> set <N>` click runs without any confirm screen (§13: parses without permissions). NOT TESTED.
14. `trigger_tick` dispatches as the player with the function permission level (default 2) — Hermes' autotest checks it.
15. Function tag entries `{"id": …, "required": false}` load in 26.3 (standard format since 1.16.2; the verified
    autotest pack uses plain strings).

## Deviations from the spike (none from VERIFIED.md)

- Tiles are deduped across all pages and packed into shared sheets; each `y<N>` font lists only the sheets drawn at N.
- Moves before hit glyphs always go into a separate space-font run (VERIFIED §10: spaces must not carry events).
- Regions > 128 px are split; `after_action` default `close`; trigger mode (Stage C) is new.

## Open questions (Stage D)

- One function per trigger id (`trigger_tick` would call `function <ns>:trigger/<N>`), so a command that does not parse
  only breaks its own button instead of all of them?
- An "open menu" trigger id (functions mode), so normal players can open the menu with `/trigger`?
- Bundle an OFL font (e.g. Noto Sans TC) so browser and Node exports are identical? G-key target page selectable?
  `pause_screen_additions` option? Move the browser build into a Web Worker?

## Correction after the first real-game autotest run (Hermes, 26.3)
- `time query daytime` does not exist in 26.3 (world clocks/timelines): the autotest tick function failed to load
  ("element 'minecraft:daytime' of type 'minecraft:timeline' not found"), so no PAGE/TRIGGER marker ran. The check now uses
  `time query minecraft:day` (ticks inside the 24000-tick day timeline; `time set day` = marker `minecraft:day` = tick 1000).
  `time set day|noon|night|midnight` themselves parse in 26.3 (markers). Lesson: parse every generated command with the target
  game version; unparsable lines make the whole function (and for `trigger_tick` every button) fail.

## Page size vs. screen (Hermes, see docs/VERIFIED.md section 16)
- 597x336 (70% x 70% of a 853x480 GUI) verified in game. For smaller GUIs (1080p "auto" = 480x270) the usable height is about
  `9 * floor((S - 83) / 9)` (180 at S = 270) per the decompiled layout code; not yet run. The editor's mock (`gameLayout.widgetSpace = S - 100`)
  is more pessimistic than that and should be re-calibrated after the in-game check. The exporter reserves one empty line (9 px) too many.

## Largest page at 1920x1080 (Hermes, docs/VERIFIED.md section 18)
- GUI 480x270 (auto scale 4): 448x189 fits without scrolling (93% x 70%) IF the exporter reserved one line fewer; today's export reaches 448x180
  (448x171 when the page touches its right edge). Verified in the game with post-processed packs (`scripts/max1080-poc.ts`); the exporter is NOT changed yet.
- To change in the exporter: `layout.ts` `lines: ceil(H/9)` -> `ceil(H/9) - 1`, and end the first line at W + 1 when its running advance peaks at W + 1
  (otherwise the widget height pass wraps the line and adds a line). Goldens (`export-golden.test.ts`, exports/demo) must be regenerated.
