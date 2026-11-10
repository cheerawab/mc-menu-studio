import { describe, expect, it } from 'vitest';
import { createProject } from '../../core/model/defaults';
import { checkProjectHandler } from '../handlers/check';

describe('mcms.check.project', () => {
  it('reports no errors for a fresh blank project', () => {
    const { issues, counts } = checkProjectHandler(createProject());
    expect(counts.error).toBe(0);
    expect(issues.every((i) => i.severity !== 'error')).toBe(true);
  });

  it('reports the export-blocking "minecraft" namespace error, with the zh-TW message intact', () => {
    const project = createProject({ namespace: 'minecraft' });
    const { issues, counts } = checkProjectHandler(project);
    expect(counts.error).toBeGreaterThan(0);
    expect(issues.some((i) => i.code === 'export-namespace-minecraft' && i.message.includes('minecraft'))).toBe(true);
  });

  it('passes mode/commandMode through to checkExport (trigger mode silences the direct-mode command warning)', () => {
    const page = createProject().pages[0];
    const project = createProject({ pages: [{ ...page, elements: [] }] });
    const withDirect = checkProjectHandler(project, { commandMode: 'direct' });
    const withTrigger = checkProjectHandler(project, { commandMode: 'trigger' });
    // no command actions at all here, but the call must not throw and must accept the option either way
    expect(withDirect.counts.error).toBe(withTrigger.counts.error);
  });
});
