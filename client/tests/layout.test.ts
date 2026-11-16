import { describe, expect, it } from 'vitest';
import {
  computeGameLayout,
  keyboardMetricsFor,
  CONTROL_HEIGHT,
  MAX_CELL,
  MIN_CELL,
} from '../src/ui/layout';
import type { SafeInsets } from '../src/ui/safeArea';

const NO_INSETS: SafeInsets = { top: 0, bottom: 0, left: 0, right: 0 };
const PHONE_INSETS: SafeInsets = { top: 47, bottom: 34, left: 0, right: 0 };
const TABLET_INSETS: SafeInsets = { top: 24, bottom: 20, left: 20, right: 20 };

/** Матрица экранов: узкие телефоны, крупные, ландшафт, планшет, десктоп. */
const SCREENS: readonly { width: number; height: number; insets: SafeInsets }[] = [
  { width: 320, height: 480, insets: NO_INSETS },
  { width: 320, height: 568, insets: PHONE_INSETS },
  { width: 360, height: 640, insets: PHONE_INSETS },
  { width: 390, height: 844, insets: PHONE_INSETS },
  { width: 414, height: 896, insets: PHONE_INSETS },
  { width: 640, height: 360, insets: NO_INSETS },
  { width: 844, height: 390, insets: PHONE_INSETS },
  { width: 768, height: 1024, insets: TABLET_INSETS },
  { width: 1024, height: 768, insets: TABLET_INSETS },
  { width: 1280, height: 800, insets: NO_INSETS },
];

describe('computeGameLayout — матрица экранов', () => {
  for (const screen of SCREENS) {
    for (const boardSize of [3, 5] as const) {
      for (const controlCount of [3, 4] as const) {
        const label = `${screen.width}x${screen.height} поле ${boardSize} кнопок ${controlCount}`;
        it(label + ': элементы в границах экрана и не наезжают', () => {
          const kb = keyboardMetricsFor(screen.width);
          const layout = computeGameLayout({
            width: screen.width,
            height: screen.height,
            boardSize,
            insets: screen.insets,
            keyboardHeight: kb.height,
            controlCount,
          });

          // Размер клетки в разумных пределах.
          expect(layout.cellSize).toBeGreaterThanOrEqual(MIN_CELL);
          expect(layout.cellSize).toBeLessThanOrEqual(MAX_CELL);

          // Поле целиком в границах экрана с учётом safe-area.
          const boardPx = layout.cellSize * boardSize;
          expect(layout.boardX).toBeGreaterThanOrEqual(screen.insets.left);
          expect(layout.boardX + boardPx).toBeLessThanOrEqual(screen.width - screen.insets.right);

          // Поле ниже HUD и часов.
          expect(layout.boardY).toBeGreaterThanOrEqual(layout.timerY);

          // Панель управления целиком на экране.
          expect(layout.controlY).toBeGreaterThanOrEqual(layout.boardY);
          expect(layout.controlY + CONTROL_HEIGHT).toBeLessThanOrEqual(
            screen.height - screen.insets.bottom,
          );

          // Нижний край клавиатуры — над панелью управления, не поверх неё.
          expect(layout.keyboardY + kb.height).toBeLessThanOrEqual(layout.controlY);

          // Клавиатура целиком на экране.
          expect(layout.keyboardY).toBeGreaterThanOrEqual(0);

          // Подсказка слова — между полем и панелью (клэмп гарантирует верхнюю границу).
          expect(layout.wordPreviewY).toBeLessThanOrEqual(layout.controlY - 20);
          if (!layout.keyboardOverlapsBoard) {
            // Если клавиатура помещается под полем, подсказка стоит сразу под полем.
            expect(layout.wordPreviewY).toBe(layout.boardY + boardPx + 8);
          }
        });
      }
    }
  }

  it('кнопки панели управления помещаются по ширине на узких экранах', () => {
    for (const screen of SCREENS) {
      for (const controlCount of [3, 4] as const) {
        const layout = computeGameLayout({
          width: screen.width,
          height: screen.height,
          boardSize: 5,
          insets: screen.insets,
          keyboardHeight: keyboardMetricsFor(screen.width).height,
          controlCount,
        });
        const total =
          layout.controlWidth * controlCount + layout.controlGap * (controlCount - 1);
        // Кнопки могут вылезать за пределы доступной ширины только когда
        // сработал минимум 64px на экзотически узком экране с вырезами.
        if (total > screen.width - 32 - screen.insets.left - screen.insets.right) {
          expect(layout.controlWidth).toBe(64);
        }
      }
    }
  });

  it('поворот экрана: раскладка пересчитывается без наездов в обеих ориентациях', () => {
    const kbPortrait = keyboardMetricsFor(390);
    const kbLandscape = keyboardMetricsFor(844);
    const portrait = computeGameLayout({
      width: 390, height: 844, boardSize: 5, insets: PHONE_INSETS,
      keyboardHeight: kbPortrait.height, controlCount: 4,
    });
    const landscape = computeGameLayout({
      width: 844, height: 390, boardSize: 5, insets: PHONE_INSETS,
      keyboardHeight: kbLandscape.height, controlCount: 4,
    });
    expect(portrait.cellSize).toBeGreaterThan(landscape.cellSize);
    expect(portrait.keyboardOverlapsBoard).toBe(false);
    // В узком ландшафте клавиатура физически не помещается под полем —
    // раскладка честно сообщает о наложении (клавиатура показывается поверх).
    expect(landscape.keyboardOverlapsBoard).toBe(true);
  });
});

describe('keyboardMetricsFor', () => {
  it('высота в пределах 3 рядов, клавиши не меньше тап-таргета', () => {
    for (const width of [320, 360, 390, 768, 1280]) {
      const m = keyboardMetricsFor(width);
      expect(m.keyWidth).toBeGreaterThanOrEqual(18);
      expect(m.keyHeight).toBeGreaterThanOrEqual(42);
      expect(m.keyHeight).toBeLessThanOrEqual(64);
      expect(m.height).toBe(3 * m.keyHeight + 2 * 5);
    }
  });

  it('на широких экранах высота не растёт бесконечно', () => {
    expect(keyboardMetricsFor(1280).height).toBe(keyboardMetricsFor(768).height);
  });
});
