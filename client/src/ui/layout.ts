/**
 * Чистый расчёт раскладки игрового экрана: поле, HUD, подсказка слова,
 * панель управления, клавиатура. Сцены вызывают computeGameLayout при старте
 * и на каждый resize/поворот — вся арифметика в одном месте и покрыта тестами
 * матрицей экранов. Без импортов Pixi: модуль чистый и тестируемый в Node.
 */
import type { SafeInsets } from './safeArea';

export interface GameLayoutInput {
  width: number;
  height: number;
  boardSize: number;
  insets: SafeInsets;
  /** Высота клавиатуры при текущей ширине (keyboardMetricsFor). */
  keyboardHeight: number;
  /** Кнопок в панели управления: 4 в оффлайне, 3 в онлайне. */
  controlCount: number;
}

export interface GameLayout {
  cellSize: number;
  boardX: number;
  boardY: number;
  hudY: number;
  timerY: number;
  wordPreviewY: number;
  controlY: number;
  controlWidth: number;
  controlGap: number;
  keyboardY: number;
  /**
   * Клавиатура наезжает на поле (узкий ландшафт): показывать её поверх
   * нижней части экрана на время выбора буквы.
   */
  keyboardOverlapsBoard: boolean;
}

export const MIN_CELL = 34;
export const MAX_CELL = 110;
/** Резерв под HUD и часы над полем. */
export const HUD_RESERVED = 84;
export const CONTROL_HEIGHT = 46;

const KEY_GAP = 5;
const KEY_ROWS = 3;
const KEY_COUNT = 12;

/**
 * Метрики клавиатуры по ширине экрана. Высота не растёт бесконечно
 * на широких экранах (иначе клавиши перекрывают поле), минимум —
 * крупный тап-таргет.
 */
export function keyboardMetricsFor(width: number): {
  keyWidth: number;
  keyHeight: number;
  height: number;
} {
  const keyWidth = Math.max(18, Math.floor((width - KEY_GAP * (KEY_COUNT - 1)) / KEY_COUNT));
  const keyHeight = Math.min(64, Math.max(42, Math.floor(keyWidth * 1.15)));
  return { keyWidth, keyHeight, height: KEY_ROWS * keyHeight + (KEY_ROWS - 1) * KEY_GAP };
}

/** Раскладка игрового экрана под текущие размеры и safe-area. */
export function computeGameLayout(input: GameLayoutInput): GameLayout {
  const { width, height, boardSize, insets, keyboardHeight, controlCount } = input;
  // Резервы: сверху HUD и часы, снизу клавиатура и панель управления.
  const reservedTop = HUD_RESERVED + insets.top;
  const reservedBottom = keyboardHeight + 58 + insets.bottom;
  const cell = Math.min(
    Math.floor((width - 20 - insets.left - insets.right) / boardSize),
    Math.floor((height - reservedTop - reservedBottom) / boardSize),
  );
  const cellSize = Math.max(MIN_CELL, Math.min(MAX_CELL, cell));
  const boardPx = cellSize * boardSize;
  const boardY = reservedTop;
  const boardX = Math.max(insets.left, Math.floor((width - boardPx) / 2));
  const controlGap = 8;
  const controlWidth = Math.min(
    118,
    Math.max(
      64,
      Math.floor(
        (width - 32 - insets.left - insets.right - controlGap * (controlCount - 1)) / controlCount,
      ),
    ),
  );
  const controlY = height - 58 - insets.bottom;
  // Нижний край клавиатуры на 6px выше верха панели управления — они не пересекаются.
  const keyboardY = height - 64 - insets.bottom - keyboardHeight;
  return {
    cellSize,
    boardX,
    boardY,
    hudY: insets.top,
    timerY: 60 + insets.top,
    // Подсказка слова — под полем, но никогда не заходит под панель управления
    // (узкий ландшафт, когда поле не поместилось и прижато к панели).
    wordPreviewY: Math.min(boardY + boardPx + 8, controlY - 28),
    controlY,
    controlWidth,
    controlGap,
    keyboardY,
    keyboardOverlapsBoard: boardY + boardPx > keyboardY,
  };
}
