// PlaceholderAPI (PAPI) support for the MCP layer — design/preview only.
//
// Hard limit, stated up front so callers don't expect magic: an exported MC Menu Studio menu is a VANILLA dialog whose
// text is baked into a custom bitmap font at export time. Vanilla has no PlaceholderAPI, so a placeholder like
// %player_name% is NOT resolved at runtime — it would render literally (and any glyph not baked into the font shows as
// a tofu box). PAPI placeholders only ever resolve inside a server plugin (zMenu/DeluxeMenus) at open time.
//
// So what this module does, and all it can honestly do against a vanilla export:
//   1. detectPlaceholders(project) — find every %...% token so the agent/exporter can WARN that this menu depends on a
//      plugin runtime and will not resolve under a plain datapack.
//   2. samplePlaceholders(project) — return a *clone* with placeholders replaced by representative sample values
//      (%player_name% -> "Steve", %playerpoints_points% -> "1,234") so a PREVIEW shows roughly the right length and
//      layout. The original project is never mutated; exports keep the real %...% tokens.
//
// This module imports only core types and is free of src/app/React/Next.
import type { Element, Project } from '../core/model/types';

// Matches a PAPI/zMenu token: %identifier% where identifier is [A-Za-z0-9_-]+ (PAPI uses `_`, zMenu globals use `-`).
// These never nest, so a simple non-greedy single-percent-pair scan is correct and avoids eating "100%% done".
const PLACEHOLDER_RE = /%([a-zA-Z0-9][a-zA-Z0-9_-]*)%/g;

/** Representative preview values. Keys are matched as a prefix (before the first `_` group) then by exact token. */
const SAMPLE_VALUES: Record<string, string> = {
  // identity
  player: 'Steve',
  player_name: 'Steve',
  player_displayname: 'Steve',
  player_uuid: '00000000-0000-0000-0000-000000000000',
  player_world: 'world',
  // economy
  vault_eco_balance: '12,345',
  vault_eco_balance_formatted: '$12,345',
  playerpoints_points: '1,234',
  // zmenu internals
  zmenu_argument_target: 'Alex',
  zmenu_argument_reason: '違規',
  zmenu_player_value_switch_value: '開',
  zmenu_statistic_time_played: '12h 30m',
  // pagination
  page: '1',
  maxPage: '3',
  'max-page': '3',
  slot: '0',
  // item context
  name: '範例',
  price: '100',
  material: 'STONE',
};

const GENERIC_SAMPLE = '範例';

/** Best sample value for a token: exact match, else first-group prefix, else a generic label. */
export function sampleFor(token: string): string {
  if (token in SAMPLE_VALUES) return SAMPLE_VALUES[token];
  const head = token.split('_')[0];
  if (head in SAMPLE_VALUES) return SAMPLE_VALUES[head];
  return GENERIC_SAMPLE;
}

/** Replaces every %...% token in a string with its sample value. Non-matching text is untouched. */
export function fillPlaceholders(text: string): string {
  return text.replace(PLACEHOLDER_RE, (_m, token: string) => sampleFor(token));
}

export interface PlaceholderHit {
  token: string;
  /** Where it was found, e.g. "元件「[3] 經濟金融」的 tooltip" / "頁面標題". */
  where: string;
  count: number;
}

/** Every distinct placeholder token found in a project's visible text (titles, labels, tooltips). */
export function detectPlaceholders(project: Project): PlaceholderHit[] {
  const hits = new Map<string, PlaceholderHit>();
  const scan = (text: string | undefined, where: string) => {
    if (!text) return;
    for (const m of text.matchAll(PLACEHOLDER_RE)) {
      const token = m[1];
      const key = `${token}\u0000${where}`;
      const cur = hits.get(key);
      if (cur) cur.count++;
      else hits.set(key, { token, where, count: 1 });
    }
  };
  for (const page of project.pages) {
    scan(page.title, `頁面「${page.key}」標題`);
    for (const el of page.elements) {
      const name = elementText(el) || el.name;
      scan(elementText(el), `元件「${name}」文字`);
      scan((el as { tooltip?: string }).tooltip, `元件「${name}」tooltip`);
    }
  }
  return [...hits.values()];
}

/** True if the project contains any PAPI placeholder (quick gate for an export warning). */
export function hasPlaceholders(project: Project): boolean {
  for (const page of project.pages) {
    if (PLACEHOLDER_RE.test(page.title)) {
      PLACEHOLDER_RE.lastIndex = 0;
      return true;
    }
    PLACEHOLDER_RE.lastIndex = 0;
    for (const el of page.elements) {
      for (const s of [elementText(el), (el as { tooltip?: string }).tooltip]) {
        if (s && PLACEHOLDER_RE.test(s)) {
          PLACEHOLDER_RE.lastIndex = 0;
          return true;
        }
        PLACEHOLDER_RE.lastIndex = 0;
      }
    }
  }
  return false;
}

/** The text field of an element that renders on screen (button/label use `text`), or undefined. */
function elementText(el: Element): string | undefined {
  return (el as { text?: string }).text;
}

/**
 * Returns a deep clone of the project with every %...% token in visible text replaced by a sample value, for PREVIEW
 * rendering. The input is never mutated; callers export the untouched original so real tokens survive.
 */
export function samplePlaceholders(project: Project): Project {
  const clone: Project = structuredClone(project);
  for (const page of clone.pages) {
    page.title = fillPlaceholders(page.title);
    for (const el of page.elements) {
      const t = el as { text?: string; tooltip?: string };
      if (typeof t.text === 'string') t.text = fillPlaceholders(t.text);
      if (typeof t.tooltip === 'string') t.tooltip = fillPlaceholders(t.tooltip);
    }
  }
  return clone;
}

/** One-line zh-TW export warning listing the placeholder tokens, or null when there are none. */
export function placeholderExportWarning(project: Project): string | null {
  const hits = detectPlaceholders(project);
  if (!hits.length) return null;
  const tokens = [...new Set(hits.map((h) => `%${h.token}%`))];
  return `此選單含 ${tokens.length} 種 PAPI 佔位符（${tokens.join('、')}）。原版 Dialog 匯出不會在執行期替換它們，會顯示字面文字；若要即時值請改走帶外掛（zMenu/DeluxeMenus）的方案。`;
}

/** Export the regexp source so tests and sibling code share one definition. */
export const PLACEHOLDER_PATTERN = PLACEHOLDER_RE.source;
