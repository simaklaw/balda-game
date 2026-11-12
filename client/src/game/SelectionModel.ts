import type { CellPos } from '@balda/shared';
import { normalizeLetter } from '@balda/shared';

export type SelectionPhase = 'idle' | 'choosingLetter' | 'building';

export interface SelectionSnapshot {
  phase: SelectionPhase;
  newCell: CellPos | null;
  previewLetter: string | null;
  path: CellPos[];
}

/** Минимальный доступ к полю, необходимый модели выделения. */
export interface BoardReader {
  size: number;
  get(row: number, col: number): string;
  isEmpty(row: number, col: number): boolean;
}

const ORTHO_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const DIAG_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

/**
 * Конечный автомат выделения слова:
 * idle → (тап по пустой клетке с соседней буквой) → choosingLetter →
 * (буква на клавиатуре) → building → (цепочка drag-ом или кликами) → ход.
 */
export class SelectionModel {
  private phase: SelectionPhase = 'idle';
  private newCell: CellPos | null = null;
  private previewLetter: string | null = null;
  private path: CellPos[] = [];

  constructor(
    private readonly board: BoardReader,
    private readonly minWordLength: number,
    private readonly allowDiagonal: boolean,
  ) {}

  get snapshot(): SelectionSnapshot {
    return {
      phase: this.phase,
      newCell: this.newCell,
      previewLetter: this.previewLetter,
      path: [...this.path],
    };
  }

  /** Тап по клетке: пустая клетка с соседней буквой начинает или переносит выделение. */
  tapCell(row: number, col: number): boolean {
    if (this.phase === 'building') return false;
    if (!this.inBounds(row, col)) return false;
    if (this.phase === 'choosingLetter' && this.newCell !== null && this.newCell.row === row && this.newCell.col === col) {
      this.reset();
      return true;
    }
    if (!this.board.isEmpty(row, col)) return false;
    if (!this.hasLetteredNeighbor(row, col)) return false;
    this.newCell = { row, col };
    this.previewLetter = null;
    this.path = [];
    this.phase = 'choosingLetter';
    return true;
  }

  /** Выбор буквы для новой клетки (кастомная клавиатура). */
  chooseLetter(letter: string): boolean {
    if (this.phase !== 'choosingLetter' || this.newCell === null) return false;
    this.previewLetter = normalizeLetter(letter);
    this.phase = 'building';
    this.path = [];
    return true;
  }

  /** Продление цепочки (drag-to-select и пошаговый клик). Вход в предпоследнюю клетку — drag-back. */
  extendPath(row: number, col: number): boolean {
    if (this.phase !== 'building' || this.newCell === null || this.previewLetter === null) return false;
    if (!this.inBounds(row, col)) return false;
    const pos: CellPos = { row, col };
    if (this.path.length === 0) {
      if (!this.isSelectable(pos)) return false;
      this.path.push(pos);
      return true;
    }
    if (this.path.length >= 2) {
      const back = this.path[this.path.length - 2]!;
      if (back.row === row && back.col === col) {
        this.path.pop();
        return true;
      }
    }
    const last = this.path[this.path.length - 1]!;
    if (this.path.some((c) => c.row === row && c.col === col)) return false;
    if (!this.isAdjacent(last, pos)) return false;
    if (!this.isSelectable(pos)) return false;
    this.path.push(pos);
    return true;
  }

  /** Слово по текущей цепочке (новая буква подставляется на своё место). */
  currentWord(): string {
    return this.path.map((c) => this.letterAt(c)).join('');
  }

  canSubmit(): boolean {
    if (this.phase !== 'building' || this.newCell === null || this.previewLetter === null) return false;
    if (this.path.length < this.minWordLength) return false;
    return this.path.some(
      (c) => this.newCell !== null && c.row === this.newCell.row && c.col === this.newCell.col,
    );
  }

  toMove(): { letter: string; cell: CellPos; path: CellPos[] } | null {
    if (!this.canSubmit() || this.newCell === null || this.previewLetter === null) return null;
    return { letter: this.previewLetter, cell: this.newCell, path: [...this.path] };
  }

  reset(): void {
    this.phase = 'idle';
    this.newCell = null;
    this.previewLetter = null;
    this.path = [];
  }

  private letterAt(pos: CellPos): string {
    if (this.newCell !== null && pos.row === this.newCell.row && pos.col === this.newCell.col) {
      return this.previewLetter ?? '';
    }
    return this.board.get(pos.row, pos.col);
  }

  private isSelectable(pos: CellPos): boolean {
    if (this.newCell !== null && pos.row === this.newCell.row && pos.col === this.newCell.col) {
      return true;
    }
    return !this.board.isEmpty(pos.row, pos.col);
  }

  private isAdjacent(a: CellPos, b: CellPos): boolean {
    const dr = Math.abs(a.row - b.row);
    const dc = Math.abs(a.col - b.col);
    if (dr + dc === 1) return true;
    return this.allowDiagonal && dr === 1 && dc === 1;
  }

  private hasLetteredNeighbor(row: number, col: number): boolean {
    const dirs = this.allowDiagonal ? DIAG_DIRS : ORTHO_DIRS;
    for (const [dr, dc] of dirs) {
      const r = row + dr;
      const c = col + dc;
      if (this.inBounds(r, c) && !this.board.isEmpty(r, c)) return true;
    }
    return false;
  }

  private inBounds(row: number, col: number): boolean {
    return row >= 0 && col >= 0 && row < this.board.size && col < this.board.size;
  }
}
