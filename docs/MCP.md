# MCP — agent-operable MC Menu Studio

`src/mcp/` exposes MC Menu Studio over the [Model Context Protocol](https://modelcontextprotocol.io) so an AI
agent can build and export a menu end to end — create a project, edit pages/elements, check it, preview it,
export it — without a browser and without touching the UI. It is a **second frontend** over the exact same
`src/core` pure functions the React editor uses (`src/app/`); one source of truth, two ways to drive it.

See `MCP_PLAN.md` for the original design brief and `TASK_MCP.md` for the task/acceptance checklist this
implementation was built against. `STATUS.md`'s "Stage I" section is the changelog entry.

## Running it

```
npm run mcp              # stdio server, for any MCP client
npm run mcp:smoke        # scripted end-to-end check (spawns the server itself)
```

To mount it in Claude Code:

```
claude mcp add mcms -- npx tsx scripts/mcp-server.ts
```

Any other MCP client that speaks stdio works the same way: command `npx`, args `["tsx", "scripts/mcp-server.ts"]`,
run from this repository's root (module resolution needs the local `node_modules`).

## Design

### Why MCP, and why a thin layer

`src/core/` is already pure TypeScript with no React/DOM dependency and runs headlessly in Node with
`@napi-rs/canvas` (`scripts/demo-export.ts` is the existing example). Every capability an agent needs — build a
project, edit it, validate it, render it, zip it — is already a pure function. `src/mcp/` is therefore an
**adapter, not a new implementation**: every tool is a thin zod-validated wrapper that calls into `src/core` and
nothing else. It must never reimplement render/export/validate logic, and it never imports `src/app`, React or
Next.

### State model: the file is the truth

An MCP server is a long-lived process; an agent calls it many times over one connection. Rather than keep state
purely in memory (lost on crash, invisible to a human who wants to open the same project in the browser editor
at the same time), **every project is a `*.mcms.json` file** — exactly `model/serialize.ts`'s
`serializeProject()` output, the same format the browser editor reads and writes.

- `mcms.project.create`/`open` register a fresh in-memory `handle -> {Project, path}` entry
  (`src/mcp/state.ts`'s `ProjectStore`) and return the `handle` to the agent.
- Every mutating tool (`page.*`, `element.*`) calls `ProjectStore.mutate(handle, fn)`: `fn` runs one of
  `model/ops.ts`'s immutable operations, and the result is written back to the handle's file **immediately**,
  before the tool call returns. An agent that crashes or reconnects loses nothing; a person can have the same
  JSON open in the browser editor and see the agent's edits after a reload.
  Mutation failures (misuse, like updating an element id that does not exist on the page) throw *before* the
  reassignment, so the in-memory snapshot and the file are both left exactly as they were — a failed call never
  half-applies.
- `mcms.project.create` refuses to run if its target file already exists, rather than silently overwriting it:
  `create` is for new projects, `open` is for re-attaching to one that already exists.
- All operations are immutable (`model/ops.ts`'s own contract): a `handle` always points at the latest snapshot;
  nothing is ever mutated in place.

This was chosen over a pure in-memory session specifically so an agent's work is reproducible, inspectable with
any text editor or the browser UI, and durable across a crash — at the cost of a small amount of disk I/O per
edit (every `mutate()` is synchronous and cheap: a `JSON.stringify` + `writeFileSync`).

### Validation boundary

Every tool input is a zod schema (`src/mcp/schemas.ts`), required by the MCP SDK. The schemas mirror
`model/types.ts` structurally but deliberately do **not** re-implement ranges `model/defaults.ts`'s
`normalizeElement` already clamps (font size, icon/image scale, slot grid size, bar value, etc.) — those are
core's job, and the MCP layer calling the same `createElement`/`updateElements` gets the same clamping for free.

Two things are bounded at the MCP layer specifically because `src/core` deliberately leaves them to the
*caller* to bound (the browser editor's own `Inspector.tsx`/`NumberInput` component clamps them client-side
before ever calling `updatePage`):

- `Page.width/height` are bounded to `PAGE_LIMITS` in `pagePropsSchema`.
- `mcms.preview.game_mock`'s `winW`/`winH` are bounded to 3840px in `windowDimSchema`.

Both numbers drive a `createCanvas(width, height)` allocation with no size check in the renderer itself (the
`fitsCanvas`/`MAX_CANVAS_PIXELS` check only runs inside `checkExport`, which an agent might call *after* already
triggering a huge allocation via `preview.page`). Leaving them unbounded would let a pathological or just-wrong
agent call crash the server process with an out-of-memory allocation; this is exactly the system-boundary
validation CLAUDE.md's security guidance asks for.

Everything a core function's own `Error`/`ExportError` throws (zh-TW message included) propagates unchanged: the
MCP SDK's own `CallToolRequestSchema` handler catches any thrown error and turns it into
`{content: [...], isError: true}` with the error's `.message` as the text — so core's zh-TW validation messages
reach the agent exactly as written, with no MCP-layer translation step to get wrong.

### Previews: the agent's eyes

Static export means the agent cannot see the game; `mcms.preview.page` and `mcms.preview.game_mock` are its only
visual feedback. Both call the *exact* rendering pipeline the editor itself uses
(`render/renderPage.ts`/`game/chrome.ts`, matching `GamePreview.tsx`'s own `fitScale`/`previewDensity`/
`drawGameMock` calls), so what an agent "sees" is what the editor would show. By default they write a PNG to
disk and return its path (base64-encoding a picture into every tool response would bloat the context fast);
pass `inline: true` to get a base64 `image` content block instead, for a client that wants to render it directly.

## Tool reference

All tools are namespaced `mcms.<group>.<verb>`. Every mutating tool returns the full updated `project` object so
an agent can re-read structure without a separate `project.get` round trip (it is also always available via
`mcms.project.get`). `handle` identifies an open project (from `project.create`/`project.open`); `pageId`/
element `ids` are the model's own ids.

### A. Project lifecycle (`src/mcp/handlers/project.ts`)

| Tool | Input | Output | Wraps |
|---|---|---|---|
| `mcms.project.list_templates` | — | `{id, name, description, skinId}[]` | `templates/index.ts` `TEMPLATES` |
| `mcms.project.create` | `{name?, namespace?, skinId?, fromTemplate?, path?}` | `{handle, path, project}` | `model/defaults.ts` `createProject` or `TEMPLATES[].build()`; writes the file |
| `mcms.project.open` | `{path}` | `{handle, project, path, warnings}` | `model/serialize.ts` `parseProjectJson` |
| `mcms.project.save` | `{handle, path?}` | `{path}` | `model/serialize.ts` `serializeProject`; writes the file |
| `mcms.project.get` | `{handle}` | `{project, path}` | — (reads the current snapshot) |

`path` defaults to `<namespace>.mcms.json` under the server's working directory when omitted.

### B. Pages (`src/mcp/handlers/page.ts`, wraps `model/ops.ts`)

| Tool | Input |
|---|---|
| `mcms.page.add` | `{handle, key?, title?, width?, height?, bgColor?, footerLabel?, index?}` |
| `mcms.page.update` | `{handle, pageId, patch: {key?, title?, width?, height?, bgColor?, footerLabel?}}` |
| `mcms.page.remove` | `{handle, pageId}` (errors if it is the only page) |
| `mcms.page.duplicate` | `{handle, pageId}` |
| `mcms.page.move` | `{handle, pageId, toIndex}` |

### C. Elements (`src/mcp/handlers/element.ts`, wraps `model/defaults.ts`/`model/ops.ts`/`geometry.ts`)

| Tool | Input |
|---|---|
| `mcms.element.add` | `{handle, pageId, type, props?, index?}` — `type` is one of the 9 element types, `props` any subset of that type's fields (see `mcms.schema.element_types`) |
| `mcms.element.update` | `{handle, pageId, ids[], patch}` — `patch` is the same field set as `props` above |
| `mcms.element.remove` | `{handle, pageId, ids[]}` |
| `mcms.element.move_z` | `{handle, pageId, ids[], dir: 'up'\|'down'\|'top'\|'bottom'}` |
| `mcms.element.duplicate` | `{handle, pageId, ids[], offset?}` (default offset 8px) |
| `mcms.element.align` | `{handle, pageId, ids[], mode: 'left'\|'hcenter'\|'right'\|'top'\|'vmiddle'\|'bottom'}` |
| `mcms.element.distribute` | `{handle, pageId, ids[], axis: 'h'\|'v'}` (needs >= 3 ids to do anything) |

Every id-not-found or page-not-found condition throws a specific zh-TW error rather than silently no-opping
(unlike `model/ops.ts` itself, which is deliberately silent on an unknown id — the MCP layer adds the check).

### D. Introspection (`src/mcp/handlers/introspect.ts`)

| Tool | Output |
|---|---|
| `mcms.schema.element_types` | `{type, label, defaults}[]` — one freshly-created element per type, so an agent can see every field and its default value without guessing |
| `mcms.schema.icons` | `{id, label}[]` — all 28 built-in icon ids |
| `mcms.schema.skins` | `{id, name, description, accent, swatches}[]` — all 4 built-in skins |

### E. Checks (`src/mcp/handlers/check.ts`, wraps `export/project.ts` `checkExport`)

| Tool | Input | Output |
|---|---|---|
| `mcms.check.project` | `{handle, mode?, commandMode?}` | `{issues: Issue[], counts: {error, warning, info}}` — `error`-severity issues block export |

### F. Previews (`src/mcp/handlers/preview.ts`)

| Tool | Input | Output |
|---|---|---|
| `mcms.preview.page` | `{handle, pageId, scale?, inline?, outPath?}` | default: `{path, width, height}` (PNG written to disk); `inline: true`: base64 `image` content |
| `mcms.preview.game_mock` | `{handle, pageId, winW, winH, guiScale, inline?, outPath?}` | default: `{path, width, height, fits, fitsWidth, fitsHeight, warning}`; `inline: true`: base64 `image` content + the same metadata |

Default output path: `<dir of the project file>/previews/<pageKey>.png` (or `.mock.png`), override with `outPath`.

### G. Export (`src/mcp/handlers/export.ts`, wraps `export/project.ts`/`export/index.ts`)

| Tool | Input | Output |
|---|---|---|
| `mcms.export.build` | `{handle, options?}` | `{stats, warnings}` — builds in memory, writes nothing, lets an agent check before committing to files |
| `mcms.export.write` | `{handle, options?, outDir}` | `{files: {resourcePack, dataPack, readme, autotest}, stats, warnings}` |

`options` (all optional, default from the project): `namespace`, `packName`, `mode` (`registry`\|`functions`),
`quickActions`, `afterAction` (`close`\|`none`), `commandMode` (`trigger`\|`direct`), `scale` (1-4, default the
project's 解析度), `tileSize`, `autotest`.

## A worked example

```
mcms.project.create        {fromTemplate: "lobby", path: "./lobby.mcms.json"}   -> {handle, project}
mcms.element.update         {handle, pageId: <first page>, ids: [<label id>], patch: {text: "新標題"}}
mcms.check.project          {handle}                                            -> {issues, counts}
mcms.preview.page           {handle, pageId: <first page>}                      -> {path}  (look at the PNG)
mcms.export.write           {handle, outDir: "./out"}                          -> {files}  (resourcepack.zip, datapack.zip, README_zh-TW.txt)
```

`scripts/mcp-smoke.ts` runs exactly this shape of sequence against the real server over stdio.
