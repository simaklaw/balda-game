import type { Dawg, GameConfig } from '@balda/shared';
import { Room } from './Room';
import type { PlayerConnection, RoomOptions } from './Room';
import type { PlayerRecord, PlayerStore } from './PlayerStore';

/** Код комнаты: только буквы без путаницы (ввод с canvas-клавиатуры). */
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ID_LENGTH = 5;
/** Сколько времени после завершения партии комната остаётся в памяти. */
const FINISHED_ROOM_TTL_MS = 60_000;
/** Стартовый рейтинг, если игрок ещё неизвестен. */
const START_RATING = 1000;

export interface MatchmakerOptions {
  config?: GameConfig;
  turnMs?: number;
  reconnectMs?: number;
  /** Постоянное хранилище профилей; без него рейтинг живёт в памяти. */
  players?: PlayerStore;
}

export interface JoinResult {
  room: Room;
  playerId: string;
  token: string;
  index: number;
}

/** Быстрый матч и приватные комнаты по коду; профиль по имени игрока. */
export class Matchmaker {
  private dawg: Dawg;
  private options: MatchmakerOptions;
  private rooms = new Map<string, Room>();
  private waiting: Room | null = null;
  private ratings = new Map<string, number>();

  constructor(dawg: Dawg, options: MatchmakerOptions = {}) {
    this.dawg = dawg;
    this.options = options;
  }

  /** Быстрый матч: садит в ожидающую комнату или создаёт новую. */
  quickMatch(conn: PlayerConnection, name: string): JoinResult {
    if (this.waiting === null || this.waiting.isFull || this.waiting.isFinished) {
      this.waiting = this.createRoomObject();
    }
    const room = this.waiting;
    const res = room.addPlayer(conn, name, this.ratingFor(name));
    return { room, ...res };
  }

  /** Приватная комната по коду: создаёт и сажает автора. */
  createRoom(conn: PlayerConnection, name: string): JoinResult {
    const room = this.createRoomObject();
    const res = room.addPlayer(conn, name, this.ratingFor(name));
    return { room, ...res };
  }

  /** Вход в приватную комнату по коду. */
  joinRoom(roomId: string, conn: PlayerConnection, name: string): JoinResult | null {
    const room = this.rooms.get(roomId.trim().toUpperCase());
    if (!room || room.isFull || room.isFinished) return null;
    const res = room.addPlayer(conn, name, this.ratingFor(name));
    return { room, ...res };
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId.trim().toUpperCase());
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  /** Запомненный рейтинг игрока по имени. */
  getRating(name: string): number {
    return this.ratingFor(name);
  }

  /** Профиль игрока по имени (null — игрок ещё не играл). */
  getProfile(name: string): PlayerRecord | null {
    return this.options.players?.get(name) ?? null;
  }

  /** Остановить все таймеры всех комнат (для тестов и graceful shutdown). */
  dispose(): void {
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
    this.waiting = null;
  }

  private ratingFor(name: string): number {
    return this.options.players?.get(name)?.rating ?? this.ratings.get(nameKey(name)) ?? START_RATING;
  }

  private createRoomObject(): Room {
    const id = this.newId();
    const options: RoomOptions = {
      id,
      dawg: this.dawg,
      config: this.options.config,
      turnMs: this.options.turnMs,
      reconnectMs: this.options.reconnectMs,
      onFinished: (room) => {
        this.applyRatings(room);
        if (this.waiting?.id === room.id) this.waiting = null;
        setTimeout(() => {
          room.dispose();
          this.rooms.delete(room.id);
        }, FINISHED_ROOM_TTL_MS);
      },
      onEmpty: (room) => {
        room.dispose();
        this.rooms.delete(room.id);
        if (this.waiting?.id === room.id) this.waiting = null;
      },
    };
    const room = new Room(options);
    this.rooms.set(id, room);
    return room;
  }

  /** Сохранить результаты игроков завершившейся партии. */
  private applyRatings(room: Room): void {
    const outcome = room.lastOutcome;
    if (outcome === null) return;
    const names = room.names;
    const winner = room.winnerIndex;
    const store = this.options.players;
    if (store !== undefined) {
      for (let i = 0; i < names.length && i < outcome.newRatings.length; i++) {
        const name = names[i]!;
        if (name !== '') store.applyResult(name, outcome.newRatings[i]!, winner === i);
      }
      return;
    }
    for (let i = 0; i < names.length && i < outcome.newRatings.length; i++) {
      const name = names[i]!;
      if (name !== '') this.ratings.set(nameKey(name), outcome.newRatings[i]!);
    }
  }

  private newId(): string {
    let out = '';
    for (let i = 0; i < ID_LENGTH; i++) {
      out += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    }
    return out;
  }
}

function nameKey(name: string): string {
  return name.trim().slice(0, 24).toLowerCase();
}
