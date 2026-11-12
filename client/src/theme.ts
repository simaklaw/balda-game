/** Палитры тёмной и светлой темы и управление активной темой. */

export interface Palette {
  bg: number;
  panel: number;
  panelBorder: number;
  accent: number;
  accentDark: number;
  ai: number;
  cell: number;
  cellBorder: number;
  cellEmpty: number;
  cellNew: number;
  cellPath: number;
  text: number;
  textDim: number;
  letterText: number;
  danger: number;
  success: number;
}

export type ThemeKind = 'dark' | 'light';

export const DARK: Palette = {
  bg: 0x10161f,
  panel: 0x1a2332,
  panelBorder: 0x2c3a50,
  accent: 0x5aa7ff,
  accentDark: 0x2f5a8f,
  ai: 0xffa04d,
  cell: 0xf3ead8,
  cellBorder: 0xcbbfa5,
  cellEmpty: 0x243246,
  cellNew: 0x7fc97f,
  cellPath: 0xffd86b,
  text: 0xf5f7fa,
  textDim: 0x9fb0c3,
  letterText: 0x2a2117,
  danger: 0xe06c5a,
  success: 0x7fc97f,
};

export const LIGHT: Palette = {
  bg: 0xece7dc,
  panel: 0xf9f6ef,
  panelBorder: 0xcfc4b2,
  accent: 0x2f6fb5,
  accentDark: 0x24548a,
  ai: 0xd97a2b,
  cell: 0xffffff,
  cellBorder: 0xb9ad99,
  cellEmpty: 0xd9d0bf,
  cellNew: 0x3f9d3f,
  cellPath: 0xf3c84a,
  text: 0x242a33,
  textDim: 0x6b7686,
  letterText: 0x2a2117,
  danger: 0xc25141,
  success: 0x3f9d3f,
};

let current: Palette = DARK;

/** Активная палитра. Все компоненты читают цвета через этот геттер. */
export function palette(): Palette {
  return current;
}

export function themeKind(): ThemeKind {
  return current === DARK ? 'dark' : 'light';
}

export function setTheme(kind: ThemeKind): void {
  current = kind === 'dark' ? DARK : LIGHT;
}

export const FONT_FAMILY = 'Arial, sans-serif';
