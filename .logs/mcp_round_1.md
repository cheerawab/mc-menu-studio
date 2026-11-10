# MCP self-review — round 1

Scope: read every file under `src/mcp/` and `scripts/mcp-server.ts` / `scripts/mcp-smoke.ts` end to end, looking
for bugs, not just re-skimming what I just wrote.

## Checked and found safe (no change needed)

- **Cross-type `variant` union** (`elementPatchShape.variant` accepts both `PanelVariant` and `ButtonVariant`
  values): if an agent sets a button's `variant` to `'inset'` (a panel value), every skin's `drawButton`
  (`vanilla.ts`, `darkModern.ts`, `holo.ts`, `parchment.ts`) has a `default:`/final-`else` branch, so the renderer
  falls back gracefully instead of crashing. Confirmed by reading all four skins' `drawButton`/`drawPanel`.
- **`ProjectStore.mutate` on a throwing `fn`**: `e.project = fn(e.project)` throws before the assignment runs, so
  a failed mutation (e.g. unknown element id) never corrupts the in-memory snapshot or touches the file. Added a
  regression test (`page.test.ts`: "does not touch the file" after a thrown update).
- **`alignRects`/`distributeRects` fed `Element[]` instead of `Rect[]`**: structurally compatible (Element has
  x/y/w/h), TypeScript accepts it, runtime behaviour matches the editor's own usage pattern.
- **zod v4 API surface** used here (`.strict()`, `.partial()`, `.shape`, `z.discriminatedUnion`, `z.enum`,
  `.finite()`) verified directly against the installed `zod@4.6.7` with small `node -e` probes before relying on
  it in schemas.ts.

## Bugs found and fixed

1. **Unbounded page size -> unbounded canvas allocation (robustness/DoS risk).** `model/ops.ts` intentionally does
   not clamp `Page.width/height` to `PAGE_LIMITS` — that's a caller responsibility (the editor's `NumberInput` in
   `Inspector.tsx` clamps `min={PAGE_LIMITS.minW} max={PAGE_LIMITS.maxW}` before ever calling `updatePage`). The
   MCP layer, as the second caller of `model/ops.ts`, had not replicated that clamp: `mcms.page.add`/`page.update`
   accepted any positive integer width/height. A page of e.g. 50000x50000 would later hit
   `env.createCanvas(page.width * scale, ...)` in `mcms.preview.page` / `mcms.export.build` with no size check
   (that check, `fitsCanvas`/`MAX_CANVAS_PIXELS`, only runs inside `checkExport`, not inside the renderer itself),
   risking an OOM/crash in the server process before the agent ever gets to run `mcms.check.project`.
   **Fix**: `pagePropsSchema.width/height` now bounded to `PAGE_LIMITS.min/maxW/H` in `schemas.ts`. This is a
   boundary validation in the MCP adapter, not a change to `model/ops.ts` or any core signature.
2. **Unbounded `mcms.preview.game_mock` window size**, same class of issue: `winW`/`winH` drove
   `env.createCanvas(L.guiW * density, L.guiH * density)` with no upper bound. Since `density <= guiScale`, the
   canvas is at most `winW x winH` texels, so bounding the window dimensions bounds the allocation.
   **Fix**: new `windowDimSchema` (`int, 64..3840`) in `schemas.ts`, applied to both `winW` and `winH`. 3840 covers
   every `WINDOW_PRESETS` entry (max 2560x1440) with headroom, while keeping the worst case comparable to the
   `MAX_CANVAS_PIXELS` budget `render/scale.ts` already uses elsewhere.
3. **`ProjectStore.open()` on a missing file threw a raw Node `ENOENT` error** instead of a zh-TW message
   consistent with every other MCP-layer error. **Fix**: `readProjectFile` now catches `ENOENT` specifically and
   throws `找不到專案檔「<path>」。`; any other read error still propagates unchanged.

All three fixes are additive zod/guard changes in `src/mcp/` only — no `src/core` file was touched, no existing
test assertion was changed. Regression tests added: `schemas.test.ts` (page size limits, `windowDimSchema`),
`state.test.ts` (missing-file message).

## Re-run after fixes

- `npx tsc --noEmit`: clean.
- `npx vitest run src/mcp`: 57/57 passed (was 53 before this round's new tests).
- `npm run lint`: clean.
- `npm test`: 250/250 passed (193 baseline + 57 new), zero regressions.
