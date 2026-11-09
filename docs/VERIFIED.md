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
