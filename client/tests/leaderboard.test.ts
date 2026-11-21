import { describe, expect, it } from 'vitest';
import {
  addResult,
  formatEntry,
  parseLeaderboard,
  serializeLeaderboard,
  sortEntries,
  LEADERBOARD_MAX,
} from '../src/game/leaderboard';
import type { LeaderboardEntry } from '../src/game/leaderboard';

const makeEntry = (overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  score: 10,
  difficulty: 'medium',
  boardSize: 5,
  timeControl: 'classic',
  date: '2026-11-15T10:00:00.000Z',
  ...overrides,
});

/** Невалидная запись без проверки типов: для тестов устойчивости к мусору. */
const makeRaw = (patch: Record<string, unknown>): unknown => ({ ...makeEntry(), ...patch });

describe('parseLeaderboard', () => {
  it('null, пустая строка и мусор дают пустой рейтинг', () => {
    expect(parseLeaderboard(null)).toEqual([]);
    expect(parseLeaderboard('')).toEqual([]);
    expect(parseLeaderboard('не json')).toEqual([]);
    expect(parseLeaderboard('{"score":5}')).toEqual([]);
    expect(parseLeaderboard('42')).toEqual([]);
  });

  it('читает корректный JSON и сортирует по очкам', () => {
    const raw = serializeLeaderboard([
      makeEntry({ score: 5, date: '2026-11-15T10:00:00.000Z' }),
      makeEntry({ score: 20, date: '2026-11-14T10:00:00.000Z' }),
    ]);
    const entries = parseLeaderboard(raw);
    expect(entries.map((entry) => entry.score)).toEqual([20, 5]);
  });

  it('отбрасывает повреждённые записи, но оставляет годные', () => {
    const raw = JSON.stringify([
      makeEntry({ score: 7 }),
      { score: 'много' },
      null,
      makeRaw({ score: 9, difficulty: 'nightmare' }),
      makeRaw({ score: 3, boardSize: 9 }),
      makeRaw({ score: 4, timeControl: 'turbo' }),
      makeRaw({ score: 2, date: 'вчера' }),
    ]);
    const entries = parseLeaderboard(raw);
    expect(entries.map((entry) => entry.score)).toEqual([7]);
  });

  it('обрезает топ до LEADERBOARD_MAX', () => {
    const raw = serializeLeaderboard(
      Array.from({ length: LEADERBOARD_MAX + 5 }, (_, i) => makeEntry({ score: i + 1 })),
    );
    expect(parseLeaderboard(raw)).toHaveLength(LEADERBOARD_MAX);
    expect(parseLeaderboard(raw)[0]!.score).toBe(LEADERBOARD_MAX + 5);
  });
});

describe('sortEntries', () => {
  it('равные очки: раньше сыгранная партия выше', () => {
    const sorted = sortEntries([
      makeEntry({ score: 12, date: '2026-11-15T12:00:00.000Z' }),
      makeEntry({ score: 12, date: '2026-11-15T08:00:00.000Z' }),
    ]);
    expect(sorted[0]!.date).toBe('2026-11-15T08:00:00.000Z');
  });

  it('не мутирует входной массив', () => {
    const entries = [makeEntry({ score: 1 }), makeEntry({ score: 2 })];
    sortEntries(entries);
    expect(entries.map((entry) => entry.score)).toEqual([1, 2]);
  });
});

describe('addResult', () => {
  it('добавляет результат на место по очкам', () => {
    const next = addResult([makeEntry({ score: 30 }), makeEntry({ score: 10 })], makeEntry({ score: 20 }));
    expect(next.map((entry) => entry.score)).toEqual([30, 20, 10]);
  });

  it('не мутирует входной массив', () => {
    const entries = [makeEntry({ score: 10 })];
    addResult(entries, makeEntry({ score: 50 }));
    expect(entries).toHaveLength(1);
  });

  it('держит топ не длиннее LEADERBOARD_MAX', () => {
    let entries: LeaderboardEntry[] = [];
    for (let i = 0; i < LEADERBOARD_MAX + 3; i++) {
      entries = addResult(entries, makeEntry({ score: i, date: `2026-01-${(i % 28) + 1}T00:00:00.000Z` }));
    }
    expect(entries).toHaveLength(LEADERBOARD_MAX);
    expect(entries[0]!.score).toBe(LEADERBOARD_MAX + 2);
  });
});

describe('serializeLeaderboard', () => {
  it('round-trip: сериализация → разбор даёт те же записи', () => {
    const entries = [makeEntry({ score: 33 }), makeEntry({ score: 8, boardSize: 3 })];
    expect(parseLeaderboard(serializeLeaderboard(entries))).toEqual(entries);
  });
});

describe('formatEntry', () => {
  it('показывает сложность, поле и дату', () => {
    expect(formatEntry(makeEntry({ score: 24, difficulty: 'hard', boardSize: 5 }))).toBe(
      'сложно · 5×5 · 15.11',
    );
    expect(formatEntry(makeEntry({ score: 24, difficulty: 'easy', boardSize: 3 }))).toBe(
      'легко · 3×3 · 15.11',
    );
  });
});
