// Group G (export): thin wrapper over export/project.ts exportPagesFromProject and export/index.ts
// buildExport/zipExport. The MCP layer only fills in ExportOptions defaults and writes the zips to outDir.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildExport, zipExport, type ExportBuild, type ExportOptions } from '../../core/export';
import { exportPagesFromProject } from '../../core/export/project';
import type { Project, RenderScale } from '../../core/model/types';
import type { RenderEnv } from '../../core/render/types';

export interface ExportOptionsInput {
  namespace?: string;
  packName?: string;
  mode?: ExportOptions['mode'];
  quickActions?: boolean;
  afterAction?: ExportOptions['afterAction'];
  commandMode?: ExportOptions['commandMode'];
  scale?: RenderScale;
  tileSize?: number;
  autotest?: boolean;
}

/** Fills in ExportOptions defaults from the project (namespace, pack name, 解析度) when the agent omits them. */
export function resolveExportOptions(project: Project, input: ExportOptionsInput = {}): ExportOptions {
  return {
    namespace: input.namespace ?? project.namespace,
    packName: input.packName ?? project.name,
    mode: input.mode ?? 'registry',
    quickActions: input.quickActions ?? true,
    afterAction: input.afterAction ?? 'close',
    commandMode: input.commandMode,
    scale: input.scale ?? project.settings.renderScale,
    tileSize: input.tileSize,
    autotest: input.autotest ?? false,
  };
}

export function buildProjectExport(project: Project, env: RenderEnv, input: ExportOptionsInput = {}): ExportBuild {
  const options = resolveExportOptions(project, input);
  const pages = exportPagesFromProject(project, env, (p) => p.key, options.scale);
  return buildExport(pages, options);
}

export interface ExportFiles {
  resourcePack: string;
  dataPack: string;
  readme: string;
  autotest: string | null;
}

/** Zips the build and writes resourcepack.zip / datapack.zip / README_zh-TW.txt (+ autotest.zip) into outDir. */
export async function writeProjectExport(build: ExportBuild, outDir: string): Promise<ExportFiles> {
  const dir = resolve(outDir);
  mkdirSync(dir, { recursive: true });
  const zips = await zipExport(build);
  const resourcePack = join(dir, 'resourcepack.zip');
  const dataPack = join(dir, 'datapack.zip');
  const readme = join(dir, 'README_zh-TW.txt');
  writeFileSync(resourcePack, zips.resourcePack);
  writeFileSync(dataPack, zips.dataPack);
  writeFileSync(readme, build.readme);
  let autotest: string | null = null;
  if (zips.autotest) {
    autotest = join(dir, 'autotest.zip');
    writeFileSync(autotest, zips.autotest);
  }
  return { resourcePack, dataPack, readme, autotest };
}
