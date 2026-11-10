// Client-metric assumptions of the exporter. THIS IS THE ONLY FILE THAT HOLDS SUCH NUMBERS (BRIEF §1): when a real-game
// test disagrees, fix the value here. Tags: VERIFIED = seen in the real 26.3 client (docs/VERIFIED.md §n),
// DECOMPILED = read in Mojang's shipped classes, WIKI = reference/docs dump, TEST = not verified yet.

/** VERIFIED §6: `pack.mcmeta` min_format/max_format for Minecraft Java 26.3. */
export const RESOURCE_PACK_FORMAT = 97;
export const DATA_PACK_FORMAT = 121;

/** VERIFIED §1: a glyph with `ascent = BASELINE - N` has its top edge N px below the top of the first text line. */
export const BASELINE = 7;
/** VERIFIED §1/§3: height of one text line (the empty "\n" lines after the picture). */
export const LINE_HEIGHT = 9;
/** VERIFIED §3: the text widget's text width is `plain_message.width - WIDGET_PADDING`. */
export const WIDGET_PADDING = 8;
/** VERIFIED §3 (THE WRAP RULE): `plain_message.width = W + 8 + 4`, never `W + 8`. */
export const WIDTH_MARGIN = 4;
/** WIKI/DECOMPILED: `plain_message.width` must be 1..1024, so W <= 1024 - 12. */
export const MAX_MESSAGE_WIDTH = 1024;
export const MAX_PICTURE_WIDTH = MAX_MESSAGE_WIDTH - WIDGET_PADDING - WIDTH_MARGIN;

/**
 * Advance of a bitmap glyph in GUI px. DECOMPILED (26.3 client: BitmapProvider.Definition#load, read by Hermes; not
 * yet run in the game for height != cell height) + VERIFIED §2 for height == cell height (seams exact):
 *
 *   int cellWidth = image.getWidth() / columns, cellHeight = image.getHeight() / rows;   // texels
 *   float pixelScale = (float) this.height / cellHeight;                                  // `height` = JSON field
 *   int actualGlyphWidth = getActualGlyphWidth(image, cellWidth, cellHeight, col, row);   // rightmost alpha != 0, + 1
 *   ... new Glyph(pixelScale, image, x, y, cellWidth, cellHeight,
 *                 (int) (0.5 + actualGlyphWidth * pixelScale) + 1, ascent);              // the advance
 *
 * Float arithmetic: float pixelScale, float product (Math.fround), then a double add of 0.5 and a truncation.
 * With height == cellHeight (scale 1) this is `actualWidth + 1`. `actualWidth` is in texels (0 for an empty cell).
 */
export function bitmapAdvance(actualWidth: number, height: number, cellHeight: number): number {
  const pixelScale = Math.fround(height / cellHeight);
  return Math.trunc(0.5 + Math.fround(actualWidth * pixelScale)) + 1;
}

/** Advance of a glyph whose cell has `scale` texels per GUI px (tile cells: JSON height T, cell T * scale texels). */
export function glyphAdvance(actualWidth: number, scale = 1): number {
  return bitmapAdvance(actualWidth, 1, scale);
}

/** VERIFIED §2: space font, U+E000+k advances +2^k and U+E020+k advances -2^k, k = 0..10. */
export const SPACE_POS_BASE = 0xe000;
export const SPACE_NEG_BASE = 0xe020;
export const SPACE_BITS = 11;
/** The whole U+E000..U+E02F block stays reserved for spaces; glyph code points start above it. */
export const SPACE_BLOCK_END = 0xe02f;

/**
 * Code points for picture glyphs: BMP private use U+E100..U+F8FF (VERIFIED with the spike), then the supplementary
 * private-use area A (U+F0000..) only for very large projects (TEST: not tried in game yet).
 */
export const GLYPH_RANGES: readonly (readonly [number, number])[] = [
  [0xe100, 0xf8ff],
  [0xf0000, 0xffffd],
];

/** VERIFIED §1: 32 px tiles join seamlessly. Allowed custom sizes for the exporter option. */
export const DEFAULT_TILE_SIZE = 32;
export const MIN_TILE_SIZE = 8;
/** TEST/[GW]: glyph cells stay <= 128 px per side; hit regions larger than that are split into several glyphs. */
export const MAX_CELL = 128;

/**
 * DECOMPILED (Stage H facts 3-4): glyphs are stitched into 256 x 256 atlas pages with 1 texel spacing, sampled nearest.
 * A cell wider or taller than 255 texels cannot be stitched (the game draws the missing-glyph box).
 */
export const MAX_CELL_TEXELS = 255;

/**
 * Tile size in GUI px per render scale (cell = T * scale texels, kept <= 72 so 3 x 3 cells or more share an atlas
 * page): 1x 32 (32 texels, VERIFIED), 2x 32 (64), 3x 24 (72), 4x 16 (64). TEST: scales above 1 not run in the game yet.
 */
export const TILE_SIZE_BY_SCALE: Readonly<Record<1 | 2 | 3 | 4, number>> = { 1: 32, 2: 32, 3: 24, 4: 16 };

export function defaultTileSize(scale: number): number {
  return TILE_SIZE_BY_SCALE[scale as 1 | 2 | 3 | 4] ?? DEFAULT_TILE_SIZE;
}
/** Sheet packing: at most 16 columns x 16 rows of cells per PNG. */
export const SHEET_COLUMNS = 16;
export const SHEET_MAX_ROWS = 16;

/**
 * DECOMPILED §10/§11: hit glyph pixels have alpha 1/255. Non-zero alpha => full actual width (exact hit box);
 * the text shader discards such faint pixels [GW], so the glyph is invisible (TEST: invisibility not seen in game yet).
 */
export const HIT_ALPHA = 1;

/** VERIFIED §1 (white keeps the texture colours) + §9 (vanilla draws a drop shadow unless shadow_color is 0). */
export const RUN_STYLE = { color: '#ffffff', shadow_color: 0 } as const;

/** VERIFIED §1: vertical offsets up to N = 288 were seen working; larger offsets are TEST. */
export const MAX_VERIFIED_OFFSET = 288;

/** Dialog shape used by the spike (VERIFIED §1). Footer button width: JAR default 150. */
export const DIALOG_TYPE = 'minecraft:notice';
export const FOOTER_BUTTON_WIDTH = 150;
/** VERIFIED §1: the dialog does not pause; `after_action` is an export option (its footer semantics are TEST). */
export const DIALOG_PAUSE = false;

/** WIKI: `run_command` does not need a leading slash (the spike used none). */
export const COMMAND_PREFIX = '';
/** The "close menu" action runs this command (needs permission level 2; in trigger mode the tick function runs it). */
export const CLOSE_COMMAND = 'dialog clear @s';

/**
 * DECOMPILED §13: trigger mode. Buttons run `trigger mcms_<ns> set <id>` (permission level 0, no confirm screen);
 * `data/<ns>/function/trigger_tick.mcfunction` (tag minecraft:tick) runs the real command as the player.
 * TEST: the whole chain (click -> trigger -> dispatch) has not run in the game yet.
 */
export const TRIGGER_OBJECTIVE_PREFIX = 'mcms_';
export const TRIGGER_FUNCTIONS = { load: 'trigger_load', tick: 'trigger_tick' } as const;
/** WIKI/TEST: chat input is limited to 256 characters; longer commands get a warning (function lines have no such limit). */
export const MAX_TRIGGER_COMMAND_WARN = 256;

/** VERIFIED §5: auto-test data pack used by Hermes (page k shown at tick firstTick + ticksPerPage * k). */
export const AUTOTEST = {
  namespace: 'mcms_autotest',
  objective: 'mcms_t',
  firstTick: 120,
  ticksPerPage: 800,
  /** Trigger mode: ticks after the last page's tick at which the three trigger tests run (time, weather, nav/close). */
  triggerOffsets: [40, 120, 200],
  /** The `time set day` test reads `time query minecraft:day` this many ticks after the trigger... */
  checkDelay: 20,
  /** ...and expects it in this range (1000 = day, plus the ticks that passed if the daylight cycle runs). */
  dayRange: [1000, 1100],
} as const;

/** Determinism: every zip entry gets this timestamp; deflate levels are fixed. */
export const ZIP_DATE_MS = Date.UTC(2026, 0, 1, 0, 0, 0);
export const PNG_DEFLATE_LEVEL = 9;
export const ZIP_DEFLATE_LEVEL = 9;
