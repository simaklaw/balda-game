import { Container, Graphics, Text } from 'pixi.js';
import type { CellPos } from '@balda/shared';
import { FONT_FAMILY, palette } from '../theme';

export interface BoardHighlight {
  newCell: CellPos | null;
  previewLetter: string | null;
  path: CellPos[];
  aiCell: CellPos | null;
}

const NO_HIGHLIGHT: BoardHighlight = { newCell: null, previewLetter: null, path: [], aiCell: null };

/** Отрисовка поля: сетка, буквы и подсветки выделения. */
export class BoardView extends Container {
  private readonly boardSize: number;
  private readonly cellSize: number;
  private readonly overlay: Graphics;
  private readonly letterViews: Text[][] = [];

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
      }
      this.letterViews.push(rowViews);
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

  /** Локальные координаты контейнера → клетка (или null вне поля). */
  cellAt(localX: number, localY: number): CellPos | null {
    const col = Math.floor(localX / this.cellSize);
    const row = Math.floor(localY / this.cellSize);
    if (row < 0 || col < 0 || row >= this.boardSize || col >= this.boardSize) return null;
    return { row, col };
  }

  /** Обновить буквы и подсветки: get возвращает букву клетки ('' — пустая). */
  sync(get: (row: number, col: number) => string, highlight: BoardHighlight = NO_HIGHLIGHT): void {
    this.overlay.clear();
    const inPath = (row: number, col: number): boolean =>
      highlight.path.some((c) => c.row === row && c.col === col);
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
        const size = this.cellSize - 6;
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
        }
      }
    }
  }
}
