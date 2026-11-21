import type { PlatformAdapter, PlatformId, PlatformProfile } from './types';
import { WebAdapter } from './web';
import { loadYandexSdk, YandexAdapter } from './yandex';
import { VKAdapter } from './vk';
import type { VkBridgeApi } from './vk';
import { TelegramAdapter, getTelegramWebApp } from './telegram';

export type {
  LeaderboardRow,
  PlatformAdapter,
  PlatformId,
  PlatformLeaderboards,
  PlatformProfile,
  PlatformSocial,
  PlatformStorage,
} from './types';
export { buildInviteLink, parseLaunchRoom } from './social';

/** Минимальный интервал между межстраничными рекламами. */
export const AD_MIN_INTERVAL_MS = 180000;

/** Определяет платформу по URL и user-agent (чистая функция, покрыта тестами). */
export function detectPlatform(rawUrl: string, userAgent: string): PlatformId {
  const url = rawUrl.toLowerCase();
  const ua = userAgent.toLowerCase();
  if (url.includes('yandex') || url.includes('ysdk') || url.includes('ya.ru')) return 'yandex';
  if (ua.includes('yandex') || ua.includes('yaapp')) return 'yandex';
  // VK Mini Apps: iframe-запуск содержит vk_app_id, обычные ссылки — vk.com/vk.ru.
  if (url.includes('vk_app_id') || url.includes('vk.com') || url.includes('vk.ru')) return 'vk';
  // Одноклассники: новые игры публикуются только через VK Mini Apps,
  // поэтому запуск с ok.ru обслуживает тот же VK-адаптер (vk-bridge).
  if (url.includes('ok.ru')) return 'vk';
  // Telegram Mini Apps: запуск через t.me или параметры tgWebApp* в URL/хэше.
  if (url.includes('t.me') || url.includes('telegram') || url.includes('tgwebapp')) return 'telegram';
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

/** Создаёт адаптер платформы; при любом сбое молча откатываемся на веб. */
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
  if (hint === 'vk') {
    try {
      // Динамический импорт: vk-bridge попадает в отдельный чанк и грузится
      // только внутри VK/OK.
      const mod = await import('@vkontakte/vk-bridge');
      return new VKAdapter(mod.default as unknown as VkBridgeApi);
    } catch {
      /* фолбэк на веб */
    }
  }
  if (hint === 'telegram') {
    // WebApp уже создан скриптом telegram-web-app.js в index.html.
    const webApp = getTelegramWebApp();
    if (webApp !== null) return new TelegramAdapter(webApp);
  }
  return new WebAdapter();
}

/** Профиль игрока: из адаптера, иначе из имени, иначе null. Никогда не бросает. */
export async function fetchProfile(adapter: PlatformAdapter): Promise<PlatformProfile | null> {
  try {
    if (typeof adapter.getProfile === 'function') {
      const profile = await adapter.getProfile();
      if (profile !== null) return profile;
    }
    const name = await adapter.getPlayerName();
    return name === null ? null : { id: null, name, avatarUrl: null };
  } catch {
    return null;
  }
}
