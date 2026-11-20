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
  /** Центр и край фонового свечения. */
  bgGlow: number;
}

export type ThemeKind = 'dark' | 'light';

export const DARK: Palette = {
  bg: 0x0b111c,
  panel: 0x172236,
  panelBorder: 0x2a3b5a,
  accent: 0x3f82ee,
  accentDark: 0x2a5cb0,
  ai: 0xff9a5c,
  cell: 0xf6eedb,
  cellBorder: 0xd2c29c,
  cellEmpty: 0x111a2b,
  cellNew: 0x58c27d,
  cellPath: 0xf0c35c,
  text: 0xf4f6fb,
  textDim: 0x9db0c9,
  letterText: 0x2b1f14,
  danger: 0xe9705f,
  success: 0x6fd08c,
  player: 0x72b8ff,
  gold: 0xf0c35c,
  tileEdge: 0xb9a578,
  bgGlow: 0x1c2c4a,
};

export const LIGHT: Palette = {
  bg: 0xe9e1d0,
  panel: 0xfbf7ee,
  panelBorder: 0xd2c6af,
  accent: 0x2f6fb5,
  accentDark: 0x24548a,
  ai: 0xc96a22,
  cell: 0xfffdf6,
  cellBorder: 0xc4b693,
  cellEmpty: 0xd8cdb6,
  cellNew: 0x2f9a58,
  cellPath: 0xe0a92e,
  text: 0x242a33,
  textDim: 0x66717f,
  letterText: 0x2b1f14,
  danger: 0xb94a3b,
  success: 0x2f9a58,
  player: 0x2f6fb5,
  gold: 0xc8921f,
  tileEdge: 0xcdbd95,
  bgGlow: 0xf6f0e2,
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
export const LETTER_FONT = 'Georgia, "Palatino Linotype", Palatino, "Times New Roman", serif';

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
