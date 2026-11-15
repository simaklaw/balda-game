import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RatingStore, nameKey } from '../src/RatingStore';

let dir: string | null = null;

function makePath(): string {
  dir = mkdtempSync(join(tmpdir(), 'balda-ratings-'));
  return join(dir!, 'sub', 'ratings.json');
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

describe('RatingStore', () => {
  it('сохраняет и читает рейтинг между перезапусками', () => {
    const path = makePath();
    const first = new RatingStore(path);
    first.load();
    first.set('Алиса', 1234);
    first.dispose();

    const second = new RatingStore(path);
    second.load();
    expect(second.get('алиса')).toBe(1234);
    expect(second.get('Незнакомец')).toBeNull();
  });

  it('каталог создаётся автоматически', () => {
    const path = makePath(); // подкаталог sub/ ещё не существует
    const store = new RatingStore(path);
    store.load();
    expect(() => store.set('Боб', 1050)).not.toThrow();

    const second = new RatingStore(path);
    second.load();
    expect(second.get('БОБ')).toBe(1050);
  });

  it('повреждённый файл не валит сервер', () => {
    const path = makePath();
    const store = new RatingStore(path);
    store.load();
    store.set('Алиса', 1100);
    writeFileSync(path, '{ это не json', 'utf8');

    const after = new RatingStore(path);
    expect(() => after.load()).not.toThrow();
    expect(after.get('Алиса')).toBeNull();
    expect(after.size).toBe(0);
  });

  it('некорректные значения из файла отбрасываются', () => {
    const path = makePath();
    const store = new RatingStore(path);
    store.load();
    store.set('Алиса', 1100);
    store.flush();
    // Подменяем файл картой с мусорными значениями
    writeFileSync(path, JSON.stringify({ 'алиса': 'сто', 'боб': 1200, 'вова': null }), 'utf8');
    const after = new RatingStore(path);
    after.load();
    expect(after.get('алиса')).toBeNull();
    expect(after.get('боб')).toBe(1200);
    expect(after.get('вова')).toBeNull();
  });

  it('файл — валидный JSON с рейтингами по ключам', () => {
    const path = makePath();
    const store = new RatingStore(path);
    store.load();
    store.set('Алиса', 1050);
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, number>;
    expect(raw['алиса']).toBe(1050);
  });
});
