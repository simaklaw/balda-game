import type {
  LeaderboardRow,
  PlatformAdapter,
  PlatformId,
  PlatformLeaderboards,
  PlatformProfile,
  PlatformStorage,
} from './types';

// SDK отдаётся с домена самой игры на площадке Яндекса (см. docs.yandex.ru).
const SDK_URL = '/sdk.js';

/** Минимальные типы SDK Яндекс Игр (v2) — без внешних пакетов. */
export interface YandexPlayer {
  getName(): string;
  getPhoto?(size: 'small' | 'medium' | 'large'): string;
  getUniqueID?(): string;
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  setData(data: Record<string, unknown>): Promise<void>;
}

/** Элемент ответа getLeaderboardEntries (минимально необходимое). */
export interface YandexLeaderboardEntry {
  rank: number;
  score: number;
  player?: { publicName?: string };
}

/** Нативные лидерборды Яндекс Игр (требуют создания в консоли разработчика). */
export interface YandexLeaderboards {
  setLeaderboardScore(name: string, score: number): Promise<void>;
  getLeaderboardEntries(
    name: string,
    options?: { quantityTop?: number; includeUser?: boolean; quantityAround?: number },
  ): Promise<{ entries?: YandexLeaderboardEntry[] }>;
}

export interface YandexSdk {
  features?: { LoadingAPI?: { ready(): void } };
  adv?: {
    showFullscreenAdv(options?: {
      callbacks?: {
        onClose?: (wasShown: boolean) => void;
        onError?: (error: unknown) => void;
      };
    }): void;
  };
  getPlayer?: (options?: { scopes?: boolean }) => Promise<YandexPlayer>;
  getLeaderboards?: () => Promise<YandexLeaderboards>;
}

declare global {
  interface Window {
    YaGames?: { init(): Promise<unknown> };
  }
}

/** Техническое имя нативного лидерборда (создаётся в консоли Яндекс Игр). */
export const YANDEX_LEADERBOARD = 'baldaScore';

/** Загружает SDK Яндекс Игр; вне их окружения или при сбое возвращает null. */
export async function loadYandexSdk(): Promise<YandexSdk | null> {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;
    if (window.YaGames === undefined) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SDK_URL;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Не удалось загрузить SDK Яндекс Игр'));
        document.head.appendChild(script);
      });
    }
    const games = window.YaGames;
    if (games === undefined) return null;
    return (await games.init()) as YandexSdk;
  } catch {
    return null;
  }
}

/**
 * Платформа Яндекс Игр: LoadingAPI.ready, межстраничная реклама между
 * партиями, облачное хранилище игрока с фолбэком на localStorage,
 * нативный лидерборд.
 */
export class YandexAdapter implements PlatformAdapter {
  readonly id: PlatformId = 'yandex';
  private readonly sdk: YandexSdk;
  private player: YandexPlayer | null = null;
  private playerRequested = false;
  private leaderboardsApi: YandexLeaderboards | null | undefined;

  constructor(sdk: YandexSdk) {
    this.sdk = sdk;
  }

  async ready(): Promise<void> {
    try {
      this.sdk.features?.LoadingAPI?.ready();
    } catch {
      /* не критично */
    }
  }

  async getPlayerName(): Promise<string | null> {
    const player = await this.ensurePlayer();
    if (player === null) return null;
    try {
      const name = player.getName();
      return typeof name === 'string' && name !== '' ? name : null;
    } catch {
      return null;
    }
  }

  async getProfile(): Promise<PlatformProfile | null> {
    const player = await this.ensurePlayer();
    if (player === null) return null;
    try {
      const rawName = player.getName();
      const name = typeof rawName === 'string' && rawName !== '' ? rawName : 'Игрок';
      let avatarUrl: string | null = null;
      if (typeof player.getPhoto === 'function') {
        const photo = player.getPhoto('large');
        if (typeof photo === 'string' && photo.startsWith('https://')) avatarUrl = photo;
      }
      let id: string | null = null;
      if (typeof player.getUniqueID === 'function') {
        const uid = player.getUniqueID();
        if (typeof uid === 'string' && uid !== '') id = uid;
      }
      return { id, name, avatarUrl };
    } catch {
      return null;
    }
  }

  async showInterstitial(): Promise<void> {
    const adv = this.sdk.adv;
    const show = adv?.showFullscreenAdv;
    if (adv === undefined || typeof show !== 'function') return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };
      // Страховка: если SDK не вызвал ни один колбэк, не подвешиваем игру.
      const guard = setTimeout(finish, 20000);
      try {
        show.call(adv, {
          callbacks: {
            onClose: () => {
              clearTimeout(guard);
              finish();
            },
            onError: () => {
              clearTimeout(guard);
              finish();
            },
          },
        });
      } catch {
        clearTimeout(guard);
        finish();
      }
    });
  }

  /** Нативный лидерборд: отправка результата и чтение топа. */
  readonly leaderboards: PlatformLeaderboards = {
    submitScore: async (score) => {
      const api = await this.ensureLeaderboards();
      if (api === null) return;
      await api.setLeaderboardScore(YANDEX_LEADERBOARD, Math.max(0, Math.floor(score)));
    },
    getTopScores: async (limit = 10) => {
      const api = await this.ensureLeaderboards();
      if (api === null) return null;
      try {
        const data = await api.getLeaderboardEntries(YANDEX_LEADERBOARD, {
          quantityTop: Math.max(1, Math.min(20, Math.floor(limit))),
          includeUser: true,
          quantityAround: 0,
        });
        const rows: LeaderboardRow[] = [];
        for (const entry of data?.entries ?? []) {
          const score = entry?.score;
          const rank = entry?.rank;
          if (typeof score !== 'number' || !Number.isFinite(score)) continue;
          if (typeof rank !== 'number' || !Number.isFinite(rank)) continue;
          const name = entry?.player?.publicName;
          rows.push({
            rank: Math.max(1, Math.floor(rank)),
            name: typeof name === 'string' ? name : '',
            score: Math.max(0, Math.floor(score)),
          });
        }
        return rows;
      } catch {
        // Лидерборд ещё не создан в консоли или API недоступен — не ошибка игры.
        return null;
      }
    },
  };

  readonly storage: PlatformStorage = {
    get: async (key) => {
      const player = await this.ensurePlayer();
      if (player !== null) {
        try {
          const data = await player.getData([key]);
          const value = data?.[key];
          if (typeof value === 'string') return value;
        } catch {
          /* фолбэк на localStorage ниже */
        }
      }
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: async (key, value) => {
      const player = await this.ensurePlayer();
      if (player !== null) {
        try {
          await player.setData({ [key]: value });
          return;
        } catch {
          /* фолбэк ниже */
        }
      }
      try {
        localStorage.setItem(key, value);
      } catch {
        /* приватный режим — игнорируем */
      }
    },
    remove: async (key) => {
      const player = await this.ensurePlayer();
      if (player !== null) {
        try {
          await player.setData({ [key]: null });
          return;
        } catch {
          /* фолбэк ниже */
        }
      }
      try {
        localStorage.removeItem(key);
      } catch {
        /* игнорируем */
      }
    },
  };

  private async ensurePlayer(): Promise<YandexPlayer | null> {
    if (this.playerRequested) return this.player;
    this.playerRequested = true;
    const getPlayer = this.sdk.getPlayer;
    if (typeof getPlayer !== 'function') return null;
    try {
      this.player = await getPlayer.call(this.sdk, { scopes: false });
    } catch {
      this.player = null;
    }
    return this.player;
  }

  private async ensureLeaderboards(): Promise<YandexLeaderboards | null> {
    if (this.leaderboardsApi !== undefined) return this.leaderboardsApi;
    const get = this.sdk.getLeaderboards;
    if (typeof get !== 'function') {
      this.leaderboardsApi = null;
      return null;
    }
    try {
      this.leaderboardsApi = await get.call(this.sdk);
    } catch {
      this.leaderboardsApi = null;
    }
    return this.leaderboardsApi;
  }
}
