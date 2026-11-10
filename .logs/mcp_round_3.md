# MCP self-review — round 3

Scope: final holistic pass — verify the hard rules mechanically (not just by memory), re-scan every handler for
the "unbounded allocation" and "silent overwrite" bug classes found in rounds 1-2 to make sure no sibling case
was missed, and strengthen the weakest point in the test pyramid (the smoke test never touched group F).

## Hard-rule compliance, verified mechanically

- `grep -rn "from ['\"].*src/app\|from ['\"]react\|from ['\"]next\b\|from ['\"]@/app" src/mcp scripts/mcp-server.ts scripts/mcp-smoke.ts`
  -> no matches. `src/mcp` never imports React/Next/`src/app`.
- `git diff main...HEAD --stat -- src/core` -> empty. No `src/core` file was touched by this branch.
- `git diff main...HEAD --stat -- 'src/core/__tests__/*' 'src/app/**/*.test.*'` -> empty. No existing test file
  was modified (every new test lives under `src/mcp/__tests__/`).
- No `git push` was run; no commit targeted `main` (all commits are on `feat/mcp-server`, verified with
  `git log --oneline` below); no code path launches Minecraft; no code path makes an external network call
  (the only `fetch`/network-shaped code is the MCP stdio transport itself, which talks to the local child
  process, not the internet).

## Re-swept for the two bug classes from rounds 1-2 (none found)

- **Unbounded allocation**: re-checked every numeric field in `elementPatchShape` against what
  `model/defaults.ts normalizeElement` already clamps (fontSize 6-72, icon/image scale 1-8/1-16, slotgrid
  cols/rows 1-40/1-30, shape radius/strokeWidth, divider thickness, bar value/segments) — all of them are
  clamped by core itself before they can affect a canvas size, so no further MCP-layer bound was needed there.
  The only two fields that reach a canvas dimension un-clamped by core were `Page.width/height` and the preview
  window size, both already fixed in round 1.
  `export/index.ts`'s `tileSize` is unbounded in `exportOptionsShape`, but `buildExport`'s own `validateInput`
  checks `tileSize * scale > MAX_CELL_TEXELS` and throws a proper `ExportError` *before* any allocation happens
  (confirmed by reading `export/index.ts` build order again) — no fix needed there.
- **Silent overwrite**: `mcms.export.write` always overwrites `resourcepack.zip`/`datapack.zip`/`README_zh-TW.txt`
  in `outDir` without checking for existing files. Confirmed this matches `scripts/demo-export.ts`'s own
  behaviour (it unconditionally overwrites, and even explicitly deletes a stale `autotest.zip` when not
  requested) — export output is a regenerable build artifact, not source-of-truth data like a `*.mcms.json`
  project file, so unlike `project.create` this is intentional and consistent with existing project convention.
  No fix.
- Duplicate ids in an `ids` array (e.g. `['a', 'a']`) passed to `element.update`/`align`/`distribute`: the
  `Map` built from `ids.map((id, i) => [id, positions[i]])` keeps the last occurrence's value for a repeated
  key — not a crash, just "last write wins" for a pathological input a normal agent would never construct.
  Left as is.

## Test coverage gap closed

`scripts/mcp-smoke.ts` exercised groups A, C, E and G but never F (previews) over the real stdio transport —
the one path that depends on the `@napi-rs/canvas` native binding resolving correctly in a spawned subprocess
(as opposed to inside the vitest worker process, which is a different runtime). Added an `mcms.preview.page`
call that writes a PNG and asserts the file starts with the PNG magic bytes. Re-ran: still passes, 680x420 PNG,
13688 bytes.

## Final verification (this round, after the smoke-test change)

- `npx tsc --noEmit`: clean.
- `npm run lint`: clean.
- `npm test`: **251/251 passed** (193 baseline + 58 `src/mcp` tests), zero regressions, across all three rounds.
- `npm run build`: succeeds (Next.js production build, TypeScript pass included).
- `npx tsx scripts/mcp-smoke.ts`: SMOKE TEST PASSED, now including a real preview.page round-trip.

No further bugs found this round. Calling the self-review done at 3 rounds per TASK_MCP.md's minimum.
