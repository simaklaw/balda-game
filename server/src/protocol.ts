import type {
  CellPos,
  EndReason,
  GameStatus,
  MoveHistoryEntry,
} from '@balda/shared';

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

export type ClientMessage =
  | { type: 'quick-match'; name: string }
  | { type: 'create-room'; name: string }
  | { type: 'join-room'; name: string; roomId: string }
  | { type: 'move'; path: CellPos[]; cell: CellPos; letter: string }
  | { type: 'pass' }
  | { type: 'reconnect'; roomId: string; playerId: string; token: string }
  | { type: 'leave' };

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
    };

const CLIENT_TYPES: ReadonlySet<string> = new Set([
  'quick-match',
  'create-room',
  'join-room',
  'move',
  'pass',
  'reconnect',
  'leave',
]);

/** Разбор входящего сообщения; возвращает null для мусора. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const type = (data as { type?: unknown }).type;
  if (typeof type !== 'string' || !CLIENT_TYPES.has(type)) return null;
  return data as ClientMessage;
}
