/**
 * Простой rate-limiter с фиксированным окном, без внешних зависимостей.
 * Применяется к HTTP-эндпоинтам (/health, /metrics) — дешёвая защита от
 * сканирования и DDoS. Чистый модуль: время инъецируется, покрыт тестами.
 */

export interface RateLimiterOptions {
  /** Максимум запросов за окно на один ключ (обычно IP). */
  limit: number;
  /** Длина окна, мс. */
  windowMs: number;
  /** Источник времени (тесты); по умолчанию Date.now. */
  now?: () => number;
}

export interface RateLimiter {
  /** Разрешён ли запрос для ключа. */
  allow(key: string): boolean;
  /** Число отслеживаемых ключей (для тестов и метрик). */
  size(): number;
}

interface Window {
  start: number;
  count: number;
}

/** Выше этого числа ключей просроченные окна вычищаются принудительно. */
const MAX_TRACKED_KEYS = 10_000;

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now = options.now ?? Date.now;
  const windows = new Map<string, Window>();

  return {
    allow(key: string): boolean {
      const t = now();
      const current = windows.get(key);
      if (current === undefined || t - current.start >= options.windowMs) {
        windows.set(key, { start: t, count: 1 });
        if (windows.size > MAX_TRACKED_KEYS) {
          // Много одноразовых ключей (сканер со spoofing-IP):
          // выкидываем просроченные окна, чтобы карта не росла бесконечно.
          for (const [k, win] of windows) {
            if (t - win.start >= options.windowMs) windows.delete(k);
          }
        }
        return true;
      }
      current.count += 1;
      return current.count <= options.limit;
    },
    size(): number {
      return windows.size;
    },
  };
}
