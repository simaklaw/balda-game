import { normalizeLetter, normalizeWord } from './letters';
import type { CellPos } from './types';

const ORTHO_DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const DIAG_DIRS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

/** Игровое поле NxN. Пустая клетка — ''. */
export class Board {
  readonly size: number;
  private cells: string[];

  constructor(size: number, initialWord?: string) {
    this.size = size;
    this.cells = new Array<string>(size * size).fill('');
    if (initialWord !== undefined) {
      const word = normalizeWord(initialWord);
      if (word.length !== size) {
        throw new Error(`Initial word must have ${size} letters for a ${size}x${size} board`);
      }
      const row = Math.floor(size / 2);
      for (let i = 0; i < size; i++) this.set(row, i, word[i]!);
    }
  }

  inBounds(row: number, col: number): boolean {
    return row >= 0 && col >= 0 && row < this.size && col < this.size;
  }

  get(row: number, col: number): string {
    return this.cells[row * this.size + col]!;
  }

  letterAt(pos: CellPos): string {
    return this.get(pos.row, pos.col);
  }

  isEmpty(row: number, col: number): boolean {
    return this.get(row, col) === '';
  }

  set(row: number, col: number, letter: string): void {
    if (!this.inBounds(row, col)) {
      throw new Error(`Cell out of bounds: ${row},${col}`);
    }
    this.cells[row * this.size + col] = normalizeLetter(letter);
  }

  isFull(): boolean {
    return this.cells.every((c) => c !== '');
  }

  neighbors(row: number, col: number, allowDiagonal: boolean): CellPos[] {
    const dirs = allowDiagonal ? DIAG_DIRS : ORTHO_DIRS;
    const out: CellPos[] = [];
    for (const [dr, dc] of dirs) {
      const r = row + dr!;
      const c = col + dc!;
      if (this.inBounds(r, c)) out.push({ row: r, col: c });
    }
    return out;
  }

  clone(): Board {
    const b = new Board(this.size);
    b.restore(this.cells);
    return b;
  }

  serialize(): string {
    return JSON.stringify({ size: this.size, cells: this.cells });
  }

  static deserialize(data: string): Board {
    const parsed = JSON.parse(data) as { size: number; cells: string[] };
    const b = new Board(parsed.size);
    b.restore(parsed.cells);
    return b;
  }

  private restore(cells: string[]): void {
    if (cells.length !== this.size * this.size) {
      throw new Error(`Cell count mismatch: expected ${this.size * this.size}, got ${cells.length}`);
    }
    this.cells = [...cells];
  }
}
