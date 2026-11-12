import type { PlatformAdapter, PlatformId } from './types';
import { WebAdapter } from './web';
import { loadYandexSdk, YandexAdapter } from './yandex';

export type { PlatformAdapter, PlatformId, PlatformStorage } from './types';

/** Минимальный интервал между межстраничными рекламами. */
export const AD_MIN_INTERVAL_MS = 180000;

/** Определяет платформу по URL и user-agent (чистая функция, покрыта тестами). */
export function detectPlatform(rawUrl: string, userAgent: string): PlatformId {
  const url = rawUrl.toLowerCase();
  const ua = userAgent.toLowerCase();
  if (url.includes('yandex') || url.includes('ysdk') || url.includes('ya.ru')) return 'yandex';
  if (ua.includes('yandex') || ua.includes('yaapp')) return 'yandex';
  return 'web';
}

/** Разрешает межстраничную рекламу не чаще, чем раз в minIntervalMs. */
export function shouldShowInterstitial(
  lastShownAt: number,
  now: number,
  minIntervalMs: number = AD_MIN_INTERVAL_MS,
): boolean {
  return lastShownAt <= 0 || now - lastShownAt >= minIntervalMs;
}

/** Создаёт адаптер платформы: Яндекс Игры при их окружении, иначе просто веб. */
export async function createAdapter(): Promise<PlatformAdapter> {
  let hint: PlatformId = 'web';
  try {
    hint = detectPlatform(window.location.href, navigator.userAgent);
  } catch {
    hint = 'web';
  }
  if (hint === 'yandex') {
    const sdk = await loadYandexSdk();
    if (sdk !== null) return new YandexAdapter(sdk);
  }
  return new WebAdapter();
}
