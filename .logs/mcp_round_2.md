# MCP self-review — round 2

Scope: re-read `src/mcp/server.ts` line by line (the file every tool is wired through) and
`src/mcp/handlers/project.ts`, looking specifically for silent-data-loss and dead-code/redundancy issues missed
in round 1.

## Bugs found and fixed

1. **`mcms.project.create` could silently overwrite an existing file.** The default path is derived from the
   namespace (`<namespace>.mcms.json` under cwd); two `create` calls with the same default namespace and no
   explicit `path` (or an explicit `path` the agent forgot was already in use) would silently clobber whatever
   project was already at that path, with no warning — a real data-loss risk for a tool whose whole design point
   is "the file is the truth". `create` is for *new* projects; re-attaching to an existing file is what
   `mcms.project.open` is for. **Fix**: `createProjectHandle` now checks `existsSync(path)` first and throws
   `檔案「<path>」已經存在，請用 mcms.project.open 開啟它，或指定不同的 path。` instead of overwriting. Regression
   test added in `project.test.ts` (second `create` at the same path throws, first file's content is untouched).
2. **Minor: double `store.get(handle)` lookup** in both preview tools (`mcms.preview.page`/`game_mock`) — the
   handler fetched the project once directly and again inside a `requirePageOf(store, handle, pageId)` helper.
   Not a correctness bug (Map lookups are O(1) and idempotent), but needless and a bit confusing to read.
   **Fix**: `requirePageOf(store, handle, pageId)` -> `requirePageIn(project, pageId)`, taking the
   already-fetched `Project` directly; both call sites updated to pass `project` instead of `store, handle`.

## Checked and found safe (no change needed)

- **Concurrent `mutate()` calls on the same handle**: `ProjectStore.mutate` has no `await` in its critical
  section (`e.project = fn(e.project); writeProjectFile(...)` are both synchronous), so even if two tool calls
  are logically "in flight" concurrently over one MCP connection, the mutation itself runs atomically within a
  single microtask turn — no interleaving/race is possible at the JS level. Multi-agent concurrency on the same
  handle is out of MVP scope per MCP_PLAN.md §7 anyway; this just confirms the single-agent case can't corrupt
  state via interleaving.
- **`mcms.export.write`'s `outDir` is not sandboxed to a project subdirectory.** Deliberate: this is a local
  stdio MCP server run by the same user operating the agent (same trust boundary as `scripts/demo-export.ts`'s
  `--out` flag, which has the same lack of sandboxing). Not a cross-tenant service.
- **`page.add`'s top-level args lose `pagePropsSchema`'s `.strict()`** because the tool is registered with
  `...pagePropsSchema.shape` spread into a raw shape object rather than the schema object itself (the `tool()`
  overload needs a `ZodRawShape`, not a `ZodObject`). A typo'd field name is silently dropped rather than
  rejected. Confirmed this is confined to `page.add`'s own args (not `page.update`, which nests the whole
  schema under `patch`, preserving strictness) and is a UX nicety gap, not a correctness bug — noting it here
  rather than fixing it, since fixing it would mean giving `page.add` a different and less convenient flattened
  argument shape than the rest of the file, for marginal benefit.

## Re-run after fixes

- `npx tsc --noEmit`: clean.
- `npx vitest run src/mcp`: 58/58 passed (was 57 before this round's new test).
- `npm run lint`: clean.
- `npm test`: 251/251 passed (193 baseline + 58 new), zero regressions.
- `npx tsx scripts/mcp-smoke.ts`: SMOKE TEST PASSED (re-ran against the modified server.ts/project.ts).
