import { describe, expect, it } from 'vitest';
import { Board } from '../src/board';
import { Dawg } from '../src/dawg';
import { findAiMove } from '../src/ai';
import { validateMove } from '../src/rules';
import type { GameConfig } from '../src/types';

const cfg: GameConfig = { boardSize: 3, allowDiagonal: false, minWordLength: 3, maxSkipsInRow: 3 };

describe('findAiMove', () => {
  const dawg = Dawg.fromWords(['кот', 'сок', 'аток']);
  const board = new Board(3, 'кот');
  const used = new Set(['кот']);

  it('hard находит самое длинное слово (аток)', () => {
    const mv = findAiMove(board, dawg, cfg, used, 'hard', () => 0);
    expect(mv).not.toBeNull();
    expect(mv!.word).toBe('аток');
    expect(mv!.points).toBe(4);
    expect(mv!.letter).toBe('а');
  });

  it('ход ИИ проходит валидацию', () => {
    const mv = findAiMove(board, dawg, cfg, used, 'hard', () => 0)!;
    const v = validateMove(board, dawg, cfg, used, { letter: mv.letter, cell: mv.cell, path: mv.path });
    expect(v.ok).toBe(true);
  });

  it('hard откатывается к сок, если аток уже использован', () => {
    const mv = findAiMove(board, dawg, cfg, new Set(['кот', 'аток']), 'hard', () => 0);
    expect(mv!.word).toBe('сок');
  });

  it('easy возвращает какой-то допустимый ход', () => {
    const mv = findAiMove(board, dawg, cfg, used, 'easy', () => 0.99);
    expect(['сок', 'аток']).toContain(mv!.word);
  });

  it('возвращает null, если ходов нет', () => {
    const mv = findAiMove(board, Dawg.fromWords(['кот']), cfg, new Set(['кот']), 'hard');
    expect(mv).toBeNull();
  });
});
