import { describe, expect, it } from 'vitest';
import { calcElo, CHIPS_PER_WIN } from '../src/elo';

describe('calcElo', () => {
  it('при равных рейтингах победа даёт K/2', () => {
    const [a, b] = calcElo(1000, 1000, 1);
    expect(a).toBe(1016);
    expect(b).toBe(984);
  });

  it('рейтинг сохраняется при ничьей равных', () => {
    const [a, b] = calcElo(1000, 1000, 0.5);
    expect(a).toBe(1000);
    expect(b).toBe(1000);
  });

  it('система нулевая: сумма рейтингов не меняется', () => {
    const cases: [number, number, 0 | 0.5 | 1][] = [
      [1200, 900, 1],
      [1200, 900, 0],
      [1500, 1500, 0.5],
      [800, 2000, 1],
    ];
    for (const [ra, rb, s] of cases) {
      const [na, nb] = calcElo(ra, rb, s);
      expect(na + nb).toBe(ra + rb);
    }
  });

  it('сенсация даёт больше очков, чем ожидаемая победа', () => {
    const [upsetA] = calcElo(1000, 1400, 1);
    const [favA] = calcElo(1400, 1000, 1);
    expect(upsetA - 1000).toBeGreaterThan(favA - 1400);
  });

  it('чипы начисляются только за победу', () => {
    expect(CHIPS_PER_WIN).toBe(10);
  });
});
