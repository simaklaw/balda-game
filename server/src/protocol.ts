import type {
  CellPos,
  EndReason,
  GameStatus,
  MoveHistoryEntry,
} from '@balda/shared';
import { isCyrillicLetter } from '@balda/shared';

/** Снимок состояния комнаты, отправляемый клиентам. */
export interface RoomState {
  roomId: string;
  /** Размер поля N×N. */
  size: number;
  /** Буквы поля, '' — пустая клетка. */
  board: string[][];
  players: { name: string; score: number; connected: boolean }[];
  currentPlayer: number;
  /** 'waiting' — ждём второго игрока, иначе статус партии. */
  status: GameStatus | 'waiting';
  history: MoveHistoryEntry[];
  winner: number | null;
  endReason: EndReason;
  /** Timestamp (мс), до которого текущий игрок обязан сделать ход. */
  turnDeadline: number | null;
  /** Индекс игрока-получателя снимка. */
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

const CLIENT_TYPES: ReadonlySet<string> = new Set([
  'quick-match',
  'create-room',
  'join-room',
  'move',
  'pass',
  'reconnect',
  'leave',
  'profile',
]);

const MAX_BOARD = 7;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v);

const isCellPos = (v: unknown): v is CellPos =>
  isObj(v) &&
  isInt(v.row) && v.row >= 0 && v.row < MAX_BOARD &&
  isInt(v.col) && v.col >= 0 && v.col < MAX_BOARD;

/** Имя: непустая строка разумной длины (сервер дополнительно обрежет до 24). */
const isName = (v: unknown): v is string =>
  isStr(v) && v.trim().length > 0 && v.length <= 64;

const isRoomId = (v: unknown): v is string => isStr(v) && v.length >= 1 && v.length <= 32;

const isPath = (v: unknown): v is CellPos[] =>
  Array.isArray(v) && v.length >= 1 && v.length <= 49 && v.every(isCellPos);

const isLetter = (v: unknown): v is string =>
  isStr(v) && [...v].length === 1 && isCyrillicLetter(v);

/**
 * Строгий разбор входящего сообщения: проверяются тип и все поля.
 * Возвращает null для любого мусора — сервер никогда не приводит
 * непроверенные данные к типу на веру.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(data)) return null;
  const type = data.type;
  if (!isStr(type) || !CLIENT_TYPES.has(type)) return null;

  switch (type) {
    case 'quick-match':
    case 'create-room':
      return isName(data.name) ? { type, name: data.name } : null;
    case 'join-room':
      return isName(data.name) && isRoomId(data.roomId)
        ? { type: 'join-room', name: data.name, roomId: data.roomId }
        : null;
    case 'move':
      return isPath(data.path) && isCellPos(data.cell) && isLetter(data.letter)
        ? { type: 'move', path: data.path, cell: data.cell, letter: data.letter }
        : null;
    case 'pass':
      return { type: 'pass' };
    case 'reconnect':
      return isRoomId(data.roomId) && isStr(data.playerId) && isStr(data.token) && data.token.length <= 64
        ? { type: 'reconnect', roomId: data.roomId, playerId: data.playerId, token: data.token }
        : null;
    case 'leave':
      return { type: 'leave' };
    case 'profile':
      return isName(data.name) ? { type: 'profile', name: data.name } : null;
    default:
      return null;
  }
}
