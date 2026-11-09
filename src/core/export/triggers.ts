// Trigger mode (docs/VERIFIED.md §13): a `run_command` click that needs permissions opens Minecraft's confirm screen on
// every click and does not work for normal players; `/trigger` needs no permission and runs silently. So in trigger
// mode a button runs `trigger <objective> set <id>` and the data pack's tick function runs the real command as the
// player (function permission level), then resets the scores and re-enables the objective.
import { AUTOTEST, CLOSE_COMMAND, MAX_TRIGGER_COMMAND_WARN, TRIGGER_OBJECTIVE_PREFIX } from './constants';
import { commandText, functionName, type TriggerIds } from './dialogs';
import { ExportError } from './errors';
import type { ExportAction, ExportMode, ExportRegion, ExportWarning, TriggerAction, TriggerKind, TriggerTable } from './types';

/** Scoreboard objective of the trigger ids (objective names have no length limit in 26.3). */
export const triggerObjective = (ns: string) => `${TRIGGER_OBJECTIVE_PREFIX}${ns}`;

/**
 * The command as it goes into `trigger_tick`: the direct-mode text (one line, one leading `/` removed) without any
 * further leading slashes or spaces, which would not parse after `run ` and would stop the whole function from loading.
 */
export function dispatchedCommand(raw: string): string {
  return commandText(raw).replace(/^[\s/]+/, '');
}

interface Spec {
  key: string;
  kind: TriggerKind;
  command: string;
  target?: string;
}

/** Identity of an action that gets a trigger id in this packaging mode (identical actions share an id), or null. */
export function triggerSpec(action: ExportAction, ns: string, mode: ExportMode): Spec | null {
  switch (action.type) {
    case 'command': {
      const command = dispatchedCommand(action.command);
      return command ? { key: `command:${command}`, kind: 'command', command } : null;
    }
    case 'close':
      return { key: 'close', kind: 'close', command: CLOSE_COMMAND };
    case 'page':
      // registry mode keeps show_dialog, which needs no permission
      return mode === 'functions' ? { key: `page:${action.key}`, kind: 'page', command: `function ${ns}:${functionName(action.key)}`, target: action.key } : null;
    default:
      return null;
  }
}

export interface TriggerPage {
  key: string;
  /** Exported regions of the page in z-order. */
  regions: ExportRegion[];
}

/**
 * Assigns ids 1, 2, 3... in order of first appearance: pages in export order, regions in z-order. With `footerClose`
 * (after_action none) the footer buttons need the close action too; when no button uses it, it gets the next id after
 * all buttons, so switching the footer setting never renumbers the buttons.
 */
export function assignTriggers(pages: TriggerPage[], ns: string, mode: ExportMode, footerClose: boolean): TriggerTable {
  const byKey = new Map<string, TriggerAction>();
  const add = (spec: Spec, firstPage: string, footerOnly: boolean) => {
    if (byKey.has(spec.key)) return;
    const row: TriggerAction = { id: byKey.size + 1, kind: spec.kind, command: spec.command, firstPage, footerOnly };
    if (spec.target !== undefined) row.target = spec.target;
    byKey.set(spec.key, row);
  };
  for (const p of pages)
    for (const r of p.regions) {
      const spec = triggerSpec(r.action, ns, mode);
      if (spec) add(spec, p.key, false);
    }
  if (footerClose && pages.length) add(triggerSpec({ type: 'close' }, ns, mode)!, pages[0].key, true);
  return { objective: triggerObjective(ns), actions: [...byKey.values()] };
}

/** Id lookup for the click events of one build (dialogs.ts turns an id into `trigger <objective> set <id>`). */
export function triggerLookup(table: TriggerTable, ns: string, mode: ExportMode): TriggerIds {
  const ids = new Map<string, number>();
  for (const a of table.actions) {
    const key = a.kind === 'command' ? `command:${a.command}` : a.kind === 'close' ? 'close' : `page:${a.target}`;
    ids.set(key, a.id);
  }
  return {
    objective: table.objective,
    idOf(action) {
      const spec = triggerSpec(action, ns, mode);
      return spec ? ids.get(spec.key) : undefined;
    },
  };
}

/** Rejects commands that would break `trigger_tick` and warns about very long ones. Nothing is escaped. */
export function checkTriggerCommands(table: TriggerTable): ExportWarning[] {
  const warnings: ExportWarning[] = [];
  for (const a of table.actions) {
    if (/[\r\n]/.test(a.command)) throw new ExportError(`按鈕編號 ${a.id} 的指令包含換行，無法寫進函數檔。`);
    // mcfunction files join a line that ends with "\" with the next line (line continuation)
    if (a.command.endsWith('\\'))
      throw new ExportError(`按鈕編號 ${a.id} 的指令「${a.command}」以反斜線 \\ 結尾，寫進函數檔後會和下一行接在一起。請刪掉結尾的 \\，或改用「直接執行」。`);
    if (a.command.length > MAX_TRIGGER_COMMAND_WARN)
      warnings.push({
        code: 'command-long',
        pageKey: a.firstPage,
        message: `按鈕編號 ${a.id} 的指令超過 ${MAX_TRIGGER_COMMAND_WARN} 個字元（${a.command.length}），可能無法執行（尚待實機驗證）。`,
      });
  }
  return warnings;
}

/** `data/<ns>/function/trigger_load.mcfunction`: creates the objective (an error on /reload when it exists is harmless). */
export const triggerLoadSource = (table: TriggerTable) => `scoreboard objectives add ${table.objective} trigger\n`;

/**
 * `data/<ns>/function/trigger_tick.mcfunction`: one dispatch line per id, then reset every used score to 0, then
 * re-enable the objective for everybody (`/trigger` locks a player's score until it is enabled again).
 */
export function triggerTickSource(table: TriggerTable): string {
  const obj = table.objective;
  const lines = table.actions.map((a) => `execute as @a[scores={${obj}=${a.id}}] at @s run ${a.command}`);
  lines.push(`scoreboard players set @a[scores={${obj}=1..}] ${obj} 0`, `scoreboard players enable @a ${obj}`);
  return `${lines.join('\n')}\n`;
}

/** Function tag entries are optional, so a broken trigger_tick never takes other packs' load/tick functions down. */
export const functionTag = (id: string) => ({ values: [{ id, required: false }] });

// ---- auto-test (Hermes, VERIFIED §5): exercise the trigger -> dispatch path without a mouse ----

export interface AutotestTrigger {
  /** Log marker: `say TRIGGER <label> id <id>`. */
  label: string;
  id: number;
  command: string;
  tick: number;
  /** `time set day`: the auto-test sets midnight first and checks `time query daytime` a second later. */
  daytimeCheck: boolean;
}

/**
 * The three trigger tests after the last page (T = tick of the last page): T+40 the `time set day` id, T+120 the
 * `weather clear` id, T+200 a navigation id that opens `lobby` (functions mode; else the first navigation id) or the
 * close id (registry mode). A slot whose action does not exist in the export is left out.
 */
export function autotestTriggers(table: TriggerTable, mode: ExportMode, lastPageTick: number): AutotestTrigger[] {
  const cmd = (c: string) => table.actions.find((a) => a.kind === 'command' && a.command === c);
  const close = table.actions.find((a) => a.kind === 'close');
  const nav = table.actions.find((a) => a.kind === 'page' && a.target === 'lobby') ?? table.actions.find((a) => a.kind === 'page');
  const slots: [string, TriggerAction | undefined, boolean][] = [
    ['time_day', cmd('time set day'), true],
    ['weather_clear', cmd('weather clear'), false],
    mode === 'functions' && nav ? [`nav_${nav.target}`, nav, false] : ['close', close, false],
  ];
  const out: AutotestTrigger[] = [];
  slots.forEach(([label, a, daytimeCheck], i) => {
    if (a) out.push({ label, id: a.id, command: a.command, tick: lastPageTick + AUTOTEST.triggerOffsets[i], daytimeCheck });
  });
  return out;
}
