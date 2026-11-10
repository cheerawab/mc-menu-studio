// Demo export used by `npm run demo:export` and the golden tests: the calibration page first, then every page of every
// built-in template (each rendered with its own template project, so each keeps its skin).
import { uniqueKey } from '../model/ids';
import type { RenderScale } from '../model/types';
import type { RenderEnv } from '../render/types';
import { TEMPLATES } from '../templates';
import { CALIBRATION_KEY, calibrationPage } from './calibration';
import { exportPagesFromProject } from './project';
import type { CommandMode, ExportOptions, ExportPage } from './types';

export const DEMO_NAMESPACE = 'mcms_demo';

/**
 * `commandMode` omitted = direct (the Stage B output the golden tests pin); the CLI passes its --commands value.
 * `scale` omitted = 1 (must match the scale the pages were rendered at, see demoPages).
 */
export const demoOptions = (mode: ExportOptions['mode'], autotest = false, commandMode?: CommandMode, scale?: RenderScale): ExportOptions => ({
  namespace: DEMO_NAMESPACE,
  packName: 'MC Menu Studio 示範',
  mode,
  quickActions: true,
  afterAction: 'close',
  autotest,
  ...(commandMode ? { commandMode } : {}),
  ...(scale && scale !== 1 ? { scale } : {}),
});

/**
 * Render scale of the demo export: `override` (`--scale N`) or else the templates' own 解析度 (they all use the
 * project default). One export has one scale, so templates with different scales need an override.
 */
export function demoScale(override?: RenderScale): RenderScale {
  if (override) return override;
  const scales = new Set(TEMPLATES.map((t) => t.build().settings.renderScale));
  if (scales.size !== 1) throw new Error(`templates use different render scales (${[...scales].join(', ')}); pass --scale`);
  return [...scales][0];
}

/**
 * Page keys: a template page keeps its key when it equals the template id, otherwise it becomes `<template>_<key>`
 * (e.g. lobby, lobby_rules, rules, rules_welcome). Links inside a template follow the renamed keys. Every page,
 * the calibration page included, is rendered at `scale` (default 1; the CLI passes demoScale(--scale)).
 */
export function demoPages(env: RenderEnv, scale: RenderScale = 1): ExportPage[] {
  const taken = new Set<string>([CALIBRATION_KEY]);
  const pages: ExportPage[] = [];
  for (const t of TEMPLATES) {
    const project = t.build();
    const keys = new Map<string, string>();
    for (const p of project.pages) {
      const key = uniqueKey(p.key === t.id ? p.key : `${t.id}_${p.key}`, taken);
      taken.add(key);
      keys.set(p.id, key);
    }
    pages.push(...exportPagesFromProject(project, env, (p) => keys.get(p.id) ?? p.key, scale));
  }
  return [calibrationPage(pages[0]?.key, scale), ...pages];
}
