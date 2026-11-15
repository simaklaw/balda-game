import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHIPS_PER_WIN } from './elo';

/** Стартовый рейтинг, если игрок в хранилище не найден. */
export const START_RATING = 1000;

/** Профиль игрока: рейтинг Эло, фишки и статистика партий. */
export interface PlayerRecord {
  rating: number;
  chips: number;
  games: number;
  wins: number;
}

/** Ключ игрока: регистр и пробелы не различаются, длина ограничена. */
export function nameKey(name: string): string {
  return name.trim().slice(0, 24).toLowerCase();
}

function emptyRecord(): PlayerRecord {
  return { rating: START_RATING, chips: 0, games: 0, wins: 0 };
}

function isRecord(value: unknown): value is PlayerRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.rating === 'number' && Number.isFinite(v.rating) &&
    typeof v.chips === 'number' && Number.isFinite(v.chips) &&
    typeof v.games === 'number' && Number.isFinite(v.games) &&
    typeof v.wins === 'number' && Number.isFinite(v.wins)
  );
}

/**
 * Файловое хранилище профилей игроков (JSON, без БД).
 * Читается один раз при старте, каждая запись — атомарная
 * (tmp-файл + rename), поэтому сбой питания не портит файл.
 * Профиль меняется редко (раз в партию), так что синхронной
 * записи на диск достаточно. Старый формат (число = рейтинг)
 * мигрирует автоматически.
 */
export class PlayerStore {
  private players = new Map<string, PlayerRecord>();

  constructor(private readonly path: string) {}

  /** Загрузить файл; повреждённый или отсутствующий — начинаем с пустой карты. */
  load(): void {
    this.players.clear();
    try {
      if (!existsSync(this.path)) return;
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return;
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          // Старый формат RatingStore: число = рейтинг.
          this.players.set(key, { ...emptyRecord(), rating: Math.round(value) });
        } else if (isRecord(value)) {
          this.players.set(key, {
            rating: Math.round(value.rating),
            chips: Math.max(0, Math.round(value.chips)),
            games: Math.max(0, Math.round(value.games)),
            wins: Math.max(0, Math.round(value.wins)),
          });
        }
      }
    } catch {
      /* битый файл — не валим сервер, начинаем с пустой карты */
      this.players.clear();
    }
  }

  /** Профиль игрока или null, если он ещё не играл. */
  get(name: string): PlayerRecord | null {
    return this.players.get(nameKey(name)) ?? null;
  }

  /**
   * Записать результат завершённой партии: новый рейтинг Эло,
   * +1 партия, за победу — +1 победа и +CHIPS_PER_WIN фишек.
   */
  applyResult(name: string, newRating: number, won: boolean): void {
    const key = nameKey(name);
    const rec = this.players.get(key) ?? emptyRecord();
    rec.rating = Math.round(newRating);
    rec.games += 1;
    if (won) {
      rec.wins += 1;
      rec.chips += CHIPS_PER_WIN;
    }
    this.players.set(key, rec);
    this.flush();
  }

  get size(): number {
    return this.players.size;
  }

  /** Атомарная запись на диск: tmp-файл + rename. */
  flush(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = this.path + '.tmp';
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.players), null, 2) + '\n', 'utf8');
      renameSync(tmp, this.path);
    } catch {
      /* диск недоступен — профили живут в памяти до следующей записи */
    }
  }

  /** Сбросить на диск при остановке сервера. */
  dispose(): void {
    this.flush();
  }
}
