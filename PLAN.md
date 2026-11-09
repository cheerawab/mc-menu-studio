# PLAN — Stage A (editor + renderer, no exporter)

## Modules
- `src/core/model/`   `types.ts` (Project/Page/Element/Action), `defaults.ts` (factories, element meta),
  `ids.ts`, `ops.ts` (pure immutable project edits), `serialize.ts` (normalise/migrate JSON), `validate.ts` (檢查 issues)
- `src/core/geometry.ts`  snap, move/resize with snap, align, distribute, bbox, hit test
- `src/core/history.ts`   snapshot undo stack (200 steps, coalescing key for typing/drags)
- `src/core/render/`  `types.ts` (minimal Ctx2D so DOM + @napi-rs/canvas both fit), `color.ts`, `pixel.ts`
  (crisp integer primitives: rounded/chamfered rows, bevels, gradients, noise), `text.ts` (wrap CJK/Latin,
  kinsoku, alpha-threshold "pixelate", MC-style shadow), `icons.ts` (24 16x16 bitmaps, tintable),
  `elements.ts`, `renderPage.ts` (`renderPage(ctx,page,project,env) -> {width,height,regions}`; `computeRegions`)
- `src/core/skins/`   `vanilla`, `darkModern`, `holo`, `parchment` (+ accent override). Everything draws INSIDE the element rect.
- `src/core/templates/` 6 zh-TW templates + blank project
- `src/core/game/chrome.ts` `GAME_CHROME` constants (header/footer/title/button metrics, approximate) + fit maths + mock drawing
- `src/app/state/`    zustand vanilla store (`editorStore.ts`), persistence (localStorage autosave, JSON import/export), image cache
- `src/app/editor/`   TopBar, LeftPanel (palette/pages/layers), CanvasView (rulers, grid, handles, marquee), GamePreview,
  Inspector (+ fields, ActionEditor), LinkMap, IssuesPanel, TemplatesDialog, Toasts/Confirm
- `scripts/demo-export.mjs` prints "not implemented until Stage B"

## Data model (summary)
Project{version,id,name,namespace,skinId,pages[],assets{},settings{fontFamily,accent|null}}
Page{id,key,title,width,height,bgColor|null,elements[]}; elements bottom->top
Base{id,type,name,x,y,w,h,locked,hidden,opacity}; interactive (button,label,image,icon,shape) add {action,tooltip}
panel{variant,fill,border} button{text,fontSize,bold,textColor,variant,fill,icon} label{text,fontSize,lineHeight,bold,
shadow,color,align,vAlign,wrap,pixelate,fontFamily} image{assetId,fit,scale,smoothing} bar{value,color,trackColor,segments,
text} shape{shape,radius,fill,gradient,stroke,strokeWidth} divider{orientation,style,color,thickness}
slotgrid{cols,rows,slotSize,gap} (size derived) icon{icon,scale,tint} (size derived = 16*scale)
Action = none | page{pageId} | command{command (no leading slash)} | url{url} | copy{text} | close

## Store shape (zustand vanilla, React via useStore)
{ project, currentPageId, selection[], clipboard, history{past[],future[],lastKey,lastTime},
  view{zoom,panX,panY,showGrid,snap,showRegions,mode:'edit'|'game',guiScale,windowPreset}, toasts[], confirm }
Actions: commit(mutator,{coalesceKey}) | begin/endGesture for drags | undo/redo | select* | page ops | clipboard ops.

## Build order
1. Scaffold (Next 16, Tailwind 4, vitest, zustand, jszip, lucide-react, @napi-rs/canvas dev). Commit.
2. Core model + geometry + history + validation + tests. Commit.
3. Renderer, skins, icons, templates, game chrome + determinism/regions/template tests; render PNG previews
   with a node script to eyeball skins. Commit.
4. Store + persistence + editor UI (three panes, canvas interactions, inspector, game preview, templates, 檢查). Commit.
5. jsdom smoke test of the editor, lint/typecheck/test/build green, dev server check on :3737, STATUS.md + README. Commit.

## Defaults chosen (also in STATUS.md)
Page 320x200 (max 1000x600, min 16). GUI scale 3 @ 1920x1080 default preview. Snap 1 px, grid on.
Commands stored without leading "/". Templates' sample = 伺服器大廳 on first visit.
