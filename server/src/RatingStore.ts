import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Стартовый рейтинг, если игрок в хранилище не найден. */
export const START_RATING = 1000;

/** Ключ игрока: регистр и пробелы не различаются, длина ограничена. */
export function nameKey(name: string): string {
  return name.trim().slice(0, 24).toLowerCase();
}

/**
 * Файловое хранилище рейтингов (JSON, без БД).
 * Читается один раз при старте, каждая запись — атомарная
 * (tmp-файл + rename), поэтому сбой питания не портит файл.
 * Рейтинги меняются редко (раз в партию), так что синхронной
 * записи на диск достаточно.
 */
export class RatingStore {
  private ratings = new Map<string, number>();

  constructor(private readonly path: string) {}

  /** Загрузить файл; повреждённый или отсутствующий — начинаем с пустой карты. */
  load(): void {
    this.ratings.clear();
    try {
      if (!existsSync(this.path)) return;
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return;
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          this.ratings.set(key, Math.round(value));
        }
      }
    } catch {
      /* битый файл — не валим сервер, начинаем с пустой карты */
      this.ratings.clear();
    }
  }

  /** Рейтинг игрока или null, если он ещё не играл. */
  get(name: string): number | null {
    return this.ratings.get(nameKey(name)) ?? null;
  }

  /** Сохранить рейтинг игрока (сразу пишет на диск). */
  set(name: string, rating: number): void {
    this.ratings.set(nameKey(name), Math.round(rating));
    this.flush();
  }

  get size(): number {
    return this.ratings.size;
  }

  /** Атомарная запись на диск: tmp-файл + rename. */
  flush(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = this.path + '.tmp';
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.ratings), null, 2) + '\n', 'utf8');
      renameSync(tmp, this.path);
    } catch {
      /* диск недоступен — рейтинги живут в памяти до следующей записи */
    }
  }

  /** Сбросить на диск при остановке сервера. */
  dispose(): void {
    this.flush();
  }
}
