import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Dawg } from '@balda/shared';
import type { GameConfig } from '@balda/shared';
import { Matchmaker } from '../src/Matchmaker';
import { Room } from '../src/Room';
import type { PlayerConnection } from '../src/Room';
import type { ServerMessage } from '../src/protocol';

const CONFIG: GameConfig = {
  boardSize: 3,
  allowDiagonal: false,
  minWordLength: 2,
  maxSkipsInRow: 3,
};

const WORDS = ['бал', 'ак', 'ол', 'бо', 'сок', 'лак'];

class FakeConn implements PlayerConnection {
  messages: ServerMessage[] = [];

  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }

  lastState() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i]!;
      if (m.type === 'state') return m.state;
    }
    return null;
  }

  gameOver() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i]!;
      if (m.type === 'game-over') return m;
    }
    return null;
  }

  errors(): string[] {
    return this.messages.filter((m) => m.type === 'error').map((m) => m.message);
  }
}

function makeRoom(extra: { turnMs?: number; reconnectMs?: number } = {}): Room {
  return new Room({
    id: 'TEST1',
    dawg: Dawg.fromWords(WORDS),
    config: CONFIG,
    turnMs: extra.turnMs ?? 0,
    reconnectMs: extra.reconnectMs ?? 0,
  });
}

/** Поле 3×3, средний ряд «бал»; каждый ход ставит новую букву рядом. */
const MOVE_AK = { letter: 'к', cell: { row: 0, col: 1 }, path: [{ row: 1, col: 1 }, { row: 0, col: 1 }] };
const MOVE_OL = { letter: 'о', cell: { row: 0, col: 2 }, path: [{ row: 0, col: 2 }, { row: 1, col: 2 }] };
const MOVE_BO = { letter: 'о', cell: { row: 0, col: 0 }, path: [{ row: 1, col: 0 }, { row: 0, col: 0 }] };
const MOVE_AK_AGAIN = { letter: 'к', cell: { row: 2, col: 1 }, path: [{ row: 1, col: 1 }, { row: 2, col: 1 }] };

describe('Room', () => {
  let p0: FakeConn;
  let p1: FakeConn;
  let room: Room;
  let s0: { playerId: string; token: string };
  let s1: { playerId: string; token: string };

  beforeEach(() => {
    p0 = new FakeConn();
    p1 = new FakeConn();
    room = makeRoom();
    s0 = room.addPlayer(p0, 'Алиса');
    s1 = room.addPlayer(p1, 'Боб');
  });

  afterEach(() => {
    room.dispose();
    vi.useRealTimers();
  });

  it('партия начинается, когда пришли оба игрока', () => {
    expect(room.isFull).toBe(true);
    const state = p1.lastState();
    expect(state).not.toBeNull();
    expect(state!.status).toBe('playing');
    expect(state!.currentPlayer).toBe(0);
    expect(state!.players.map((p) => p.name)).toEqual(['Алиса', 'Боб']);
    expect(state!.board[1]).toEqual(['б', 'а', 'л']);
  });

  it('до прихода второго игрока статус waiting', () => {
    const solo = makeRoom();
    const conn = new FakeConn();
    solo.addPlayer(conn, 'Один');
    expect(conn.lastState()!.status).toBe('waiting');
    solo.dispose();
  });

  it('валидный ход принимается, счёт и очередь меняются', () => {
    room.move(s0.playerId, MOVE_AK);
    const state = p0.lastState();
    expect(state!.players[0]!.score).toBe(2);
    expect(state!.currentPlayer).toBe(1);
    expect(state!.board[0]![1]).toBe('к');
  });

  it('ход не в свою очередь отклоняется', () => {
    room.move(s1.playerId, MOVE_AK);
    expect(p1.errors()).toContain('Сейчас не ваш ход');
  });

  it('повтор слова отклоняется', () => {
    room.move(s0.playerId, MOVE_AK);
    room.move(s1.playerId, MOVE_OL);
    room.move(s0.playerId, MOVE_BO);
    room.move(s1.playerId, MOVE_AK_AGAIN);
    expect(p1.errors()).toContain('Слово уже использовано');
  });

  it('reconnect по секрет-токену возвращает слот, с неверным токеном — нет', () => {
    const fresh = new FakeConn();
    room.handleDisconnect(p0);
    expect(room.reconnect(s0.playerId, 'wrong-token', fresh)).toBeNull();
    expect(room.reconnect(s0.playerId, s0.token, fresh)).toBe(0);
    const state = fresh.lastState();
    expect(state).not.toBeNull();
    expect(state!.players[0]!.connected).toBe(true);
  });

  it('таймер хода делает авто-пас по истечении', () => {
    vi.useFakeTimers();
    const timed = makeRoom({ turnMs: 1000 });
    const a = timed.addPlayer(new FakeConn(), 'А');
    timed.addPlayer(new FakeConn(), 'Б');
    vi.advanceTimersByTime(1100);
    const state = timed.stateFor(a.index);
    expect(state.currentPlayer).toBe(1);
    timed.dispose();
  });

  it('окно реконнекта истекло — техпоражение отключившегося', () => {
    vi.useFakeTimers();
    const timed = makeRoom({ reconnectMs: 500 });
    const connA = new FakeConn();
    timed.addPlayer(connA, 'А');
    const sB = timed.addPlayer(new FakeConn(), 'Б');
    timed.handleDisconnect(connA);
    vi.advanceTimersByTime(600);
    const state = timed.stateFor(sB.index);
    expect(state.status).toBe('finished');
    expect(state.winner).toBe(1);
    expect(state.endReason).toBe('timeout');
    timed.dispose();
  });

  it('уход игрока в начавшейся партии — техпоражение ушедшего', () => {
    room.leave(s0.playerId);
    const state = p1.lastState();
    expect(state.status).toBe('finished');
    expect(state.winner).toBe(1);
  });

  it('game-over содержит дельту рейтинга и фишки победителю', () => {
    const rated = makeRoom();
    const connA = new FakeConn();
    const connB = new FakeConn();
    const a = rated.addPlayer(connA, 'А', 1200);
    rated.addPlayer(connB, 'Б', 1000);
    rated.leave(a.playerId); // А ушёл — победил Б
    const over = connB.gameOver();
    expect(over).not.toBeNull();
    expect(over!.deltaChips).toEqual([0, 10]);
    expect(over!.deltaRating[1]).toBeGreaterThan(0);
    expect(over!.deltaRating[0]).toBeLessThan(0);
    void a;
    rated.dispose();
  });
});

describe('Matchmaker', () => {
  const dawg = Dawg.fromWords(WORDS);

  it('быстрый матч сажает двух игроков в одну комнату', () => {
    const mm = new Matchmaker(dawg, { turnMs: 0, reconnectMs: 0 });
    const a = mm.quickMatch(new FakeConn(), 'А');
    const b = mm.quickMatch(new FakeConn(), 'Б');
    expect(a.room).toBe(b.room);
    expect(a.playerId).not.toBe(b.playerId);
    expect(a.token).not.toBe(b.token);
    mm.dispose();
  });

  it('приватная комната: вход по коду, заполненная недоступна', () => {
    const mm = new Matchmaker(dawg, { turnMs: 0, reconnectMs: 0 });
    const host = mm.createRoom(new FakeConn(), 'А');
    const guest = mm.joinRoom(host.room.id.toLowerCase(), new FakeConn(), 'Б');
    expect(guest).not.toBeNull();
    expect(mm.joinRoom(host.room.id, new FakeConn(), 'В')).toBeNull();
    mm.dispose();
  });

  it('код комнаты — только буквы (ввод с canvas-клавиатуры)', () => {
    const mm = new Matchmaker(dawg, { turnMs: 0, reconnectMs: 0 });
    const host = mm.createRoom(new FakeConn(), 'А');
    expect(host.room.id).toMatch(/^[A-Z]{5}$/);
    mm.dispose();
  });

  it('рейтинг победителя растёт между партиями', () => {
    const mm = new Matchmaker(dawg, { turnMs: 0, reconnectMs: 0 });
    const before = mm.getRating('Победитель');
    const host = mm.createRoom(new FakeConn(), 'Победитель');
    const guest = mm.joinRoom(host.room.id, new FakeConn(), 'Проигравший');
    host.room.leave(guest!.playerId);
    expect(mm.getRating('Победитель')).toBeGreaterThan(before);
    expect(mm.getRating('Проигравший')).toBeLessThan(1000);
    mm.dispose();
  });
});
