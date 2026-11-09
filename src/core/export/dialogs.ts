// Text components, click/hover events and the dialog definition of one page, for both export modes.
import { CLOSE_COMMAND, COMMAND_PREFIX, DIALOG_PAUSE, DIALOG_TYPE, FOOTER_BUTTON_WIDTH, RUN_STYLE } from './constants';
import type { PageLayout } from './layout';
import { toSnbt } from './snbt';
import type { AfterAction, ExportAction, ExportMode, ExportRegion } from './types';

/** Trigger-mode lookup (see triggers.ts): objective and the id of an action, undefined when it has none. */
export interface TriggerIds {
  objective: string;
  idOf(action: ExportAction): number | undefined;
}

/** Function file of a page in `functions` mode: data/<ns>/function/show_<key>.mcfunction */
export const functionName = (key: string) => `show_${key}`;

/** Drops control characters a text component should not carry (keeps \n), normalises line breaks and tabs. */
export function cleanText(s: string): string {
  return s.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '');
}

/** Single-line variant (titles, button labels, commands). */
export const oneLine = (s: string) => cleanText(s).replace(/\n+/g, ' ').trim();

export type ClickEvent = Record<string, string>;
export interface HoverEvent {
  action: 'show_text';
  value: { text: string };
}

/** A command action's text in direct mode: one line, one leading slash removed (empty = no click). */
export const commandText = (raw: string) => oneLine(raw).replace(/^\//, '');

/** Actions that run through `/trigger` in trigger mode (registry-mode navigation stays `show_dialog`). */
export const usesTrigger = (action: ExportAction, mode: ExportMode) =>
  action.type === 'command' || action.type === 'close' || (action.type === 'page' && mode === 'functions');

/**
 * Click event of a region, or null when the region has no click action. Without `triggers` (direct mode) commands
 * are sent as they are; with `triggers` commands, close and functions-mode navigation become `trigger <obj> set <id>`.
 */
export function clickEvent(action: ExportAction, ns: string, mode: ExportMode, triggers?: TriggerIds | null): ClickEvent | null {
  if (triggers && usesTrigger(action, mode)) {
    const id = triggers.idOf(action);
    return id === undefined ? null : { action: 'run_command', command: `${COMMAND_PREFIX}trigger ${triggers.objective} set ${id}` };
  }
  switch (action.type) {
    case 'none':
      return null;
    case 'page':
      return mode === 'registry'
        ? { action: 'show_dialog', dialog: `${ns}:${action.key}` }
        : { action: 'run_command', command: `${COMMAND_PREFIX}function ${ns}:${functionName(action.key)}` };
    case 'command': {
      const cmd = commandText(action.command);
      return cmd ? { action: 'run_command', command: COMMAND_PREFIX + cmd } : null;
    }
    case 'url': {
      const url = action.url.trim();
      return url ? { action: 'open_url', url } : null;
    }
    case 'copy':
      return { action: 'copy_to_clipboard', value: cleanText(action.text) };
    case 'close':
      return { action: 'run_command', command: COMMAND_PREFIX + CLOSE_COMMAND };
  }
}

/** Hover tooltip (multi-line allowed), or null when empty. */
export function hoverEvent(tooltip: string): HoverEvent | null {
  const text = cleanText(tooltip).trim();
  return text ? { action: 'show_text', value: { text } } : null;
}

/** `contents` of the plain_message: neutral root "", the runs, then the empty lines. */
export function textComponents(layout: PageLayout, regions: ExportRegion[], ns: string, mode: ExportMode, triggers?: TriggerIds | null): unknown[] {
  const out: unknown[] = [''];
  for (const run of layout.runs) {
    const comp: Record<string, unknown> = {
      text: run.text,
      font: run.font === 'space' ? `${ns}:space` : `${ns}:y${run.font}`,
      ...RUN_STYLE,
    };
    if (run.region !== undefined) {
      const r = regions[run.region];
      const click = clickEvent(r.action, ns, mode, triggers);
      const hover = hoverEvent(r.tooltip);
      if (click) comp.click_event = click;
      if (hover) comp.hover_event = hover;
    }
    out.push(comp);
  }
  out.push({ text: '\n'.repeat(layout.lines), ...RUN_STYLE });
  return out;
}

export interface DialogInput {
  title: string;
  footerLabel: string;
  layout: PageLayout;
  contents: unknown[];
  afterAction: AfterAction;
  /**
   * Command of the footer button (`after_action: none` only; DECOMPILED §13: with `none` the footer button only runs
   * its own action, so it needs the close action to close the menu). Omitted = no action (today's footer).
   */
  footerCommand?: string | null;
}

export function dialogObject(d: DialogInput): Record<string, unknown> {
  const footer: Record<string, unknown> = { label: { text: d.footerLabel }, width: FOOTER_BUTTON_WIDTH };
  // dialog actions use `type` (not `action` like text click events)
  if (d.footerCommand) footer.action = { type: 'run_command', command: d.footerCommand };
  return {
    type: DIALOG_TYPE,
    title: { text: oneLine(d.title) },
    can_close_with_escape: true,
    pause: DIALOG_PAUSE,
    after_action: d.afterAction,
    body: [{ type: 'minecraft:plain_message', width: d.layout.messageWidth, contents: d.contents }],
    action: footer,
  };
}

/** The footer button's command: none with `after_action: close`; else the close action of the command mode. */
export function footerCommand(afterAction: AfterAction, triggers?: TriggerIds | null): string | null {
  if (afterAction !== 'none') return null;
  return clickEvent({ type: 'close' }, '', 'registry', triggers)?.command ?? null;
}

/** One-line function that shows the dialog inline (functions mode, VERIFIED §4). */
export function functionSource(dialog: unknown): string {
  return `dialog show @s ${toSnbt(dialog)}\n`;
}
