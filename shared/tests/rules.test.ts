import { describe, expect, it } from 'vitest';
import { Board } from '../src/board';
import { Dawg } from '../src/dawg';
import { validateMove } from '../src/rules';
import type { CellPos, GameConfig } from '../src/types';

const p = (row: number, col: number): CellPos => ({ row, col });

const cfg: GameConfig = { boardSize: 5, allowDiagonal: false, minWordLength: 4, maxSkipsInRow: 3 };
const dawg = Dawg.fromWords(['балда', 'садл', 'сот']);
const dawgOnly = Dawg.fromWords(['балда']);
const board = new Board(5, 'балда');
const used = new Set(['балда']);

describe('validateMove', () => {
  it('принимает корректный ход (садл)', () => {
    const r = validateMove(board, dawg, cfg, used, {
      letter: 'с',
      cell: p(1, 4),
      path: [p(1, 4), p(2, 4), p(2, 3), p(2, 2)],
    });
    expect(r.ok).toBe(true);
    expect(r.word).toBe('садл');
    expect(r.points).toBe(4);
  });

  it('отклоняет занятую клетку', () => {
    expect(
      validateMove(board, dawg, cfg, used, { letter: 'с', cell: p(2, 4), path: [p(2, 4)] }).error,
    ).toBe('CELL_OCCUPIED');
  });

  it('отклоняет букву без соседей', () => {
    expect(
      validateMove(board, dawg, cfg, used, { letter: 'с', cell: p(0, 0), path: [p(0, 0)] }).error,
    ).toBe('NO_NEIGHBOR_LETTERS');
  });

  it('отклоняет не-кириллическую букву', () => {
    expect(
      validateMove(board, dawg, cfg, used, { letter: 'f', cell: p(1, 4), path: [p(1, 4)] }).error,
    ).toBe('INVALID_LETTER');
  });

  it('отклоняет путь без новой клетки', () => {
    expect(
      validateMove(board, dawg, cfg, used, {
        letter: 'с',
        cell: p(1, 4),
        path: [p(2, 4), p(2, 3), p(2, 2)],
      }).error,
    ).toBe('PATH_MISSING_NEW_CELL');
  });

  it('отклоняет разрыв пути', () => {
    expect(
      validateMove(board, dawg, cfg, used, {
        letter: 'с',
        cell: p(1, 4),
        path: [p(1, 4), p(2, 3), p(2, 2)],
      }).error,
    ).toBe('PATH_NOT_CONTIGUOUS');
  });

  it('отклоняет повтор клетки', () => {
    expect(
      validateMove(board, dawg, cfg, used, {
        letter: 'с',
        cell: p(1, 4),
        path: [p(1, 4), p(2, 4), p(2, 4)],
      }).error,
    ).toBe('PATH_REVISITS_CELL');
  });

  it('отклоняет пустую клетку в пути', () => {
    expect(
      validateMove(board, dawg, cfg, used, {
        letter: 'с',
        cell: p(1, 4),
        path: [p(1, 4), p(0, 4)],
      }).error,
    ).toBe('PATH_EMPTY_CELL');
  });

  it('отклоняет короткое слово', () => {
    expect(
      validateMove(board, dawg, cfg, used, {
        letter: 'с',
        cell: p(1, 4),
        path: [p(1, 4), p(2, 4)],
      }).error,
    ).toBe('WORD_TOO_SHORT');
  });

  it('отклоняет неизвестное слово', () => {
    expect(
      validateMove(board, dawgOnly, cfg, used, {
        letter: 'с',
        cell: p(1, 4),
        path: [p(1, 4), p(2, 4), p(2, 3), p(2, 2)],
      }).error,
    ).toBe('WORD_UNKNOWN');
  });

  it('отклоняет использованное слово', () => {
    expect(
      validateMove(board, dawg, cfg, new Set(['садл']), {
        letter: 'с',
        cell: p(1, 4),
        path: [p(1, 4), p(2, 4), p(2, 3), p(2, 2)],
      }).error,
    ).toBe('WORD_ALREADY_USED');
  });

  it('диагональ: разрешена и запрещена по конфигу', () => {
    const b3 = new Board(3, 'кот');
    const move = { letter: 'с', cell: p(0, 0), path: [p(0, 0), p(1, 1), p(1, 2)] };
    const cfgDiag: GameConfig = { ...cfg, boardSize: 3, allowDiagonal: true, minWordLength: 3 };
    const cfgOrtho: GameConfig = { ...cfgDiag, allowDiagonal: false };
    expect(validateMove(b3, dawg, cfgDiag, new Set(['кот']), move).ok).toBe(true);
    expect(validateMove(b3, dawg, cfgOrtho, new Set(['кот']), move).error).toBe(
      'PATH_NOT_CONTIGUOUS',
    );
  });
});
