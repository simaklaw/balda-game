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
});
