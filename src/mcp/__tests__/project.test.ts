import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../../core/templates';
import { buildProject, createProjectHandle, getProjectHandle, listTemplates, openProjectHandle, saveProjectHandle } from '../handlers/project';
import { ProjectStore } from '../state';

function tmpPath(name = 'p.mcms.json'): string {
  return join(mkdtempSync(join(tmpdir(), 'mcms-project-')), name);
}

describe('mcms.project.list_templates', () => {
  it('matches the built-in template registry (id/name/description/skinId only)', () => {
    expect(listTemplates()).toEqual(TEMPLATES.map(({ id, name, description, skinId }) => ({ id, name, description, skinId })));
  });
});

describe('buildProject', () => {
  it('builds a blank project by default', () => {
    const p = buildProject({});
    expect(p.pages).toHaveLength(1);
  });

  it('builds from a template and applies overrides', () => {
    const p = buildProject({ fromTemplate: 'shop', name: '我的商店', namespace: 'myshop' });
    expect(p.name).toBe('我的商店');
    expect(p.namespace).toBe('myshop');
    expect(p.pages.map((pg) => pg.key)).toEqual(TEMPLATES.find((t) => t.id === 'shop')!.build().pages.map((pg) => pg.key));
  });

  it('throws a zh-TW error for an unknown template id', () => {
    expect(() => buildProject({ fromTemplate: 'nope' })).toThrow(/找不到範本/);
  });
});

describe('mcms.project.create / open / save / get', () => {
  it('runs the full lifecycle through one ProjectStore', () => {
    const store = new ProjectStore();
    const path = tmpPath();
    const created = createProjectHandle(store, { fromTemplate: 'lobby', path });
    expect(created.project.pages.length).toBeGreaterThan(0);
    expect(created.path).toBe(path);

    const got = getProjectHandle(store, created.handle);
    expect(got.project).toBe(created.project);
    expect(got.path).toBe(path);

    const opened = openProjectHandle(store, path);
    expect(opened.project.name).toBe(created.project.name);
    expect(opened.handle).not.toBe(created.handle);

    const newPath = tmpPath('renamed.mcms.json');
    expect(saveProjectHandle(store, created.handle, newPath)).toEqual({ path: newPath });
  });

  it('refuses to create over an existing file (would otherwise silently clobber it)', () => {
    const store = new ProjectStore();
    const path = tmpPath();
    createProjectHandle(store, { path });
    expect(() => createProjectHandle(store, { path })).toThrow(/已經存在/);
    // the original file is untouched
    expect(openProjectHandle(store, path).project.name).toBe('未命名選單');
  });
});
