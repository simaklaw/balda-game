import type { Difficulty } from '@balda/shared';
import type { TimeControlKind } from './TimerModel';

/** Одна запись локального рейтинга: результат завершённой оффлайн-партии. */
export interface LeaderboardEntry {
  /** Очки игрока за партию. */
  score: number;
  difficulty: Difficulty;
  boardSize: 3 | 5;
  timeControl: TimeControlKind;
  /** Момент завершения партии (ISO). */
  date: string;
}

/** Сколько результатов хранится в локальном рейтинге. */
export const LEADERBOARD_MAX = 10;

/** Ключ в хранилище платформы (на Яндексе — облачные сейвы игрока). */
export const LEADERBOARD_KEY = 'balda.leaderboard';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];
const TIME_CONTROLS: readonly TimeControlKind[] = ['none', 'classic', 'blitz', 'fisher'];

const isDifficulty = (value: unknown): value is Difficulty =>
  typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);

const isTimeControl = (value: unknown): value is TimeControlKind =>
  typeof value === 'string' && (TIME_CONTROLS as readonly string[]).includes(value);

const isBoardSize = (value: unknown): value is 3 | 5 => value === 3 || value === 5;

/** Приводит неизвестное значение к записи рейтинга; мусор отбрасывает. */
function normalizeEntry(item: unknown): LeaderboardEntry | null {
  if (typeof item !== 'object' || item === null) return null;
  const raw = item as Record<string, unknown>;
  if (typeof raw.score !== 'number' || !Number.isFinite(raw.score)) return null;
  if (!isDifficulty(raw.difficulty) || !isBoardSize(raw.boardSize)) return null;
  if (!isTimeControl(raw.timeControl)) return null;
  if (typeof raw.date !== 'string' || Number.isNaN(Date.parse(raw.date))) return null;
  return {
    score: Math.max(0, Math.floor(raw.score)),
    difficulty: raw.difficulty,
    boardSize: raw.boardSize,
    timeControl: raw.timeControl,
    date: raw.date,
  };
}

/** Сортировка: по очкам убыванию, при равенстве — раньше сыгранная партия выше. */
export function sortEntries(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Date.parse(a.date) - Date.parse(b.date);
  });
}

/**
 * Разбирает JSON из хранилища; повреждённые или чужие данные дают пустой
 * рейтинг — локальный рейтинг никогда не ломает игру.
 */
export function parseLeaderboard(raw: string | null): LeaderboardEntry[] {
  if (raw === null || raw === '') return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const entries: LeaderboardEntry[] = [];
    for (const item of data) {
      const entry = normalizeEntry(item);
      if (entry !== null) entries.push(entry);
    }
    return sortEntries(entries).slice(0, LEADERBOARD_MAX);
  } catch {
    return [];
  }
}

/** Добавляет результат и возвращает новый топ (не мутирует вход). */
export function addResult(
  entries: readonly LeaderboardEntry[],
  result: LeaderboardEntry,
): LeaderboardEntry[] {
  return sortEntries([...entries, result]).slice(0, LEADERBOARD_MAX);
}

/** Сериализация для хранилища платформы. */
export function serializeLeaderboard(entries: readonly LeaderboardEntry[]): string {
  return JSON.stringify(entries);
}

/** Короткая подпись результата для экрана рейтинга: «сложно · 5×5 · 15.11». */
export function formatEntry(entry: LeaderboardEntry): string {
  const difficulty = entry.difficulty === 'easy' ? 'легко' : entry.difficulty === 'medium' ? 'средне' : 'сложно';
  const parsed = Date.parse(entry.date);
  const date = Number.isNaN(parsed)
    ? ''
    : ' · ' + new Date(parsed).toISOString().slice(8, 10) + '.' + new Date(parsed).toISOString().slice(5, 7);
  return difficulty + ' · ' + entry.boardSize + '×' + entry.boardSize + date;
}
