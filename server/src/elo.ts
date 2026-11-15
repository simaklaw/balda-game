/** Эло-рейтинг и фишки. Чипы начисляются только за победу. */

export const CHIPS_PER_WIN = 10;

/**
 * Классический Эло с коэффициентом K.
 * Возвращает новые рейтинги [игрока A, игрока B]; scoreA — результат A.
 */
export function calcElo(
  ratingA: number,
  ratingB: number,
  scoreA: 0 | 0.5 | 1,
  k = 32,
): [number, number] {
  const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  const newA = Math.round(ratingA + k * (scoreA - expectedA));
  const newB = Math.round(ratingB + k * (1 - scoreA - expectedB));
  return [newA, newB];
}
