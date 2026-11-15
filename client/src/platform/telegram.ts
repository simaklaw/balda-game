import type { PlatformAdapter, PlatformId, PlatformStorage } from './types';

/** Сколько ждём ответ CloudStorage, прежде чем уйти в фолбэк на localStorage. */
export const TG_STORAGE_TIMEOUT_MS = 3000;

/**
 * Минимальная часть Telegram WebApp API, которую используем.
 * Полный объект приходит из скрипта telegram-web-app.js (index.html),
 * здесь описаны только нужные поля.
 */
export interface TelegramWebAppLike {
  ready(): void;
  expand?(): void;
  initDataUnsafe?: {
    user?: { first_name?: unknown; last_name?: unknown; username?: unknown };
  };
  CloudStorage?: {
    getItem(key: string, cb: (err: unknown, value: string | null) => void): void;
    setItem(key: string, value: string, cb: (err: unknown) => void): void;
    removeItem(key: string, cb: (err: unknown) => void): void;
  };
}

/** Достаёт WebApp из глобального объекта; вне Telegram или без скрипта — null. */
export function getTelegramWebApp(): TelegramWebAppLike | null {
  try {
    const telegram = (window as { Telegram?: { WebApp?: unknown } }).Telegram;
    if (typeof telegram !== 'object' || telegram === null) return null;
    const webApp = (telegram as { WebApp?: unknown }).WebApp;
    if (typeof webApp !== 'object' || webApp === null) return null;
    return webApp as TelegramWebAppLike;
  } catch {
    return null;
  }
}

/**
 * Платформа Telegram Mini Apps:
 * - ready → WebApp.ready() + expand();
 * - имя игрока → initDataUnsafe.user (username, иначе имя + фамилия);
 * - хранилище → CloudStorage (облачное) с фолбэком на localStorage;
 *   каждый вызов под страховочным таймаутом — колбэки Telegram могут
 *   не прийти никогда, зависнуть игра не может;
 * - рекламы в Mini Apps API нет — showInterstitial пустой.
 */
export class TelegramAdapter implements PlatformAdapter {
  readonly id: PlatformId = 'telegram';
  private readonly webApp: TelegramWebAppLike;
  private readonly storageTimeoutMs: number;

  constructor(webApp: TelegramWebAppLike, storageTimeoutMs: number = TG_STORAGE_TIMEOUT_MS) {
    this.webApp = webApp;
    this.storageTimeoutMs = storageTimeoutMs;
  }

  async ready(): Promise<void> {
    try {
      this.webApp.ready();
      this.webApp.expand?.();
    } catch {
      /* не критично */
    }
  }

  async getPlayerName(): Promise<string | null> {
    const user = this.webApp.initDataUnsafe?.user;
    if (typeof user !== 'object' || user === null) return null;
    const username = user.username;
    if (typeof username === 'string' && username !== '') return username;
    const name = [user.first_name, user.last_name]
      .filter((part): part is string => typeof part === 'string' && part !== '')
      .join(' ')
      .trim();
    return name !== '' ? name : null;
  }

  async showInterstitial(): Promise<void> {
    /* В Telegram Mini Apps нет официальной interstitial-рекламы. */
  }

  /** CloudStorage.getItem → Promise; null при ошибке/таймауте/отсутствии API. */
  private cloudGet(key: string): Promise<string | null> {
    const cloud = this.webApp.CloudStorage;
    if (cloud === undefined) return Promise.resolve(null);
    return new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (value: string | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        resolve(value);
      };
      const guard = setTimeout(() => finish(null), this.storageTimeoutMs);
      try {
        cloud.getItem(key, (err, value) => {
          if (err !== null && err !== undefined) finish(null);
          else finish(typeof value === 'string' && value !== '' ? value : null);
        });
      } catch {
        finish(null);
      }
    });
  }

  /** CloudStorage.setItem → true, если Telegram подтвердил запись. */
  private cloudSet(key: string, value: string): Promise<boolean> {
    const cloud = this.webApp.CloudStorage;
    if (cloud === undefined) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        resolve(ok);
      };
      const guard = setTimeout(() => finish(false), this.storageTimeoutMs);
      try {
        cloud.setItem(key, value, (err) => finish(err === null || err === undefined));
      } catch {
        finish(false);
      }
    });
  }

  /** CloudStorage.removeItem → true, если Telegram подтвердил удаление. */
  private cloudRemove(key: string): Promise<boolean> {
    const cloud = this.webApp.CloudStorage;
    if (cloud === undefined) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        resolve(ok);
      };
      const guard = setTimeout(() => finish(false), this.storageTimeoutMs);
      try {
        cloud.removeItem(key, (err) => finish(err === null || err === undefined));
      } catch {
        finish(false);
      }
    });
  }

  readonly storage: PlatformStorage = {
    get: async (key) => {
      const cloud = await this.cloudGet(key);
      if (cloud !== null) return cloud;
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: async (key, value) => {
      if (await this.cloudSet(key, value)) return;
      try {
        localStorage.setItem(key, value);
      } catch {
        /* приватный режим — игнорируем */
      }
    },
    remove: async (key) => {
      if (await this.cloudRemove(key)) return;
      try {
        localStorage.removeItem(key);
      } catch {
        /* игнорируем */
      }
    },
  };
}
