import type {
  CellPos,
  EndReason,
  GameStatus,
  MoveHistoryEntry,
} from '@balda/shared';

/** Зеркало серверного протокола (server/src/protocol.ts). */

export interface RoomState {
  roomId: string;
  size: number;
  board: string[][];
  players: { name: string; score: number; connected: boolean }[];
  currentPlayer: number;
  /** 'waiting' — ждём второго игрока, иначе статус партии. */
  status: GameStatus | 'waiting';
  history: MoveHistoryEntry[];
  winner: number | null;
  endReason: EndReason;
  turnDeadline: number | null;
  you: number;
}

/** Публичный профиль игрока (без приватных данных). */
export interface PlayerProfile {
  rating: number;
  chips: number;
  games: number;
  wins: number;
}

export type ClientMessage =
  | { type: 'quick-match'; name: string }
  | { type: 'create-room'; name: string }
  | { type: 'join-room'; name: string; roomId: string }
  | { type: 'move'; path: CellPos[]; cell: CellPos; letter: string }
  | { type: 'pass' }
  | { type: 'reconnect'; roomId: string; playerId: string; token: string }
  | { type: 'leave' }
  | { type: 'profile'; name: string };

export type ServerMessage =
  | {
      type: 'joined';
      roomId: string;
      playerId: string;
      token: string;
      you: number;
      state: RoomState;
    }
  | { type: 'state'; state: RoomState }
  | { type: 'error'; message: string }
  | {
      type: 'game-over';
      winner: number | null;
      scores: number[];
      reason: EndReason;
      deltaRating: number[];
      deltaChips: number[];
    }
  | { type: 'profile'; name: string; profile: PlayerProfile | null };

const SERVER_TYPES: ReadonlySet<string> = new Set([
  'joined',
  'state',
  'error',
  'game-over',
  'profile',
]);

/** Разбор сообщения сервера; возвращает null для мусора. */
export function parseServerMessage(raw: string): ServerMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const type = (data as { type?: unknown }).type;
  if (typeof type !== 'string' || !SERVER_TYPES.has(type)) return null;
  return data as ServerMessage;
}
