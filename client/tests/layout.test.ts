import { describe, expect, it } from 'vitest';
import {
  computeGameLayout,
  keyboardMetricsFor,
  keyboardRowsFor,
  MAX_CELL,
  MIN_CELL,
  MIN_CELL_COMPACT,
  KEYBOARD_GAP,
} from '../src/ui/layout';
import type { SafeInsets } from '../src/ui/safeArea';

const NO_INSETS: SafeInsets = { top: 0, bottom: 0, left: 0, right: 0 };
const PHONE_INSETS: SafeInsets = { top: 47, bottom: 34, left: 0, right: 0 };
const TABLET_INSETS: SafeInsets = { top: 24, bottom: 20, left: 20, right: 20 };

const SCREENS: readonly { width: number; height: number; insets: SafeInsets }[] = [
  { width: 320, height: 568, insets: NO_INSETS },
  { width: 320, height: 568, insets: PHONE_INSETS },
  { width: 360, height: 640, insets: NO_INSETS },
  { width: 390, height: 844, insets: PHONE_INSETS },
  { width: 568, height: 320, insets: NO_INSETS },
  { width: 640, height: 360, insets: NO_INSETS },
  { width: 844, height: 390, insets: PHONE_INSETS },
  { width: 768, height: 1024, insets: TABLET_INSETS },
  { width: 1024, height: 768, insets: TABLET_INSETS },
  { width: 1280, height: 800, insets: NO_INSETS },
];

describe('computeGameLayout — инварианты',
  () => {
  for (const screen of SCREENS) {
    for (const boardSize of [3, 5, 7] as const) {
      for (const controlCount of [3, 4] as const) {
        const label = `${screen.width}x${screen.height} поле ${boardSize} кнопок ${controlCount}`;
        it(label, () => {
          const kb = keyboardMetricsFor(screen.width);
          const layout = computeGameLayout({
            width: screen.width,
            height: screen.height,
            boardSize,
            insets: screen.insets,
            keyboardHeight: kb.height,
            controlCount,
          });

          if (!layout.fits) {
            expect(layout.unfitReason).not.toBeNull();
            return;
          }

          expect(layout.unfitReason).toBeNull();
          const minCell = layout.orientation === 'landscape-compact' ? MIN_CELL_COMPACT : MIN_CELL;
          expect(layout.cellSize).toBeGreaterThanOrEqual(minCell);
          expect(layout.cellSize).toBeLessThanOrEqual(MAX_CELL);

          const boardPx = layout.cellSize * boardSize;
          expect(layout.boardX).toBeGreaterThanOrEqual(screen.insets.left);
          expect(layout.boardX + boardPx).toBeLessThanOrEqual(screen.width - screen.insets.right);
          expect(layout.boardY + boardPx).toBeLessThanOrEqual(screen.height - screen.insets.bottom);
          expect(layout.controlY + layout.controlHeight).toBeLessThanOrEqual(
            screen.height - screen.insets.bottom,
          );
          expect(layout.keyboardY).toBeGreaterThanOrEqual(screen.insets.top);
          expect(layout.keyboardX).toBeGreaterThanOrEqual(screen.insets.left);

          if (layout.orientation === 'portrait') {
            expect(layout.boardY + boardPx).toBeLessThanOrEqual(layout.keyboardY - KEYBOARD_GAP);
            expect(layout.keyboardY + kb.height).toBeLessThanOrEqual(layout.controlY);
          } else if (layout.orientation === 'landscape-wide') {
            expect(layout.keyboardX).toBeGreaterThanOrEqual(layout.boardX + boardPx);
          } else {
            expect(layout.boardY + boardPx).toBeLessThanOrEqual(layout.keyboardY);
            expect(layout.keyboardRows).toHaveLength(2);
          }
        });
      }
    }
  }
});

describe('computeGameLayout — контрольные значения',
  () => {
  it('320×568 n=3/5/7',
    () => {
    for (const [n, cell, bottom, kby] of [
      [3, 92, 360, 368],
      [5, 55, 359, 368],
      [7, 39, 357, 368],
    ] as const) {
      const kb = keyboardMetricsFor(320);
      const layout = computeGameLayout({
        width: 320,
        height: 568,
        boardSize: n,
        insets: NO_INSETS,
        keyboardHeight: kb.height,
        controlCount: 4,
      });
      expect(layout.fits).toBe(true);
      expect(layout.cellSize).toBe(cell);
      expect(layout.boardY + layout.cellSize * n).toBe(bottom);
      expect(layout.keyboardY).toBe(kby);
    }
  });

  it('landscape compact and wide',
    () => {
    const c = computeGameLayout({
      width: 568, height: 320, boardSize: 5, insets: NO_INSETS,
      keyboardHeight: keyboardMetricsFor(568).height, controlCount: 4,
    });
    expect(c.orientation).toBe('landscape-compact');
    expect(c.cellSize).toBe(27);

    const w = computeGameLayout({
      width: 1024, height: 768, boardSize: 5, insets: NO_INSETS,
      keyboardHeight: keyboardMetricsFor(1024).height, controlCount: 4,
    });
    expect(w.orientation).toBe('landscape-wide');
    expect(w.cellSize).toBe(94);
    expect(w.keyboardX).toBe(510);
  });

  it('keyboardRowsFor',
    () => {
    expect(keyboardRowsFor(498)).toHaveLength(3);
    expect(keyboardRowsFor(360)).toHaveLength(2);
  });
});

describe('keyboardMetricsFor',
  () => {
  it('высота 3 рядов',
    () => {
    for (const width of [320, 360, 390, 768, 1280]) {
      const m = keyboardMetricsFor(width);
      expect(m.keyWidth).toBeGreaterThanOrEqual(18);
      expect(m.keyHeight).toBeGreaterThanOrEqual(42);
      expect(m.height).toBe(3 * m.keyHeight + 2 * 5);
    }
  });
});
