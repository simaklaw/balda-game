import { Container, Graphics, Text } from 'pixi.js';
import type { CellPos } from '@balda/shared';
import { FONT_FAMILY, palette } from '../theme';
import { shouldReduceMotion } from '../perf';

export interface BoardHighlight {
  newCell: CellPos | null;
  previewLetter: string | null;
  path: CellPos[];
  aiCell: CellPos | null;
  /** Full AI path for highlighting */
  aiPath: CellPos[];
  /** Show plus sign hint on empty cells */
  showPlaceable: boolean;
}

const NO_HIGHLIGHT: BoardHighlight = {
  newCell: null,
  previewLetter: null,
  path: [],
  aiCell: null,
  aiPath: [],
  showPlaceable: false,
};

const ORTHO_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/** Drawing board: grid, letters and highlights for cells. */
export class BoardView extends Container {
  private readonly boardSize: number;
  private readonly cellSize: number;
  private readonly overlay: Graphics;
  private readonly letterViews: Text[][] = [];
  private readonly cellGraphics: Graphics[][] = [];
  private lastBoardState: Map<string, string> = new Map();

  constructor(boardSize: number, cellSize: number) {
    super();
    this.boardSize = boardSize;
    this.cellSize = cellSize;

    const grid = new Graphics();
    grid
      .roundRect(0, 0, this.totalSize(), this.totalSize(), 14)
      .fill({ color: palette().panel })
      .stroke({ width: 2, color: palette().panelBorder });
    for (let row = 0; row < boardSize; row++) {
      for (let col = 0; col < boardSize; col++) {
        const { x, y } = this.cellOrigin(row, col);
        grid
          .roundRect(x, y, this.cellSize - 6, this.cellSize - 6, 8)
          .fill({ color: palette().cellEmpty })
          .stroke({ width: 1, color: palette().panelBorder, alpha: 0.7 });
      }
    }
    this.addChild(grid);

    this.overlay = new Graphics();
    this.addChild(this.overlay);

    for (let row = 0; row < boardSize; row++) {
      const rowViews: Text[] = [];
      const rowGraphics: Graphics[] = [];
      for (let col = 0; col < boardSize; col++) {
        const letterView = new Text({
          text: '',
          style: {
            fontFamily: FONT_FAMILY,
            fontSize: Math.floor(this.cellSize * 0.5),
            fill: palette().letterText,
          },
        });
        letterView.anchor.set(0.5);
        const { x, y } = this.cellOrigin(row, col);
        letterView.position.set(x + (this.cellSize - 6) / 2, y + (this.cellSize - 6) / 2);
        letterView.visible = false;
        this.addChild(letterView);
        rowViews.push(letterView);

        const cellGfx = new Graphics();
        cellGfx.visible = false;
        this.addChild(cellGfx);
        rowGraphics.push(cellGfx);
      }
      this.letterViews.push(rowViews);
      this.cellGraphics.push(rowGraphics);
    }
  }

  get boardPixelSize(): number {
    return this.totalSize();
  }

  private totalSize(): number {
    return this.boardSize * this.cellSize;
  }

  private cellOrigin(row: number, col: number): { x: number; y: number } {
    return { x: col * this.cellSize + 3, y: row * this.cellSize + 3 };
  }

  /** Convert local coordinates to cell position (or null if outside). */
  cellAt(localX: number, localY: number): CellPos | null {
    const col = Math.floor(localX / this.cellSize);
    const row = Math.floor(localY / this.cellSize);
    if (row < 0 || col < 0 || row >= this.boardSize || col >= this.boardSize) return null;
    return { row, col };
  }

  /** Set pulse animation scale for a cell */
  setPulse(row: number, col: number, scale: number): void {
    const view = this.letterViews[row]?.[col];
    if (view !== undefined) view.scale.set(scale);
  }

  /** Update board: letters and highlights */
  sync(get: (row: number, col: number) => string, highlight: BoardHighlight = NO_HIGHLIGHT): void {
    const reduceMotion = shouldReduceMotion();
    const size = this.cellSize - 6;

    if (!reduceMotion) {
      this.overlay.clear();
    }

    const inPath = (row: number, col: number): boolean =>
      highlight.path.some((c) => c.row === row && c.col === col);
    const inAiPath = (row: number, col: number): boolean =>
      highlight.aiPath.some((c) => c.row === row && c.col === col);

    for (let row = 0; row < this.boardSize; row++) {
      for (let col = 0; col < this.boardSize; col++) {
        const view = this.letterViews[row]![col]!;
        const isNew =
          highlight.newCell !== null && highlight.newCell.row === row && highlight.newCell.col === col;
        const letter = isNew ? (highlight.previewLetter ?? '') : get(row, col);
        view.text = letter.toUpperCase();
        view.visible = letter !== '';
        view.style.fill = isNew ? palette().cellNew : palette().letterText;

        const { x, y } = this.cellOrigin(row, col);

        if (!reduceMotion) {
          if (isNew) {
            this.overlay
              .roundRect(x, y, size, size, 8)
              .fill({ color: palette().cell, alpha: 0.9 })
              .stroke({ width: 3, color: palette().cellNew });
          } else if (inPath(row, col)) {
            this.overlay.roundRect(x, y, size, size, 8).fill({ color: palette().cellPath, alpha: 0.28 });
          }
          if (
            highlight.aiCell !== null &&
            highlight.aiCell.row === row &&
            highlight.aiCell.col === col &&
            !isNew
          ) {
            this.overlay.roundRect(x, y, size, size, 8).stroke({ width: 3, color: palette().ai });
          } else if (inAiPath(row, col) && !isNew) {
            this.overlay
              .roundRect(x, y, size, size, 8)
              .stroke({ width: 2, color: palette().ai, alpha: 0.6 });
          }
          if (
            highlight.showPlaceable &&
            letter === '' &&
            !isNew &&
            this.hasLetteredNeighbor(get, row, col)
          ) {
            this.overlay.roundRect(x, y, size, size, 8).fill({ color: palette().cell, alpha: 0.4 });
            const cx = x + size / 2;
            const cy = y + size / 2;
            const arm = Math.max(7, Math.floor(size * 0.16));
            this.overlay
              .rect(cx - arm, cy - 2, arm * 2, 4)
              .fill({ color: palette().textDim, alpha: 0.55 });
            this.overlay
              .rect(cx - 2, cy - arm, 4, arm * 2)
              .fill({ color: palette().textDim, alpha: 0.55 });
          }
        }
      }
    }
  }

  /** Check if cell has at least one lettered neighbor */
  private hasLetteredNeighbor(
    get: (row: number, col: number) => string,
    row: number,
    col: number,
  ): boolean {
    for (const [dr, dc] of ORTHO_DIRS) {
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && c >= 0 && r < this.boardSize && c < this.boardSize && get(r, c) !== '') {
        return true;
      }
    }
    return false;
  }
}
