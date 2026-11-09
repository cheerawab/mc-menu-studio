// Text components, click/hover events and the dialog definition of one page, for both export modes.
import { CLOSE_COMMAND, COMMAND_PREFIX, DIALOG_PAUSE, DIALOG_TYPE, FOOTER_BUTTON_WIDTH, RUN_STYLE } from './constants';
import type { PageLayout } from './layout';
import { toSnbt } from './snbt';
import type { AfterAction, ExportAction, ExportMode, ExportRegion } from './types';

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

/** Click event of a region, or null when the region has no click action. */
export function clickEvent(action: ExportAction, ns: string, mode: ExportMode): ClickEvent | null {
  switch (action.type) {
    case 'none':
      return null;
    case 'page':
      return mode === 'registry'
        ? { action: 'show_dialog', dialog: `${ns}:${action.key}` }
        : { action: 'run_command', command: `${COMMAND_PREFIX}function ${ns}:${functionName(action.key)}` };
    case 'command': {
      const cmd = oneLine(action.command).replace(/^\//, '');
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
export function textComponents(layout: PageLayout, regions: ExportRegion[], ns: string, mode: ExportMode): unknown[] {
  const out: unknown[] = [''];
  for (const run of layout.runs) {
    const comp: Record<string, unknown> = {
      text: run.text,
      font: run.font === 'space' ? `${ns}:space` : `${ns}:y${run.font}`,
      ...RUN_STYLE,
    };
    if (run.region !== undefined) {
      const r = regions[run.region];
      const click = clickEvent(r.action, ns, mode);
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
}

export function dialogObject(d: DialogInput): Record<string, unknown> {
  return {
    type: DIALOG_TYPE,
    title: { text: oneLine(d.title) },
    can_close_with_escape: true,
    pause: DIALOG_PAUSE,
    after_action: d.afterAction,
    body: [{ type: 'minecraft:plain_message', width: d.layout.messageWidth, contents: d.contents }],
    action: { label: { text: d.footerLabel }, width: FOOTER_BUTTON_WIDTH },
  };
}

/** One-line function that shows the dialog inline (functions mode, VERIFIED §4). */
export function functionSource(dialog: unknown): string {
  return `dialog show @s ${toSnbt(dialog)}\n`;
}
