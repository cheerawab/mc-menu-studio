import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildExport, ExportError } from '../../core/export';
import { exportPagesFromProject } from '../../core/export/project';
import { createProject } from '../../core/model/defaults';
import { createRenderEnv } from '../env';
import { buildProjectExport, resolveExportOptions, writeProjectExport } from '../handlers/export';

const env = createRenderEnv();

describe('resolveExportOptions', () => {
  it('fills every default from the project when the agent passes no options', () => {
    const project = createProject({ namespace: 'myns', name: 'My Menu' });
    const o = resolveExportOptions(project);
    expect(o).toEqual({
      namespace: 'myns', packName: 'My Menu', mode: 'registry', quickActions: true, afterAction: 'close',
      commandMode: undefined, scale: project.settings.renderScale, tileSize: undefined, autotest: false,
    });
  });

  it('lets every field be overridden', () => {
    const project = createProject();
    const o = resolveExportOptions(project, {
      namespace: 'ov', packName: 'Pack', mode: 'functions', quickActions: false, afterAction: 'none',
      commandMode: 'trigger', scale: 3, tileSize: 24, autotest: true,
    });
    expect(o).toEqual({
      namespace: 'ov', packName: 'Pack', mode: 'functions', quickActions: false, afterAction: 'none',
      commandMode: 'trigger', scale: 3, tileSize: 24, autotest: true,
    });
  });
});

describe('mcms.export.build: stats must match a direct buildExport call field-by-field', () => {
  it('produces byte-for-byte identical stats to calling exportPagesFromProject + buildExport directly', () => {
    const project = createProject({ namespace: 'cmp' });
    const viaHandler = buildProjectExport(project, env, {});

    const options = resolveExportOptions(project, {});
    const pages = exportPagesFromProject(project, env, (p) => p.key, options.scale);
    const direct = buildExport(pages, options);

    expect(viaHandler.stats).toEqual(direct.stats);
    expect(viaHandler.warnings).toEqual(direct.warnings);
  });

  it('propagates the core ExportError with its zh-TW message unchanged (e.g. the "minecraft" namespace)', () => {
    const project = createProject({ namespace: 'minecraft' });
    expect(() => buildProjectExport(project, env, {})).toThrow(ExportError);
    expect(() => buildProjectExport(project, env, {})).toThrow(/minecraft/);
  });
});

describe('mcms.export.write: determinism', () => {
  it('writes byte-identical zips for the same project and options across two separate calls', async () => {
    const project = createProject({ namespace: 'det', name: '決定性測試' });
    const build1 = buildProjectExport(project, env, {});
    const build2 = buildProjectExport(project, env, {});
    const dir1 = mkdtempSync(join(tmpdir(), 'mcms-export-1-'));
    const dir2 = mkdtempSync(join(tmpdir(), 'mcms-export-2-'));
    const files1 = await writeProjectExport(build1, dir1);
    const files2 = await writeProjectExport(build2, dir2);
    expect(readFileSync(files1.resourcePack)).toEqual(readFileSync(files2.resourcePack));
    expect(readFileSync(files1.dataPack)).toEqual(readFileSync(files2.dataPack));
    expect(readFileSync(files1.readme)).toEqual(readFileSync(files2.readme));
    expect(files1.autotest).toBeNull();
  });

  it('also writes an autotest.zip when requested', async () => {
    const project = createProject({ namespace: 'autod' });
    const build = buildProjectExport(project, env, { autotest: true });
    const dir = mkdtempSync(join(tmpdir(), 'mcms-export-autotest-'));
    const files = await writeProjectExport(build, dir);
    expect(files.autotest).not.toBeNull();
    expect(readFileSync(files.autotest!).length).toBeGreaterThan(0);
  });
});
