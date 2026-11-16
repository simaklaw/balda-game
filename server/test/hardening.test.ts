import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { parseClientMessage } from '../src/protocol';
import { calcElo, kFactor } from '../src/elo';
import { pickStartWord, START_WORDS } from '../src/Room';
import { loadDictionary } from '../src/dictionary';

describe('parseClientMessage (строгий разбор)', () => {
  it('валидные сообщения проходят', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'quick-match', name: 'Аня' })))
      .toEqual({ type: 'quick-match', name: 'Аня' });
    expect(parseClientMessage(JSON.stringify({ type: 'join-room', name: 'Аня', roomId: 'ABCDE' })))
      .toEqual({ type: 'join-room', name: 'Аня', roomId: 'ABCDE' });
    expect(
      parseClientMessage(
        JSON.stringify({
          type: 'move',
          path: [{ row: 2, col: 2 }, { row: 2, col: 3 }],
          cell: { row: 2, col: 3 },
          letter: 'к',
        }),
      ),
    ).toEqual({
      type: 'move',
      path: [{ row: 2, col: 2 }, { row: 2, col: 3 }],
      cell: { row: 2, col: 3 },
      letter: 'к',
    });
    expect(parseClientMessage(JSON.stringify({ type: 'pass' }))).toEqual({ type: 'pass' });
    expect(
      parseClientMessage(JSON.stringify({ type: 'reconnect', roomId: 'ABCDE', playerId: 'p1', token: 't' })),
    ).toEqual({ type: 'reconnect', roomId: 'ABCDE', playerId: 'p1', token: 't' });
  });

  it('мусор и неверные типы полей отбрасываются', () => {
    expect(parseClientMessage('не json')).toBeNull();
    expect(parseClientMessage('42')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'hack' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'quick-match', name: 42 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'quick-match', name: '' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'quick-match' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'join-room', name: 'Аня', roomId: 5 }))).toBeNull();
  });

  it('ход с некорректной буквой, клеткой или путём отбрасывается', () => {
    const base = { type: 'move', path: [{ row: 2, col: 2 }], cell: { row: 2, col: 2 } };
    expect(parseClientMessage(JSON.stringify({ ...base, letter: '1' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...base, letter: 'a' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ ...base, letter: 'кот' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'move', path: 'балда', cell: { row: 0, col: 0 }, letter: 'к' }))).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ type: 'move', path: [{ row: -1, col: 0 }], cell: { row: -1, col: 0 }, letter: 'к' })),
    ).toBeNull();
    expect(
      parseClientMessage(JSON.stringify({ type: 'move', path: [{ row: 0.5, col: 0 }], cell: { row: 0, col: 0 }, letter: 'к' })),
    ).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'move', path: [], cell: { row: 0, col: 0 }, letter: 'к' }))).toBeNull();
  });
});

describe('стартовые слова', () => {
  it('для каждого размера поля длина слова равна размеру', () => {
    for (const [size, pool] of Object.entries(START_WORDS)) {
      expect(pool.length, 'пул ' + size + '×' + size + ' не пуст').toBeGreaterThan(0);
      for (const word of pool) {
        expect(word.length, '"' + word + '" не подходит для ' + size + '×' + size).toBe(Number(size));
      }
    }
  });

  it('pickStartWord выбирает слово из пула и уважает длину', () => {
    expect(START_WORDS[3]).toContain(pickStartWord(3, () => 0));
    expect(START_WORDS[5]).toContain(pickStartWord(5, () => 0.99));
    expect(START_WORDS[7]).toContain(pickStartWord(7, () => 0.5));
    expect(() => pickStartWord(4)).toThrow();
  });

  it('все стартовые слова есть в боевом словаре', () => {
    const { dawg, source } = loadDictionary(
      fileURLToPath(new URL('../../client/public/dict/words.txt', import.meta.url)),
    );
    expect(source).toBe('file');
    for (const pool of Object.values(START_WORDS)) {
      for (const word of pool) {
        expect(dawg.has(word), '"' + word + '" отсутствует в словаре').toBe(true);
      }
    }
  });
});

describe('Эло: коэффициент K по опыту и уровню', () => {
  it('новичкам K=40, середина K=26, топы K=18', () => {
    expect(kFactor(0, 1000)).toBe(40);
    expect(kFactor(9, 1000)).toBe(40);
    expect(kFactor(10, 1000)).toBe(26);
    expect(kFactor(500, 2099)).toBe(26);
    expect(kFactor(500, 2100)).toBe(18);
  });

  it('при равных K результат совпадает с классическим расчётом', () => {
    const [newA, newB] = calcElo(1000, 1000, 1, 32, 32);
    expect(newA).toBe(1016);
    expect(newB).toBe(984);
  });

  it('победитель-новичок растёт быстрее победителя-ветерана', () => {
    // Одинаковые рейтинги, одинаковый результат — разница только в K.
    const [rookie] = calcElo(1500, 1500, 1, 40, 40);
    const [veteran] = calcElo(1500, 1500, 1, 18, 18);
    expect(rookie - 1500).toBe(20);
    expect(veteran - 1500).toBe(9);
    expect(rookie - 1500).toBeGreaterThan(veteran - 1500);
  });
});
