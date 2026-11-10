// Headless demo export (same src/core code as the browser; pictures rendered with @napi-rs/canvas).
//   npm run demo:export -- [--mode registry|functions|both] [--commands trigger|direct] [--scale 1|2|3|4] [--out exports/demo] [--autotest]
// Writes <out>/<mode>/{resourcepack.zip,datapack.zip,README_zh-TW.txt[,autotest.zip]} and <out>/HANDOFF.md.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { buildExport, zipExport, type ExportBuild } from '../src/core/export';
import * as C from '../src/core/export/constants';
import { DEMO_NAMESPACE, demoOptions, demoPages, demoScale } from '../src/core/export/demo';
import { autotestTick } from '../src/core/export/pack';
import { DEMO_PACK_KB } from '../src/core/export/readme';
import { autotestTriggers } from '../src/core/export/triggers';
import type { TriggerAction } from '../src/core/export/types';
import type { CanvasLike, RenderEnv } from '../src/core/render/types';
import { DEMO_USAGE, parseDemoArgs, UsageError, type DemoArgs } from './demo-args';

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

const kindLabel = (a: TriggerAction) => (a.kind === 'page' ? `page -> ${a.target}` : a.kind);
const firstUse = (a: TriggerAction) => (a.footerOnly ? 'footer' : a.firstPage);

function triggerTable(b: ExportBuild): string[] {
  const t = b.triggers!;
  return [
    `### ${b.options.mode} (objective \`${t.objective}\`, ${t.actions.length} ids)`,
    '',
    '| id | kind | command run by trigger_tick | first page |',
    '|----|------|-----------------------------|------------|',
    ...t.actions.map((a) => `| ${a.id} | ${kindLabel(a)} | \`${a.command}\` | ${firstUse(a)} |`),
    '',
  ];
}

function triggerSchedule(builds: ExportBuild[]): string[] {
  const n = builds[0].pages.length;
  const T = autotestTick(n - 1);
  const L = [
    `## Auto-test: trigger checks (after the last page, T = ${T})`,
    '',
    'The auto-test plays the button presses itself: `say TRIGGER <label> id <N>`, then the player runs',
    '`trigger <objective> set <N>` (the same command a button sends). The data pack\'s `trigger_tick` then runs the real',
    'command as the player within one tick. Tick functions run silently, so the dispatched command itself writes no log',
    'line; the `time set day` test therefore sets midnight first and logs a check 1 s later. Expected `latest.log` lines',
    '(`<player>` = your name):',
    '',
    '| mode | tick | expected log line | what to check |',
    '|------|------|-------------------|---------------|',
  ];
  for (const b of builds) {
    for (const t of autotestTriggers(b.triggers!, b.options.mode, T)) {
      const effect =
        t.label === 'time_day' ? 'sky turns from midnight to day' :
        t.label === 'weather_clear' ? 'no log line from `weather clear`; rain stops if it was raining' :
        t.label === 'close' ? 'the open dialog (last page) closes' : `the \`${t.label.slice(4)}\` dialog opens`;
      L.push(`| ${b.options.mode} | ${t.tick} | \`[<player>] TRIGGER ${t.label} id ${t.id}\` | runs \`${t.command}\`: ${effect} |`);
      if (t.daytimeCheck)
        L.push(`| ${b.options.mode} | ${t.tick + C.AUTOTEST.checkDelay} | \`[<player>] TRIGGER CHECK ${t.label} OK\` | \`FAIL\` = daytime not in ${C.AUTOTEST.dayRange.join('..')}: the trigger -> dispatch chain did not run |`);
    }
  }
  L.push(
    '',
    `\`say AUTOTEST DONE\` stays at tick ${autotestTick(n)}. The last page is closed (registry) or replaced by the lobby`,
    `(functions) at T+${C.AUTOTEST.triggerOffsets[2]}: take its screenshot before that. An error such as`,
    '`Failed to load function mcms_demo:trigger_tick` in the log means a command in the tick function did not parse.',
    '',
  );
  return L;
}

/** Stage H: what the render scale changes and what to look at in the game (nothing above 1x has run there yet). */
function resolutionSection(b: ExportBuild): string[] {
  const { scale, tileSize: T, cellTexels } = b.stats;
  return [
    '## Resolution (render scale, Stage H)',
    '',
    `Pictures at **${scale}x**: tile ${T} GUI px = ${cellTexels}x${cellTexels} texel cells, font JSON \`height: ${T}\` (GUI px), ascent unchanged.`,
    'Tile size per scale: 1x 32, 2x 32, 3x 24, 4x 16 GUI px (cells <= 72 texels). Hit glyphs stay 1x. Layout (message width,',
    'lines, offsets, hit boxes) is in GUI px and identical at every scale. Build the same pages at another scale with',
    '`npm run demo:export -- --autotest --scale N --out exports/demo-Nx` (N = 1..4).',
    'Sharpest when GUI scale / render scale is a whole number (GUI 2 -> 2x, GUI 3 -> 3x, GUI 4 -> 4x or 2x); a render',
    'scale above the GUI scale drops texels (jagged edges, thin strokes may vanish). resourcepack.zip of this demo,',
    `measured: 1x ${DEMO_PACK_KB[1]} KB, 2x ${DEMO_PACK_KB[2]} KB, 3x ${DEMO_PACK_KB[3]} KB, 4x ${DEMO_PACK_KB[4]} KB ` +
      '(2x is ~5x of 1x because small text is anti-aliased instead of pixelated; less than scale^2 above that).',
    '',
    'Check in the game (decompiled, NOT yet run above 1x):',
    `1. \`calibration\` at ${scale}x: the 16 px grid still exact across tile seams (the advance is`,
    '   `(int)(0.5 + actualWidth * height / cellHeight) + 1`, float math); no missing-glyph boxes (cells <= 255 texels).',
    '2. Text crisp at GUI 2 and 4 with 2x; compare `--scale 1` vs `--scale 2` screenshots of `lobby` at GUI 2, 3 and 4.',
    '3. Clicks and tooltips land on the same places as at 1x (hit glyphs are unchanged).',
    '',
  ];
}

function handoff(builds: ExportBuild[], args: DemoArgs, argv: string[]): string {
  const b = builds[0];
  const { out, autotest } = args;
  const trigger = b.options.commandMode === 'trigger';
  const obj = b.triggers?.objective;
  const L: string[] = [];
  L.push(
    '# HANDOFF: MC Menu Studio demo export (Stage C: trigger mode)',
    '',
    `Generated by \`npm run demo:export -- ${argv.join(' ')}\`. Output is byte-reproducible (same command => same bytes).`,
    `Namespace \`${DEMO_NAMESPACE}\`, ${b.pages.length} pages, resolution ${b.stats.scale}x, tile ${b.stats.tileSize} px (${b.stats.cellTexels} texels). Modes: ${builds.map((x) => x.options.mode).join(', ')}.`,
    `Commands: **${b.options.commandMode}**${trigger ? ` (objective \`${obj}\`; buttons run \`trigger ${obj} set <id>\`)` : ' (buttons send the commands themselves, Stage B behaviour)'}.`,
    '',
    '## Files',
    `- \`${out}/<mode>/resourcepack.zip\`: fonts + sheets. Identical bytes for both modes and both command modes (install once).`,
    '- `registry/datapack.zip`: `data/mcms_demo/dialog/<key>.json` + `quick_actions` tag (G opens `calibration`).',
    '- `functions/datapack.zip`: `data/mcms_demo/function/show_<key>.mcfunction` (one line: `dialog show @s {SNBT}`).',
    trigger
      ? '- trigger mode, both data packs: `data/mcms_demo/function/trigger_load.mcfunction` (creates the trigger objective), ' +
          '`trigger_tick.mcfunction` (one `execute as @a[scores={obj=N}] at @s run <command>` line per id, reset, enable), ' +
          'registered in `data/minecraft/tags/function/{load,tick}.json` as `{"id": ..., "required": false}`.'
      : '- direct mode: no trigger functions, no function tags (identical to the Stage B data packs).',
    autotest ? '- `<mode>/autotest.zip`: namespace `mcms_autotest`, objective `mcms_t` (load resets it).' : '- (no autotest.zip: run with `--autotest`)',
    '- `<mode>/README_zh-TW.txt`: the end-user instructions the browser export also ships.',
    '',
    'Test ONE mode per world: both autotest packs use the same `mcms_autotest` functions, and both data packs are named',
    '`datapack.zip` (rename when copying). Registry mode in singleplayer shows the experimental-settings screen; functions',
    'mode needs cheats to OPEN the menu (`/function`); inside the menu, trigger mode needs no permission.',
    '',
    `## Pages${autotest ? ' and auto-test schedule (ticks after load; `say PAGE <key>` then show)' : ''}`,
    '',
    `| k | key | title | size | regions | registry | functions |${autotest ? ' tick |' : ''}`,
    `|---|-----|-------|------|---------|----------|-----------|${autotest ? '------|' : ''}`,
    ...b.pages.map(
      (p, k) =>
        `| ${k} | \`${p.key}\` | ${p.title} | ${p.width}x${p.height} | ${p.regions.length} | \`/dialog show @s ${DEMO_NAMESPACE}:${p.key}\` | \`/function ${DEMO_NAMESPACE}:show_${p.key}\` |${autotest ? ` ${autotestTick(k)} |` : ''}`,
    ),
    autotest ? `\n\`say AUTOTEST DONE\` at tick ${autotestTick(b.pages.length)}.` : '',
    '',
  );
  if (trigger) {
    L.push(
      '## Trigger ids (按鈕編號對照)',
      '',
      'Ids: order of first appearance (pages in order, regions in z-order); identical actions share an id. Functions mode',
      'also gives page navigation an id (it would run `/function`); registry navigation stays `show_dialog`. Anyone can',
      `type \`/trigger ${obj} set <id>\` to run an action without the menu.`,
      '',
      ...builds.flatMap(triggerTable),
    );
    if (autotest) L.push(...triggerSchedule(builds));
  }
  L.push(...resolutionSection(b));
  L.push(
    '## What to look at',
    '1. `calibration`: 16 px grid exact across tile seams; corner squares at (1,1) (247,1) (1,151) (247,151); magenta cross;',
    '   checker at (100,100); gradient bar at y=140; no dark band on the right/bottom edges (VERIFIED §12).',
    '2. Hover (NOT TESTED): each corner, the checker and both halves of the gradient show a tooltip; the bottom-right',
    '   corner is tooltip-only.',
    '3. Click (NOT TESTED): top-left copies `MCMS calibration: top-left`; top-right runs `random value 1..6`; bottom-left',
    '   opens `lobby`; checker = close; gradient (two 128x6 hit glyphs) runs `random value 1..100`. Hit boxes should match',
    trigger
      ? '   the squares exactly. Trigger mode: a click should NOT show the "confirm command" screen; the command runs a tick later.\n' +
          '   Tick functions run silently: `random value` shows no result to the player in trigger mode (expected, not a bug).'
      : '   the squares exactly. Direct mode: privileged commands show the "confirm command" screen on every click (VERIFIED §13).',
    '4. `after_action: close` (DECOMPILED §13): any body click closes the dialog; navigation opens the next page; the footer',
    '   button closes it; Esc closes it.',
    '5. Template pages: buttons run harmless commands (time/weather/gamemode/random/list; the shop uses `/give`).',
    '',
    '## Exporter assumptions (all in `src/core/export/constants.ts`)',
    `- \`plain_message.width = W + ${C.WIDGET_PADDING + C.WIDTH_MARGIN}\`; peak running advance <= W + 1 (limit W + ${C.WIDTH_MARGIN}).`,
    `- Space font U+E000+k / U+E020+k; glyphs from U+E100; fonts \`y<N>\` with ascent ${C.BASELINE} - N, only for used N (max here: ${b.stats.maxOffset}).`,
    `- Hit glyph pixels alpha ${C.HIT_ALPHA}/255, cell = region (split above ${C.MAX_CELL} px); emitted after all tiles; events only on hit runs.`,
    `- \`run_command\` without leading slash; close = \`${C.CLOSE_COMMAND}\`; dialog \`pause: ${C.DIALOG_PAUSE}\`, footer width ${C.FOOTER_BUTTON_WIDTH}.`,
    `- trigger mode: objective \`${C.TRIGGER_OBJECTIVE_PREFIX}<ns>\` (type trigger), functions \`${C.TRIGGER_FUNCTIONS.load}\` / \`${C.TRIGGER_FUNCTIONS.tick}\`; with \`after_action: none\` the footer gets the close action.`,
    `- pack formats: resource ${C.RESOURCE_PACK_FORMAT}, data ${C.DATA_PACK_FORMAT}.`,
    '',
    '## Stats',
    ...builds.map((x) => `- ${x.options.mode}: ${JSON.stringify(x.stats)}`),
    '',
  );
  return L.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  let args: DemoArgs;
  try {
    args = parseDemoArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`demo:export: ${e.message}\n${DEMO_USAGE}`);
    process.exit(2);
  }
  if (args.help) {
    console.log(DEMO_USAGE);
    return;
  }
  const { modes, out, autotest, commandMode } = args;
  const env: RenderEnv = { createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike };
  const t0 = performance.now();
  const scale = demoScale(args.scale);
  const pages = demoPages(env, scale);
  console.log(
    `MC Menu Studio demo export: ${pages.length} pages (${pages.map((p) => p.key).join(', ')}), namespace ${DEMO_NAMESPACE}, ` +
      `commands ${commandMode}, resolution ${scale}x`,
  );
  const builds: ExportBuild[] = [];
  for (const mode of modes) {
    const build = buildExport(pages, demoOptions(mode, autotest, commandMode, scale), { resourcePack: 'resourcepack.zip', dataPack: 'datapack.zip', autotest: 'autotest.zip' });
    const zips = await zipExport(build);
    const dir = join(out, mode);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'resourcepack.zip'), zips.resourcePack);
    writeFileSync(join(dir, 'datapack.zip'), zips.dataPack);
    writeFileSync(join(dir, 'README_zh-TW.txt'), build.readme);
    if (zips.autotest) writeFileSync(join(dir, 'autotest.zip'), zips.autotest);
    else rmSync(join(dir, 'autotest.zip'), { force: true }); // never leave a stale auto-test pack behind
    const s = build.stats;
    const pad = ''.padEnd(9);
    console.log(
      `${mode.padEnd(9)} ${s.scale}x, tile ${s.tileSize} px (${s.cellTexels} texels): tiles ${s.tilesPlaced} (${s.tilesUnique} unique, ${s.tilesEmpty} empty skipped), sheets ${s.sheets} ` +
        `(${s.sheets - s.hitSizes} tile + ${s.hitSizes} hit), glyphs ${s.glyphs}, fonts ${s.fonts} (max y ${s.maxOffset}), ` +
        `regions ${s.regions} -> ${s.hitGlyphs} hit glyphs, components ${s.components}`,
    );
    console.log(
      `${pad} resourcepack.zip ${kb(zips.resourcePack.length)}, datapack.zip ${kb(zips.dataPack.length)}` +
        `${zips.autotest ? `, autotest.zip ${kb(zips.autotest.length)}` : ''} -> ${dir}/`,
    );
    if (build.triggers) {
      console.log(`${pad} trigger ids (objective ${build.triggers.objective}): ${build.triggers.actions.length}`);
      for (const a of build.triggers.actions)
        console.log(`${pad}   ${String(a.id).padStart(2)}  ${kindLabel(a).padEnd(20)} ${a.command}  [${firstUse(a)}]`);
    }
    for (const w of build.warnings) console.log(`${pad} ! ${w.message}`);
    builds.push(build);
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'HANDOFF.md'), handoff(builds, args, argv));
  console.log(`HANDOFF: ${join(out, 'HANDOFF.md')} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
