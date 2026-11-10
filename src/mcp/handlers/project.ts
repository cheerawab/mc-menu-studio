// Group A (project lifecycle): thin wrappers over model/defaults.createProject, templates/index.ts and
// model/serialize.ts. The MCP-specific bit is only the file path bookkeeping (ProjectStore).
import { resolve } from 'node:path';
import { createProject } from '../../core/model/defaults';
import type { Project, SkinId } from '../../core/model/types';
import { TEMPLATES } from '../../core/templates';
import type { ProjectStore } from '../state';

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  skinId: SkinId;
}

export function listTemplates(): TemplateSummary[] {
  return TEMPLATES.map(({ id, name, description, skinId }) => ({ id, name, description, skinId }));
}

export interface CreateProjectArgs {
  name?: string;
  namespace?: string;
  skinId?: SkinId;
  fromTemplate?: string;
  path?: string;
}

function findTemplate(id: string) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`找不到範本「${id}」，可用的範本：${TEMPLATES.map((x) => x.id).join(', ')}。`);
  return t;
}

/** Builds a blank or templated project, applying any requested overrides (name/namespace/skinId). */
export function buildProject(args: CreateProjectArgs): Project {
  const base = args.fromTemplate ? findTemplate(args.fromTemplate).build() : createProject();
  return {
    ...base,
    ...(args.name !== undefined ? { name: args.name } : {}),
    ...(args.namespace !== undefined ? { namespace: args.namespace } : {}),
    ...(args.skinId !== undefined ? { skinId: args.skinId } : {}),
  };
}

export function defaultProjectPath(project: Project): string {
  return resolve(`${project.namespace}.mcms.json`);
}

export function createProjectHandle(store: ProjectStore, args: CreateProjectArgs): { handle: string; path: string; project: Project } {
  const project = buildProject(args);
  const path = args.path ?? defaultProjectPath(project);
  const created = store.create(project, path);
  return { ...created, project };
}

export function openProjectHandle(store: ProjectStore, path: string) {
  return store.open(path);
}

export function saveProjectHandle(store: ProjectStore, handle: string, path?: string): { path: string } {
  return { path: store.save(handle, path) };
}

export function getProjectHandle(store: ProjectStore, handle: string): { project: Project; path: string } {
  return { project: store.get(handle), path: store.path(handle) };
}
