// Pack files (resource pack, data pack, auto-test data pack) and byte-reproducible zips (jszip): sorted entry names,
// explicit directory entries, one fixed timestamp, fixed deflate level, PNG/zip entries stored.
import JSZip from 'jszip';
import {
  AUTOTEST,
  BASELINE,
  DATA_PACK_FORMAT,
  RESOURCE_PACK_FORMAT,
  SPACE_BITS,
  SPACE_NEG_BASE,
  SPACE_POS_BASE,
  TRIGGER_FUNCTIONS,
  ZIP_DATE_MS,
  ZIP_DEFLATE_LEVEL,
} from './constants';
import { functionName, functionSource } from './dialogs';
import type { Sheet } from './sheets';
import { functionTag, triggerLoadSource, triggerTickSource, type AutotestTrigger } from './triggers';
import type { ExportMode, FileMap, TriggerTable } from './types';

const encoder = new TextEncoder();
export const utf8 = (s: string): Uint8Array => encoder.encode(s);

/** JSON with every non-ASCII UTF-16 unit escaped as \uXXXX (like the spike's `ensure_ascii`, VERIFIED). */
export function asciiJson(value: unknown, indent?: number): string {
  return JSON.stringify(value, null, indent).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

const jsonFile = (value: unknown) => utf8(`${asciiJson(value, 2)}\n`);

/** Space provider: U+E000+k = +2^k, U+E020+k = -2^k (VERIFIED §2). Included in every font. */
export function spaceProvider(): { type: 'space'; advances: Record<string, number> } {
  const advances: Record<string, number> = {};
  for (let k = 0; k < SPACE_BITS; k++) advances[String.fromCharCode(SPACE_POS_BASE + k)] = 2 ** k;
  for (let k = 0; k < SPACE_BITS; k++) advances[String.fromCharCode(SPACE_NEG_BASE + k)] = -(2 ** k);
  return { type: 'space', advances };
}

/** One `y<N>` font: the sheets whose glyphs are drawn at vertical offset N. */
export interface FontPlan {
  offset: number;
  sheets: Sheet[];
}

export function bitmapProvider(ns: string, sheet: Sheet, offset: number) {
  return { type: 'bitmap', file: `${ns}:font/${sheet.name}.png`, height: sheet.cellH, ascent: BASELINE - offset, chars: sheet.chars };
}

export function resourcePackFiles(ns: string, description: string, sheets: Sheet[], fonts: FontPlan[]): FileMap {
  const files: FileMap = new Map();
  files.set('pack.mcmeta', jsonFile({ pack: { description, min_format: RESOURCE_PACK_FORMAT, max_format: RESOURCE_PACK_FORMAT } }));
  const space = spaceProvider();
  files.set(`assets/${ns}/font/space.json`, utf8(asciiJson({ providers: [space] })));
  for (const f of fonts) {
    const providers = [space, ...f.sheets.map((s) => bitmapProvider(ns, s, f.offset))];
    files.set(`assets/${ns}/font/y${f.offset}.json`, utf8(asciiJson({ providers })));
  }
  for (const s of sheets) files.set(`assets/${ns}/textures/font/${s.name}.png`, s.png);
  return files;
}

export interface DataPage {
  key: string;
  dialog: Record<string, unknown>;
}

/**
 * Data pack: the pages (registry: dialog JSON; functions: one `dialog show` line each) and, in trigger mode with at
 * least one id, `trigger_load` / `trigger_tick` registered in the minecraft:load / minecraft:tick function tags.
 */
export function dataPackFiles(
  ns: string,
  description: string,
  mode: ExportMode,
  pages: DataPage[],
  quickActions: boolean,
  triggers: TriggerTable | null = null,
): FileMap {
  const files: FileMap = new Map();
  files.set('pack.mcmeta', jsonFile({ pack: { description, min_format: DATA_PACK_FORMAT, max_format: DATA_PACK_FORMAT } }));
  if (mode === 'registry') {
    for (const p of pages) files.set(`data/${ns}/dialog/${p.key}.json`, utf8(asciiJson(p.dialog)));
    if (quickActions && pages.length) files.set('data/minecraft/tags/dialog/quick_actions.json', jsonFile({ values: [`${ns}:${pages[0].key}`] }));
  } else {
    for (const p of pages) files.set(`data/${ns}/function/${functionName(p.key)}.mcfunction`, utf8(functionSource(p.dialog)));
  }
  if (triggers?.actions.length) {
    files.set(`data/${ns}/function/${TRIGGER_FUNCTIONS.load}.mcfunction`, utf8(triggerLoadSource(triggers)));
    files.set(`data/${ns}/function/${TRIGGER_FUNCTIONS.tick}.mcfunction`, utf8(triggerTickSource(triggers)));
    files.set('data/minecraft/tags/function/load.json', jsonFile(functionTag(`${ns}:${TRIGGER_FUNCTIONS.load}`)));
    files.set('data/minecraft/tags/function/tick.json', jsonFile(functionTag(`${ns}:${TRIGGER_FUNCTIONS.tick}`)));
  }
  return files;
}

/** Tick at which the auto-test shows page k (VERIFIED §5). */
export const autotestTick = (k: number) => AUTOTEST.firstTick + AUTOTEST.ticksPerPage * k;

/** Trigger mode part of the auto-test: the objective of the menu and the tests to run after the last page. */
export interface AutotestTriggerPlan {
  objective: string;
  tests: AutotestTrigger[];
}

/**
 * Hermes' auto-test data pack (VERIFIED §5): `load` (re)creates objective mcms_t and resets it; `tick` counts ticks per
 * player and at tick 120 + 800*k says `PAGE <key>` (for latest.log) and then shows page k. Trigger mode adds the
 * trigger tests (see autotestTriggers) during the last page: `say TRIGGER <label> id <N>`, then the player runs
 * `trigger <objective> set <N>`; the `time set day` test sets midnight first and logs `TRIGGER CHECK time_day OK|FAIL`.
 */
export function autotestFiles(ns: string, mode: ExportMode, keys: string[], trigger: AutotestTriggerPlan | null = null): FileMap {
  const { namespace: at, objective: obj } = AUTOTEST;
  const files: FileMap = new Map();
  const variant = trigger ? `${mode}, trigger` : mode;
  files.set('pack.mcmeta', jsonFile({ pack: { description: `MC Menu Studio autotest (${ns}, ${variant})`, min_format: DATA_PACK_FORMAT, max_format: DATA_PACK_FORMAT } }));
  files.set('data/minecraft/tags/function/load.json', jsonFile({ values: [`${at}:load`] }));
  files.set('data/minecraft/tags/function/tick.json', jsonFile({ values: [`${at}:tick`] }));
  const load = [
    `scoreboard objectives add ${obj} dummy`,
    `scoreboard players reset * ${obj}`,
    `say MCMS AUTOTEST LOADED ${ns} ${mode} ${keys.length} pages${trigger ? `, trigger mode, ${trigger.tests.length} trigger tests` : ''}`,
  ];
  const tick = [`scoreboard players add @a ${obj} 1`];
  keys.forEach((key, k) => {
    const sel = `@a[scores={${obj}=${autotestTick(k)}}]`;
    tick.push(`execute as ${sel} run say PAGE ${key}`);
    tick.push(mode === 'registry' ? `execute as ${sel} run dialog show @s ${ns}:${key}` : `execute as ${sel} run function ${ns}:${functionName(key)}`);
  });
  for (const t of trigger?.tests ?? []) {
    const sel = `@a[scores={${obj}=${t.tick}}]`;
    if (t.daytimeCheck) tick.push(`execute as ${sel} run time set midnight`);
    tick.push(`execute as ${sel} run say TRIGGER ${t.label} id ${t.id}`);
    tick.push(`execute as ${sel} run trigger ${trigger!.objective} set ${t.id}`);
    if (t.daytimeCheck) {
      const later = `@a[scores={${obj}=${t.tick + AUTOTEST.checkDelay}}]`;
      const range = `${AUTOTEST.dayRange[0]}..${AUTOTEST.dayRange[1]}`;
      tick.push(`execute as ${later} store result score #daytime ${obj} run time query minecraft:day`);
      tick.push(`execute as ${later} if score #daytime ${obj} matches ${range} run say TRIGGER CHECK ${t.label} OK`);
      tick.push(`execute as ${later} unless score #daytime ${obj} matches ${range} run say TRIGGER CHECK ${t.label} FAIL`);
    }
  }
  tick.push(`execute as @a[scores={${obj}=${autotestTick(keys.length)}}] run say AUTOTEST DONE`);
  files.set(`data/${at}/function/load.mcfunction`, utf8(`${load.join('\n')}\n`));
  files.set(`data/${at}/function/tick.mcfunction`, utf8(`${tick.join('\n')}\n`));
  return files;
}

/** Zips a file map reproducibly: same files => same bytes, in Node and in the browser. */
export async function zipFiles(files: FileMap): Promise<Uint8Array> {
  const zip = new JSZip();
  const date = new Date(ZIP_DATE_MS);
  const dirs = new Set<string>();
  for (const name of files.keys()) {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(`${parts.slice(0, i).join('/')}/`);
  }
  for (const name of [...dirs, ...files.keys()].sort()) {
    if (name.endsWith('/')) {
      zip.file(name, null, { dir: true, date, createFolders: false });
      continue;
    }
    const stored = /\.(png|zip)$/i.test(name);
    zip.file(name, files.get(name)!, { date, createFolders: false, binary: true, compression: stored ? 'STORE' : 'DEFLATE' });
  }
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: ZIP_DEFLATE_LEVEL },
    platform: 'DOS',
  });
}
