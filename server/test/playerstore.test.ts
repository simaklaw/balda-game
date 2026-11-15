import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CHIPS_PER_WIN } from '../src/elo';
import { PlayerStore, nameKey } from '../src/PlayerStore';

let dir: string | null = null;

function makePath(): string {
  dir = mkdtempSync(join(tmpdir(), 'balda-players-'));
  return join(dir!, 'sub', 'players.json');
}

afterEach(() => {
  dir = null;
});

describe('nameKey', () => {
  it('регистр и пробелы не различаются, длина ограничена', () => {
    expect(nameKey('  Алиса ')).toBe(nameKey('алиса'));
    expect(nameKey('x'.repeat(30))).toHaveLength(24);
  });
});

describe('PlayerStore', () => {
  it('applyResult копит рейтинг, фишки и статистику', () => {
    const store = new PlayerStore(makePath());
    store.load();
    store.applyResult('Алиса', 1016, true);
    store.applyResult('Алиса', 1000, false);
    const rec = store.get('алиса');
    expect(rec).not.toBeNull();
    expect(rec!.rating).toBe(1000);
    expect(rec!.games).toBe(2);
    expect(rec!.wins).toBe(1);
    expect(rec!.chips).toBe(CHIPS_PER_WIN);
  });

  it('профиль переживает перезапуск', () => {
    const path = makePath();
    const first = new PlayerStore(path);
    first.load();
    first.applyResult('Боб', 1050, true);
    first.dispose();

    const second = new PlayerStore(path);
    second.load();
    const rec = second.get('БОБ');
    expect(rec).not.toBeNull();
    expect(rec!.rating).toBe(1050);
    expect(rec!.wins).toBe(1);
    expect(second.get('Незнакомец')).toBeNull();
  });

  it('старый формат (число = рейтинг) мигрирует автоматически', () => {
    const path = makePath();
    const store = new PlayerStore(path);
    store.load();
    store.applyResult('Алиса', 1100, true);
    store.flush();
    // Подменяем файл картой старого формата RatingStore
    writeFileSync(path, JSON.stringify({ 'алиса': 1234, 'боб': 987 }), 'utf8');
    const after = new PlayerStore(path);
    after.load();
    const rec = after.get('алиса');
    expect(rec).not.toBeNull();
    expect(rec!.rating).toBe(1234);
    expect(rec!.chips).toBe(0);
    expect(rec!.games).toBe(0);
    expect(after.get('боб')!.rating).toBe(987);
  });

  it('повреждённый файл не валит сервер', () => {
    const path = makePath();
    const store = new PlayerStore(path);
    store.load();
    store.applyResult('Алиса', 1100, true);
    writeFileSync(path, '{ это не json', 'utf8');

    const after = new PlayerStore(path);
    expect(() => after.load()).not.toThrow();
    expect(after.get('Алиса')).toBeNull();
    expect(after.size).toBe(0);
  });

  it('некорректные значения из файла отбрасываются', () => {
    const path = makePath();
    const store = new PlayerStore(path);
    store.load();
    store.applyResult('Алиса', 1100, true);
    store.flush();
    writeFileSync(
      path,
      JSON.stringify({
        'алиса': { rating: 'сто', chips: 0, games: 0, wins: 0 },
        'боб': { rating: 1050, chips: 20, games: 3, wins: 2 },
        'вова': { rating: 1000, chips: -5, games: 1, wins: 0 },
      }),
      'utf8',
    );
    const after = new PlayerStore(path);
    after.load();
    expect(after.get('алиса')).toBeNull();
    expect(after.get('боб')!.wins).toBe(2);
    // Отрицательные фишки обрезаются в 0
    expect(after.get('вова')!.chips).toBe(0);
  });

  it('каталог создаётся автоматически, файл — валидный JSON', () => {
    const path = makePath(); // подкаталог sub/ ещё не существует
    const store = new PlayerStore(path);
    store.load();
    expect(() => store.applyResult('Боб', 1050, true)).not.toThrow();
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, { rating: number }>;
    expect(raw['боб']!.rating).toBe(1050);
  });
});
