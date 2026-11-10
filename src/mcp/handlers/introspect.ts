// Group D (introspection): lets an agent discover what it can fill in, without guessing field names. Pure reads
// over model/defaults.ts, model/types.ts and skins/index.ts; never invents values of its own.
import { createElement, ELEMENT_LABELS } from '../../core/model/defaults';
import { ELEMENT_TYPES } from '../../core/model/defaults';
import { ICON_IDS } from '../../core/model/types';
import { ICON_LABELS } from '../../core/render/icons';
import { SKIN_LIST } from '../../core/skins';

export interface ElementTypeInfo {
  type: string;
  label: string;
  /** A freshly created element of this type (id replaced by a placeholder) showing every field and its default. */
  defaults: Record<string, unknown>;
}

export function elementTypesInfo(): ElementTypeInfo[] {
  return ELEMENT_TYPES.map((type) => ({
    type,
    label: ELEMENT_LABELS[type],
    defaults: { ...createElement(type), id: '<id>' },
  }));
}

export interface IconInfo {
  id: string;
  label: string;
}

export function iconsInfo(): IconInfo[] {
  return ICON_IDS.map((id) => ({ id, label: ICON_LABELS[id] }));
}

export interface SkinInfo {
  id: string;
  name: string;
  description: string;
  accent: string;
  swatches: string[];
}

export function skinsInfo(): SkinInfo[] {
  return SKIN_LIST.map((s) => ({ id: s.id, name: s.name, description: s.description, accent: s.accent, swatches: s.swatches }));
}
