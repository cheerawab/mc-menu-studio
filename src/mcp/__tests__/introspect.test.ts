import { describe, expect, it } from 'vitest';
import { ELEMENT_TYPES } from '../../core/model/defaults';
import { ICON_IDS } from '../../core/model/types';
import { SKIN_IDS } from '../../core/model/defaults';
import { elementTypesInfo, iconsInfo, skinsInfo } from '../handlers/introspect';

describe('mcms.schema.element_types', () => {
  it('lists every element type with its defaults', () => {
    const info = elementTypesInfo();
    expect(info.map((i) => i.type)).toEqual([...ELEMENT_TYPES]);
    const button = info.find((i) => i.type === 'button')!;
    expect(button.defaults).toMatchObject({ type: 'button', text: '按鈕', id: '<id>' });
  });
});

describe('mcms.schema.icons', () => {
  it('lists every built-in icon id with a zh-TW label', () => {
    const icons = iconsInfo();
    expect(icons.map((i) => i.id)).toEqual([...ICON_IDS]);
    expect(icons.every((i) => i.label.length > 0)).toBe(true);
  });
});

describe('mcms.schema.skins', () => {
  it('lists every built-in skin', () => {
    const skins = skinsInfo();
    expect(skins.map((s) => s.id).sort()).toEqual([...SKIN_IDS].sort());
    expect(skins.every((s) => s.swatches.length > 0)).toBe(true);
  });
});
