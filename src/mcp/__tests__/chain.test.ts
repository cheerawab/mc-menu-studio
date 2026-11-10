// Full lifecycle: create -> add page -> add element -> update -> check -> export, asserting structure at each
// step (MCP_PLAN.md §3 / TASK_MCP.md's acceptance checklist).
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serializeProject } from '../../core/model/serialize';
import { createRenderEnv } from '../env';
import { checkProjectHandler } from '../handlers/check';
import { addElementHandler, updateElementHandler } from '../handlers/element';
import { buildProjectExport, writeProjectExport } from '../handlers/export';
import { addPageHandler } from '../handlers/page';
import { createProjectHandle } from '../handlers/project';
import { ProjectStore } from '../state';

describe('full agent lifecycle', () => {
  it('create -> add page -> add element -> update -> check -> export', async () => {
    const store = new ProjectStore();
    const env = createRenderEnv();
    const dir = mkdtempSync(join(tmpdir(), 'mcms-chain-'));
    const projectPath = join(dir, 'menu.mcms.json');

    // 1. create
    const created = createProjectHandle(store, { name: '鏈路測試', namespace: 'chaintest', path: projectPath });
    expect(created.project.pages).toHaveLength(1);
    expect(readFileSync(projectPath, 'utf8')).toBe(serializeProject(created.project));
    const { handle } = created;

    // 2. add page
    const { pageId: secondPageId, project: afterAddPage } = addPageHandler(store, handle, { title: '第二頁' });
    expect(afterAddPage.pages).toHaveLength(2);
    expect(afterAddPage.pages[1]).toMatchObject({ id: secondPageId, title: '第二頁' });

    // 3. add element
    const firstPageId = afterAddPage.pages[0].id;
    const { elementId, project: afterAddElement } = addElementHandler(store, handle, firstPageId, 'button', {
      text: '前往第二頁', action: { type: 'page', pageId: secondPageId },
    });
    const button = afterAddElement.pages[0].elements.find((e) => e.id === elementId)!;
    expect(button).toMatchObject({ type: 'button', text: '前往第二頁', action: { type: 'page', pageId: secondPageId } });

    // 4. update
    const { project: afterUpdate } = updateElementHandler(store, handle, firstPageId, [elementId], { x: 12, y: 34 });
    const updatedButton = afterUpdate.pages[0].elements.find((e) => e.id === elementId)!;
    expect(updatedButton).toMatchObject({ x: 12, y: 34 });

    // every mutation so far persisted immediately: the file matches the latest in-memory snapshot
    expect(readFileSync(projectPath, 'utf8')).toBe(serializeProject(afterUpdate));

    // 5. check: a project with a page link and no errors
    const { issues, counts } = checkProjectHandler(afterUpdate);
    expect(counts.error).toBe(0);
    expect(issues.every((i) => i.severity !== 'error')).toBe(true);

    // 6. export
    const build = buildProjectExport(afterUpdate, env, {});
    expect(build.stats.pages).toBe(2);
    expect(build.stats.regions).toBeGreaterThan(0); // the button we added is a clickable region
    const outDir = mkdtempSync(join(tmpdir(), 'mcms-chain-export-'));
    const files = await writeProjectExport(build, outDir);
    expect(readFileSync(files.resourcePack).length).toBeGreaterThan(0);
    expect(readFileSync(files.dataPack).length).toBeGreaterThan(0);
  });
});
