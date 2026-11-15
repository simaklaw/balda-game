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

describe('parseServerMessage', () => {
  it('разбирает state', () => {
    const raw = JSON.stringify({ type: 'state', state: { roomId: 'ABCDE', you: 0 } });
    const msg = parseServerMessage(raw);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe('state');
  });

  it('отбрасывает мусор', () => {
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage('{"type":"hack"}')).toBeNull();
    expect(parseServerMessage('42')).toBeNull();
  });
});
