import type { Board } from './board';
import type { Dawg } from './dawg';
import { isCyrillicLetter, normalizeLetter } from './letters';
import type { CellPos, GameConfig, MoveInput, MoveResult } from './types';

/** Собирает слово из клеток пути (новая буква подставляется на место cell). */
export function wordFromPath(
  board: Board,
  letter: string,
  cell: CellPos,
  path: CellPos[],
): string {
  return path
    .map((c) =>
      c.row === cell.row && c.col === cell.col ? normalizeLetter(letter) : board.get(c.row, c.col),
    )
    .join('');
}

/**
 * Полная валидация хода «Балды»:
 * буква → клетка свободна и рядом есть буквы → путь непрерывный, без повторов,
 * содержит новую клетку → слово есть в словаре, достаточно длинное и не использовано.
 */
export function validateMove(
  board: Board,
  dawg: Dawg,
  config: GameConfig,
  usedWords: Set<string>,
  move: MoveInput,
): MoveResult {
  const { letter, cell, path } = move;
  if (!isCyrillicLetter(letter)) return { ok: false, error: 'INVALID_LETTER' };
  if (!board.inBounds(cell.row, cell.col)) return { ok: false, error: 'OUT_OF_BOUNDS' };
  if (!board.isEmpty(cell.row, cell.col)) return { ok: false, error: 'CELL_OCCUPIED' };

  const hasLetterNeighbor = board
    .neighbors(cell.row, cell.col, config.allowDiagonal)
    .some((n) => !board.isEmpty(n.row, n.col));
  if (!hasLetterNeighbor) return { ok: false, error: 'NO_NEIGHBOR_LETTERS' };
  if (path.length === 0) return { ok: false, error: 'PATH_EMPTY' };

  const seen = new Set<string>();
  let includesNew = false;
  for (const c of path) {
    if (!board.inBounds(c.row, c.col)) return { ok: false, error: 'PATH_OUT_OF_BOUNDS' };
    const key = c.row + ':' + c.col;
    if (seen.has(key)) return { ok: false, error: 'PATH_REVISITS_CELL' };
    seen.add(key);
    if (c.row === cell.row && c.col === cell.col) includesNew = true;
  }
  if (!includesNew) return { ok: false, error: 'PATH_MISSING_NEW_CELL' };

  for (let i = 0; i < path.length; i++) {
    const c = path[i]!;
    const isNew = c.row === cell.row && c.col === cell.col;
    if (!isNew && board.isEmpty(c.row, c.col)) return { ok: false, error: 'PATH_EMPTY_CELL' };
    if (i > 0) {
      const prev = path[i - 1]!;
      const dr = Math.abs(prev.row - c.row);
      const dc = Math.abs(prev.col - c.col);
      const adjacent = dr + dc === 1 || (config.allowDiagonal && dr === 1 && dc === 1);
      if (!adjacent) return { ok: false, error: 'PATH_NOT_CONTIGUOUS' };
    }
  }

  const word = wordFromPath(board, letter, cell, path);
  if (word.length < config.minWordLength) return { ok: false, error: 'WORD_TOO_SHORT' };
  if (!dawg.has(word)) return { ok: false, error: 'WORD_UNKNOWN' };
  if (usedWords.has(word)) return { ok: false, error: 'WORD_ALREADY_USED' };
  return { ok: true, points: word.length, word };
}
