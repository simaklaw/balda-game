/** Эло-рейтинг и фишки. Чипы начисляются только за победу. */

export const CHIPS_PER_WIN = 10;

/**
 * Коэффициент K зависит от опыта и уровня игрока:
 * новички (<10 партий) растут быстро, у топов рейтинг стабилен.
 */
export function kFactor(games: number, rating: number): number {
  if (games < 10) return 40;
  if (rating < 2100) return 26;
  return 18;
}

/**
 * Эло с индивидуальным коэффициентом K каждому игроку.
 * Возвращает новые рейтинги [игрока A, игрока B]; scoreA — результат A.
 */
export function calcElo(
  ratingA: number,
  ratingB: number,
  scoreA: 0 | 0.5 | 1,
  kA = 32,
  kB = kA,
): [number, number] {
  const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  const newA = Math.round(ratingA + kA * (scoreA - expectedA));
  const newB = Math.round(ratingB + kB * (1 - scoreA - expectedB));
  return [newA, newB];
}
