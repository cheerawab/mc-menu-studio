# STATUS — Stage A (editor + renderer) — done

Stage A from `BRIEF.md` §4 is implemented. Stage B (exporter) has **not** been started: the 匯出 button is
disabled with a "Stage B" tooltip and `npm run demo:export` only prints a notice.

## How to run and test (exact commands)

```bash
npm install
npm run dev            # editor at http://localhost:3737  (Next 16.4.5, telemetry disabled via scripts/run-next.mjs)
npm run lint           # eslint (reference/ and exports/ ignored)
npm run typecheck      # tsc --noEmit, strict
npm test               # vitest: 47 tests, ~1.5 s (Node + one jsdom smoke test of the whole editor)
npm run build          # production build
npm run preview:skins  # headless render of every template page, the icon sheet and an in-game mock -> exports/previews/*.png
npm run demo:export    # prints "not implemented until Stage B"
```

Last run (this stage): lint ✓, typecheck ✓, test ✓ (47/47), build ✓, dev server ✓ (GET / 200, all chunks 200, no
errors in the server log).

## What works

**Renderer (`src/core`, pure TS, runs in browser and Node)**
- `renderPage(ctx, page, project, env) -> { width, height, regions }` draws with integer `fillRect`s
  (crisp, deterministic), text via `fillText` on a scratch canvas, then alpha-threshold ("pixelate") and a
  Minecraft-style 1 px shadow composited per pixel. `renderPageToCanvas` gives a canvas for the exporter to read
  RGBA from. `computeRegions(page)` lists click/hover rects in paint order (later = on top), clipped to the page;
  hidden elements are skipped; tooltip-only elements produce hover regions.
- Elements: panel, button (variants, optional icon), label (multi-line, CJK wrapping with kinsoku rules, align,
  v-align, size, line height, colour, bold, shadow, pixelate auto/on/off, font override), image (PNG/JPG/WebP/GIF
  upload, stretch/contain/cover/original×N, nearest/smooth), bar (value, segments, colours, label), shape
  (rect/rounded/ellipse, fill, linear gradient, stroke, opacity), divider (skin/solid/dashed/dotted), slot grid
  (cols×rows, slot size, gap; size derived), icon (28 original 16×16 bitmaps, tintable, scale 1–8).
- Every element has opacity, hidden, locked. Every skin draws strictly **inside** the element rect (tested), so
  an element's rect is exactly its clickable area.
- Skins (`src/core/skins`): 原版風格 Vanilla (grey bevel), 暗色現代 Dark Modern (rounded, drop shadow, accent),
  全息投影 Holo (translucent glass, chamfers, glow lines, corner brackets), 羊皮紙 Parchment (speckled paper,
  wood frame, gold rivets, stitched leather buttons). Project-wide skin + optional accent override; element colours
  override skin colours.

**Editor (`src/app`)**
- Left: element palette (click or drag onto the canvas; image files can be dropped directly), page list
  (add / double-click rename / duplicate / delete with confirm / drag reorder, incoming-link count), layer list
  (select, shift-select, hide, lock, double-click rename, drag reorder, action indicator).
- Centre: page bitmap at integer zoom 1–8× (`image-rendering: pixelated`, i.e. WYSIWYG), wheel zoom around the
  cursor (Shift/Alt+wheel pans), pan with Space-drag or middle mouse, rulers with selection highlight and cursor
  marker, grid, snap 1/2/4/8 px, move (Shift = axis lock), 8 resize handles (Shift or images = keep aspect; slot
  grids snap to whole slots, icons to whole scales), marquee select, hover outline, clickable-region overlay,
  size badge, align ×6 (to selection, or to the page for a single element), distribute ×2, z-order.
- Keys: arrows nudge 1 px (Shift 8), Delete/Backspace, ⌘/Ctrl+Z / Shift+⌘Z / Ctrl+Y, ⌘/Ctrl+C/X/V/D/A, Esc,
  `[` `]` (Shift = bottom/top), `0` fit, `-` `=` zoom, Enter = edit text. Undo/redo: 200 snapshots; typing in a
  field coalesces into one step (1 s window); a drag is one step.
- Right: 屬性 inspector (page settings + project settings when nothing is selected: title, key with the
  `/dialog show` command, size + presets, background, namespace, skin picker, accent, font stack, asset usage and
  "clear unused"; element fields per type; colour picker + hex with "reset to skin default"; action editor with
  inline validation; tooltip), 連結 tab (per-page list of every clickable element and its action, incoming links,
  click to jump), 檢查 tab (errors / warnings / hints, click to jump, plus the static-export limits in zh-TW).
- Top bar: project name, undo/redo, 編輯 / 遊戲預覽 toggle, GUI scale 1–4 (the game's "auto" value is marked),
  window presets 1280×720 / 1920×1080 / 2560×1440, 範本 gallery, 檔案 menu (new, from template, import JSON,
  export JSON), disabled 匯出 (Stage B).
- In-game preview: mock dialog screen at GUI resolution (dimmed blocky world, centred title + warning icon button,
  page bitmap, footer button 關閉, scrollbar when too tall), scaled to fit; badge 可完整顯示 / 寬度超出視窗 /
  高度不足; ✓/✗ for every GUI scale; hover shows Minecraft-style tooltips; clicks simulate actions (page links
  navigate, commands/URLs/copy show a toast, 關閉 closes with a "reopen" button).
- Validation (`src/core/model/validate.ts`): namespace regex, `minecraft` namespace, page key regex + duplicates,
  empty title, size limits, unreachable pages, fit at the chosen window/GUI scale, elements outside/clipped, image
  without/missing asset, actions (empty/self/dangling page link, empty/multi-line/too-long/chat command, bad URL,
  empty copy text), hidden element with action.
- Templates (`src/core/templates`): 伺服器大廳 (Dark, 2 linked pages), 規則同意 (Vanilla, 2 pages), 商店 (Vanilla,
  slot grid + prices), 快速選單 (Holo), 設定頁 (Dark, violet accent), 公告 (Parchment) + blank project. All pass
  validation without errors/warnings (tested).
- Persistence: autosave to localStorage (debounced 600 ms, also after drags), view preferences saved, sample
  project (伺服器大廳) on first visit, corrupt data falls back to the sample with a message, quota errors show a
  toast and keep retrying, JSON import (validated + normalised, with migration hook) / export
  (`<namespace>.mcmenu.json`). Uploads > 2 MB are rejected; images larger than 1000×600 are scaled down; a warning
  appears when embedded images exceed ~3 MB.

**Tests** (`src/core/__tests__`, `src/app/state/store.test.ts`, `src/app/editor/Editor.test.tsx`): model helpers,
ops, (de)serialisation and repair, action/project validation, snapping/resize/align/distribute/hit-test/zoom maths,
history (coalescing, 200 cap), renderer determinism for every template page (two fresh @napi-rs/canvas
environments → identical pixels), crisp shapes, pixelate gives binary alpha, skins stay inside rects, region
z-order/clipping, CJK/Latin wrapping and kinsoku, icons, templates validity, dialog layout maths, store (≥100
undo steps, gestures, clipboard, pages), autosave (incl. after a drag, corrupt data, quota), and a jsdom smoke test
that mounts the editor and clicks through palette → inspector → action → keys → tabs → pages → game preview →
template gallery with no `console.error`.

## Known gaps

- I could not do visual QA of the editor UI in a real browser (no browser automation per the rules). Skins,
  icons, templates and the game mock were checked visually as headless PNGs (`npm run preview:skins`); the UI was
  checked by the jsdom smoke test, the build and the generated CSS. Please eyeball http://localhost:3737 once.
- Button hover/pressed design preview (optional in the brief) is not implemented.
- Clicking (without dragging) one element of a multi-selection keeps the multi-selection.
- Segmented controls have no arrow-key navigation (Tab/Enter work). No snapping to other elements/guides.
- Undo history is not persisted across reloads. Unused image assets stay in the project until 「清除未使用」.
- localStorage (~5 MB) limits embedded images; export JSON for backups.
- Text look depends on the fonts installed where it is rendered. In Node the default stack falls back to
  "Heiti TC" (macOS); on Linux without CJK fonts the Node previews/tests would show tofu (tests do not depend on it).
- The world behind the mock dialog is decorative (no blur); all dialog chrome metrics are estimates.
- The 商店 template uses `/give` (needs operator permission); others use time/weather/gamemode/difficulty/random/
  list/spreadplayers.

## Assumptions to verify in game

Chrome/fit constants live in `GAME_CHROME` (`src/core/game/chrome.ts`); export-side assumptions will go to
`src/core/export/{layout,constants}.ts` in Stage B.

1. Dialog chrome: header 33 px, footer 33 px, body content starts 4 px below the header, footer button 150×20,
   warning icon button 20×20 placed 6 px right of the title, title drawn with the 8 px font. [TEST]
2. plain_message widget height = 2·4 + 9·(1 + ceil(H/9)) and the body is top-aligned under the header (not
   vertically centred) when it is shorter than the window; it scrolls when taller. [GW/TEST]
3. GUI "auto" scale = largest s with W/s ≥ 320 and H/s ≥ 240 (used for the ✓/✗ hints). [TEST on 26.3]
4. Glyph pixels with alpha < 10% are discarded [GW]: skins avoid sub-10% alpha; anti-aliased (non-pixelated) text
   edges below 10% will disappear in game. Partial alpha ≥ 10% (Holo glass, shadows) blends as authored. [TEST]
5. The page bitmap already contains text shadows; the dialog does not add its own shadow to glyph runs
   (fallback: `shadow_color` transparent in Stage B). [GW/TEST]
6. Commands are stored without the leading `/`; whether `run_command` needs it is decided by the exporter. [TEST]
7. Chat commands (say/tell/msg/w/me/teammsg/tm) do not run from click events → warning only. [JAR/wiki]
8. Commands longer than 256 characters may be rejected (guess) → warning. [TEST]
9. `open_url` accepts only http(s) and shows the game's confirmation screen. [wiki/TEST]
10. Multi-line tooltips (`\n` in `show_text`) render as multiple lines. [TEST]
11. Max page 1000×600 (brief); plain_message width ≤ 1024 so W + 8 fits. [JAR]

## Defaults chosen (ambiguities resolved)

- Interactive types: button, label, image, shape, icon. Panel, bar, divider and slot grid are decorative.
- Page default 320×200, min 16×16, max 1000×600; preview default 1920×1080 at GUI 3; snap 1 px; grid every 8 px
  (or every snap step ≥ 2).
- Skin is project-wide (`project.skinId`) with an optional accent; page/element colours override.
- Page keys and namespace: `[a-z0-9_]+` (stricter than vanilla on purpose).
- Default font stack: "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Heiti TC", sans-serif ("Heiti TC"
  added so Node/@napi-rs can find a CJK font on macOS). Pixelate "auto" = on at ≤ 13 px.
- Project JSON is `{format:"mc-menu-studio", version:1, project}`; import also accepts a bare project.
- Deleting a page keeps links pointing to it (they show up as errors in 檢查; undo restores the page).

## Open questions (for Stage B)

- **Font licensing for exports**: rasterising proprietary system fonts (PingFang TC, Microsoft JhengHei) into a
  distributed resource pack may not be permitted by their licences. Consider bundling an OFL font (e.g. Noto Sans
  TC, or an OFL CJK pixel font) for exported text, which would also make Node and browser exports identical.
- Export from the browser (exact WYSIWYG) and/or Node (`demo:export`, Skia text differs slightly)?
- Should the dialog footer label (關閉) and `after_action` be per-page export options?
- Per-page skins? Currently one skin per project.
