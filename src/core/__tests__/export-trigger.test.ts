// Trigger mode (docs/VERIFIED.md §13): id table, trigger_tick text, click events, footer close action, auto-test
// extension, and the guarantee that `direct` keeps the Stage B bytes.
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildExport, ExportError, zipExport, type ExportBuild, type ExportMode, type ExportOptions, type ExportPage } from '../export';
import { demoOptions, demoPages } from '../export/demo';
import { autotestFiles, autotestTick } from '../export/pack';
import { checkExport, countCommandActions } from '../export/project';
import { autotestTriggers, dispatchedCommand } from '../export/triggers';
import type { Project } from '../model/types';
import type { CanvasLike, RenderEnv } from '../render/types';
import { TEMPLATES } from '../templates';
import { readDialog, simulatePage } from './helpers/clientSim';
import { fileMapHash, triggerPages } from './helpers/triggerFixture';

const dec = (b?: Uint8Array) => new TextDecoder().decode(b);
const MODES: ExportMode[] = ['registry', 'functions'];
const opts = (mode: ExportMode, extra: Partial<ExportOptions> = {}): ExportOptions => ({
  namespace: 'trig', packName: 'T', mode, quickActions: true, afterAction: 'close', commandMode: 'trigger', ...extra,
});
const TAGS = ['data/minecraft/tags/function/load.json', 'data/minecraft/tags/function/tick.json'];

/** Hashes produced by the Stage B exporter (commit ac0815b) for triggerPages() in direct mode, after_action close. */
const STAGE_B = {
  registry: 'c372f2d85e21bfb73abe44df6fe0e22a551d5c39',
  functions: 'c418a11e3d08417b8e6459bfcfcb60b5cbc559ae',
  resourcePack: '0aaf3e5669deed4e9b87be70cf10f987c85e9034',
};

type Json = ReturnType<typeof readDialog>;
/** Click events of a page's dialog in text order (= hit glyph order). */
const clicks = (b: ExportBuild, key: string) =>
  ((readDialog(b, key).body as Json[])[0].contents as Json[]).flatMap((c) => (typeof c === 'object' && c.click_event ? [c.click_event] : []));
const footerOf = (b: ExportBuild, key: string) => readDialog(b, key).action;
const run = (command: string) => ({ action: 'run_command', command });

describe('trigger ids', () => {
  it('numbers commands, close and functions-mode navigation in order of first appearance; identical actions share an id', () => {
    const fn = buildExport(triggerPages(), opts('functions'));
    expect(fn.triggers).toEqual({
      objective: 'mcms_trig',
      actions: [
        { id: 1, kind: 'command', command: 'time set day', firstPage: 'menu', footerOnly: false },
        { id: 2, kind: 'command', command: 'weather clear', firstPage: 'menu', footerOnly: false },
        { id: 3, kind: 'page', command: 'function trig:show_second', target: 'second', firstPage: 'menu', footerOnly: false },
        { id: 4, kind: 'close', command: 'dialog clear @s', firstPage: 'menu', footerOnly: false },
        { id: 5, kind: 'page', command: 'function trig:show_menu', target: 'menu', firstPage: 'second', footerOnly: false },
        { id: 6, kind: 'command', command: 'give @s minecraft:diamond 1', firstPage: 'second', footerOnly: false },
      ],
    });
    // registry navigation stays show_dialog, so it gets no id
    const reg = buildExport(triggerPages(), opts('registry'));
    expect(reg.triggers!.actions.map((a) => [a.id, a.kind, a.command])).toEqual([
      [1, 'command', 'time set day'], [2, 'command', 'weather clear'], [3, 'close', 'dialog clear @s'], [4, 'command', 'give @s minecraft:diamond 1'],
    ]);
  });

  it('turns those clicks into `trigger <obj> set <id>` and leaves url, copy and registry navigation alone', () => {
    const url = { action: 'open_url', url: 'https://example.com/' }, copy = { action: 'copy_to_clipboard', value: 'copied' };
    const t = (id: number) => run(`trigger mcms_trig set ${id}`);
    const fn = buildExport(triggerPages(), opts('functions'));
    // menu regions in z-order: time, weather, page, url, copy, time again, close, empty command (hover only), off-page
    expect(clicks(fn, 'menu')).toEqual([t(1), t(2), t(3), url, copy, t(1), t(4)]);
    expect(clicks(fn, 'second')).toEqual([t(5), t(6), t(4), t(3)]);
    const reg = buildExport(triggerPages(), opts('registry'));
    expect(clicks(reg, 'menu')).toEqual([t(1), t(2), { action: 'show_dialog', dialog: 'trig:second' }, url, copy, t(1), t(3)]);
    expect(clicks(reg, 'second')).toEqual([{ action: 'show_dialog', dialog: 'trig:menu' }, t(4), t(3), { action: 'show_dialog', dialog: 'trig:second' }]);
  });

  it('normalises commands like direct mode and validates them without escaping', () => {
    expect(dispatchedCommand(' / /time set day ')).toBe('time set day');
    expect(dispatchedCommand('say a\nb')).toBe('say a b');
    expect(dispatchedCommand('/')).toBe('');
    const page = (command: string): ExportPage[] => [{ ...triggerPages()[1], regions: [{ x: 0, y: 8, w: 30, h: 12, action: { type: 'command', command }, tooltip: '' }] }];
    const quoted = 'tellraw @s {"text":"a \\"b\\" c","color":"gold"}';
    expect(dec(buildExport(page(quoted), opts('functions')).dataPack.get('data/trig/function/trigger_tick.mcfunction'))).toContain(`run ${quoted}\n`);
    expect(() => buildExport(page('say C:\\'), opts('functions'))).toThrow(ExportError);
    const long = buildExport(page(`say ${'x'.repeat(260)}`), opts('functions'));
    expect(long.warnings.map((w) => w.code)).toEqual(['command-long']);
  });
});

describe('trigger data pack', () => {
  it('writes trigger_load / trigger_tick and optional load / tick tags (both packaging modes)', () => {
    const reg = buildExport(triggerPages(), opts('registry'));
    const fn = buildExport(triggerPages(), opts('functions'));
    expect(dec(reg.dataPack.get('data/trig/function/trigger_load.mcfunction'))).toBe('scoreboard objectives add mcms_trig trigger\n');
    expect(dec(reg.dataPack.get('data/trig/function/trigger_tick.mcfunction'))).toBe(
      [
        'execute as @a[scores={mcms_trig=1}] at @s run time set day',
        'execute as @a[scores={mcms_trig=2}] at @s run weather clear',
        'execute as @a[scores={mcms_trig=3}] at @s run dialog clear @s',
        'execute as @a[scores={mcms_trig=4}] at @s run give @s minecraft:diamond 1',
        'scoreboard players set @a[scores={mcms_trig=1..}] mcms_trig 0',
        'scoreboard players enable @a mcms_trig',
        '',
      ].join('\n'),
    );
    expect(dec(fn.dataPack.get('data/trig/function/trigger_tick.mcfunction'))).toBe(
      [
        'execute as @a[scores={mcms_trig=1}] at @s run time set day',
        'execute as @a[scores={mcms_trig=2}] at @s run weather clear',
        'execute as @a[scores={mcms_trig=3}] at @s run function trig:show_second',
        'execute as @a[scores={mcms_trig=4}] at @s run dialog clear @s',
        'execute as @a[scores={mcms_trig=5}] at @s run function trig:show_menu',
        'execute as @a[scores={mcms_trig=6}] at @s run give @s minecraft:diamond 1',
        'scoreboard players set @a[scores={mcms_trig=1..}] mcms_trig 0',
        'scoreboard players enable @a mcms_trig',
        '',
      ].join('\n'),
    );
    for (const b of [reg, fn]) {
      expect(JSON.parse(dec(b.dataPack.get(TAGS[0])))).toEqual({ values: [{ id: 'trig:trigger_load', required: false }] });
      expect(JSON.parse(dec(b.dataPack.get(TAGS[1])))).toEqual({ values: [{ id: 'trig:trigger_tick', required: false }] });
    }
    expect([...fn.dataPack.keys()].sort()).toEqual([
      ...TAGS, 'data/trig/function/show_menu.mcfunction', 'data/trig/function/show_second.mcfunction',
      'data/trig/function/trigger_load.mcfunction', 'data/trig/function/trigger_tick.mcfunction', 'pack.mcmeta',
    ]);
  });

  it('adds no trigger files in direct mode or when nothing needs an id', () => {
    for (const mode of MODES) {
      const direct = buildExport(triggerPages(), opts(mode, { commandMode: 'direct' }));
      expect(direct.triggers).toBeNull();
      expect([...direct.dataPack.keys()].filter((k) => k.includes('trigger') || k.includes('tags/function'))).toEqual([]);
    }
    const linksOnly = triggerPages().map((p) => ({ ...p, regions: p.regions.filter((r) => r.action.type === 'page' || r.action.type === 'url') }));
    const reg = buildExport(linksOnly, opts('registry'));
    expect(reg.triggers).toEqual({ objective: 'mcms_trig', actions: [] });
    expect([...reg.dataPack.keys()].some((k) => k.includes('trigger') || k.includes('tags/function'))).toBe(false);
    expect(reg.readme).not.toContain('按鈕編號對照');
    expect(buildExport(linksOnly, opts('functions')).dataPack.has(TAGS[1])).toBe(true);
  });

  it('keeps direct mode byte-identical to Stage B (pages and resource pack); the resource pack never depends on the command mode', () => {
    for (const mode of MODES) {
      for (const extra of [{ commandMode: 'direct' as const }, { commandMode: undefined }]) {
        const b = buildExport(triggerPages(), opts(mode, extra));
        expect(b.options.commandMode).toBe('direct');
        expect(fileMapHash(b.dataPack), mode).toBe(STAGE_B[mode]);
        expect(fileMapHash(b.resourcePack)).toBe(STAGE_B.resourcePack);
      }
      expect(fileMapHash(buildExport(triggerPages(), opts(mode)).resourcePack)).toBe(STAGE_B.resourcePack);
    }
  });

  it('lists the ids in README_zh-TW (按鈕編號對照) only in trigger mode', () => {
    const fn = buildExport(triggerPages(), opts('functions'));
    expect(fn.readme).toContain('指令執行方式：/trigger（建議）');
    expect(fn.readme).toContain('【按鈕編號對照】（/trigger 計分板物件：mcms_trig）');
    expect(fn.readme).toContain('- 1：執行指令 /time set day（第一次出現：menu）');
    expect(fn.readme).toContain('- 3：切換頁面 → second（/function trig:show_second）（第一次出現：menu）');
    expect(fn.readme).toContain('- 4：關閉選單（/dialog clear @s）（第一次出現：menu）');
    const direct = buildExport(triggerPages(), opts('functions', { commandMode: 'direct' }));
    expect(direct.readme).toContain('指令執行方式：直接執行');
    expect(direct.readme).not.toContain('按鈕編號對照');
    expect(direct.readme).toContain('確認指令執行');
  });

  it('is byte-reproducible in trigger mode', async () => {
    const zips = () => zipExport(buildExport(triggerPages(), opts('functions', { autotest: true, afterAction: 'none' })));
    const [a, b] = [await zips(), await zips()];
    expect(Buffer.from(a.dataPack).equals(Buffer.from(b.dataPack))).toBe(true);
    expect(Buffer.from(a.autotest!).equals(Buffer.from(b.autotest!))).toBe(true);
  });
});

describe('footer button', () => {
  it('has no action with after_action close', () => {
    for (const commandMode of ['trigger', 'direct'] as const)
      expect(footerOf(buildExport(triggerPages(), opts('registry', { commandMode })), 'menu')).toEqual({ label: { text: '關閉' }, width: 150 });
  });

  it('gets the close action of the command mode with after_action none (DECOMPILED §13)', () => {
    const direct = buildExport(triggerPages(), opts('functions', { commandMode: 'direct', afterAction: 'none' }));
    expect(footerOf(direct, 'second')).toEqual({ label: { text: '返回' }, width: 150, action: { type: 'run_command', command: 'dialog clear @s' } });
    const trig = buildExport(triggerPages(), opts('functions', { afterAction: 'none' }));
    expect(footerOf(trig, 'menu')).toEqual({ label: { text: '關閉' }, width: 150, action: { type: 'run_command', command: 'trigger mcms_trig set 4' } });
    expect(readDialog(trig, 'menu').after_action).toBe('none');
    expect(trig.triggers).toEqual(buildExport(triggerPages(), opts('functions')).triggers); // close was already used
  });

  it('appends a footer-only close id without renumbering the buttons', () => {
    const noClose = triggerPages().map((p) => ({ ...p, regions: p.regions.filter((r) => r.action.type !== 'close') }));
    const keep = buildExport(noClose, opts('registry'));
    const none = buildExport(noClose, opts('registry', { afterAction: 'none' }));
    expect(none.triggers!.actions.slice(0, -1)).toEqual(keep.triggers!.actions);
    expect(none.triggers!.actions.at(-1)).toEqual({ id: 4, kind: 'close', command: 'dialog clear @s', firstPage: 'menu', footerOnly: true });
    expect(footerOf(none, 'second')).toMatchObject({ action: { type: 'run_command', command: 'trigger mcms_trig set 4' } });
    expect(none.readme).toContain('- 4：關閉選單（/dialog clear @s）（下方按鈕）');
  });
});

describe('auto-test trigger checks', () => {
  it('picks time, weather and navigation-to-lobby / close, 40, 120 and 200 ticks after the last page', () => {
    const fn = buildExport(triggerPages(), opts('functions'));
    const T = autotestTick(1);
    expect(autotestTriggers(fn.triggers!, 'functions', T)).toEqual([
      { label: 'time_day', id: 1, command: 'time set day', tick: T + 40, daytimeCheck: true },
      { label: 'weather_clear', id: 2, command: 'weather clear', tick: T + 120, daytimeCheck: false },
      { label: 'nav_second', id: 3, command: 'function trig:show_second', tick: T + 200, daytimeCheck: false }, // no lobby page here
    ]);
    const reg = buildExport(triggerPages(), opts('registry'));
    expect(autotestTriggers(reg.triggers!, 'registry', T).at(-1)).toEqual({ label: 'close', id: 3, command: 'dialog clear @s', tick: T + 200, daytimeCheck: false });
  });

  it('writes the trigger lines after the page schedule, which stays unchanged', () => {
    const tests = [
      { label: 'time_day', id: 3, command: 'time set day', tick: 960, daytimeCheck: true },
      { label: 'close', id: 7, command: 'dialog clear @s', tick: 1120, daytimeCheck: false },
    ];
    const files = autotestFiles('demo', 'registry', ['a', 'b'], { objective: 'mcms_demo', tests });
    const tick = dec(files.get('data/mcms_autotest/function/tick.mcfunction')).split('\n');
    const plain = dec(autotestFiles('demo', 'registry', ['a', 'b']).get('data/mcms_autotest/function/tick.mcfunction')).split('\n');
    const body = [
      'execute as @a[scores={mcms_t=960}] run time set midnight',
      'execute as @a[scores={mcms_t=960}] run say TRIGGER time_day id 3',
      'execute as @a[scores={mcms_t=960}] run trigger mcms_demo set 3',
      'execute as @a[scores={mcms_t=980}] store result score #daytime mcms_t run time query minecraft:day',
      'execute as @a[scores={mcms_t=980}] if score #daytime mcms_t matches 1000..1100 run say TRIGGER CHECK time_day OK',
      'execute as @a[scores={mcms_t=980}] unless score #daytime mcms_t matches 1000..1100 run say TRIGGER CHECK time_day FAIL',
      'execute as @a[scores={mcms_t=1120}] run say TRIGGER close id 7',
      'execute as @a[scores={mcms_t=1120}] run trigger mcms_demo set 7',
    ];
    // page lines first (unchanged), then the trigger tests, then AUTOTEST DONE at 120 + 800 * pages
    expect(tick).toEqual([...plain.slice(0, -2), ...body, ...plain.slice(-2)]);
    expect(plain.at(-2)).toBe('execute as @a[scores={mcms_t=1720}] run say AUTOTEST DONE');
    expect(dec(files.get('data/mcms_autotest/function/load.mcfunction'))).toContain('trigger mode, 2 trigger tests');
    // direct mode: the Stage B auto-test (no trigger lines)
    const direct = buildExport(triggerPages(), opts('registry', { commandMode: 'direct', autotest: true }));
    expect(dec(direct.autotest!.get('data/mcms_autotest/function/tick.mcfunction'))).not.toContain('TRIGGER');
  });
});

describe('trigger mode client simulation (demo pages)', () => {
  const env: RenderEnv = { createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike };
  const pages = demoPages(env);

  it.each(MODES)('draws the same picture and hit boxes as direct mode; clicks map to the id table (%s)', (mode) => {
    const direct = buildExport(pages, demoOptions(mode, true, 'direct'));
    const trig = buildExport(pages, demoOptions(mode, true, 'trigger'));
    expect(trig.warnings).toEqual([]);
    const table = trig.triggers!;
    const byCommand = new Map(table.actions.map((a) => [a.command, a.id]));
    let mapped = 0;
    for (const p of pages) {
      const a = simulatePage(direct, p.key, p.image.width, p.image.height);
      const b = simulatePage(trig, p.key, p.image.width, p.image.height);
      expect([b.badStyle, b.badEventRuns, b.offLine, b.outside, b.overlaps]).toEqual([0, 0, 0, 0, 0]);
      expect(Buffer.from(b.canvas).equals(Buffer.from(a.canvas)), p.key).toBe(true);
      expect(b.hits.map(({ x, y, w, h, hover }) => ({ x, y, w, h, hover }))).toEqual(a.hits.map(({ x, y, w, h, hover }) => ({ x, y, w, h, hover })));
      a.hits.forEach((h, i) => {
        const c = h.click as { action: string; command?: string } | undefined;
        const id = c?.action === 'run_command' ? byCommand.get(c.command!) : undefined;
        if (id === undefined) {
          expect(b.hits[i].click).toEqual(h.click);
        } else {
          mapped++;
          expect(b.hits[i].click).toEqual(run(`trigger mcms_mcms_demo set ${id}`));
        }
      });
    }
    expect(mapped).toBeGreaterThan(20);
    // the auto-test presses the quick menu's time and weather buttons and a lobby link / the close button
    const T = autotestTick(pages.length - 1);
    const tick = dec(trig.autotest!.get('data/mcms_autotest/function/tick.mcfunction'));
    const id = (command: string) => byCommand.get(command)!;
    expect(tick).toContain(`execute as @a[scores={mcms_t=${T + 40}}] run say TRIGGER time_day id ${id('time set day')}`);
    expect(tick).toContain(`execute as @a[scores={mcms_t=${T + 120}}] run trigger mcms_mcms_demo set ${id('weather clear')}`);
    expect(tick).toContain(
      mode === 'functions'
        ? `execute as @a[scores={mcms_t=${T + 200}}] run say TRIGGER nav_lobby id ${id('function mcms_demo:show_lobby')}`
        : `execute as @a[scores={mcms_t=${T + 200}}] run say TRIGGER close id ${id('dialog clear @s')}`,
    );
    expect(tick.trimEnd().split('\n').at(-1)).toBe(`execute as @a[scores={mcms_t=${autotestTick(pages.length)}}] run say AUTOTEST DONE`);
  });
});

describe('export checks', () => {
  const lobby = (): Project => TEMPLATES[0].build();

  it('counts command actions per packaging mode', () => {
    const p = lobby();
    const links = p.pages.flatMap((pg) => pg.elements).filter((el) => 'action' in el && !el.hidden && el.action.type === 'page').length;
    expect(links).toBeGreaterThan(0);
    expect(countCommandActions(p, 'functions')).toBe(countCommandActions(p, 'registry') + links);
    expect(countCommandActions(p, 'registry')).toBeGreaterThan(0);
  });

  it('adds the command-mode entry and only warns about chat commands in direct mode', () => {
    const p = lobby();
    const el = p.pages[0].elements.find((e) => 'action' in e && e.action.type === 'command')!;
    if ('action' in el) el.action = { type: 'command', command: 'say hi' };
    const trig = checkExport(p, { mode: 'registry', commandMode: 'trigger' });
    expect(trig.find((i) => i.code === 'export-trigger')).toMatchObject({ severity: 'info' });
    expect(trig.find((i) => i.code === 'export-trigger')!.message).toContain('/trigger mcms_lobby set <編號>');
    expect(trig.some((i) => i.code === 'export-direct' || i.code === 'command-chat')).toBe(false);
    const direct = checkExport(p, { mode: 'registry', commandMode: 'direct' });
    expect(direct.find((i) => i.code === 'export-direct')).toMatchObject({ severity: 'warning' });
    expect(direct.some((i) => i.code === 'command-chat')).toBe(true);
    expect(direct.some((i) => i.code === 'export-trigger')).toBe(false);
  });
});
