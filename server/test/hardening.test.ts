import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Dawg } from '@balda/shared';
import { parseClientMessage } from '../src/protocol';
import { calcElo, kFactor } from '../src/elo';
import { pickStartWord, START_WORDS } from '../src/Room';
import { loadDictionary } from '../src/dictionary';
import { Matchmaker } from '../src/Matchmaker';
import type { PlayerConnection } from '../src/Room';
import type { ServerMessage } from '../src/protocol';

class FakeConn implements PlayerConnection {
  messages: ServerMessage[] = [];
  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }
}

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
    // На 7×7 слово может быть и 5-буквенным (ставится по центру строки).
    const w7 = pickStartWord(7, () => 0.5);
    expect([...START_WORDS[7]!, ...START_WORDS[5]!]).toContain(w7);
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

describe('Matchmaker: защита от ботов', () => {
  const dawg = Dawg.fromWords(['бал', 'ак', 'ол', 'бо', 'сок', 'лак']);

  it('createRoom бросает при достижении лимита комнат', () => {
    const mm = new Matchmaker(dawg, { turnMs: 0, reconnectMs: 0, maxRooms: 2 });
    mm.createRoom(new FakeConn(), 'А');
    mm.createRoom(new FakeConn(), 'Б');
    expect(() => mm.createRoom(new FakeConn(), 'В')).toThrow(/лимит комнат/i);
    mm.dispose();
  });

  it('quickMatch бросает при лимите, когда ждать негде', () => {
    const mm = new Matchmaker(dawg, { turnMs: 0, reconnectMs: 0, maxRooms: 2 });
    mm.createRoom(new FakeConn(), 'А');
    mm.createRoom(new FakeConn(), 'Б');
    expect(() => mm.quickMatch(new FakeConn(), 'Г')).toThrow(/лимит комнат/i);
    mm.dispose();
  });

  it('quickMatch при лимите всё ещё садит в ожидающую комнату', () => {
    const mm = new Matchmaker(dawg, { turnMs: 0, reconnectMs: 0, maxRooms: 1 });
    const a = mm.quickMatch(new FakeConn(), 'А');
    const b = mm.quickMatch(new FakeConn(), 'Б');
    expect(a.room).toBe(b.room);
    expect(mm.roomCount).toBe(1);
    mm.dispose();
  });

  it('removeFromRoom освобождает старую комнату — утечки мёртвых соединений нет', () => {
    const mm = new Matchmaker(dawg, { turnMs: 0, reconnectMs: 0 });
    const first = mm.createRoom(new FakeConn(), 'А');
    const second = mm.createRoom(new FakeConn(), 'А');
    expect(mm.roomCount).toBe(2);
    // Соединение ушло во вторую комнату: первую освобождаем.
    mm.removeFromRoom(first.room.id, first.playerId);
    expect(first.room.playerCount).toBe(0);
    // Пустая комната удалена через onEmpty — утечки нет.
    expect(mm.roomCount).toBe(1);
    expect(second.room.playerCount).toBe(1);
    mm.dispose();
  });

  it('removeFromRoom в начавшейся партии — техпоражение ушедшего', () => {
    const mm = new Matchmaker(dawg, { turnMs: 0, reconnectMs: 0 });
    const host = mm.createRoom(new FakeConn(), 'А');
    const guest = mm.joinRoom(host.room.id, new FakeConn(), 'Б');
    expect(guest).not.toBeNull();
    mm.removeFromRoom(host.room.id, host.playerId);
    expect(host.room.isFinished).toBe(true);
    expect(host.room.winnerIndex).toBe(1);
    mm.dispose();
  });

  it('removeFromRoom для несуществующей комнаты — тихий no-op', () => {
    const mm = new Matchmaker(dawg, { turnMs: 0, reconnectMs: 0 });
    expect(() => mm.removeFromRoom('ZZZZZ', 'no-such-player')).not.toThrow();
    mm.dispose();
  });
});
