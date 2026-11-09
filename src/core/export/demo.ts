// Demo export used by `npm run demo:export` and the golden tests: the calibration page first, then every page of every
// built-in template (each rendered with its own template project, so each keeps its skin).
import { uniqueKey } from '../model/ids';
import type { RenderEnv } from '../render/types';
import { TEMPLATES } from '../templates';
import { CALIBRATION_KEY, calibrationPage } from './calibration';
import { exportPagesFromProject } from './project';
import type { ExportOptions, ExportPage } from './types';

export const DEMO_NAMESPACE = 'mcms_demo';

export const demoOptions = (mode: ExportOptions['mode'], autotest = false): ExportOptions => ({
  namespace: DEMO_NAMESPACE,
  packName: 'MC Menu Studio 示範',
  mode,
  quickActions: true,
  afterAction: 'close',
  autotest,
});

/**
 * Page keys: a template page keeps its key when it equals the template id, otherwise it becomes `<template>_<key>`
 * (e.g. lobby, lobby_rules, rules, rules_welcome). Links inside a template follow the renamed keys.
 */
export function demoPages(env: RenderEnv): ExportPage[] {
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
    pages.push(...exportPagesFromProject(project, env, (p) => keys.get(p.id) ?? p.key));
  }
  return [calibrationPage(pages[0]?.key), ...pages];
}
