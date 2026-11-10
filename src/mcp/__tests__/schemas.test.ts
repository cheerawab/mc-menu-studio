// Negative (reject) + positive (accept) pairs for every zod schema in src/mcp/schemas.ts.
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  actionSchema, checkOptionsShape, elementPropsSchema, elementTypeSchema, exportOptionsShape, handleSchema, idsSchema,
  idSchema, iconIdSchema, pagePropsSchema, renderScaleSchema, skinIdSchema,
} from '../schemas';

describe('handleSchema / idSchema / idsSchema', () => {
  it('rejects empty strings and empty arrays', () => {
    expect(handleSchema.safeParse('').success).toBe(false);
    expect(idSchema.safeParse('').success).toBe(false);
    expect(idsSchema.safeParse([]).success).toBe(false);
  });
  it('accepts non-empty values', () => {
    expect(handleSchema.safeParse('abc123').success).toBe(true);
    expect(idsSchema.safeParse(['a', 'b']).success).toBe(true);
  });
});

describe('elementTypeSchema / iconIdSchema / skinIdSchema / renderScaleSchema', () => {
  it('rejects values outside the known set', () => {
    expect(elementTypeSchema.safeParse('widget').success).toBe(false);
    expect(iconIdSchema.safeParse('banana').success).toBe(false);
    expect(skinIdSchema.safeParse('neon').success).toBe(false);
    expect(renderScaleSchema.safeParse(5).success).toBe(false);
    expect(renderScaleSchema.safeParse('2').success).toBe(false);
  });
  it('accepts every known value', () => {
    for (const t of ['panel', 'button', 'label', 'image', 'bar', 'shape', 'divider', 'slotgrid', 'icon'])
      expect(elementTypeSchema.safeParse(t).success).toBe(true);
    expect(iconIdSchema.safeParse('heart').success).toBe(true);
    for (const s of ['vanilla', 'dark', 'holo', 'parchment']) expect(skinIdSchema.safeParse(s).success).toBe(true);
    for (const s of [1, 2, 3, 4]) expect(renderScaleSchema.safeParse(s).success).toBe(true);
  });
});

describe('actionSchema', () => {
  it('rejects an unknown type, a missing discriminant and missing required fields', () => {
    expect(actionSchema.safeParse({ type: 'teleport' }).success).toBe(false);
    expect(actionSchema.safeParse({}).success).toBe(false);
    expect(actionSchema.safeParse({ type: 'page' }).success).toBe(false); // pageId required
    expect(actionSchema.safeParse({ type: 'command' }).success).toBe(false); // command required
  });
  it('accepts every action type with its required fields', () => {
    expect(actionSchema.safeParse({ type: 'none' }).success).toBe(true);
    expect(actionSchema.safeParse({ type: 'page', pageId: 'p1' }).success).toBe(true);
    expect(actionSchema.safeParse({ type: 'command', command: 'time set day' }).success).toBe(true);
    expect(actionSchema.safeParse({ type: 'url', url: 'https://example.com' }).success).toBe(true);
    expect(actionSchema.safeParse({ type: 'copy', text: 'hi' }).success).toBe(true);
    expect(actionSchema.safeParse({ type: 'close' }).success).toBe(true);
  });
});

describe('elementPropsSchema', () => {
  it('rejects an unknown field, wrong types and out-of-range numbers', () => {
    expect(elementPropsSchema.safeParse({ bogusField: 1 }).success).toBe(false);
    expect(elementPropsSchema.safeParse({ fontSize: 'big' }).success).toBe(false);
    expect(elementPropsSchema.safeParse({ opacity: 2 }).success).toBe(false);
    expect(elementPropsSchema.safeParse({ variant: 'rainbow' }).success).toBe(false);
    expect(elementPropsSchema.safeParse({ icon: 'not-an-icon' }).success).toBe(false);
    expect(elementPropsSchema.safeParse({ action: { type: 'page' } }).success).toBe(false);
  });
  it('accepts a legitimate partial patch for any element type, including both variant enums', () => {
    expect(elementPropsSchema.safeParse({ x: 10, y: -4, text: '按鈕', fontSize: 14 }).success).toBe(true);
    expect(elementPropsSchema.safeParse({ variant: 'inset' }).success).toBe(true); // panel variant
    expect(elementPropsSchema.safeParse({ variant: 'primary' }).success).toBe(true); // button variant
    expect(elementPropsSchema.safeParse({ icon: null }).success).toBe(true);
    expect(elementPropsSchema.safeParse({ action: { type: 'close' }, tooltip: '提示' }).success).toBe(true);
    expect(elementPropsSchema.safeParse({}).success).toBe(true);
  });
});

describe('pagePropsSchema', () => {
  it('rejects unknown fields and non-positive sizes', () => {
    expect(pagePropsSchema.safeParse({ elements: [] }).success).toBe(false);
    expect(pagePropsSchema.safeParse({ width: 0 }).success).toBe(false);
    expect(pagePropsSchema.safeParse({ width: 12.5 }).success).toBe(false);
  });
  it('accepts a legitimate partial page patch', () => {
    expect(pagePropsSchema.safeParse({ key: 'main', title: '選單', width: 320, height: 200, bgColor: null, footerLabel: '關閉' }).success).toBe(
      true,
    );
    expect(pagePropsSchema.safeParse({}).success).toBe(true);
  });
});

describe('exportOptionsShape / checkOptionsShape', () => {
  const exportOptions = z.object(exportOptionsShape);
  const checkOptions = z.object(checkOptionsShape);
  it('rejects an unknown mode/commandMode', () => {
    expect(exportOptions.safeParse({ mode: 'bundle' }).success).toBe(false);
    expect(exportOptions.safeParse({ commandMode: 'magic' }).success).toBe(false);
    expect(checkOptions.safeParse({ mode: 'bundle' }).success).toBe(false);
  });
  it('accepts a fully-specified options object and an empty one', () => {
    expect(
      exportOptions.safeParse({
        namespace: 'ns', packName: 'My Pack', mode: 'registry', quickActions: true, afterAction: 'close',
        commandMode: 'direct', scale: 2, tileSize: 32, autotest: false,
      }).success,
    ).toBe(true);
    expect(exportOptions.safeParse({}).success).toBe(true);
    expect(checkOptions.safeParse({ mode: 'functions', commandMode: 'trigger' }).success).toBe(true);
  });
});
