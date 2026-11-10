import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject } from '../../core/model/defaults';
import { serializeProject } from '../../core/model/serialize';
import { HandleNotFoundError, ProjectStore } from '../state';

function tmpPath(name = 'p.mcms.json'): string {
  return join(mkdtempSync(join(tmpdir(), 'mcms-state-')), name);
}

describe('ProjectStore (file is the source of truth)', () => {
  it('creates a handle and writes the project to disk immediately', () => {
    const store = new ProjectStore();
    const project = createProject({ name: '測試專案' });
    const path = tmpPath();
    const { handle, path: abs } = store.create(project, path);
    expect(abs).toBe(path);
    expect(readFileSync(path, 'utf8')).toBe(serializeProject(project));
    expect(store.get(handle)).toBe(project);
  });

  it('throws a zh-TW error for an unknown handle', () => {
    const store = new ProjectStore();
    expect(() => store.get('nope')).toThrow(HandleNotFoundError);
    expect(() => store.get('nope')).toThrow(/找不到 handle/);
  });

  it('persists every mutation: file content always equals serializeProject(new project)', () => {
    const store = new ProjectStore();
    const { handle, path } = store.create(createProject(), tmpPath());
    const next = store.mutate(handle, (p) => ({ ...p, name: '改名後' }));
    expect(next.name).toBe('改名後');
    expect(readFileSync(path, 'utf8')).toBe(serializeProject(next));
    expect(store.get(handle)).toBe(next);
  });

  it('open() throws a zh-TW error for a missing file, not a raw ENOENT', () => {
    const store = new ProjectStore();
    const missing = tmpPath('does-not-exist.mcms.json');
    expect(() => store.open(missing)).toThrow(/找不到專案檔/);
  });

  it('open() reads a file written by create() into a fresh handle', () => {
    const store = new ProjectStore();
    const path = tmpPath();
    store.create(createProject({ name: '原始' }), path);
    const opened = store.open(path);
    expect(opened.project.name).toBe('原始');
    expect(opened.warnings).toEqual([]);
    expect(opened.handle).not.toBe('');
  });

  it('save() writes to a new path and remembers it for later mutations', () => {
    const store = new ProjectStore();
    const { handle } = store.create(createProject(), tmpPath('a.mcms.json'));
    const newPath = tmpPath('b.mcms.json');
    const saved = store.save(handle, newPath);
    expect(saved).toBe(newPath);
    expect(readFileSync(newPath, 'utf8')).toBe(serializeProject(store.get(handle)));
    const next = store.mutate(handle, (p) => ({ ...p, name: '再改一次' }));
    expect(readFileSync(newPath, 'utf8')).toBe(serializeProject(next));
  });
});
