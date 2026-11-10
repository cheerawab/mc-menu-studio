# VERIFIED IN THE REAL GAME (Minecraft Java 26.3, singleplayer, macOS, GUI scale 3)

Hermes ran the spike generator (`reference/spike/spike_gen.py`, a ~250-line dependency-free Python reference
implementation of the exporter core) and looked at the result in a real client through Prism Launcher.
Where this file disagrees with `docs/TECHNIQUE.md`, **this file wins**. Items are marked
VERIFIED (seen/measured in the game), DECOMPILED (read in Mojang's shipped classes), or NOT TESTED.

## 1. The pixel technique works (VERIFIED)
- A `minecraft:notice` dialog with one `minecraft:plain_message` whose `contents` is a list of text components, each run
  using font `<ns>:y<N>` (bitmap font with `ascent = 7 - N`) preceded by space-font glyphs for x movement, renders a
  multi-tile picture **pixel-exactly**: 256x160 grid scene, 7x5 tiles of 32 px: 1-px grid lines every 16 px measured at
  exactly 16.0 MC px spacing in both axes across every tile seam; 200x100 UI scene (gradient, frame, 4 corner markers,
  3 buttons, translucent band, progress bar) looks identical to the source bitmap; 120x300 (tall) and 520x80 (wide) fine.
- Vertical offsets up to N = 288 (ascent = -281) work. Fonts per offset: only the y values actually used need to exist.
- Clients show the picture centred horizontally; the picture top is ~67 MC px below the window top (GUI scale 3, 480 px
  tall window; independent of picture height for 100/160/300). Title is centred ~16 px from the top; the `notice` footer
  button ("關閉" / our label) sits at the bottom edge. A 300 px tall picture still fits at GUI scale 3 in a 720p window.
- Measured: with `guiScale:3` and a 1280x720 window one MC GUI px = 3 framebuffer px.

## 2. Advance model (VERIFIED by seams)
`advance(glyph) = (index of rightmost column with alpha>0, + 1) + 1`. A fully opaque 32 px cell advances 33; the
generator emits a corrective `-1` space after it. With this model every seam is exact. Keep using it.
Space font: `advances` for chars U+E000+k = +2^k and U+E020+k = -2^k (k = 0..10) worked, including long negative moves
(-201 = -128 -64 -8 -1 written as 4 chars).

## 3. THE WRAP RULE (VERIFIED, this was the one real bug)
The text widget wraps a line as soon as the **running** advance exceeds its text width (= `plain_message.width` - 8).
The running advance peaks at `W + 1` after the last glyph of a row (the glyph advance includes the +1) BEFORE the corrective
move. With `width = W + 8` the 7th tile of the first row overflowed (201 > 200), the client wrapped, rows 2..n landed on
line 2 (9 px lower), centred differently => garbled picture. **Fix: `plain_message.width = W + 8 + 4`** (extra even margin;
the single line is then centred inside the widget, which is what we want anyway). Never let the running advance exceed
`width - 8`, also for hit-glyph runs. Final move must land at exactly W, then the empty "\n" lines.

## 4. Datapack dialogs trigger the "experimental settings" screen in singleplayer (DECOMPILED + VERIFIED)
`ResourceManagerRegistryLoadTask` gives registry entries from any non-"known" pack `Lifecycle.experimental()`, and
`WorldOpenFlows.openWorldCheckWorldStemCompatibility` then shows the backup-confirm screen ("使用實驗性設定的世界不受支援",
buttons: 建立備份後載入 / 我知道我在做什麼！ / 取消) **every time the world is opened**. So any pack that adds
`data/<ns>/dialog/*.json` makes singleplayer worlds show that screen (servers: no screen).
Workaround that was VERIFIED: **inline dialogs from functions**. `data/<ns>/function/show_<page>.mcfunction` containing one line
`dialog show @s {<dialog as SNBT>}` (JSON -> SNBT: same structure, quote keys, escape `"` and `\`; mixed-type lists like
`["", {...}, {...}]` are valid since 1.21.5; raw private-use characters in the UTF-8 file are fine). No registry entry =>
no warning. Navigation inside such menus uses `run_command` with `function <ns>:show_<page>` (needs permission level 2:
singleplayer with cheats / ops only). The exporter must therefore offer two output modes:
 1. `registry` (default; servers; `show_dialog` navigation; singleplayer shows the warning once per world open),
 2. `functions` (singleplayer/maps with cheats; no warning; `/function` navigation; open with `/function <ns>:show_<first>`).
Say this clearly (zh-TW) in the export dialog.

## 5. Auto-test hook the exporter should emit (Hermes uses it; no mouse needed)
Optional third data pack `autotest` (flag `--autotest` in the CLI): `load` function creates objective `mcms_t`; `tick`
function increments it for all players and, at t = 120 + 800*k ticks, runs `say PAGE <pagekey>` then shows page k
(registry mode: `dialog show @s <ns>:<key>`; functions mode: `function <ns>:show_<key>`). Hermes polls `latest.log` for the
`PAGE <key>` marker and takes a screenshot. Keep each page up 40 s.

## 6. Pack metadata (VERIFIED: loaded without warnings)
resource pack `pack.mcmeta`: `{"pack":{"description":"...","min_format":97,"max_format":97}}`;
data pack: `min_format`/`max_format` 121. Worlds auto-detect packs dropped into `<world>/datapacks/<name>/`.
Resource pack selected via options.txt `resourcePacks:["vanilla","file/<zip name>"]` (Hermes does this).

## 7. NOT TESTED yet (do not claim these in the UI/README as verified)
- click events on glyph runs and the invisible alpha=1/255 hit glyph boxes; hover tooltips; `show_dialog` navigation;
  `after_action: none` semantics of the footer button; behaviour when the picture is taller than the window (scroll);
  GUI scales 1/2/4; text shadow (none observed on bitmap glyphs); multiplayer; Bedrock.
  Hermes needs desktop-click approval from the user to test clicks; until then these stay "assumptions".

## 8. Chrome metrics for the in-game mock preview (measured, GUI scale 3, 1280x720 window = 853x480 MC px)
picture top y = 67 MC px; picture horizontally centred; footer button ~ (150x20) ending ~6 px above the bottom edge;
title baseline ~16 px from the top. Keep these in one constants object; they will be refined later.

## 9. Drop shadow (VERIFIED in game + DECOMPILED)
Vanilla draws a drop shadow behind these glyphs: screenshots show a 1 MC-px band of RGB(63,63,63) (= 25% of white) on the
right and bottom edges of every picture. **Every run must carry `"shadow_color": 0`** (transparent). DECOMPILED:
`Font.PreparedTextBuilder.getShadowColor` returns the style value when present, and the shadow is only drawn when it is != 0.
`shadow_color: 0` has NOT been seen in game yet (Hermes will check when the exporter exists), but it is the documented
mechanism. A shadow also makes the click box 1 px larger on the right/bottom (see 10).

## 10. Click hit-testing algorithm (DECOMPILED from 26.3 jar; NOT yet clicked in game)
`ActiveTextCollector.ClickableStyleFinder.accept` -> `findElementUnderCursor`: if the mouse is inside the union of all glyph
quads of the line (`PreparedText.bounds`, so the whole picture area, not just the 9 px line band), the client visits every
glyph AND every "empty area" (space glyphs) and each one whose active rectangle contains the point and whose style has a
click_event OVERWRITES the result => **the last glyph in text order that contains the point wins** (z-order = text order).
Active rectangle of a bitmap glyph = its drawn quad: x from the cursor to cursor + FULL CELL WIDTH (not the trimmed advance),
y from `line_y + (7 - ascent)` to `+ cell height`; +1 px right/bottom only if a shadow is drawn. Hence: a hit glyph whose cell is
exactly region w x h (every pixel alpha = 1/255, so `getActualGlyphWidth` is full width and the shader discards the pixels)
gives exactly that rectangle. Hit glyph runs must come after everything else they overlap. Space glyphs carrying a click
style are clickable over their POSITIVE advance only (and only in the first line's 9 px band): never put click/hover events
on space runs; put them on the glyph run only (spaces in separate runs).
Hover tooltips use the same walk (hover_event). Mouse hit test happens in GUI coordinates of the widget; scrolling the body
moves the pose, hit-test follows.

## 11. Bitmap provider facts (DECOMPILED)
`pixelScale = height / cellHeight` (height = provider `height` field). Keep `height == cell height` so
`advance = (int)(0.5 + actualWidth) + 1 = actualWidth + 1`. `ascent <= height` (error otherwise). The `chars` grid must be
rectangular; pad with `\u0000`; cell = png size / grid. `getActualGlyphWidth` scans columns right to left for any pixel with
non-zero alpha (luminance-or-alpha != 0). Declaring a codepoint twice only logs a warning (last wins).

## 12. STAGE B EXPORT, REAL CLIENT RESULTS (Hermes, 26.3, singleplayer, GUI scale 3) — functions mode
Installed `exports/demo/functions/{resourcepack.zip,datapack.zip,autotest.zip}` exactly as a user would (zips in `resourcepacks/`
and in the world's `datapacks/`), opened the world, autotest showed every page. Load log: no WARN/ERROR from the packs.
- VERIFIED: all 9 pages render correctly (calibration, lobby, lobby_rules, rules, rules_welcome, shop, quick, settings, notice): no wrap,
  no garbled rows, tile seams invisible, corner squares at the exact corners, grid lines continuous. Picture is centred; its top is
  67 MC px below the window content top, identical for pages 160..214 px tall.
- VERIFIED: `shadow_color: 0` works: the right/bottom edge of the white frame has the same profile as the left/top edge (no 25%-grey
  band that the spike showed without it).
- VERIFIED: `dialog show @s {SNBT}` with ~1-2 KB of private-use text per page is accepted; the unzipped zip data packs are picked up
  from `datapacks/` without `pack.mcmeta` complaints (min_format = max_format = 121).
- Numeric check (window screenshot rescaled by 1.8363, mean abs diff over opaque pixels vs source bitmap, minimum at the expected
  position, +1 screenshot px shift raises it by 3-6 levels): shop 5.4, settings 4.9, notice 6.8, rules_welcome 7.5, rules 9.2, quick 12.6
  (sharp glow lines); a wrong page gives 128.
- NOT TESTED (no input possible while the user sleeps; computer_use clicks/keys need approval): clicks, hover tooltips, footer button,
  Esc, G key, registry mode (needs one click on the experimental-settings screen), servers.

## 13. DECOMPILED (26.3 client): what a click really does
`AbstractStringWidget.mouseClicked` -> `ClickableStyleFinder(font, (int) mouseX, (int) mouseY)` over `visitLines` -> winner style ->
`DialogBodyHandlers.runActionOnParent` -> `DialogScreen.runAction(event)` which applies the dialog's `after_action`:
- `none`: the screen stays (`setScreen(this)`). The footer button of a `notice` dialog then does NOTHING (it only runs its own
  optional action and stays); Esc still closes (`onClose` always uses CLOSE if `can_close_with_escape`).
- `close` (exporter default): after ANY body click (command, copy, url) the dialog closes (screen := previousScreen, normally null).
  `show_dialog` opens the next dialog with the same previousScreen, so navigation works with either setting.
- `wait_for_response`: shows a waiting screen until the server answers (plugin `custom` actions).
- `run_command` goes through `ClientPacketListener.sendUnattendedCommand` which first runs `verifyCommand`:
  parse error -> confirm screen; signable arguments (say, msg...) -> "can only be run from chat" confirm; **command that needs
  elevated permissions (it does not parse with the permission-less suggestion provider: time, weather, gamemode, give, function, dialog,
  execute...) -> confirm screen "multiplayer.confirm_command.permissions_required" ("This command requires elevated permissions.
  This might negatively affect your game. Are you sure? Command: ...", button "Run Command") EVERY time, even for ops / cheats-on
  singleplayer.** Only commands that parse without permissions (e.g. `/trigger`, `/list`, `/help`) run silently.
  `show_dialog`, `copy_to_clipboard` do not confirm; `open_url` shows the link confirm screen if the chat-link prompt option is on.
=> consequences: (a) functions-mode navigation `function ns:show_x` always shows the confirm screen; (b) menus that run privileged
commands are clumsy and do not work for normal players; (c) the plugin-free solution is a **trigger objective** (`/trigger <obj> set N`
is permission level 0): buttons run `trigger`, a tick function dispatches N -> the real command as the player (function permission
level), re-enables the objective every tick. This is the planned "trigger mode".

## 14. STAGE C RESULTS (Hermes, real 26.3 client, singleplayer, functions mode + trigger mode, autotest)
- VERIFIED server side: autotest `TRIGGER time_day id 9` (= `trigger mcms_mcms_demo set 9` run as the player) followed 1 s later by
  `TRIGGER CHECK time_day OK`: the chain trigger objective -> `trigger_tick` (as @a at @s, function permission) -> `time set day`
  works in 26.3; `trigger_load`/`trigger_tick` tag entries written as `{"id":..., "required":false}` load fine.
- VERIFIED: `TRIGGER nav_lobby id 2` (= `function mcms_demo:show_lobby` dispatched by trigger_tick) replaced the open `notice` dialog by
  `lobby` (window screenshot diff vs the lobby preview 3.87, same as the direct lobby shot). So page navigation by trigger works.
- VERIFIED: all 9 pages again pixel-correct with the Stage C export (mean abs diff vs source 3.9-14.9, wrong page 126); the corner
  squares of the calibration page have the exact colours at the exact corners; frame width 470 px = 256 GUI px * 1.8363.
- BUG FOUND BY THE RUN (fixed, commit 05131c1): the autotest used `time query daytime`, which does not exist in 26.3 (timelines/world
  clocks): "Whilst parsing command on line 23 ... 'minecraft:daytime' of type 'minecraft:timeline' not found" made the whole
  `mcms_autotest:tick` function fail (no PAGE markers at all). Now `time query minecraft:day`. Always check `latest.log` ~15 s after
  launch for `Failed to load function`.
- VERIFIED (offline, Mojang's own codec, no game): `Dialog.DIRECT_CODEC` parses all 9 registry-mode dialog JSONs of the Stage C export
  (`DialogCheck.java` in the minecraft-jar-inspection skill; negative control with a bogus after_action / width 5000 / unknown click
  action fails as expected).
- DECOMPILED: `/trigger` has no `requires` in `TriggerCommand.register`, so the client's permission-less parse accepts
  `trigger <obj> set N` and `verifyCommand` returns NO_ISSUES (no confirm screen). Not seen by clicking.
- STILL NOT TESTED (needs the user's approval for computer_use input, or a person at the keyboard): real mouse clicks (hit boxes,
  `after_action: close` after a click, footer button, Esc), hover tooltips, no-confirm-screen for `/trigger` clicks, G key,
  registry mode in singleplayer (needs a click on the experimental-settings screen) and on a server, other GUI scales/window sizes.

## 15. SAO-STYLE PROOF OF CONCEPT + FIRST HOVER OBSERVATION (Hermes, real 26.3 client, singleplayer, functions + trigger mode)
`scripts/sao-poc.ts` (`npx tsx scripts/sao-poc.ts`, not part of the editor) draws two 340x210 pages with plain canvas vector code
(silver circle icon column, orange selection + pointer notch, translucent panel at 93% alpha, gradients, anti-aliased CJK text),
hands them to the real exporter (`buildExport`, functions mode, trigger commands, autotest) and writes `exports/sao-poc/`.
Screenshots: `exports/screenshots/7-sao-items-ingame.png`, `8-sao-status-ingame.png`.
- VERIFIED: both pages render cleanly: translucent panel lets the blurred world through, anti-aliased edges, CJK text, 119 unique tiles,
  no visible seams or wrapped rows. Vanilla chrome is unchanged: title + warning button at the top centre, the footer button ("登出")
  at the bottom, blurred world behind. Nothing of that can be removed by the picture.
- VERIFIED (first hover seen): the OS cursor parked at the window centre was over region "體力 VIT 20" of `sao_status`; the screenshot
  shows the vanilla tooltip with exactly that text next to the cursor. So `hover_event` on a hit glyph works. Clicks are still NOT TESTED.
  Tip: a parked cursor is a free hover test, put a tooltip region under the window centre.
- VERIFIED: autotest trigger chain again: `TRIGGER time_day id 3` + `CHECK OK`, `weather_clear id 4`, `nav_sao_status id 1`, no errors.
- Design limits that stay (inference from how Dialog works, except where marked): a Dialog is a modal screen, so it cannot be a HUD
  (health bar, party list, mob cursors) and cannot replace the pause menu (a dialog can only add a button to it via the
  `#minecraft:pause_screen_additions` tag, minecraft.wiki Game_Menu). Picture position is fixed (centred), static pictures only in this
  exporter. See `docs/LANDSCAPE.md` for what other tools claim (motion, HD, typing in a drawn box): NOT verified by Hermes.

## 16. HOW BIG CAN A PAGE BE? (Hermes, 26.3; one real-game run + decompiled layout code)
VERIFIED in the real game (window 1280x720 pt = 2560x1440 framebuffer, GUI scale 3 = GUI 853x480):
- `scripts/size-poc.ts` set `s480`: the SAO-style pages baked at 597x336 (k = 1.6 of the 340x210 design) = 70.0% x 70.0% of the GUI.
  Both pages render cleanly (no seams, no wrapped rows, anti-aliased CJK text, translucent panel, no scrollbar); picture top stays at 67.
  Vertical offsets up to 320 px work (earlier verified only to 288: `MAX_VERIFIED_OFFSET` in constants.ts can move to 320).
  A hover tooltip ("麵包 ×12") showed up from the parked cursor, so hover on a tile region works at this size too.
  Cost: 416 tiles (229 unique) for 2 pages, resourcepack.zip 113 KB, datapack.zip 4.1 KB (functions mode), 100 text components.
  Screenshots: `exports/screenshots/9-sao-70pct-items.png`, `10-sao-70pct-status.png`.
DECOMPILED (not run for S < 480; details and formulas in the minecraft-jar-inspection skill, references/dialog-layout.md):
- Header 33 + footer 33. Body = ScrollableLayout, max height S - 66, reserves 20 px of width. Content sits at y = min(63, S - 33 - h): it
  moves up before it scrolls, and scrolls only when taller than S - 66. plain_message widget height = 9 * lines + 8; a trailing "\n" adds an
  empty line (StringSplitter.splitLines), so the exporter's `ceil(H/9)` newlines reserve ONE LINE (9 px) more than the picture needs.
- No-scroll max picture height (current exporter): H <= 9 * floor((S - 83) / 9): S=270 (1080p, GUI "auto" = 4): 180 = 67%;
  S=240 (1440p auto = 6): 153 = 64%; S=256 (1366x768 auto = 3): 171; S=360: 270 = 75%; S=480: 396 = 82%. With one newline fewer: +9 px
  (S=270 -> 189 = exactly 70%). NOT TESTED.
- Auto GUI scale = Window.calculateScale: largest s with fbW/s >= 320 and fbH/s >= 240 (+1 if odd with forceUnicodeFont).
- Width is never fitted to the screen: a page wider than about (GUI width - 32) is expected to be cropped on both sides. NOT TESTED.
- `src/core/game/chrome.ts` `widgetSpace` (= S - 100) is 34 px more pessimistic than the code above and ignores "moves up before it scrolls";
  the editor therefore warns "高度不足" earlier than the game scrolls. Fix it after the in-game check below.
NOT TESTED / BLOCKED: a launch with window 960x540 + `guiScale:0` (= 1080p auto, GUI 480x270) to see the scroll threshold, the scrollbar,
the container moving up and a too-wide page. The script was blocked by the approval flow (no answer within 5 minutes) and was not retried.
Material is ready: `exports/size-poc/s270` (fit180 336x180, over189 336x189, sao_items 340x210, wide520 520x100). To run it: set
`MinecraftWinWidth=960`, `MinecraftWinHeight=540` in the Prism instance.cfg and `guiScale:0` in options.txt, install the s270 packs, run the
autotest + `shot_loop.py`, restore both files. Expected if the code reading is right: fit180 has its top frame line at about y = 44 (not 67),
over189 and sao_items show a scrollbar with the footer button still visible, wide520 is cropped at both sides.

## 17. LARGEST PAGE AT GUI 853x480 (real game: window 1280x720 pt, GUI scale 3) AND WHY SAME-SIZE PAGES DIFFER
`scripts/max-poc.ts` (set `m853`), screenshots `exports/screenshots/11..14`. Scale 1.8363 screenshot px per GUI px.
VERIFIED in the real game:
- SAO page 821x396 (the 340x210 design at k = 396/210): complete down to the bottom row, NO scrollbar. It spans x 16..837 of 853
  (96.2% of the width) and y 38..434 of 480 (82.5% of the height). The frame page of the same size measures 1507 x 726 screenshot px
  = 820.7 x 395.4 GUI px. Title and warning button stay at the top, the footer button at the bottom; nothing can be drawn over them
  (scissor of the scroll container) and the left/right margin is 16 px (10 scrollbar reserve + 6 widget padding).
- Frame page 821x396 (same size): complete picture but WITH a scrollbar; frame page 821x405: scrollbar, shorter thumb. Thumb sizes give
  content heights of about 422 and 431 GUI px (= 46 and 47 lines of 9 px + 8), one line more than `1 + ceil(H/9)` predicts for both.
- Page 1012 px wide in an 853 px GUI: starts at the same 16 px left margin and is cropped on the RIGHT only (not centred), no garbling,
  tooltip still works.
- Hover from the parked cursor works again (tooltips "麵包 ×12", "821x396（頁面中央）").
EXPLANATION (DECOMPILED + offline simulation of the text splitter over the exported function files reproduces 45 / 45 / 46 lines):
- `FocusableTextWidget.updateHeight()` counts lines with `font.split(message, super.getWidth())`, and `MultiLineTextWidget.getWidth()` is the
  width of the WIDEST LINE (= W, the final cursor of our first line), not the widget's max width. Rendering still wraps at W + 4 (width - 8).
- Our first line's running advance peaks at W + 1 whenever a row ends with a tile whose right-most column is opaque (picture touches its
  right edge, e.g. a frame). The height pass then wraps that line once => one extra empty line (9 px) in the widget height. Nothing visible
  changes. The SAO page keeps its right margin transparent (peak = W) so it has no extra line.
- So lines = 1 + ceil(H/9) + (peak > W ? 1 : 0); no scroll iff 8 + 9 * lines <= S - 66 (container max height).
  S = 480: H <= 396 when the right edge is transparent, H <= 387 when it is not (measured: 396 clean for SAO; 396 scrolls for the frame; 405 scrolls).
- Fix candidates for the exporter (NOT done): end the first line with a few extra pixels of space so that W_line >= peak (re-centre by the
  same amount), and emit ceil(H/9) - 1 newlines instead of ceil(H/9) (the picture needs ceil(H/9) lines in total). Together +18 px of height.
- The editor's mock (`chrome.ts`: `widgetSpace` = S - 100) is wrong in both directions: use container max = S - 66, y = min(63, S - 33 - h).
OFFLINE CODEC CHECK (Mojang's own Dialog codec via DialogCheck): `plain_message.width` must be within [1;1024] (1024 ok, 1025 fails), so the
widest possible picture is 1024 - 12 = 1012 px.
NOT RUN: GUI scale 2 (GUI 1280x720, predicted largest 1012 x 630 / 621 when touching the right edge) and the "frame page first" order test.
The second launch of this session was held back by the approval prompt (no answer after 5 minutes) and was not retried.
