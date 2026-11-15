/**
 * Адрес WebSocket-сервера:
 * явный override (window.BALDA_WS_URL / localStorage) → иначе тот же хост.
 */
export function resolveWsUrl(protocol: string, host: string, override: string | null): string {
  const clean = override?.trim() ?? '';
  if (clean !== '') return clean;
  const secure = protocol === 'https:' || protocol === 'wss:';
  return (secure ? 'wss://' : 'ws://') + host + '/ws';
}

/** Override адреса из окружения страницы (для тестов и самостоятельного деплоя). */
export function detectWsOverride(): string | null {
  try {
    const global = window as { BALDA_WS_URL?: unknown };
    if (typeof global.BALDA_WS_URL === 'string' && global.BALDA_WS_URL !== '') {
      return global.BALDA_WS_URL;
    }
    const saved = localStorage.getItem('balda.ws');
    if (saved !== null && saved.trim() !== '') return saved;
  } catch {
    /* не браузерное окружение */
  }
  return null;
}
