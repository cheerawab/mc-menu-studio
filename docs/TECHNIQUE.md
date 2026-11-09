# TECHNIQUE — pixel-positioned clickable GUIs inside the vanilla Dialog screen

> **UPDATE: the core technique has now been verified in a real 26.3 client. Read `docs/VERIFIED.md` FIRST; it supersedes
> this file wherever they differ** (notably: `plain_message.width` must be `W + 8 + 4`, not `W + 8`, otherwise the line wraps;
> datapack dialogs make singleplayer show an "experimental settings" screen, so also offer a `functions` export mode with
> inline dialogs). A working reference implementation of the exporter core is in `reference/spike/spike_gen.py`.

Status legend: **[JAR]** confirmed by reading the shipped Minecraft 26.3 jars (Hermes did this).
**[GW]** claimed by the Glyphwork author ("verified against the 26.3 client"), see `reference/glyphwork`.
**[TEST]** must be confirmed in the real game by Hermes; this file will be updated with the result.
Do not treat [GW]/[TEST] items as proven. Write code so that these assumptions live in ONE small,
well-named module (constants + the layout arithmetic), so a wrong assumption is a one-line fix.

## 1. Idea in one paragraph

A vanilla Java client (26.3, also 1.21.6+) can show a server-defined **Dialog** screen. A dialog body can be a
single `minecraft:plain_message` whose `contents` is a text component. Text components can select a **font**
per run, and resource-pack fonts can map private-use characters (U+E000..U+F8FF) to **PNG bitmaps**
("glyphs"). With (a) a *space* font that moves the text cursor by exact pixel amounts (including negative),
and (b) one font per vertical offset (bitmap `ascent` is how far the glyph sits above the baseline, and may be
negative), any bitmap can be drawn at any (x, y) pixel position, in any paint order, on the dialog's first text
line. Click/hover events attached to a text run make that run clickable / hoverable exactly where its glyphs are
drawn. So: **render the whole menu to one RGBA bitmap, cut it into tiles, and emit each tile as a glyph**.
Everything is static data (data pack + resource pack): it works in singleplayer and on any server.

## 2. Dialog definition (data pack)  `data/<ns>/dialog/<page>.json`

```json
{
  "type": "minecraft:notice",
  "title": {"text": "選單"},
  "can_close_with_escape": true,
  "pause": false,
  "after_action": "none",
  "body": [{"type": "minecraft:plain_message", "width": 328, "contents": [ /* components, see §4 */ ]}],
  "action": {"label": {"text": "關閉"}, "width": 150}
}
```
- Types/fields [JAR]: types `notice|confirmation|multi_action|server_links|dialog_list`; common fields `title,
  external_title, body, inputs, can_close_with_escape, pause, after_action`. `plain_message.width` is 1..1024
  (default 200). `after_action` ∈ `close|none|wait_for_response`; `none` is only allowed when `pause` is false.
- `notice` always shows ONE footer button (default label "OK", `gui.ok`). Its `action` can be customised. [TEST]:
  whether the footer button closes the dialog when `after_action` is `none`. If not, decide between
  `after_action: close` (every click closes) or another dialog type. Make this an export option.
- Header has the title and a small **warning icon button** that cannot be removed [JAR]
  (`assets/minecraft/textures/gui/sprites/dialog/warning_button{,_disabled,_highlighted}.png`, 3 sprites).
- Open a page: `/dialog show @s <ns>:<page>`; in a text/button click: `{"action":"show_dialog","dialog":"<ns>:<page>"}`.
- Convenience: tag `data/minecraft/tags/dialog/quick_actions.json` `{"values":["<ns>:<page>"]}` binds the page to the
  **G** key (one entry => G opens it directly). `pause_screen_additions` does the same from the pause menu. [JAR: tags exist]
  [TEST]: G opens a single-entry quick_actions dialog directly.
- Click events available [JAR/wiki]: `run_command` (runs as the player, needs permission; cannot run chat commands such
  as /say /tell), `show_dialog`, `open_url`, `copy_to_clipboard`, `suggest_command`, `custom` (server plugin only).
  Hover: `show_text`.
- Text components inside dialogs do NOT resolve `selector`/`score`/`nbt` (Mojira MC-297871, "Invalid") [JAR/wiki].

## 3. Resource pack (fonts)

- `pack.mcmeta` for 26.3 [JAR+wiki]: resource pack `{"pack":{"description":"...","min_format":97,"max_format":97}}`;
  data pack `{"pack":{"description":"...","min_format":121,"max_format":121}}`. (26.3 = resource 97.1, data 121.0.)
  Do not emit deprecated `pack_format`/`supported_formats` (we only target new versions).
- **space font** `assets/<ns>/font/space.json`: `{"providers":[{"type":"space","advances":{"\ue000":1,"\ue001":2,"\ue002":4,...,"\ue020":-1,"\ue021":-2,...}}]}`
  Powers of two up to 2^10 (+-1024) are enough: any dx is a sum of <= 11 of them. [GW]
- **bitmap font per vertical offset N**: `assets/<ns>/font/y<N>.json`:
  `{"providers":[<the same space provider>, {"type":"bitmap","file":"<ns>:font/<sheet>.png","height":H,"ascent":7-N,"chars":["\ue100\ue101", ...]}, ...]}`
  - First text line's baseline is 7 px below the line top, so a glyph whose TOP should be N px below the line top
    needs `ascent = 7 - N`. `ascent` may be negative; the client only rejects `ascent > height`
    (error "Ascent X higher than height Y") [JAR]. [GW]: works for N up to hundreds.
  - `height` = cell height of the sheet; keep cells >= 8 px high so `ascent=7` is legal for N=0 [GW]. Cells <= 128x128 [GW].
  - A sheet is a PNG = grid of equal cells; `chars` rows have equal length; a NUL char (`\u0000`) pads empty cells.
  - Only emit fonts for the N values that are actually used (with tile rows on a fixed grid that is a handful).
  - Include the space provider in every y-font so spaces can be written inside any run [GW].
- Glyph **advance** rule (client): `advance = (rightmost column that has any non-zero alpha) + 1` pixels, plus 1
  [GW: `actualWidth + 1`]. A fully opaque 32-px-wide cell therefore advances 33, not 32. The layout code MUST model this
  exactly and insert a corrective space after every glyph (or choose cell widths so a transparent right column exists).
  [TEST] confirm the exact advance of an opaque 16/32 px cell.
- Glyphs are drawn with the text colour as a multiplier: use `"color":"#ffffff"` so the PNG shows as authored.
  Alpha < 0.1 is discarded by the text shader (those pixels are invisible but still count for hit testing) [GW].
- Text shadow: dialog body text appears to be drawn without a shadow [GW: "font without shadow"], but if a drop shadow
  shows up use the style field `shadow_color` (set fully transparent) on every run. [TEST]

## 4. Composing the body

All visual tiles go on the **first text line** (line 0), in paint order (later = on top). For each tile:
1. move the cursor to the tile's x with space glyphs (`font: "<ns>:space"`, or space chars inside the y-font run),
2. emit the tile's char in font `<ns>:y<tileY>`.
After the last tile, move to exactly x = scene width W so the first line's total advance is **W** [GW: "every
non-empty line ends at the same x" because the client centres each line]. The widget width is `W + 2*4`
(client text padding 4 px per side [GW: FocusableTextWidget.DEFAULT_PADDING = 4]) -> text origin x = 4 inside the widget.
Because only line 0 has content, put `ceil(H/9)` further empty lines (`"\n"`) after it: the widget is as tall as its lines
(9 px per line), the dialog reserves that height, and clicks only register inside the widget [GW]. [TEST]: header/footer do
not overlap the drawn glyphs; the widget is scrollable when taller than the window.
Merge consecutive glyphs of the same font/colour/events into one run to keep the JSON small.

## 5. Click and hover regions (hitboxes)

- A run with `click_event`/`hover_event` is interactive over the area where its glyphs are drawn. [GW] The client
  hit-tests each glyph against its drawn box and the LAST glyph under the cursor that has a click event wins.
  So draw **invisible hit glyphs after all visuals**: a sheet whose cells are filled with alpha=1/255 pixels
  (`0x01000000` ARGB) gives a clickable, invisible rectangle of exactly the cell size. One sheet per distinct hit size
  (or tile big regions with <=32 px cells). Hit glyphs without events never block clicks below them.
- Space glyphs: a positive space that inherits a click event becomes clickable across its advance, so keep
  event-carrying runs free of positive spaces; put corrective moves in separate runs without events. [GW]
- Tooltip: `hover_event: {"action":"show_text","value":{"text":"..."}}`. [TEST]
- Page navigation = `click_event: {"action":"show_dialog","dialog":"<ns>:<page>"}`. With `after_action: none` the
  current dialog stays until the new one replaces it. [TEST]

## 6. Client facts from the jars [JAR]

- Dialog layout is fixed by the game: header (title + warning icon) / scrollable body / optional footer. Widgets used:
  `FocusableTextWidget` for plain_message (with a possible background fill when focused), `MultiLineTextWidget`,
  `ItemDisplayWidget`, `EditBox`, `MultiLineEditBox`, `CycleButton`, `Checkbox`, slider, `Button`.
- Dialog code is unchanged between 26.3 and 26.4-snapshot-7 (class list and field names identical).
- Vanilla font definitions are in `reference/minecraft-26.3/font/` (read-only reference; **never ship Mojang's font
  textures** in an exported pack).
- Custom-screen warning text lives in `lang`: the player can always reject a custom screen. Do not try to hide it.

## 7. Static-export limits (say these in the UI, in Traditional Chinese)

- No hover/pressed visual states (only tooltips), no live text, no text input, no animation, no scrolling inside
  the picture. Inputs would have to be native dialog inputs (out of scope).
- `run_command` runs as the player: in singleplayer it needs cheats enabled for op commands; on a server only commands
  the player may run work. (Stretch goal: "trigger mode" using `/trigger` + a datapack tick function so normal players
  can press buttons that run privileged commands.)
- Menu size: practical limit is the window. At 1920x1080 with GUI scale 3 the usable area is about 640x360 minus the
  header/footer. Warn when a page will not fit at the chosen GUI scale.
- Players who decline the resource pack see garbage private-use characters; mention it in the export README.

## 8. How Hermes will test

Hermes copies `resourcepack.zip` to the Minecraft 26.3 instance `resourcepacks/` and `datapack` into a test world's
`datapacks/`, opens the dialog (G key or `/dialog show`), takes screenshots and clicks buttons. Findings are written back
here under "VERIFIED" and into your next prompt. Expect corrections to the [GW]/[TEST] items above.
