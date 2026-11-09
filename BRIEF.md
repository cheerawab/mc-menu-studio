# BRIEF — build "MC Menu Studio" (選單工坊)

## 0. What and why
A web editor (Next.js) in which a Minecraft Java server/map owner designs custom in-game menus visually and exports them
as a **resource pack + data pack** that draws a pixel-positioned, clickable GUI in the vanilla **Dialog** screen
(Java 26.3 / 1.21.6+, no client mods). It is an independent, no-code, static-export take on the idea behind the open source
plugin **Glyphwork** (`reference/glyphwork`, read its README and `docs/`; see `docs/TECHNIQUE.md` for the mechanics).
Users: Taiwanese server owners and creators. **The whole UI is Traditional Chinese (繁體中文, zh-TW)** and menus must support
CJK text (a known weakness of the reference plugin; this is our differentiator).
The "trend" this rides: custom menus built from Dialog + resource packs are getting popular. The product goal is
"anyone can make a menu like that in minutes, then drop two zips into Minecraft".

## 1. How we work
- You write code and tests. You may run `npm run dev` (port 3737), tests, build. **Do not launch Minecraft.**
  Hermes (orchestrator) takes your exports, loads them into a real Minecraft 26.3 through Prism Launcher, screenshots and
  clicks the result, and sends findings back. Hence: exports must be deterministic and reproducible with one command
  (`npm run demo:export`), and `docs/TECHNIQUE.md` assumptions [GW]/[TEST] must be isolated in one small module
  (e.g. `src/core/export/layout.ts` + `constants.ts`) so a wrong assumption is a quick fix.
- Be frugal with quota (see CLAUDE.md rule 4). Think hard about design, then write code in few large coherent steps.
- Stages are separate runs. Do ONLY the stage you are asked for. Finish it fully (tests green, build green), update
  `STATUS.md`, commit, stop.

## 2. Architecture (both stages)
```
src/core/model/    Project, Page, Element types (zod or plain TS), defaults, id helpers, JSON (de)serialisation, migrations stub
src/core/render/   renderPage(ctx, page, project, assets) -> { width, height, regions[] }  pure, integer pixels, Canvas 2D API only
src/core/skins/    built-in skins (drawPanel/drawButton/... + palettes)
src/core/export/   (Stage B) tiles -> glyph sheets -> fonts -> dialog JSON -> zip files
src/app/           Next.js App Router UI (client components for the editor), zustand (or similar) store
scripts/           node scripts (demo export; uses @napi-rs/canvas for headless rendering)
```
- `renderPage` takes a `CanvasRenderingContext2D`-compatible context so the SAME code runs in the browser and in Node
  (`@napi-rs/canvas`). It draws at integer coordinates (no sub-pixel), returns the interactive `regions`
  (`{x,y,w,h,action,tooltip}` in page pixels, in z-order). Text uses canvas `fillText`; provide a "pixelate" option that
  thresholds text alpha for a crisp pixel look (default on for small sizes). CJK must work (font stack with
  "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif; allow user-chosen font family string).
- The preview in the editor is the exported bitmap, shown at integer zoom with `image-rendering: pixelated`: WYSIWYG.
- Keep `src/core` free of React/DOM/Next imports. It must be unit-testable with vitest in Node.

## 3. Data model (guideline, refine as needed)
```ts
Project { id; name; namespace /* [a-z0-9_] */; skinId; pages: Page[]; assets: Record<id, {name, mime, dataUrl, w, h}>; settings }
Page    { id; key /* file name, [a-z0-9_] */; title; width; height; bgColor?; elements: Element[] }
Element = Panel | Button | Label | Image | Bar | Shape | Divider | SlotGrid | Icon   // all have id,x,y,w,h,name,locked,hidden
Action  = {type:'none'} | {type:'page', pageId} | {type:'command', command} | {type:'url', url} | {type:'copy', text} | {type:'close'}
Interactive elements carry { action, tooltip? }
```
Defaults: page 320x200. Max page 1000x600. Coordinates are integers.

## 4. STAGE A — editor + renderer (NO exporter yet)
Deliver a polished, working editor at `http://localhost:3737`:
1. **Scaffold** Next.js (latest stable, App Router, TypeScript strict, Tailwind) in THIS directory (it already has docs/, reference/,
   CLAUDE.md, BRIEF.md; do not clobber them). npm only. Add vitest, eslint, zustand, jszip, @napi-rs/canvas (dev/script use only).
   Scripts per CLAUDE.md (`demo:export` can print "not implemented until Stage B").
2. **Renderer + skins**: elements Panel, Button, Label (multi-line, align, font size, colour, bold, pixelate), Image (uploaded
   PNG/JPG/WebP, scale, nearest/smooth), Bar (progress bar, static value), Shape (rect/rounded rect, fill, gradient, stroke, opacity),
   Divider, SlotGrid (cols x rows of slot frames), Icon (>= 16 built-in 16x16 pixel icons drawn from tiny bitmaps in code: heart,
   star, sword, pickaxe, bag, gear, home, map, coin, check, cross, arrow left/right/up/down, lock...). Skins (>= 4, each must look
   designed, with consistent palette, bevels/rounding/shadow/glow): **Vanilla** (Minecraft-like grey bevel), **Dark Modern**
   (flat dark, rounded, accent colour), **Holo** (translucent cyan glass with thin glowing outline, sci-fi HUD feel),
   **Parchment** (fantasy). Skin = look for Panel/Button/text defaults; elements can override colours. Button states are not
   interactive in-game but the editor can show "hover" for design preview (optional).
3. **Editor UX** (three panes): left = element palette, page list (add/rename/duplicate/delete/reorder), layers list (select, hide, lock,
   reorder); centre = canvas with zoom 1x-8x (wheel + buttons), pan (space-drag/middle), grid + snap (1/2/4/8 px), rulers,
   drag/resize handles, arrow-key nudge (shift = 8 px), delete, duplicate, copy/paste, multi-select (shift-click), align/distribute
   buttons, undo/redo (>= 100 steps); right = inspector (position, size, colours with a colour picker + hex, font size, text, action, tooltip,
   image replace). Top bar: project name, undo/redo, edit/in-game preview toggle, GUI scale 1-4, window presets (1280x720, 1920x1080,
   2560x1440), export button (disabled with tooltip "Stage B" for now), language is fixed zh-TW.
4. **In-game mock preview**: draws the vanilla dialog chrome (dim world-like background, title centred with the small warning icon,
   the page bitmap centred, footer button "關閉") at the chosen GUI scale and window size. The chrome metrics are approximate:
   keep them in one constants object so Hermes can calibrate them from real screenshots later. Show a "fits / does not fit" badge.
5. **Pages and actions**: button action "open page" links pages; show a link map or a clear list. Validate: unique page keys, namespace regex,
   dangling page links, empty commands, oversized pages. Surface problems in a "檢查" panel.
6. **Templates gallery** (>= 6, zh-TW content, each in a different skin where sensible): 伺服器大廳 (lobby with server buttons, rules, discord link),
   規則同意 (rules + agree), 商店 (SlotGrid + price labels), 快速選單 (time day/night, weather clear/rain, gamemode, home), 設定頁, 公告.
   Use harmless commands (e.g. `time set day`, `weather clear`, `gamemode creative`, `random value 1..6`, `list`).
7. **Persistence**: autosave to localStorage, import/export project JSON, "new project", sample project on first visit. Handle asset size limits gracefully.
8. **Tests** (vitest): model helpers, action validation, region z-order, renderer determinism (same input -> same pixels, using a tiny
   Node canvas), snapping math, undo/redo store, template validity. Keep them fast.
9. **Quality**: `npm run lint`, `typecheck`, `test`, `build` all pass. No console errors in the dev server. Responsive down to 1280 px wide.
   Visual design of the editor itself should feel like a modern dark tool UI (not default Tailwind boilerplate), Traditional Chinese
   copy that sounds natural to Taiwanese users, accessible labels and focus rings.
Definition of done (Stage A): all above works in the browser; `STATUS.md` written (features, how to run, known gaps).

## 5. STAGE B — exporter (will be given later with VERIFIED technique notes)
Do not start it in Stage A. For orientation only: tiles -> glyph sheets -> `space`/`y<N>` fonts -> dialog JSON per page -> `resourcepack.zip`
+ `datapack.zip` (+ README, quick_actions tag option, namespace/pack name options), a Node CLI path (`npm run demo:export`)
and an Export dialog in the UI. Design `renderPage` and the model so the exporter can consume `{ rgba pixels, width, height, regions }`.

## 6. STAGE C — fixes from real-game tests, polish, optional "trigger mode" for servers (later).

## 7. Rules of engagement
- Everything stays inside this directory (reference/ is read-only). Install only npm packages you need. No telemetry, no external
  network calls at runtime (the app must work offline once installed; fonts via system stack or bundled files).
- No secrets, no accounts, no analytics. Licence: MIT; README credits Glyphwork for the idea and states clearly that this is an
  independent implementation.
- When uncertain about a Minecraft detail, say so in `STATUS.md` under "Assumptions to verify in game"; do not invent behaviour.
