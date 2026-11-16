import type { EndReason } from '@balda/shared';

/** Текст, тон и подпись причины для финального оверлея (чистая функция — тестируется без Pixi). */
export interface GameOverText {
  title: string;
  tone: 'success' | 'danger' | 'neutral';
  reason: string;
}

const REASON_TEXT: Record<Exclude<EndReason, null>, string> = {
  timeout: 'время вышло',
  skip_limit: 'три пропуска подряд',
  resign: 'сдача',
  no_moves: 'ходов больше нет',
  board_full: '',
};

/**
 * Заголовок/тон/причина финала. winner — индекс с точки зрения игрока:
 * 0 — сам игрок (победа), 1 — соперник (поражение), null — ничья.
 */
export function gameOverText(winner: number | null, endReason: EndReason): GameOverText {
  const title = winner === null ? 'Ничья' : winner === 0 ? 'Победа!' : 'Поражение';
  const tone: GameOverText['tone'] =
    winner === null ? 'neutral' : winner === 0 ? 'success' : 'danger';
  const reason = endReason === null ? '' : REASON_TEXT[endReason];
  return { title, tone, reason };
}
