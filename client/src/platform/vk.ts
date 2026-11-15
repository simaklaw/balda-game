import type { PlatformAdapter, PlatformId, PlatformStorage } from './types';

/**
 * Минимальный интерфейс vk-bridge, который мы используем.
 * Настоящий bridge из '@vkontakte/vk-bridge' приводится к нему одним кастом
 * в createAdapter() — полный пакет типов не нужен.
 */
export interface VkBridgeApi {
  send(event: string, params?: Record<string, unknown>): Promise<unknown>;
}

/** Сколько ждём нативную рекламу, прежде чем не подвешивать игру. */
const AD_GUARD_MS = 20000;

/**
 * Платформа VK Mini Apps (VK Bridge):
 * - ready → VKWebAppInit;
 * - имя игрока → VKWebAppGetUserInfo (имя + фамилия);
 * - хранилище → VKWebAppStorageGet/Set (облачное), фолбэк на localStorage;
 *   удаления в VK Storage нет — remove записывает пустую строку;
 * - реклама → VKWebAppShowNativeAds (interstitial).
 */
export class VKAdapter implements PlatformAdapter {
  readonly id: PlatformId = 'vk';
  private readonly bridge: VkBridgeApi;

  constructor(bridge: VkBridgeApi) {
    this.bridge = bridge;
  }

  async ready(): Promise<void> {
    try {
      await this.bridge.send('VKWebAppInit');
    } catch {
      /* не критично */
    }
  }

  async getPlayerName(): Promise<string | null> {
    try {
      const res = await this.bridge.send('VKWebAppGetUserInfo');
      if (typeof res !== 'object' || res === null) return null;
      const info = res as { first_name?: unknown; last_name?: unknown };
      const name = [info.first_name, info.last_name]
        .filter((part): part is string => typeof part === 'string' && part !== '')
        .join(' ')
        .trim();
      return name !== '' ? name : null;
    } catch {
      return null;
    }
  }

  async showInterstitial(): Promise<void> {
    await this.showNativeAd('interstitial');
  }

  private showNativeAd(adFormat: string): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };
      // Страховка: если VK не ответил, не подвешиваем игру.
      const guard = setTimeout(finish, AD_GUARD_MS);
      try {
        this.bridge
          .send('VKWebAppShowNativeAds', { ad_format: adFormat })
          .then(() => {
            clearTimeout(guard);
            finish();
          })
          .catch(() => {
            clearTimeout(guard);
            finish();
          });
      } catch {
        clearTimeout(guard);
        finish();
      }
    });
  }

  readonly storage: PlatformStorage = {
    get: async (key) => {
      try {
        const res = await this.bridge.send('VKWebAppStorageGet', { keys: [key] });
        if (typeof res === 'object' && res !== null) {
          const entries = (res as { keys?: unknown }).keys;
          if (Array.isArray(entries)) {
            for (const entry of entries) {
              if (typeof entry === 'object' && entry !== null && (entry as { key?: unknown }).key === key) {
                const value = (entry as { value?: unknown }).value;
                // Пустая строка = ключ удалён (см. remove).
                return typeof value === 'string' && value !== '' ? value : null;
              }
            }
          }
        }
      } catch {
        /* фолбэк на localStorage ниже */
      }
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: async (key, value) => {
      try {
        await this.bridge.send('VKWebAppStorageSet', { key, value });
        return;
      } catch {
        /* фолбэк ниже */
      }
      try {
        localStorage.setItem(key, value);
      } catch {
        /* приватный режим — игнорируем */
      }
    },
    remove: async (key) => {
      // В VK Storage нет удаления — пишем пустую строку.
      try {
        await this.bridge.send('VKWebAppStorageSet', { key, value: '' });
        return;
      } catch {
        /* фолбэк ниже */
      }
      try {
        localStorage.removeItem(key);
      } catch {
        /* игнорируем */
      }
    },
  };
}
