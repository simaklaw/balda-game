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

export type AuthProvider = 'vk' | 'ok' | 'telegram' | 'yandex' | 'guest';

export type ClientMessage =
  | {
      type: 'auth';
      provider: AuthProvider;
      name: string;
      externalId?: string;
      proof?: string;
      accountId?: string;
      secret?: string;
    }
  | { type: 'quick-match'; name: string }
  | { type: 'create-room'; name: string }
  | { type: 'join-room'; name: string; roomId: string }
  | { type: 'move'; path: CellPos[]; cell: CellPos; letter: string }
  | { type: 'pass' }
  | { type: 'reconnect'; roomId: string; playerId: string; token: string }
  | { type: 'leave' }
  | { type: 'profile'; name?: string };

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
  | { type: 'profile'; name: string; profile: PlayerProfile | null }
  | {
      type: 'auth-ok';
      accountId: string;
      secret?: string;
      name: string;
      profile: PlayerProfile;
    }
  | { type: 'auth-failed'; message: string };

const SERVER_TYPES: ReadonlySet<string> = new Set([
  'joined',
  'state',
  'error',
  'game-over',
  'profile',
  'auth-ok',
  'auth-failed',
]);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/** board — квадратный массив строк; players — 2 слота с числами. */
function isRoomState(v: unknown): v is RoomState {
  if (!isObj(v)) return false;
  if (!isStr(v.roomId) || !isInt(v.size) || v.size < 3 || v.size > 7) return false;
  if (!Array.isArray(v.board) || v.board.length !== v.size) return false;
  for (const row of v.board) {
    if (!Array.isArray(row) || row.length !== v.size) return false;
    if (!row.every((c) => isStr(c))) return false;
  }
  if (!Array.isArray(v.players) || v.players.length !== 2) return false;
  for (const pl of v.players) {
    if (!isObj(pl) || !isStr(pl.name) || !isNum(pl.score) || !isBool(pl.connected)) return false;
  }
  if (!isInt(v.currentPlayer) || !isStr(v.status)) return false;
  if (!Array.isArray(v.history)) return false;
  if (v.winner !== null && !isInt(v.winner)) return false;
  if (v.turnDeadline !== null && !isNum(v.turnDeadline)) return false;
  if (!isInt(v.you)) return false;
  return true;
}

function isNumArray(v: unknown, len: number): v is number[] {
  return Array.isArray(v) && v.length === len && v.every(isNum);
}

function isPlayerProfile(v: unknown): v is PlayerProfile {
  return (
    isObj(v) &&
    isNum(v.rating) &&
    isNum(v.chips) &&
    isNum(v.games) &&
    isNum(v.wins)
  );
}

/**
 * Разбор сообщения сервера.
 * Проверяет type и структуру state / scores — битое сообщение не уронит сцену.
 */
export function parseServerMessage(raw: string): ServerMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(data)) return null;
  const type = data.type;
  if (!isStr(type) || !SERVER_TYPES.has(type)) return null;

  switch (type) {
    case 'joined':
      return isStr(data.roomId) &&
        isStr(data.playerId) &&
        isStr(data.token) &&
        isInt(data.you) &&
        isRoomState(data.state)
        ? {
            type: 'joined',
            roomId: data.roomId,
            playerId: data.playerId,
            token: data.token,
            you: data.you,
            state: data.state,
          }
        : null;
    case 'state':
      return isRoomState(data.state) ? { type: 'state', state: data.state } : null;
    case 'error':
      return isStr(data.message) ? { type: 'error', message: data.message } : null;
    case 'game-over':
      return (data.winner === null || isInt(data.winner)) &&
        isNumArray(data.scores, 2) &&
        isStr(data.reason) &&
        isNumArray(data.deltaRating, 2) &&
        isNumArray(data.deltaChips, 2)
        ? {
            type: 'game-over',
            winner: data.winner as number | null,
            scores: data.scores,
            reason: data.reason as EndReason,
            deltaRating: data.deltaRating,
            deltaChips: data.deltaChips,
          }
        : null;
    case 'profile':
      return isStr(data.name)
        ? {
            type: 'profile',
            name: data.name,
            profile: isPlayerProfile(data.profile) ? data.profile : null,
          }
        : null;
    case 'auth-ok':
      return isStr(data.accountId) && isStr(data.name) && isPlayerProfile(data.profile)
        ? {
            type: 'auth-ok',
            accountId: data.accountId,
            secret: isStr(data.secret) ? data.secret : undefined,
            name: data.name,
            profile: data.profile,
          }
        : null;
    case 'auth-failed':
      return isStr(data.message) ? { type: 'auth-failed', message: data.message } : null;
    default:
      return null;
  }
}
