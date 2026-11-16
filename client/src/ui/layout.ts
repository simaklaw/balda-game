/**
 * Чистый расчёт раскладки игрового экрана: поле, HUD, подсказка слова,
 * панель управления, клавиатура. Три ветки: portrait, landscape-wide, landscape-compact.
 * Без импортов Pixi: модуль чистый и тестируемый в Node.
 */
import type { SafeInsets } from './safeArea';

export interface GameLayoutInput {
  width: number;
  height: number;
  boardSize: number;
  insets: SafeInsets;
  /** Высота клавиатуры портретной ветки (keyboardMetricsFor по полной ширине). */
  keyboardHeight: number;
  /** Кнопок в панели управления: 4 в оффлайне, 3 в онлайне. */
  controlCount: number;
}

export type LayoutOrientation = 'portrait' | 'landscape-wide' | 'landscape-compact';

export interface GameLayout {
  orientation: LayoutOrientation;
  cellSize: number;
  boardX: number;
  boardY: number;
  hudY: number;
  timerX: number;
  timerY: number;
  wordPreviewX: number;
  wordPreviewY: number;
  /** Подсказка помещается отдельно от поля (иначе рисовать в HUD.status). */
  previewFits: boolean;
  controlX: number;
  controlY: number;
  controlWidth: number;
  controlHeight: number;
  controlGap: number;
  keyboardX: number;
  keyboardY: number;
  keyboardWidth: number;
  keyboardRows: readonly string[];
  fits: boolean;
  unfitReason: 'board-too-tall' | 'board-too-wide' | null;
}

export const MIN_CELL = 34;
export const MAX_CELL = 110;
export const HUD_RESERVED = 84;
export const CONTROL_HEIGHT = 46;
export const KEYBOARD_GAP = 8;
export const CONTROL_BLOCK = 64;
export const MIN_CELL_COMPACT = 24;

const KEY_GAP = 5;
const KEY_ROWS = 3;
const KEY_COUNT = 12;
const HUD_COMPACT = 40;
const CONTROL_COMPACT = 40;
const KEY_GAP_COMPACT = 4;
const KEY_H_COMPACT = 34;
const PAD = 8;

export const PORTRAIT_ROWS: readonly string[] = ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю'];
export const COMPACT_ROWS: readonly string[] = ['йцукенгшщзхъфыва', 'пролджэячсмитьбю'];

export function keyboardRowsFor(width: number): readonly string[] {
  return width >= 420 ? PORTRAIT_ROWS : COMPACT_ROWS;
}

export function keyboardMetricsFor(
  width: number,
  rows: readonly string[] = PORTRAIT_ROWS,
): {
  keyWidth: number;
  keyHeight: number;
  height: number;
  gap: number;
} {
  const longest = rows.reduce((max, row) => Math.max(max, row.length), 1);
  if (rows.length <= 2) {
    const gap = KEY_GAP_COMPACT;
    const keyWidth = Math.max(18, Math.floor((width - gap * (longest - 1)) / longest));
    const keyHeight = KEY_H_COMPACT;
    return {
      keyWidth,
      keyHeight,
      height: rows.length * keyHeight + (rows.length - 1) * gap,
      gap,
    };
  }
  const keyWidth = Math.max(18, Math.floor((width - KEY_GAP * (KEY_COUNT - 1)) / KEY_COUNT));
  const keyHeight = Math.min(64, Math.max(42, Math.floor(keyWidth * 1.15)));
  return {
    keyWidth,
    keyHeight,
    height: KEY_ROWS * keyHeight + (KEY_ROWS - 1) * KEY_GAP,
    gap: KEY_GAP,
  };
}

function controlWidthFor(available: number, controlCount: number, gap: number): number {
  return Math.min(
    118,
    Math.max(64, Math.floor((available - gap * (controlCount - 1)) / controlCount)),
  );
}

export function computeGameLayout(input: GameLayoutInput): GameLayout {
  const { width, height, insets, keyboardHeight, controlCount } = input;
  const innerW = width - insets.left - insets.right;
  const innerH = height - insets.top - insets.bottom;

  if (innerW > innerH && innerH >= 420) {
    return layoutLandscapeWide(input);
  }
  if (innerW > innerH && innerH < 420) {
    return layoutLandscapeCompact(input);
  }
  return layoutPortrait(input, keyboardHeight, controlCount);
}

function layoutPortrait(
  input: GameLayoutInput,
  keyboardHeight: number,
  controlCount: number,
): GameLayout {
  const { width, height, boardSize, insets } = input;
  const reservedTop = HUD_RESERVED + insets.top;
  const reservedBottom = keyboardHeight + CONTROL_BLOCK + KEYBOARD_GAP + insets.bottom;

  const cellFromWidth = Math.floor((width - 20 - insets.left - insets.right) / boardSize);
  const cellFromHeight = Math.floor((height - reservedTop - reservedBottom) / boardSize);
  const rawCell = Math.min(cellFromWidth, cellFromHeight);

  let cellSize: number;
  let fits = true;
  let unfitReason: 'board-too-tall' | 'board-too-wide' | null = null;
  if (rawCell < MIN_CELL) {
    fits = false;
    unfitReason = cellFromHeight < MIN_CELL ? 'board-too-tall' : 'board-too-wide';
    cellSize = MIN_CELL;
  } else {
    cellSize = Math.min(MAX_CELL, rawCell);
  }

  const boardPx = cellSize * boardSize;
  const boardY = reservedTop;
  const boardX = Math.max(insets.left, Math.floor((width - boardPx) / 2));
  const controlGap = 8;
  const controlWidth = controlWidthFor(
    width - 32 - insets.left - insets.right,
    controlCount,
    controlGap,
  );
  const controlY = height - 58 - insets.bottom;
  const keyboardY = height - CONTROL_BLOCK - insets.bottom - keyboardHeight;
  const total = controlWidth * controlCount + controlGap * (controlCount - 1);
  const controlX = Math.floor((width - total) / 2);

  const previewBelow = boardY + boardPx + 8;
  const previewFits = previewBelow + 24 <= Math.min(keyboardY, controlY);

  return {
    orientation: 'portrait',
    cellSize,
    boardX,
    boardY,
    hudY: insets.top,
    timerX: width / 2,
    timerY: 60 + insets.top,
    wordPreviewX: width / 2,
    wordPreviewY: previewFits ? previewBelow : controlY - 28,
    previewFits,
    controlX,
    controlY,
    controlWidth,
    controlHeight: CONTROL_HEIGHT,
    controlGap,
    keyboardX: insets.left,
    keyboardY,
    keyboardWidth: width - insets.left - insets.right,
    keyboardRows: PORTRAIT_ROWS,
    fits,
    unfitReason,
  };
}

function layoutLandscapeWide(input: GameLayoutInput): GameLayout {
  const { width, height, boardSize, insets, controlCount } = input;
  const innerW = width - insets.left - insets.right;
  const innerH = height - insets.top - insets.bottom;
  const availH = innerH - 72;
  const availW = Math.floor(innerW * 0.46);
  const rawCell = Math.min(Math.floor(availH / boardSize), Math.floor(availW / boardSize));

  let fits = true;
  let unfitReason: 'board-too-tall' | 'board-too-wide' | null = null;
  let cellSize: number;
  if (rawCell < MIN_CELL) {
    fits = false;
    unfitReason = Math.floor(availH / boardSize) < MIN_CELL ? 'board-too-tall' : 'board-too-wide';
    cellSize = Math.max(1, rawCell);
  } else {
    cellSize = Math.min(MAX_CELL, rawCell);
  }

  const boardX = insets.left + 16;
  const boardY = insets.top + 56;
  const colX = boardX + cellSize * boardSize + 24;
  const colW = width - colX - insets.right - 16;
  const controlGap = 8;
  const perButton = Math.floor((colW - controlGap * (controlCount - 1)) / controlCount);
  const controlWidth = Math.min(118, Math.max(1, perButton));
  const buttonsFit = perButton >= 40;
  const controlY = height - 58 - insets.bottom;
  const previewY = insets.top + 80;
  const keyboardY = previewY + 28;
  const rows = keyboardRowsFor(colW);

  return {
    orientation: 'landscape-wide',
    cellSize,
    boardX,
    boardY,
    hudY: insets.top,
    timerX: colX + colW / 2,
    timerY: insets.top + 56,
    wordPreviewX: colX + colW / 2,
    wordPreviewY: previewY,
    previewFits: true,
    controlX: colX,
    controlY,
    controlWidth,
    controlHeight: CONTROL_HEIGHT,
    controlGap,
    keyboardX: colX,
    keyboardY,
    keyboardWidth: Math.max(0, colW),
    keyboardRows: rows,
    fits: fits && colW >= 80 && buttonsFit,
    unfitReason: fits && colW >= 80 && buttonsFit ? null : (unfitReason ?? 'board-too-wide'),
  };
}

function layoutLandscapeCompact(input: GameLayoutInput): GameLayout {
  const { width, height, boardSize, insets, controlCount } = input;
  const innerW = width - insets.left - insets.right;
  const kbdH = 2 * KEY_H_COMPACT + KEY_GAP_COMPACT;
  const availH =
    height - insets.top - insets.bottom - HUD_COMPACT - CONTROL_COMPACT - kbdH - 4 * PAD;
  const rawCell = Math.min(Math.floor(availH / boardSize), Math.floor((innerW - 2 * PAD) / boardSize));
  const fits = rawCell >= MIN_CELL_COMPACT;
  const cellSize = fits ? rawCell : Math.max(1, rawCell);
  const boardPx = cellSize * boardSize;
  const boardY = insets.top + HUD_COMPACT + PAD;
  const boardX = Math.max(insets.left, Math.floor((width - boardPx) / 2));
  const keyboardY = boardY + boardPx + PAD;
  const controlY = keyboardY + kbdH + PAD;
  const controlGap = 8;
  const keyboardWidth = Math.max(0, innerW);
  const controlWidth = controlWidthFor(keyboardWidth - 16, controlCount, controlGap);
  const total = controlWidth * controlCount + controlGap * (controlCount - 1);
  const controlX = Math.max(insets.left, Math.floor((width - total) / 2));

  return {
    orientation: 'landscape-compact',
    cellSize,
    boardX,
    boardY,
    hudY: insets.top,
    timerX: width / 2,
    timerY: insets.top + 4,
    wordPreviewX: width / 2,
    wordPreviewY: keyboardY - 4,
    previewFits: false,
    controlX,
    controlY,
    controlWidth,
    controlHeight: CONTROL_COMPACT,
    controlGap,
    keyboardX: insets.left,
    keyboardY,
    keyboardWidth,
    keyboardRows: COMPACT_ROWS,
    fits,
    unfitReason: fits ? null : 'board-too-tall',
  };
}
