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
  /** Цвет игрока в HUD (у соперника — ai). */
  player: number;
  /** Золото: выделения, заголовок, кольцо новой буквы. */
  gold: number;
  /** Нижняя грань фишки (объём). */
  tileEdge: number;
  /** Центр фонового свечения. */
  bgGlow: number;
  /** Рама доски (орех) и её кромка (латунь). */
  frame: number;
  frameEdge: number;
}

export type ThemeKind = 'dark' | 'light';

export const DARK: Palette = {
  // «Ночная партия»: изумрудное сукно, орех, латунь и слоновая кость.
  bg: 0x08110d,
  panel: 0x10201a,
  panelBorder: 0x4a4326,
  accent: 0xc9a24b,
  accentDark: 0x8f7230,
  ai: 0xdc8a5e,
  cell: 0xf4ecd9,
  cellBorder: 0xd8c9a3,
  cellEmpty: 0x0c2219,
  cellNew: 0x4fc08d,
  cellPath: 0xe6c36e,
  text: 0xf3ead6,
  textDim: 0xa3b3a6,
  letterText: 0x1d1810,
  danger: 0xdb6a52,
  success: 0x5fc98f,
  player: 0xeadfc4,
  gold: 0xe3c071,
  tileEdge: 0xb8a574,
  bgGlow: 0x143a2c,
  frame: 0x3a281a,
  frameEdge: 0xa98a43,
};

export const LIGHT: Palette = {
  bg: 0xd8ccae,
  panel: 0xf7f0df,
  panelBorder: 0xb9a572,
  accent: 0x1f5c47,
  accentDark: 0x16443a,
  ai: 0xb45a2e,
  cell: 0xfffbef,
  cellBorder: 0xcdbd93,
  cellEmpty: 0x2d5c48,
  cellNew: 0x1f9a67,
  cellPath: 0xd6a73a,
  text: 0x1c2a22,
  textDim: 0x5d6a5f,
  letterText: 0x1d1810,
  danger: 0xb6452f,
  success: 0x1f9a67,
  player: 0x1f5c47,
  gold: 0xa77d1c,
  tileEdge: 0xc9b98c,
  bgGlow: 0xeadfc3,
  frame: 0x7b5a38,
  frameEdge: 0xb08a3e,
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

/** Интерфейс: системный шрифт без загрузки файлов. */
export const FONT_FAMILY =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
/** Буквы фишек и заголовок: «книжная» гарнитура, есть на всех платформах. */
export const LETTER_FONT = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif';

/** Относительная яркость цвета 0..1 (для выбора цвета текста на заливке). */
export function luminance(color: number): number {
  const ch = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch((color >> 16) & 255) + 0.7152 * ch((color >> 8) & 255) + 0.0722 * ch(color & 255);
}

/** Смешать цвет с чёрным (amount<0) или белым (amount>0): amount в [-1, 1]. */
export function shade(color: number, amount: number): number {
  const target = amount < 0 ? 0 : 255;
  const t = Math.min(1, Math.abs(amount));
  const mix = (c: number): number => Math.round(c + (target - c) * t);
  return (mix((color >> 16) & 255) << 16) | (mix((color >> 8) & 255) << 8) | mix(color & 255);
}

const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

/** CSS-фон страницы: мягкое свечение в центре, синхронно с темой. */
export function pageBackground(): string {
  const p = current;
  return 'radial-gradient(ellipse at 50% 38%, ' + hex(p.bgGlow) + ' 0%, ' + hex(p.bg) + ' 70%)';
}
