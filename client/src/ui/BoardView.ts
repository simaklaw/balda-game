import { Container, Graphics, Text } from 'pixi.js';
import type { CellPos } from '@balda/shared';
import { LETTER_FONT, palette, shade } from '../theme';

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

/**
 * Drawing board: grid, letters and highlights for cells.
 * Перестраивается под новый размер клетки (поворот экрана) через setCellSize;
 * после перестроения сцена вызывает sync() для перерисовки букв.
 */
export class BoardView extends Container {
  private readonly boardSize: number;
  private cellSize: number;
  private overlay: Graphics;
  private tiles: Graphics;
  private letterViews: Text[][] = [];
  private cellGraphics: Graphics[][] = [];

  constructor(boardSize: number, cellSize: number) {
    super();
    this.boardSize = boardSize;
    this.cellSize = cellSize;
    this.overlay = new Graphics();
    this.tiles = new Graphics();
    this.build();
  }

  get boardPixelSize(): number {
    return this.totalSize();
  }

  /** Перестроить поле под новый размер клетки (поворот/resize экрана). */
  setCellSize(cellSize: number): void {
    if (cellSize === this.cellSize) return;
    this.cellSize = cellSize;
    this.build();
  }

  private build(): void {
    for (const child of [...this.children]) child.destroy({ children: true });
    this.removeChildren();

    const grid = new Graphics();
    const total = this.totalSize();
    // Рама доски: мягкая тень, ореховый корпус, латунная волосяная кромка и сукно внутри.
    grid.roundRect(0, 8, total, total, 20).fill({ color: 0x000000, alpha: 0.28 });
    grid.roundRect(2, 5, total - 2, total, 20).fill({ color: 0x000000, alpha: 0.22 });
    grid.roundRect(0, 0, total, total, 20).fill({ color: palette().frame });
    grid.roundRect(0.5, 0.5, total - 1, total - 1, 20).stroke({ width: 1, color: palette().frameEdge, alpha: 0.85 });
    grid.roundRect(3, 3, total - 6, total - 6, 17).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
    grid.roundRect(4, 4, total - 8, total - 8, 16).fill({ color: palette().cellEmpty, alpha: 0.55 });
    const slot = this.cellSize - 6;
    const radius = Math.max(6, Math.floor(slot * 0.14));
    for (let row = 0; row < this.boardSize; row++) {
      for (let col = 0; col < this.boardSize; col++) {
        const { x, y } = this.cellOrigin(row, col);
        // Утопленная ячейка: тёмное дно + светлая нижняя кромка.
        grid.roundRect(x, y + 1, slot, slot, radius).fill({ color: palette().frameEdge, alpha: 0.12 });
        grid.roundRect(x, y, slot, slot, radius).fill({ color: palette().cellEmpty });
        grid.roundRect(x, y, slot, slot, radius).stroke({ width: 1, color: 0x000000, alpha: 0.45 });
      }
    }
    this.overlay = new Graphics();
    this.tiles = new Graphics();
    this.addChild(grid, this.tiles, this.overlay);

    this.letterViews = [];
    this.cellGraphics = [];
    for (let row = 0; row < this.boardSize; row++) {
      const rowViews: Text[] = [];
      const rowGraphics: Graphics[] = [];
      for (let col = 0; col < this.boardSize; col++) {
        const letterView = new Text({
          text: '',
          style: {
            fontFamily: LETTER_FONT,
            fontWeight: '700',
            fontSize: Math.floor(this.cellSize * 0.54),
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

  /** Update board: tiles, letters and highlights */
  sync(get: (row: number, col: number) => string, highlight: BoardHighlight = NO_HIGHLIGHT): void {
    const size = this.cellSize - 6;
    const radius = Math.max(6, Math.floor(size * 0.14));
    const lip = Math.max(3, Math.floor(size * 0.07));
    const { overlay, tiles } = this;
    overlay.clear();
    tiles.clear();

    const inPath = (row: number, col: number): boolean =>
      highlight.path.some((c) => c.row === row && c.col === col);
    const inAiPath = (row: number, col: number): boolean =>
      highlight.aiPath.some((c) => c.row === row && c.col === col);
    const gold = palette().gold;

    for (let row = 0; row < this.boardSize; row++) {
      for (let col = 0; col < this.boardSize; col++) {
        const view = this.letterViews[row]![col]!;
        const isNew =
          highlight.newCell !== null && highlight.newCell.row === row && highlight.newCell.col === col;
        const letter = isNew ? (highlight.previewLetter ?? '') : get(row, col);
        view.text = letter.toUpperCase();
        view.visible = letter !== '';
        view.style.fill = isNew ? shade(palette().cellNew, -0.35) : palette().letterText;
        const { x, y } = this.cellOrigin(row, col);
        view.position.set(x + size / 2, y + size / 2 - lip / 2);

        if (letter !== '' && !isNew) {
          // Фишка из слоновой кости: двухслойная тень, нижняя грань, лицо, тонкая кромка.
          tiles.roundRect(x - 1, y + lip + 3, size + 2, size - lip, radius + 1).fill({ color: 0x000000, alpha: 0.2 });
          tiles.roundRect(x, y + lip + 1, size, size - lip, radius).fill({ color: 0x000000, alpha: 0.35 });
          tiles.roundRect(x, y + lip, size, size - lip, radius).fill({ color: palette().tileEdge });
          tiles.roundRect(x, y, size, size - lip, radius).fill({ color: palette().cell });
          tiles.roundRect(x + 0.5, y + 0.5, size - 1, size - lip - 1, radius).stroke({ width: 1, color: palette().cellBorder, alpha: 0.85 });
        }
        if (isNew) {
          overlay.roundRect(x - 2, y - 2, size + 4, size + 4, radius + 2).stroke({ width: 6, color: palette().cellNew, alpha: 0.22 });
          overlay.roundRect(x, y, size, size - lip, radius).fill({ color: palette().cell });
          overlay.roundRect(x, y, size, size - lip, radius).stroke({ width: 3, color: palette().cellNew });
        } else if (inPath(row, col)) {
          overlay.roundRect(x, y, size, size - lip, radius).fill({ color: gold, alpha: 0.38 });
          overlay.roundRect(x, y, size, size - lip, radius).stroke({ width: 2.5, color: gold });
        }
        if (highlight.aiCell !== null && highlight.aiCell.row === row && highlight.aiCell.col === col && !isNew) {
          overlay.roundRect(x - 1, y - 1, size + 2, size - lip + 2, radius).stroke({ width: 3.5, color: palette().ai });
        } else if (inAiPath(row, col) && !isNew) {
          overlay.roundRect(x, y, size, size - lip, radius).fill({ color: palette().ai, alpha: 0.2 });
          overlay.roundRect(x, y, size, size - lip, radius).stroke({ width: 2, color: palette().ai, alpha: 0.75 });
        }
        if (highlight.showPlaceable && letter === '' && !isNew && this.hasLetteredNeighbor(get, row, col)) {
          const cx = x + size / 2;
          const cy = y + size / 2;
          const arm = Math.max(7, Math.floor(size * 0.15));
          overlay.roundRect(x, y, size, size, radius).fill({ color: gold, alpha: 0.07 });
          overlay.roundRect(x + 2, y + 2, size - 4, size - 4, Math.max(4, radius - 2)).stroke({ width: 1.5, color: gold, alpha: 0.35 });
          overlay.rect(cx - arm, cy - 1.5, arm * 2, 3).fill({ color: gold, alpha: 0.75 });
          overlay.rect(cx - 1.5, cy - arm, 3, arm * 2).fill({ color: gold, alpha: 0.75 });
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
