// Group E (checks): thin wrapper over export/project.ts checkExport, which already layers export-only rules on
// top of model/validate.ts validateProject. zh-TW messages pass through unchanged.
import { checkExport, type ExportCheckOptions } from '../../core/export/project';
import { countIssues, type Issue } from '../../core/model/validate';
import type { Project } from '../../core/model/types';

export interface CheckResult {
  issues: Issue[];
  counts: Record<'error' | 'warning' | 'info', number>;
}

export function checkProjectHandler(project: Project, opts: ExportCheckOptions = {}): CheckResult {
  const issues = checkExport(project, opts);
  return { issues, counts: countIssues(issues) };
}
