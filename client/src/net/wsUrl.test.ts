import { describe, expect, it } from 'vitest';
import { resolveWsUrl } from './wsUrl';
import { parseServerMessage } from './protocol';

describe('resolveWsUrl', () => {
  it('http-страница → ws://тот же хост/ws', () => {
    expect(resolveWsUrl('http:', 'localhost:5173', null)).toBe('ws://localhost:5173/ws');
  });

  it('https-страница → wss://', () => {
    expect(resolveWsUrl('https:', 'games.example', null)).toBe('wss://games.example/ws');
  });

  it('явный override побеждает', () => {
    expect(resolveWsUrl('https:', 'games.example', 'ws://10.0.0.1:3001/ws')).toBe(
      'ws://10.0.0.1:3001/ws',
    );
  });

  it('пустой override игнорируется', () => {
    expect(resolveWsUrl('http:', 'localhost:5173', '  ')).toBe('ws://localhost:5173/ws');
  });
});

/** Минимально валидный RoomState для строгого parseServerMessage. */
function minimalState(overrides: Record<string, unknown> = {}) {
  return {
    roomId: 'ABCDE',
    size: 3,
    board: [
      ['', '', ''],
      ['б', 'а', 'л'],
      ['', '', ''],
    ],
    players: [
      { name: 'A', score: 0, connected: true },
      { name: 'B', score: 0, connected: true },
    ],
    currentPlayer: 0,
    status: 'playing',
    history: [],
    winner: null,
    endReason: null,
    turnDeadline: null,
    you: 0,
    ...overrides,
  };
}

describe('parseServerMessage', () => {
  it('разбирает state', () => {
    const raw = JSON.stringify({ type: 'state', state: minimalState() });
    const msg = parseServerMessage(raw);
    expect(msg).not.toBeNull();
    if (msg === null) return;
    expect(msg.type).toBe('state');
    if (msg.type === 'state') {
      expect(msg.state.roomId).toBe('ABCDE');
      expect(msg.state.size).toBe(3);
    }
  });

  it('отбрасывает state без board/players', () => {
    const raw = JSON.stringify({ type: 'state', state: { roomId: 'ABCDE', you: 0 } });
    expect(parseServerMessage(raw)).toBeNull();
  });

  it('отбрасывает мусор', () => {
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage('{"type":"hack"}')).toBeNull();
    expect(parseServerMessage('42')).toBeNull();
  });
});
