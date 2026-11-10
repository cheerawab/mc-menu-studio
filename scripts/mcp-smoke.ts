// End-to-end smoke test: spawns the real MCP server (scripts/mcp-server.ts) over stdio with the MCP client SDK,
// drives it through "build a template -> change a label -> export", and checks the produced zips.
//   npm run mcp:smoke
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

class SmokeError extends Error {}

function textOf(result: CallToolResult): string {
  const block = result.content.find((c) => c.type === 'text');
  if (!block || block.type !== 'text') throw new SmokeError(`no text content in ${JSON.stringify(result)}`);
  return block.text;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new SmokeError(`${name} failed: ${textOf(result as CallToolResult)}`);
  return JSON.parse(textOf(result as CallToolResult)) as Record<string, unknown>;
}

function assert(cond: unknown, message: string): void {
  if (!cond) throw new SmokeError(message);
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'mcms-smoke-'));
  const projectPath = join(dir, 'smoke.mcms.json');
  const outDir = join(dir, 'out');

  const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', 'scripts/mcp-server.ts'] });
  const client = new Client({ name: 'mcms-smoke', version: '0.0.1' });
  await client.connect(transport);

  try {
    const tools = await client.listTools();
    assert(tools.tools.length >= 24, `expected >= 24 tools, got ${tools.tools.length}`);
    console.log(`connected: ${tools.tools.length} tools`);

    // 1. build a template
    const created = await call(client, 'mcms.project.create', { fromTemplate: 'lobby', path: projectPath });
    const handle = created.handle as string;
    assert(typeof handle === 'string' && handle.length > 0, 'project.create did not return a handle');
    const project = created.project as { pages: { id: string; elements: { id: string; type: string }[] }[] };
    console.log(`created handle=${handle}, pages=${project.pages.length}`);

    // 2. change a label
    const firstPage = project.pages[0];
    const label = firstPage.elements.find((e) => e.type === 'label');
    assert(label, 'lobby template has no label element on its first page');
    const updated = await call(client, 'mcms.element.update', {
      handle, pageId: firstPage.id, ids: [label!.id], patch: { text: 'SMOKE TEST 標題' },
    });
    const updatedProject = updated.project as { pages: { elements: { id: string; text?: string }[] }[] };
    const changed = updatedProject.pages[0].elements.find((e) => e.id === label!.id);
    assert(changed?.text === 'SMOKE TEST 標題', `label text was not updated, got ${JSON.stringify(changed)}`);
    console.log('updated label text');

    // 2b. checks should list without throwing
    const checked = await call(client, 'mcms.check.project', { handle });
    assert(Array.isArray(checked.issues), 'check.project did not return an issues array');
    console.log(`check.project: ${(checked.issues as unknown[]).length} issues, counts=${JSON.stringify(checked.counts)}`);

    // 3. export.write
    const exported = await call(client, 'mcms.export.write', { handle, outDir });
    const files = exported.files as { resourcePack: string; dataPack: string; readme: string };
    const rpBytes = readFileSync(files.resourcePack);
    const dpBytes = readFileSync(files.dataPack);
    assert(rpBytes.length > 0, 'resourcepack.zip is empty');
    assert(dpBytes.length > 0, 'datapack.zip is empty');
    assert(Array.isArray(exported.warnings), 'export.write did not return a warnings array');
    console.log(
      `export.write: resourcepack.zip ${rpBytes.length} bytes, datapack.zip ${dpBytes.length} bytes, ` +
        `warnings=${(exported.warnings as unknown[]).length}, stats=${JSON.stringify(exported.stats)}`,
    );

    console.log('SMOKE TEST PASSED');
  } finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error('SMOKE TEST FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
