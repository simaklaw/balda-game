import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Dawg } from '@balda/shared';
import type { GameConfig } from '@balda/shared';
import { Matchmaker } from '../src/Matchmaker';
import { PlayerStore } from '../src/PlayerStore';
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
    startWord: 'бал',
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

  it('onStarted срабатывает один раз, когда комната заполнилась', () => {
    const started: Room[] = [];
    const r = new Room({
      id: 'START1',
      dawg: Dawg.fromWords(WORDS),
      config: CONFIG,
      turnMs: 0,
      reconnectMs: 0,
      startWord: 'бал',
      onStarted: (room) => started.push(room),
    });
    r.addPlayer(new FakeConn(), 'А');
    expect(started).toHaveLength(0);
    r.addPlayer(new FakeConn(), 'Б');
    expect(started).toHaveLength(1);
    expect(started[0]).toBe(r);
    r.dispose();
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
    expect(state!.status).toBe('finished');
    expect(state!.winner).toBe(1);
  });

  it('уход игрока — причина resign, а не timeout', () => {
    room.leave(s0.playerId);
    const state = p1.lastState();
    expect(state!.endReason).toBe('resign');
    const over = p1.gameOver();
    expect(over).not.toBeNull();
    expect(over!.reason).toBe('resign');
  });

  it('ничья: winner null, дельты рейтинга и фишек нулевые', () => {
    // Два паса подряд при счёте 0:0 — no_moves, ничья.
    room.pass(s0.playerId);
    room.pass(s1.playerId);
    const over = p0.gameOver();
    expect(over).not.toBeNull();
    expect(over!.winner).toBeNull();
    expect(over!.reason).toBe('no_moves');
    expect(over!.deltaRating).toEqual([0, 0]);
    expect(over!.deltaChips).toEqual([0, 0]);
    const state = p0.lastState();
    expect(state!.endReason).toBe('no_moves');
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

  it('профиль после партии содержит фишки и победы', () => {
    const dir = mkdtempSync(join(tmpdir(), 'balda-pp-'));
    const store = new PlayerStore(join(dir, 'players.json'));
    store.load();
    const mm = new Matchmaker(dawg, { turnMs: 0, reconnectMs: 0, players: store });
    expect(mm.getProfile('Победитель')).toBeNull();
    const host = mm.createRoom(new FakeConn(), 'Победитель');
    const guest = mm.joinRoom(host.room.id, new FakeConn(), 'Проигравший');
    host.room.leave(guest!.playerId);
    const winner = mm.getProfile('Победитель');
    expect(winner).not.toBeNull();
    expect(winner!.games).toBe(1);
    expect(winner!.wins).toBe(1);
    expect(winner!.chips).toBe(10);
    expect(mm.getProfile('Неизвестный')).toBeNull();
    mm.dispose();
    store.dispose();
  });

  it('ничья: applyResult вызван с won=false для обоих, дельты нулевые', () => {
    const dir = mkdtempSync(join(tmpdir(), 'balda-draw-'));
    const store = new PlayerStore(join(dir, 'players.json'));
    store.load();
    const mm = new Matchmaker(dawg, { turnMs: 0, reconnectMs: 0, players: store });
    const a = mm.quickMatch(new FakeConn(), 'НичьяА');
    const b = mm.quickMatch(new FakeConn(), 'НичьяБ');
    // Два паса подряд при счёте 0:0 — ничья (no_moves).
    a.room.pass(a.playerId);
    a.room.pass(b.playerId);
    expect(a.room.lastOutcome).not.toBeNull();
    expect(a.room.lastOutcome!.deltaRating).toEqual([0, 0]);
    expect(a.room.lastOutcome!.deltaChips).toEqual([0, 0]);
    const profA = mm.getProfile('НичьяА');
    const profB = mm.getProfile('НичьяБ');
    expect(profA).not.toBeNull();
    expect(profB).not.toBeNull();
    expect(profA!.games).toBe(1);
    expect(profA!.wins).toBe(0);
    expect(profA!.chips).toBe(0);
    expect(profB!.games).toBe(1);
    expect(profB!.wins).toBe(0);
    expect(profB!.chips).toBe(0);
    mm.dispose();
    store.dispose();
  });

  it('колбэки onStarted/onFinished срабатывают для метрик', () => {
    let started = 0;
    let finished = 0;
    const mm = new Matchmaker(dawg, {
      turnMs: 0,
      reconnectMs: 0,
      onStarted: () => {
        started += 1;
      },
      onFinished: () => {
        finished += 1;
      },
    });
    const host = mm.createRoom(new FakeConn(), 'А');
    expect(started).toBe(0);
    const guest = mm.joinRoom(host.room.id, new FakeConn(), 'Б');
    expect(started).toBe(1);
    expect(finished).toBe(0);
    host.room.leave(guest!.playerId);
    expect(finished).toBe(1);
    mm.dispose();
  });
});
