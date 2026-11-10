// Zod schemas for the MCP tool inputs. Mirrors src/core/model/types.ts; never redefines core validation rules
// (ranges/clamps still happen in model/defaults.ts normalizeElement, this only rejects the wrong shape/type).
import { z } from 'zod';
import { ELEMENT_TYPES, SKIN_IDS } from '../core/model/defaults';
import { ICON_IDS } from '../core/model/types';
import type { ElementType, SkinId } from '../core/model/types';

const num = z.number().finite();
const colorOrNull = z.string().nullable();

export const handleSchema = z.string().min(1, 'handle 不能是空字串。');
export const idSchema = z.string().min(1);
export const idsSchema = z.array(idSchema).min(1, '至少要指定一個 id。');

export const elementTypeSchema = z.enum(ELEMENT_TYPES as unknown as [ElementType, ...ElementType[]]);
export const iconIdSchema = z.enum(ICON_IDS);
export const skinIdSchema = z.enum(SKIN_IDS as unknown as [SkinId, ...SkinId[]]);
export const renderScaleSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('page'), pageId: idSchema }),
  z.object({ type: z.literal('command'), command: z.string() }),
  z.object({ type: z.literal('url'), url: z.string() }),
  z.object({ type: z.literal('copy'), text: z.string() }),
  z.object({ type: z.literal('close') }),
]);

/**
 * Every optional element field across every element type (BaseElement + Interactive + all per-type fields from
 * model/defaults.ts). Field names shared by two types with disjoint enums (only "variant": panel vs. button) take
 * the union of both; this still rejects garbage strings, it is just agnostic of which element type they land on
 * (normalizeElement/updateElements apply the patch the same way regardless of type, so this mirrors that).
 */
export const elementPatchShape = {
  name: z.string(),
  x: num,
  y: num,
  w: num.positive(),
  h: num.positive(),
  locked: z.boolean(),
  hidden: z.boolean(),
  opacity: num.min(0).max(1),
  action: actionSchema,
  tooltip: z.string(),
  text: z.string(),
  fontSize: num,
  bold: z.boolean(),
  textColor: colorOrNull,
  variant: z.union([z.enum(['raised', 'inset', 'flat']), z.enum(['default', 'primary', 'danger', 'disabled'])]),
  fill: colorOrNull,
  icon: iconIdSchema.nullable(),
  lineHeight: num,
  shadow: z.boolean(),
  color: colorOrNull,
  align: z.enum(['left', 'center', 'right']),
  vAlign: z.enum(['top', 'middle', 'bottom']),
  wrap: z.boolean(),
  pixelate: z.enum(['auto', 'on', 'off']),
  fontFamily: z.string(),
  assetId: z.string().nullable(),
  fit: z.enum(['stretch', 'contain', 'cover', 'original']),
  scale: num,
  smoothing: z.boolean(),
  value: num.min(0).max(100),
  trackColor: colorOrNull,
  segments: num,
  shape: z.enum(['rect', 'rounded', 'ellipse']),
  radius: num,
  gradient: z.object({ to: z.string(), direction: z.enum(['vertical', 'horizontal']) }).nullable(),
  stroke: colorOrNull,
  strokeWidth: num,
  orientation: z.enum(['horizontal', 'vertical']),
  style: z.enum(['skin', 'solid', 'dashed', 'dotted']),
  thickness: num,
  cols: num,
  rows: num,
  slotSize: num,
  gap: num,
  tint: colorOrNull,
};

/** Partial, unknown-key-rejecting patch/creation-props object for any element type. */
export const elementPropsSchema = z.object(elementPatchShape).partial().strict();

export const pagePatchShape = {
  key: z.string(),
  title: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bgColor: z.string().nullable(),
  footerLabel: z.string().nullable(),
};

export const pagePropsSchema = z.object(pagePatchShape).partial().strict();

export const exportModeSchema = z.enum(['registry', 'functions']);
export const afterActionSchema = z.enum(['close', 'none']);
export const commandModeSchema = z.enum(['trigger', 'direct']);

export const exportOptionsShape = {
  namespace: z.string().optional(),
  packName: z.string().optional(),
  mode: exportModeSchema.optional(),
  quickActions: z.boolean().optional(),
  afterAction: afterActionSchema.optional(),
  commandMode: commandModeSchema.optional(),
  scale: renderScaleSchema.optional(),
  tileSize: z.number().int().positive().optional(),
  autotest: z.boolean().optional(),
};

export const checkOptionsShape = {
  mode: exportModeSchema.optional(),
  commandMode: commandModeSchema.optional(),
};
