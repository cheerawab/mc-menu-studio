import type { SkinId } from '../model/types';
import { darkModernSkin } from './darkModern';
import { holoSkin } from './holo';
import { parchmentSkin } from './parchment';
import type { Skin, SkinKit } from './types';
import { vanillaSkin } from './vanilla';

export type { Skin, SkinKit } from './types';

export const SKINS: Record<SkinId, Skin> = {
  vanilla: vanillaSkin,
  dark: darkModernSkin,
  holo: holoSkin,
  parchment: parchmentSkin,
};

export const SKIN_LIST: Skin[] = [vanillaSkin, darkModernSkin, holoSkin, parchmentSkin];

export function getSkin(id: SkinId): Skin {
  return SKINS[id] ?? darkModernSkin;
}

export function skinKit(skin: Skin, accentOverride: string | null): SkinKit {
  return { accent: accentOverride || skin.accent };
}
