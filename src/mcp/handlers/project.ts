// Group A (project lifecycle): thin wrappers over model/defaults.createProject, templates/index.ts and
// model/serialize.ts. The MCP-specific bit is only the file path bookkeeping (ProjectStore), added next stage.
import { TEMPLATES } from '../../core/templates';
import type { SkinId } from '../../core/model/types';

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  skinId: SkinId;
}

export function listTemplates(): TemplateSummary[] {
  return TEMPLATES.map(({ id, name, description, skinId }) => ({ id, name, description, skinId }));
}
