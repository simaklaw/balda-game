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
  /** Перламутровый отлив: три тона градиента (шампань → розовое золото → лаванда). */
  sheen: readonly [number, number, number];
}

export type ThemeKind = 'dark' | 'light';

export const DARK: Palette = {
  // «Ночная типография»: чернильный баклажан, слоновая бумага, шампань, рубин и перламутр.
  bg: 0x0b0910,
  panel: 0x17121d,
  panelBorder: 0x4a3b57,
  accent: 0xa51f40,
  accentDark: 0x6a1129,
  ai: 0xbba9dc,
  cell: 0xf2e9d7,
  cellBorder: 0xd9cbb0,
  cellEmpty: 0x15101a,
  cellNew: 0xc72c4e,
  cellPath: 0xdcb46c,
  text: 0xf3eadb,
  textDim: 0xa59bb0,
  letterText: 0x17121a,
  danger: 0xff8493,
  success: 0x93d4ac,
  player: 0xe6c98a,
  gold: 0xe6c98a,
  tileEdge: 0xb4a283,
  bgGlow: 0x2b1733,
  frame: 0x241a2b,
  frameEdge: 0xbb9c62,
  sheen: [0xf2d89a, 0xe9a8bb, 0xb7a2ea],
};

export const LIGHT: Palette = {
  // Дневная версия: жемчуг и шампань, глубокий рубин и аметист для акцентов.
  bg: 0xe8dfd6,
  panel: 0xfbf6ee,
  panelBorder: 0xcdb9a3,
  accent: 0x9d1d3d,
  accentDark: 0x6c1229,
  ai: 0x5b4a7c,
  cell: 0xfffaf0,
  cellBorder: 0xdccfb6,
  cellEmpty: 0x2b2230,
  cellNew: 0xa81f40,
  cellPath: 0xb98a3a,
  text: 0x1e1721,
  textDim: 0x76697c,
  letterText: 0x17121a,
  danger: 0xa81f40,
  success: 0x3f7a55,
  player: 0x9d1d3d,
  gold: 0xa9803a,
  tileEdge: 0xc7b793,
  bgGlow: 0xf8f0ea,
  frame: 0x3b2d40,
  frameEdge: 0xaa8c55,
  sheen: [0xd9b36a, 0xd68aa2, 0x8f78c9],
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

/** Линейная интерполяция двух цветов, t в [0, 1]. */
export function mix(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ch = (shift: number): number => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * k);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
