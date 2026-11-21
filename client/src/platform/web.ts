import { buildInviteLink } from './social';
import type { PlatformAdapter, PlatformId, PlatformSocial, PlatformStorage } from './types';

function withStorage(action: () => void): void {
  try {
    action();
  } catch {
    /* приватный режим или переполнение — работать продолжаем */
  }
}

/** Платформа «просто браузер»: localStorage, без рекламы и авторизации. */
export class WebAdapter implements PlatformAdapter {
  readonly id: PlatformId = 'web';

  async ready(): Promise<void> {
    /* браузеру сообщать нечего */
  }

  async getPlayerName(): Promise<string | null> {
    return null;
  }

  async showInterstitial(): Promise<void> {
    /* на вебе рекламы нет */
  }

  /** В браузере приглашение — системное окно «Поделиться» (там, где оно есть). */
  readonly social: PlatformSocial | undefined =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'
      ? {
          invite: async (roomId) => {
            try {
              await navigator.share({
                title: 'Балда',
                text: 'Сыграем в Балду? Код комнаты: ' + roomId,
                url: buildInviteLink(window.location.href, roomId),
              });
              return true;
            } catch {
              return false;
            }
          },
        }
      : undefined;

  readonly storage: PlatformStorage = {
    get: async (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: async (key, value) => {
      withStorage(() => localStorage.setItem(key, value));
    },
    remove: async (key) => {
      withStorage(() => localStorage.removeItem(key));
    },
  };
}
