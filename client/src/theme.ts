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
  // «Типографская касса»: чёрная краска, бумага, киноварь, сталь.
  bg: 0x0e0c0a,
  panel: 0x1a1612,
  panelBorder: 0x3d352b,
  accent: 0xc8402b,
  accentDark: 0x8c2a1b,
  ai: 0xb9ae95,
  cell: 0xece3cf,
  cellBorder: 0xcfc3a6,
  cellEmpty: 0x1c1814,
  cellNew: 0xd2452e,
  cellPath: 0xe0583f,
  text: 0xefe6d2,
  textDim: 0x9d927f,
  letterText: 0x14110e,
  danger: 0xff7a5c,
  success: 0x9bbd7a,
  player: 0xd9503a,
  gold: 0xe0583f,
  tileEdge: 0xa89b7c,
  bgGlow: 0x211b15,
  frame: 0x2b2620,
  frameEdge: 0x7a705e,
};

export const LIGHT: Palette = {
  bg: 0xe2d8c0,
  panel: 0xf6efde,
  panelBorder: 0xbfb08e,
  accent: 0xb8321f,
  accentDark: 0x8a2316,
  ai: 0x3b3631,
  cell: 0xfbf6e8,
  cellBorder: 0xd8cca9,
  cellEmpty: 0x2a2520,
  cellNew: 0xb8321f,
  cellPath: 0xc9402b,
  text: 0x1b1712,
  textDim: 0x6e6454,
  letterText: 0x14110e,
  danger: 0xb6321f,
  success: 0x4f7a3a,
  player: 0xb8321f,
  gold: 0xb8321f,
  tileEdge: 0xc2b48f,
  bgGlow: 0xf0e8d3,
  frame: 0x4a4238,
  frameEdge: 0x8a7d66,
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
export const FONT_FAMILY = '"Lora", Georgia, "Times New Roman", serif';
/** Буквы фишек и заголовок: «книжная» гарнитура, есть на всех платформах. */
export const LETTER_FONT = '"Plex Serif", Georgia, "Times New Roman", serif';
/** Заголовки и счёт: наклонный жирный Lora. */
export const DISPLAY_FONT = '"Lora", Georgia, serif';

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
