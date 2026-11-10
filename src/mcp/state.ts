// Project handle store: file is the source of truth, the Map is a memory cache of the latest snapshot.
// Every mutation is persisted to its file immediately (MCP_PLAN.md §2.2), so an agent crash or reconnect, or a
// person opening the same JSON in the browser editor, never sees stale state.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { newId } from '../core/model/ids';
import { parseProjectJson, serializeProject } from '../core/model/serialize';
import type { Project } from '../core/model/types';

export class HandleNotFoundError extends Error {
  constructor(handle: string) {
    super(`找不到 handle「${handle}」：請先用 mcms.project.create 或 mcms.project.open 建立專案。`);
  }
}

interface Entry {
  project: Project;
  path: string;
}

/** Writes a project's canonical JSON to disk, creating parent directories as needed. */
export function writeProjectFile(path: string, project: Project): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeProject(project), 'utf8');
}

/** Reads and normalises a project JSON file. Throws a zh-TW error on a missing file or the core's on garbage input. */
export function readProjectFile(path: string): { project: Project; warnings: string[] } {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`找不到專案檔「${path}」。`);
    throw e;
  }
  return parseProjectJson(text);
}

/**
 * In-memory handle -> {project, path} registry for one server process. Not persisted across restarts: the agent
 * re-opens its `*.mcms.json` file (which IS persisted) to resume a session.
 */
export class ProjectStore {
  private readonly entries = new Map<string, Entry>();

  /** Registers an already-built project under a fresh handle and writes it to `path`. */
  create(project: Project, path: string): { handle: string; path: string } {
    const abs = resolve(path);
    const handle = newId(12);
    this.entries.set(handle, { project, path: abs });
    writeProjectFile(abs, project);
    return { handle, path: abs };
  }

  /** Loads a project JSON file and registers it under a fresh handle. */
  open(path: string): { handle: string; project: Project; path: string; warnings: string[] } {
    const abs = resolve(path);
    const { project, warnings } = readProjectFile(abs);
    const handle = newId(12);
    this.entries.set(handle, { project, path: abs });
    return { handle, project, path: abs, warnings };
  }

  private entry(handle: string): Entry {
    const e = this.entries.get(handle);
    if (!e) throw new HandleNotFoundError(handle);
    return e;
  }

  get(handle: string): Project {
    return this.entry(handle).project;
  }

  path(handle: string): string {
    return this.entry(handle).path;
  }

  /** Applies `fn` to the current project, persists the result to its file, and returns it. */
  mutate(handle: string, fn: (project: Project) => Project): Project {
    const e = this.entry(handle);
    e.project = fn(e.project);
    writeProjectFile(e.path, e.project);
    return e.project;
  }

  /** Writes the current snapshot to `path` (default: the handle's own file), and remembers it as the new path. */
  save(handle: string, path?: string): string {
    const e = this.entry(handle);
    const abs = path ? resolve(path) : e.path;
    writeProjectFile(abs, e.project);
    e.path = abs;
    return abs;
  }
}
