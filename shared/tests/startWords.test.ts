import { Board } from '../src/board';
import { describe, expect, it } from 'vitest';
import { pickStartWord, START_WORDS } from '../src/startWords';

describe('startWords', () => {
  it('пулы есть для 3, 5 и 7; длина слов равна размеру поля; без дублей', () => {
    for (const size of [3, 5, 7]) {
      const pool = START_WORDS[size]!;
      expect(pool.length).toBeGreaterThan(100);
      expect(new Set(pool).size).toBe(pool.length);
      for (const w of pool) expect(w.length).toBe(size);
    }
  });

  it('pickStartWord детерминирован при заданном rnd и бросает для неизвестного размера', () => {
    expect(pickStartWord(5, () => 0)).toBe(START_WORDS[5]![0]);
    expect(pickStartWord(5, () => 0.999999)).toBe(START_WORDS[5]!.at(-1));
    expect(() => pickStartWord(4)).toThrow();
  });

  it('на 7×7 стартовое слово может быть из 5 и 7 букв и ставится по центру строки', () => {
    const lengths = new Set<number>();
    for (let k = 0; k < 400; k++) lengths.add(pickStartWord(7, () => k / 400).length);
    expect(lengths.has(5)).toBe(true);
    expect(lengths.has(7)).toBe(true);
    const board = new Board(7, 'кошка');
    expect([0, 1, 2, 3, 4, 5, 6].map((c) => board.get(3, c)).join('|')).toBe('|к|о|ш|к|а|');
  });
});
