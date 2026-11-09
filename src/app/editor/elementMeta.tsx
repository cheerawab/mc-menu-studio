'use client';

import { BatteryMedium, Grid3x3, Image as ImageIcon, RectangleHorizontal, SeparatorHorizontal, Shapes, Square, Star, Type } from 'lucide-react';
import type { ElementType } from '@/core/model/types';
import { createElement, ELEMENT_LABELS } from '@/core/model/defaults';
import { uniqueName } from '@/core/model/ids';
import { snapValue } from '@/core/geometry';
import { currentPage, editor } from '../state/store';

export const ELEMENT_ICON: Record<ElementType, typeof Square> = {
  panel: Square,
  button: RectangleHorizontal,
  label: Type,
  image: ImageIcon,
  icon: Star,
  shape: Shapes,
  bar: BatteryMedium,
  divider: SeparatorHorizontal,
  slotgrid: Grid3x3,
};

export const ELEMENT_HINT: Record<ElementType, string> = {
  panel: '套用主題外觀的底板或視窗框',
  button: '可點擊的按鈕，可設定動作與提示',
  label: '多行文字，支援中文自動換行',
  image: '上傳 PNG / JPG / WebP 圖片',
  icon: '內建 16×16 像素圖示，可染色',
  shape: '矩形、圓角矩形或橢圓，可漸層',
  bar: '靜態進度條（例如經驗、血量）',
  divider: '水平或垂直分隔線',
  slotgrid: '物品欄格子，可設定欄數與列數',
};

/** Adds a new element of `type`, centred on `at` (page px) or on the page. */
export function addElementOfType(type: ElementType, at?: { x: number; y: number }) {
  const s = editor();
  const page = currentPage(s);
  const el = createElement(type, { name: uniqueName(ELEMENT_LABELS[type], page.elements.map((e) => e.name)) });
  if (type === 'panel' && !page.elements.length) {
    el.w = page.width;
    el.h = page.height;
  } else {
    const cx = at ? at.x : page.width / 2, cy = at ? at.y : page.height / 2;
    el.x = snapValue(cx - el.w / 2, s.view.snap);
    el.y = snapValue(cy - el.h / 2, s.view.snap);
  }
  s.addElement(el);
  return el;
}
