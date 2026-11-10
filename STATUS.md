# STATUS — Stage H (export resolution 1x-4x) — done; 2x-4x not run in the game yet

## Stage H: what changed

Owner: 「文字模糊」 (text on the editor canvas). Hermes proposed rendering the pictures at a higher resolution, the
owner chose it. A project setting 解析度 (`ProjectSettings.renderScale`, 1-4, default 2) gives every exported picture
scale x scale texels per GUI px; the layout (message width, lines, offsets, hit boxes, wrap rule) stays in GUI px.
Commits: e9348f8 (renderer), 91339f2 (export pipeline, model, CLI, goldens), plus the editor/docs commit.

- Renderer (`src/core/render/`): `RenderOptions.scale` (default 1). `renderPage` multiplies the transform by it (inside
  its save/restore), `renderPageToCanvas` allocates page px x scale. Shapes, skins, icons = exact scale x scale blocks
  (test: 2x-4x equal the nearest upscale of 1x); images keep their smoothing flag at the higher resolution.
- Text (`text.ts`): `layoutText` = wrap, alignment, vertical align, line height in page px from the 1x font metrics
  (identical line breaks at every scale); glyphs rasterised at font size x scale; shadow offset = scale texels
  (1 page px); bitmap copied with `drawImage(bmp, x, y, W, H)`, smoothing off (texels 1:1); cache key includes the
  raster scale; cache has a 6,000,000-texel budget besides the 300 entries.
- Pixelate: `on` = rasterise at 1x, threshold, scaled up nearest (same retro look at every scale); `auto` (<= 13 px)
  only at scale 1; `off` anti-aliased at scale. Buttons and bars use the `auto` rule.
- `render/scale.ts`: `RENDER_SCALES`, `isRenderScale`, `MAX_CANVAS_PIXELS` = 16,000,000, `fitScale` (display fallback).
- Exporter: `ExportOptions.scale` (default 1, so old callers and the PoC scripts are unchanged); `ExportPage.width/height`
  (page px, optional: else image / scale) and a check that every image is page px x scale. `TileSet(T, scale)` cuts
  T x scale texel cells, actual width in texels; `bitmapAdvance(aw, height, cellHeight)` in constants.ts implements the
  decompiled advance with float math (doc comment quotes the source); tiles use `glyphAdvance(aw, scale)`. Sheets:
  cells of T x scale texels, font JSON `height` = T, `ascent` = 7 - N as before; hit glyph sheets stay 1x.
  `T = tileSize ?? 32/32/24/16` for 1x/2x/3x/4x; `T x scale > 255` is an ExportError. Stats: `scale`, `cellTexels`.
- `exportPagesFromProject` renders at `project.settings.renderScale` (or an explicit scale); `checkExport` adds the
  error `export-canvas-size` above 16,000,000 texels per page (hint: lower the resolution). Calibration page at the
  export's scale = nearest upscale of the 1x picture.
- Model: `renderScale` in `ProjectSettings`, `DEFAULT_RENDER_SCALE` = 2; load (localStorage), import (JSON) and
  templates go through `normalizeProject`: missing or invalid values become 2.
- Editor: `RenderScalePicker` (segmented 1x 像素風 / 2x 建議 / 3x / 4x 最清楚, tooltips 1x：像素風、檔案最小 etc., hint
  for the selected option + 「遊戲介面大小 ÷ 解析度」是整數時最清楚) in the export dialog (基本設定) and in
  屬性 → 專案 after 預設字型; one undo step per change. Export dialog stats row 「解析度（圖塊、字型格）」, e.g.
  `2x・32 px・64×64`, next to the pack sizes. Canvas: bitmap at the project scale (fitScale cap), CSS rule
  `crispAt(zoom, dpr, scale)` = nearest when zoom x dpr >= scale. Game preview: page at the project scale, backing
  canvas GUI px x `previewDensity` = min(scale, GUI scale), page drawn nearest at its GUI size, mock chrome through the
  same transform; info line 「解析度 Nx」, in amber 「（高於 GUI n，遊戲會略過部分像素）」 when the scale exceeds the GUI scale.
- README_zh-TW.txt (every export): 【文字清晰度（解析度）】 = resolution used, tile/cell size, GUI rule, jagged edges above
  the GUI scale, measured demo sizes. HANDOFF.md: resolution line + a "Resolution" section with in-game checks.
- CLI: `npm run demo:export -- --scale N` (1-4; default the templates' 解析度 = 2x). `exports/demo` regenerated at 2x.
- PNG encoder: the five filter sums in one pass (same heuristic and tie-break, byte-identical output).
- `vitest.config.mts`: `testTimeout` 60 s (the demo-page tests already timed out at 5 s on this busy machine before
  Stage H; they now also run at 2x-4x). ExportDialog tests wait up to 20 s for a build; the two mode tests pin the
  lobby template to 1x (their pre-Stage-H cost), the new 解析度 test uses a one-page project.

### Stage H decisions (nobody could be asked)

- Default 2x: every texel is a whole number of screen px at GUI 2 and 4 (the usual auto scales), 1.5 px at GUI 3 (no
  texel dropped), only GUI 1 drops texels. Old projects load as 2x too, so their next export becomes 2x (bigger).
- Tile table 32 / 32 / 24 / 16 GUI px (cells 32 / 64 / 72 / 64 texels) as the brief suggested; `tileSize` stays an option.
- Preview density = min(scale, GUI scale) instead of the brief's "scale x GUI px": the game samples the glyph textures
  at screen px, so drawing the page nearest into a canvas of GUI-scale density drops exactly the texels the game drops
  (same nearest rule); it also keeps the preview canvas <= the window size (2560x1440 at most), so it needs no cap.
- Alignment (centre / right) uses 1x metrics like the line breaks, so at 2x+ a line can sit up to about one texel off
  its ideal hi-res position (identical layout at every scale was the priority).
- The README paragraph is in every export, also at 1x; at 1x the README therefore differs from d39d556 by that
  paragraph, while resourcepack.zip, datapack.zip and autotest.zip of both modes are byte-identical (cmp against a
  copy of the d39d556 export taken before any change). Text-free page hashes from d39d556 are pinned in a test.
- The brief's example "3x, T 24: 71 texels -> 24" contradicts fact 2: (int)(0.5 + 71 x 0.33333334) + 1 = 24 + 1 = 25.
  The tests follow fact 2: 72 -> 25, 71 -> 25, 70 -> 24 (and two float cases outside the 1/scale ratios, where float
  math gives a different result than exact or double math: (11, 13, 22) -> 7, (11, 15, 22) -> 9).
- Measured growth is not scale^2: the 2x pack is 5x the 1x pack (small text becomes anti-aliased instead of
  pixelated, which compresses worse), 3x 7.5x, 4x 10x (flat areas compress well). Docs and README give measured numbers.
- The 16,000,000-texel guard cannot trigger for pages the editor allows (1000x600 at 4x = 9.6 Mpx); it covers
  hand-edited files. The export refuses (error), canvas and preview fall back to a lower scale for display only.

### Stage H measured (demo export, 9 pages, `npm run demo:export -- --autotest --scale N`)

| scale | tile / cell | tiles placed (unique) | glyphs | fonts (max y) | components | resourcepack.zip | datapack.zip reg / fn |
|-------|-------------|-----------------------|--------|---------------|------------|------------------|-----------------------|
| 1x | 32 / 32 | 604 (458) | 471 | 26 (192) | 205 | 91,093 B (89 KB) | 9,969 / 9,846 B |
| 2x | 32 / 64 | 604 (459) | 472 | 26 (192) | 205 | 454,118 B (443 KB) | 9,973 / 9,848 B |
| 3x | 24 / 72 | 1054 (690) | 703 | 28 (192) | 223 | 683,076 B (667 KB) | 10,731 / 10,576 B |
| 4x | 16 / 64 | 2304 (1273) | 1286 | 33 (208) | 262 | 910,498 B (889 KB) | 12,423 / 12,292 B |

CPU (this machine, heavily loaded): PNG encoding is the bulk of an export, about 0.35 s per 1024x1024 sheet (zlib
level 9 alone 0.15 s); the "lobby" template end to end (render + build + zip) took 0.5 s at 1x and 1-4 s at 2x-4x
under a load average of 50-150.

### Stage H tests (+32, 193 total)

`render-scale.test.ts` (9: canvas size and bad scales, text-free pages unchanged at 1x and exact blocks at 2x-4x, images
and smoothing, label line breaks at 2x/3x, layoutText, pixelate rules, shadow offset, cache key, canvas guard),
`export-scale.test.ts` (10: advance at 1x, hand values at 2x-4x, float cases, tile table, 255 limit, sheet sizes and
font heights, scale-invariant regions / hit boxes / width / lines, image size checks, project scale + canvas guard,
README), `export-golden.test.ts` (+6: calibration at 3x, client walk of every demo page at 1x/2x/3x/4x = decode sheets
and font JSON, compute advances like the client, walk the line, every glyph on its tile, pixel-exact at texel
resolution; 2x goldens in both modes), model (+1 migration), persistence (+1 old save loads at 2x), CLI args (+1),
`CanvasTouch` (+1 canvas = page px x scale, crisp rule; the 1x test pinned to 1x), `GamePreview.test.tsx` (2: density,
renders at 1x-4x with the page bitmap drawn at its GUI size), `ExportDialog` (+1 the control sets the setting, stats
follow), `crispAt` cases in the existing viewAnimation test. The client simulation (`helpers/clientSim.ts`) now reads
scaled cells (fact 1/2 re-implemented, not imported) and refuses cells > 255 texels.

### Stage H: checked by Hermes (2026-11-10; no Minecraft launched)

The owner looked at the result in the editor, said it looks fine and asked to stop testing, so the in-game part below stays open.

Checked:
- Own run (not only the agent's): `npm run lint`, `typecheck`, `test` (21 files, 193 tests) and `build` all exit 0.
- `--scale 1` demo export (functions mode, with auto-test) is byte-identical to the export of d39d556: sha256 of
  resourcepack.zip, datapack.zip and autotest.zip against a baseline made before Stage H started. The default export is
  byte-identical to the committed `exports/demo`.
- `bitmapAdvance` / `glyphAdvance` against a reference compiled with the game's own JDK that copies the decompiled float
  arithmetic (`(int) (0.5 + actualWidth * pixelScale) + 1`, `pixelScale = (float) height / cellTexels`): 2,836 combinations
  (tile 8-128, scale 1-4, every actual width) match. The agent was right that scale 3, 71 texels gives 25 (the brief said 24).
- Pack structure read back from the zips: square tile cells of 32 / 64 / 72 / 64 texels with JSON `height` 32 / 32 / 24 /
  16 at scale 1 / 2 / 3 / 4; tile sheets 512 / 1024 / 1152 / 1024 px wide; 26 / 26 / 28 / 33 y-offset fonts; hit-glyph
  sheets identical. `resourcepack.zip` of the demo: 89 KB, 443 KB, 667 KB, 889 KB (2x is about 5x of 1x).
- Browser (Chrome emulation, desktop 1440x900 @2x): the 解析度 picker in 屬性 → 專案 stores `renderScale` and re-renders the
  page canvas at 1 / 2 / 3 / 4 texels per page px (a 340 px page gives a 340 / 680 / 1020 / 1360 px canvas); the canvas stays
  `pixelated` at 352 % zoom for every scale; a stored project without the setting loads as 2x. At that zoom the 1x text is
  blocky and strokes merge (歡 迎 選 擇 and the small card captions), 2x shows separate strokes, 3x / 4x add only a little
  smoothness over 2x. This is the editor canvas; it says nothing about the game.

Not verified (open):
1. In the game: calibration seams exact at 2x, no missing-glyph boxes, hit boxes unchanged; `lobby` text at GUI 2 / 3 / 4.
2. `--scale 3` (24 px tiles of 72 texels, pixelScale = float 1/3, the likeliest off-by-one) and `--scale 4` (16 px tiles,
   offsets up to 208): seams, clicks, tooltips. 4x at GUI 2 / 3 should look jagged (predicted from the nearest sampler).
3. Export dialog layout (not opened by Hermes), game preview with 4x at GUI 1-3, a real phone with 4x on a large page.

### Stage H: left rough

- `docs/images/export.jpg` predates the 解析度 control (no browser here to retake it).
- Exports still run on the main thread; a 4x export of a big project can block the dialog for a few seconds.
- Template thumbnails (範本 dialog) still render at 1x.
- `npm test` is slower (about 20 s at a load average of ~60, 87-112 s at ~110-125 here; Stage G was ~5 s) because the client
  walk renders every template at four scales.
- The PoC scripts compile; `sao-poc` was run with a temporary output dir and reproduced its packs byte for byte; the
  others were not run (they write into `exports/size-poc`, which must not be touched).

# Stage G (smooth zoom) — done

## Stage G: what changed

Owner: 「縮放不夠絲滑」. Hermes measured (Chrome device emulation, page canvas width every frame): a pinch took only
whole zooms (340 → 680 → 1020 px), ctrl + wheel 7 whole steps, buttons / keys / fit / double tap jumped in one frame;
the frame rate was fine (median 16.7 ms, also with 4x CPU throttle). So: continuous zoom plus animation, no new
rendering path (the page is still one bitmap canvas scaled by CSS, overlays at `x * zoom`). Exporter, renderer, data
model and persistence untouched (zoom / pan are not saved). Commits: 3eb4ecb (math + tests), 62ef3f7 (animator +
canvas + tests), plus the docs commit.

- `src/core/viewAnimation.ts` (pure): zoom ladder + `ladderStep`, `settleZoom`, `rubberBand`, `easeOutCubic`,
  `interpolateView` (zoom changes geometrically, the pan keeps the fixed point of the change still, so a zoom made
  around an anchor stays anchored on every frame; ends exactly on the target), `zoomViewAround`, `restView` (whole
  zoom → pan rounded), `wheelZoomFactor`, `approachZoom` (wheel smoothing in log scale), `crispAt`, the constants.
- `src/core/gestures.ts`: `pinchZoom` / `pinchView` no longer round (zoom follows the fingers, pan stays a float),
  optional overshoot. `src/core/geometry.ts`: `MIN_ZOOM` 0.25 (`MAX_ZOOM` 8), new `fitZoom` rule, `zoomAround` no
  longer rounds. `panBy` (one-finger pan) and `keepInView` (stage resize) still round: they work at rest.
- `src/app/editor/useViewAnimator.ts`: `ViewAnimator` + `useViewAnimator()`, the only code that moves the view over
  time: `animateTo(view, ms)`, `zoomBy(factor, anchor)` (wheel), `follow(view)` (pinch: one `setView` per animation
  frame), `settle(anchor)`, `target()`, `cancel()`, `finish()`, `dispose()`. A frame is requested only while there is
  work (no permanent rAF loop); disposed on unmount and usable again after a StrictMode remount. With
  `prefers-reduced-motion: reduce` targets are applied at once (the pinch still follows the fingers).
- `CanvasView.tsx`: the three zoom paths (zoomStep, wheel handler, key handler) now go through the animator.
  - Pinch: fractional zoom around the finger midpoint plus two-finger pan, rubber band up to 10 % past 25 % / 800 %;
    when the first finger lifts (or on pointercancel) it settles around the last midpoint.
  - Wheel: ctrl + wheel (trackpad pinch) and small deltas zoom continuously, a mouse notch 1.2x; target zoom eased
    around the cursor; 150 ms after the last wheel event the same settle as a pinch. Shift / Alt + wheel pans as
    before (stops a running zoom first).
  - 縮小 / 放大 buttons (compact and toolbar) and the = + - keys: next ladder stop, eased around the stage centre;
    pressed again while it runs, they step on from the stop being approached. 符合視窗, the 0 key and a double tap on
    empty space ease zoom and pan to the fit view; switching pages and the first layout still fit at once.
  - Any pointer-down on the stage or a wheel event stops a running animation where it is (no jump). A stage resize
    (compact sheet) first finishes a running zoom, then keeps the view centre as before.
  - Readout `Math.round(zoom * 100)%` (compact controls and toolbar); disabled states with a 0.001 epsilon.
  - Page canvas: `.pixelated` only while zoom × devicePixelRatio >= 1, the browser's smooth scaling below that.
  - Rulers: medium ticks at half the major step (when that is a multiple of the minor step): the same ticks as before
    at every whole zoom 1-8, and aligned at 25 % (before: 125 / 250 next to labels at 200 / 400). Overlays, handles,
    marquee, snapping, hit tests and drop positions were checked: they work in page px × zoom, no integer assumption.
  - The click-region overlay list is memoised (the canvas re-renders on every animation frame while zooming).

### Stage G decisions (nobody could be asked)

- Ladder: 25, 33⅓, 50, 66⅔, 100, 150, 200, 300, 400, 500, 600, 800 % (the brief's example; 1/3 and 2/3 exact, shown
  as 33 % / 67 %). "+" = first stop more than 0.1 % above the current (or approached) zoom, "−" likewise below; the
  ends stay. From a pinch zoom of 240 %: + → 300 %, − → 200 %.
- Settle: within 5 % of a whole zoom n >= 1 (|z − n| <= 0.05 n: 0.95-1.05 → 100 %, 2.85-3.15 → 300 %, 7.6-8 → 800 %),
  otherwise the zoom stays exactly as left (2.7 stays 270 %). 0.97 → 100 % on purpose: just under 100 % is the
  blurry, smooth-scaled case on a 1x screen and 100 % is the most useful level. Only after a pinch or a wheel zoom;
  buttons, keys and fit pick their own target. At a whole zoom the resting pan is rounded to whole CSS px (crisp
  pixels); fractional zooms keep a float pan (rounding would not make them crisper).
- Rubber band: kept (simple): log-scale damping with slope 1 at the limit, never more than 10 % past it; springs back
  with the settle animation.
- Durations (ease-out cubic): settle 120 ms, ladder step 180 ms, fit 220 ms. Wheel: time constant 70 ms (a notch is
  95 % done after about 210 ms), settle after 150 ms without wheel events.
- Wheel factor (one event never more than one notch): line / page mode or |deltaY| >= 50 = a notch (×1.2);
  ctrl + small deltas exp(−deltaY × 0.01), assuming Chrome reports a trackpad pinch as about −100·ln(scale) per event
  (not measured); other small deltas (two-finger scroll, smooth wheels; a plain wheel zooms in this editor, as before)
  exp(−deltaY × 0.002), i.e. 100 px of scrolling ≈ one notch.
- Fit: the largest whole zoom (<= 800 %) that leaves 48 px (unchanged); if none >= 100 % does, 100 % when the page
  fits with a small margin (compact 12 px, medium / desktop 24 px), else the exact fraction with that margin. "Lobby"
  340×210 on a 390 px phone stays at 100 %; 480×270 → 72 % (390×844 portrait), 87 % (844×390 landscape). A 0×0 stage
  (jsdom) gives 100 %.
- Smooth scaling only below 1 device px per page px (deviation from the brief's "zoom < 1"): on a 3x phone 72 % is still
  2.16 device px per page px, where bilinear scaling would blur the pixel art. On a 1x screen it switches below 100 %,
  on a 2x screen below 50 %.
- Pinch updates go through requestAnimationFrame; the one-finger pan and the mouse pan still update per event (browsers
  already deliver pointer moves once per frame, and Hermes measured no frame problem).
- Safari's macOS trackpad pinch (`gesturechange`, no ctrl + wheel) is still not handled: iOS Safari fires the same
  events for touch pinches, which the pointer path already handles.

### Stage G tests (+26, 161 total)

`src/core/__tests__/viewAnimation.test.ts` (ladder from whole and fractional zooms and at the ends, settle tolerance,
pan rounding, rubber band, easing endpoints, interpolation endpoints and anchor invariance, wheel factor monotonic and
symmetric, smoothing, crisp scaling), `gestures.test.ts` (80 → 120 px from zoom 2 = 3, 80 → 100 = 2.5, midpoint stays
under the fingers at fractional zooms, overshoot), `geometry.test.ts` (new fitZoom rules, unrounded zoomAround),
`src/app/editor/useViewAnimator.test.ts` (hand-driven clock: ease-out ends exactly on the target and stops asking for
frames, pinch coalescing, wheel accumulate / ease / settle, cancel / finish / dispose, reduced motion),
`CanvasTouch.test.tsx` (fake timers: a 40-move pinch gives 40 distinct zooms with one store update per frame and settles
2.96 → 3 around the midpoint; 2.4 stays; overshoot springs back to 800 %; buttons and keys step the ladder eased;
fit / double tap eased; pointer-down and wheel stop an animation; reduced motion; whole-percent readout in compact and
desktop; smooth scaling below 100 %; ctrl + wheel continuous and settles; wheel notch; Shift + wheel pans).
`mediaMock.ts` understands `(prefers-reduced-motion: reduce)`.

### Stage G: checked in Chrome with device emulation (Hermes, 2026-11-10)

Chrome emulation plus CDP touch / wheel events against `npm run dev`, sampling the page canvas' on-screen width on every
animation frame. Not a real phone, trackpad or Safari.

Before Stage G (page "lobby", 340 wide, 390×844 @3x): a pinch from 80 to 240 px apart produced 3 widths in total
(340 / 680 / 1020), a 60-event ctrl+wheel moved in whole-number steps only, buttons / keys / fit jumped in one frame.
The frame rate was never the problem (median 16.7 ms, p95 16.8, max 33 even at 4x CPU throttle).

After (page 480×270, which fits at 72 % on the phone):
- Pinch 80 → 240 px in 40 moves: 41 distinct widths (346 → 1038 px), largest step 5 % per frame, no reversals. Frame gaps
  median 16.7 / p95 16.8 / max 39 ms, and 16.7 / 16.7 / 33 ms at 4x CPU throttle.
- Pinch endings: ×2.4 (173 %) stays; a target of 196 % settles to exactly 200 % in about 4 frames; 104 % settles to 100 %;
  130 % stays; far past the limit the width peaks at 856 % while the fingers are down and returns to 800 % in about 6
  frames; far below the minimum it dips to 23 % and returns to 25 %.
- Buttons: 72 → 100 → 150 → 200 % and back, 12–13 distinct widths per step ending exactly on the stop; fit from 400 % takes
  15 frames; + is disabled at 800 %, − at 25 %. Keys `=` / `-` on desktop: 170–183 ms.
- `prefers-reduced-motion: reduce` (emulated): every button / fit step is a single frame.
- A pointer-down during a + animation stops it where it is (a touch at +116 ms stopped at 499 px instead of 510); no jump.
- Desktop ctrl+wheel: 12 events of deltaY −2 → ×1.27 (= e^0.24), 72 distinct widths, largest step 0.7 %, no reversals;
  60 events → ×3.32. One mouse notch → ×1.2, eased over about 25 frames; three notches → ×1.728.
- The page point under the cursor (ctrl+wheel in and out, three cursor positions) or under the pinch midpoint (zoom only,
  zoom plus midpoint drag, pure two-finger pan) moves by at most 0.05 page px.
- At zoom 1.5 and 1.75: a tap selects the right element, a one-finger drag of 36×24 screen px moves it by exactly 24×16
  page px, dragging a handle by 30×15 resizes by 20×10, undo restores.
- 480×270 on a 390 px wide phone: fit gives 72 % with 12 px margins, − goes 67 / 50 / 33 %. The canvas stays `pixelated`
  at 72 % on the 3x screen (zoom × devicePixelRatio ≥ 1, as designed).
- Idle: 0 requestAnimationFrame calls from the app, also 1.5 s after a zoom settled. No console errors or warnings, and none
  in the dev-server log.

Observed, not investigated:
- Desktop layout at 4x CPU throttle, 50 ctrl+wheel events: frame gaps median 33 ms, p95 50 ms. In 2 of 3 throttled runs the
  zoom dipped by about 1 % mid-gesture (2.091 → 2.060 → 2.077) while the events arrived up to 563 ms apart; not seen
  unthrottled. Probable cause (inferred, not tested): a gap above the 150 ms wheel-idle timer starts the settle towards 200 %
  before the next event arrives.
- On a 1x-DPR screen, 150 % with nearest-neighbour scaling shows visibly uneven 1 / 2 px strokes (one frame, enlarged 4x);
  on 2x / 3x screens the unevenness is much smaller. Smooth scaling while the zoom is moving and crisp at rest would avoid
  it; not tried.

### Stage G: still not verified

- A real trackpad (the 0.01 per deltaY constant is an assumption), a real phone, macOS Safari pinch (gesture events are not
  handled), a mouse that reports small pixel deltas.
- Rulers and grid lines at fractional zooms: seen only in one screenshot at 72 %.

### Stage G: left rough

- Fractional zooms >= 100 % that are not near a whole zoom (the 150 % stop, a pinch left at 240 %) have uneven pixel
  widths; grid lines are drawn at fractional positions there.
- A mouse that reports small pixel deltas instead of notches (some macOS setups) is treated like trackpad scrolling
  and zooms slowly (about 1 % per 4 px); not measured.
- The zoom readout is `aria-live` and changes on every frame of an animation.
- No fling / inertia after a pan or pinch.


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
1-8; Stage G: continuous) plus two-finger pan in one formula; a second finger cancels a move/resize in progress (`store.cancelGesture`: back
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
- Pinch zoom snaps to whole zoom levels (the editor only uses integer zoom: square pixels, rulers, grid). Replaced in
  Stage G: continuous zoom that settles on a whole zoom within 5 %.
- A touch on an element selects it at once (like mouse down), so a pinch that starts on an element selects it.
- Game preview: long press (400 ms) for the tooltip, not the first tap; a tap is always the click, as in the game.
- Compact dialogs: natural height up to the screen (export / templates nearly full height, confirm stays short).
- Compact toasts at the top (bottom has the tab bar and the selection bar).
- Page pinch-zoom stays allowed (accessibility); only the canvas stage uses `touch-action: none`.
- Drag-down-to-close for sheets: skipped (optional).

### Stage F: not verified

- Not verified: a real phone or tablet, iOS Safari and Android Chrome specifics (on-screen keyboard with 100dvh,
  `interactive-widget` is ignored by iOS Safari, `-webkit-touch-callout`), safe areas / notch, real multi-touch,
  blob downloads on phones. The jsdom pointer tests have no layout; the checks below ran in Chrome.
- Opening the editor from another device: Stage F's source-reading guess (the page loads, only hot reload is blocked) was
  wrong (Hermes, tested): with `npm run dev` the page HTML loads from a non-localhost address but never starts
  ("載入中…", 0 buttons) because Next 16 blocks `/_next/hmr` and the dev resources. Fixed in `next.config.ts` (`allowedDevOrigins` = this machine's own IPv4 addresses and host
  name, read at start-up: restart after a network change). Checked from this computer's browser through its Wi-Fi
  address and its VPN address: `npm run dev` and `npm start` both render the editor (107 buttons). The `.local` host name
  navigation timed out and is untested. A real phone has not connected yet.

### Stage F: checked in Chrome with device emulation (Hermes, 2026-11-10)

Emulated 390x844 @3x, 844x390, 768x1024, 1024x768, 320x568 with touch (`pointer: coarse`) and CDP touch events:
- No horizontal overflow at any size; `data-layout` = compact / compact / compact / medium (aside 208 + 264) / compact.
- Compact: tab bar + sheets open and close, palette tap adds an element and collapses the sheet, selection toolbar
  (nudge 1 → 8 → 16 px, 多選, 複製, 刪除, 上移, 下移), undo/redo, layer and page up/down buttons, 更多 sheet, ⋯ menu,
  export and template dialogs, game preview (GUI 1-4 row, resolution select, long press = tooltip, tap elsewhere hides it).
  Landscape: the panel opens from the right and the canvas keeps 276 px height.
- Touch gestures (exact numbers): one-finger drag of an element moved it by the drag distance, one-finger drag on empty
  space panned the view (selection kept), pinch zoomed around the midpoint to a whole zoom, two-finger drag panned,
  a double tap < 300 ms on empty space fits the page, corner-handle drag resized (96x20 → 126x34).
- Desktop (1440x900, real mouse events): unchanged layout (aside 244 + 304), mouse drag, arrow nudge, Ctrl+Z, marquee.
- Touch targets: nothing below 40 px except the opacity slider track (16 px); all text inputs are 16 px in compact.
- Bug found and fixed: the template gallery cards were squeezed to ~99 px in the phone sheet so the names and
  descriptions were clipped (grid rows may shrink below the content of an `overflow-hidden` card); `auto-rows-max` fixes it.
- Remaining small gaps: the page cannot be zoomed below 100% (fixed in Stage G: down to 25 %), so a page wider than the screen (e.g. 480x270 on a
  phone) has to be panned; the multi-selection hint in 屬性 still talks about the top toolbar and Shift/arrow keys;
  at 320 px wide the project name field is hidden.

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
npm test               # vitest: 193 tests (~20 s; longer on a busy machine)
npm run build          # production build
npm run demo:export -- --mode both --autotest                    # trigger mode (default), 2x -> exports/demo/ + HANDOFF.md
npm run demo:export -- --autotest --scale 1 --out exports/demo-1x   # same pages at 1x (also 3, 4)
npm run demo:export -- --mode both --autotest --commands direct --out exports/direct   # Stage B behaviour
npm run preview:skins  # PNG previews of templates/icons/game mock -> exports/previews/
```

Phone check (Hermes): any browser's device mode, e.g. 390x844, 844x390, 768x1024 with touch emulation, and 1024x768;
`[data-layout]` on the editor root tells the tier.

Last run (Stage H): `npm run lint`, `npm run typecheck`, `npm test` (193/193) and `npm run build` all exit 0;
`npm run demo:export -- --autotest` regenerated `exports/demo` at 2x.

Last run (Stage G): `npm run lint`, `npm run typecheck`, `npm test` (161/161) and `npm run build` all exit 0. Demo export
not re-run (exporter, renderer and data model untouched; the golden export tests pass).

Last run (Stage F): `npm run lint`, `npm run typecheck`, `npm test` (135/135) and `npm run build` all exit 0.

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
