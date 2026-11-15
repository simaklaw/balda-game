import { DEFAULT_CONFIG, Game } from '@balda/shared';
import type { Dawg, GameConfig, MoveErrorCode, MoveInput } from '@balda/shared';
import type { RoomState, ServerMessage } from './protocol';

/** Окно переподключения по умолчанию, мс. */
export const RECONNECT_MS = 45_000;
/** Длительность хода по умолчанию, мс. */
export const TURN_MS = 120_000;

/** Стартовые слова по размеру поля (длина = размеру). */
const INITIAL_WORDS: Record<number, string> = { 3: 'бал', 5: 'слово', 7: 'чемодан' };

/** Тексты ошибок хода для игрока. */
const ERROR_TEXT: Record<MoveErrorCode, string> = {
  INVALID_LETTER: 'Некорректная буква',
  OUT_OF_BOUNDS: 'Клетка вне поля',
  CELL_OCCUPIED: 'Клетка занята',
  NO_NEIGHBOR_LETTERS: 'Рядом с новой клеткой нет букв',
  PATH_EMPTY: 'Путь пуст',
  PATH_OUT_OF_BOUNDS: 'Путь выходит за поле',
  PATH_REVISITS_CELL: 'Путь повторяет клетку',
  PATH_MISSING_NEW_CELL: 'Слово должно проходить через новую букву',
  PATH_EMPTY_CELL: 'В пути есть пустая клетка',
  PATH_NOT_CONTIGUOUS: 'Путь не непрерывный',
  WORD_TOO_SHORT: 'Слишком короткое слово',
  WORD_UNKNOWN: 'Слова нет в словаре',
  WORD_ALREADY_USED: 'Слово уже использовано',
  NOT_PLAYERS_TURN: 'Сейчас не ваш ход',
  GAME_FINISHED: 'Партия завершена',
};

/** Минимальный интерфейс соединения игрока (WebSocket оборачивается в index.ts). */
export interface PlayerConnection {
  send(msg: ServerMessage): void;
}

interface Slot {
  id: string;
  name: string;
  /** Секрет сессии: reconnect принимается только с ним (защита от угона слота). */
  token: string;
  conn: PlayerConnection | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

export interface RoomOptions {
  id: string;
  dawg: Dawg;
  config?: GameConfig;
  /** 0 — отключить таймер хода (для тестов). */
  turnMs?: number;
  /** 0 — отключить окно реконнекта (для тестов). */
  reconnectMs?: number;
  /** Партия завершилась. */
  onFinished?: (room: Room) => void;
  /** Комната опустела (все отключились до старта). */
  onEmpty?: (room: Room) => void;
}

function sanitizeName(name: string, index: number): string {
  const clean = name.trim().slice(0, 24);
  return clean.length > 0 ? clean : 'Игрок ' + (index + 1);
}

/**
 * Комната на двух игроков: authoritative-обёртка над Game из shared/.
 * Клиент присылает только путь, клетку и букву — слово собирает и валидирует сервер.
 */
export class Room {
  readonly id: string;
  private game: Game;
  private slots: (Slot | null)[] = [null, null];
  private turnMs: number;
  private reconnectMs: number;
  private onFinished?: (room: Room) => void;
  private onEmpty?: (room: Room) => void;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private turnDeadline: number | null = null;

  constructor(options: RoomOptions) {
    this.id = options.id;
    this.turnMs = options.turnMs ?? TURN_MS;
    this.reconnectMs = options.reconnectMs ?? RECONNECT_MS;
    this.onFinished = options.onFinished;
    this.onEmpty = options.onEmpty;
    const config = options.config ?? DEFAULT_CONFIG;
    const initialWord = INITIAL_WORDS[config.boardSize] ?? 'слово';
    this.game = new Game(options.dawg, config, initialWord);
  }

  get isFull(): boolean {
    return this.slots.every((s) => s !== null);
  }

  get isFinished(): boolean {
    return this.game.status === 'finished';
  }

  get playerCount(): number {
    return this.slots.filter((s) => s !== null).length;
  }

  /** Посадить игрока в свободный слот. Бросает, если комната заполнена. */
  addPlayer(conn: PlayerConnection, name: string): { playerId: string; token: string; index: number } {
    const index = this.slots.findIndex((s) => s === null);
    if (index === -1) throw new Error('Комната заполнена');
    const slot: Slot = {
      id: crypto.randomUUID(),
      name: sanitizeName(name, index),
      token: crypto.randomUUID(),
      conn,
      reconnectTimer: null,
    };
    this.slots[index] = slot;
    if (this.isFull) this.armTurnTimer();
    this.broadcastState();
    return { playerId: slot.id, token: slot.token, index };
  }

  /**
   * Вернуть игрока в слот по playerId и секрет-токену.
   * Возвращает индекс слота или null, если данные неверны.
   */
  reconnect(playerId: string, token: string, conn: PlayerConnection): number | null {
    const index = this.slots.findIndex((s) => s !== null && s.id === playerId);
    if (index === -1) return null;
    const slot = this.slots[index]!;
    if (slot.token !== token) return null;
    if (slot.reconnectTimer !== null) {
      clearTimeout(slot.reconnectTimer);
      slot.reconnectTimer = null;
    }
    slot.conn = conn;
    if (this.isFinished) {
      conn.send({ type: 'game-over', winner: this.game.winner, scores: this.scores(), reason: this.game.endReason });
    }
    this.broadcastState();
    return index;
  }

  /** Соединение разорвано. До старта — освобождаем слот, в игре — ждём окно реконнекта. */
  handleDisconnect(conn: PlayerConnection): void {
    const index = this.slots.findIndex((s) => s !== null && s.conn === conn);
    if (index === -1) return;
    const slot = this.slots[index]!;
    slot.conn = null;
    if (!this.isFull || this.isFinished) {
      this.removeSlot(index);
      this.broadcastState();
      return;
    }
    if (slot.reconnectTimer !== null) clearTimeout(slot.reconnectTimer);
    slot.reconnectTimer = setTimeout(() => {
      slot.reconnectTimer = null;
      if (slot.conn === null && !this.isFinished) {
        this.game.declareTimeout(index);
        this.handleFinished();
      }
    }, this.reconnectMs);
    this.broadcastState();
  }

  /** Ход игрока: валидирует ядро shared, при успехе обновляет состояние. */
  move(playerId: string, move: MoveInput): void {
    const index = this.indexOfPlayer(playerId);
    const slot = this.slots[index] ?? null;
    if (index === -1 || slot === null || slot.conn === null) {
      return;
    }
    if (!this.isFull) {
      slot.conn.send({ type: 'error', message: 'Ожидание второго игрока' });
      return;
    }
    const result = this.game.submitMove({ ...move, player: index });
    if (!result.ok) {
      slot.conn.send({ type: 'error', message: ERROR_TEXT[result.error ?? 'GAME_FINISHED'] });
      return;
    }
    if (this.isFinished) {
      this.handleFinished();
    } else {
      this.armTurnTimer();
      this.broadcastState();
    }
  }

  /** Пропуск хода. */
  pass(playerId: string): void {
    const index = this.indexOfPlayer(playerId);
    if (index === -1) return;
    const slot = this.slots[index]!;
    if (!this.isFull) {
      slot.conn?.send({ type: 'error', message: 'Ожидание второго игрока' });
      return;
    }
    const result = this.game.pass(index);
    if (!result.ok) {
      slot.conn?.send({ type: 'error', message: ERROR_TEXT[result.error ?? 'GAME_FINISHED'] });
      return;
    }
    if (this.isFinished) {
      this.handleFinished();
    } else {
      this.armTurnTimer();
      this.broadcastState();
    }
  }

  /** Игрок покинул партию — техпоражение, если партия шла. */
  leave(playerId: string): void {
    const index = this.indexOfPlayer(playerId);
    if (index === -1) return;
    if (this.isFull && !this.isFinished) {
      this.game.declareTimeout(index);
      this.handleFinished();
    }
    this.removeSlot(index);
    this.broadcastState();
  }

  /** Снимок состояния с точки зрения игрока you. */
  stateFor(you: number): RoomState {
    const size = this.game.board.size;
    const board: string[][] = [];
    for (let r = 0; r < size; r++) {
      const row: string[] = [];
      for (let c = 0; c < size; c++) row.push(this.game.board.get(r, c));
      board.push(row);
    }
    return {
      roomId: this.id,
      size,
      board,
      players: this.slots.map((s, i) => ({
        name: s === null ? 'Игрок ' + (i + 1) : s.name,
        score: this.game.players[i]?.score ?? 0,
        connected: s !== null && s.conn !== null,
      })),
      currentPlayer: this.game.currentPlayer,
      status: this.game.status,
      history: [...this.game.history],
      winner: this.game.winner,
      endReason: this.game.endReason,
      turnDeadline: this.turnDeadline,
      you,
    };
  }

  /** Остановить все таймеры (при удалении комнаты). */
  dispose(): void {
    this.clearTurnTimer();
    for (const slot of this.slots) {
      if (slot?.reconnectTimer !== null && slot?.reconnectTimer !== undefined) {
        clearTimeout(slot.reconnectTimer);
        slot.reconnectTimer = null;
      }
    }
  }

  private scores(): number[] {
    return this.game.players.map((p) => p.score);
  }

  private indexOfPlayer(playerId: string): number {
    return this.slots.findIndex((s) => s !== null && s.id === playerId);
  }

  private removeSlot(index: number): void {
    const slot = this.slots[index];
    if (slot === null) return;
    if (slot.reconnectTimer !== null) {
      clearTimeout(slot.reconnectTimer);
      slot.reconnectTimer = null;
    }
    this.slots[index] = null;
    if (this.playerCount === 0) this.onEmpty?.(this);
  }

  private armTurnTimer(): void {
    this.clearTurnTimer();
    if (this.turnMs <= 0 || this.isFinished || !this.isFull) return;
    this.turnDeadline = Date.now() + this.turnMs;
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      this.turnDeadline = null;
      if (this.isFinished || !this.isFull) return;
      this.game.pass(this.game.currentPlayer);
      if (this.isFinished) {
        this.handleFinished();
      } else {
        this.armTurnTimer();
        this.broadcastState();
      }
    }, this.turnMs);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer !== null) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.turnDeadline = null;
  }

  private handleFinished(): void {
    this.clearTurnTimer();
    for (const slot of this.slots) {
      if (slot?.reconnectTimer !== null && slot?.reconnectTimer !== undefined) {
        clearTimeout(slot.reconnectTimer);
        slot.reconnectTimer = null;
      }
    }
    this.broadcastState();
    const scores = this.scores();
    for (const slot of this.slots) {
      slot?.conn?.send({
        type: 'game-over',
        winner: this.game.winner,
        scores,
        reason: this.game.endReason,
      });
    }
    this.onFinished?.(this);
  }

  private broadcastState(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      slot?.conn?.send({ type: 'state', state: this.stateFor(i) });
    }
  }
}
