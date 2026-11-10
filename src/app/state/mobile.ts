// UI state used only by the touch / compact layout. Not persisted and not part of the undo history.
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

export type SheetId = 'elements' | 'pages' | 'layers' | 'inspect' | 'more';
export type NudgeStep = 1 | 8 | 16;
export const NUDGE_STEPS: readonly NudgeStep[] = [1, 8, 16];

export interface MobileState {
  /** Sheet open in the compact layout (bottom sheet in portrait, docked right in landscape). */
  sheet: SheetId | null;
  /** 多選: a tap on an element adds it to or removes it from the selection (the touch replacement for Shift). */
  multiSelect: boolean;
  /** Pixels per tap of the selection bar's arrow buttons. */
  nudgeStep: NudgeStep;
  openSheet(id: SheetId | null): void;
  toggleSheet(id: SheetId): void;
  setMultiSelect(on: boolean): void;
  cycleNudgeStep(): void;
}

const INITIAL = { sheet: null, multiSelect: false, nudgeStep: 1 as NudgeStep };

export const mobileStore = createStore<MobileState>()((set, get) => ({
  ...INITIAL,
  openSheet: (sheet) => set({ sheet }),
  toggleSheet: (id) => set({ sheet: get().sheet === id ? null : id }),
  setMultiSelect: (multiSelect) => set({ multiSelect }),
  cycleNudgeStep: () => {
    const i = NUDGE_STEPS.indexOf(get().nudgeStep);
    set({ nudgeStep: NUDGE_STEPS[(i + 1) % NUDGE_STEPS.length] });
  },
}));

export const mobile = () => mobileStore.getState();

export function useMobile<T>(selector: (s: MobileState) => T): T {
  return useStore(mobileStore, selector);
}

/** For tests. */
export function resetMobile() {
  mobileStore.setState(INITIAL);
}
