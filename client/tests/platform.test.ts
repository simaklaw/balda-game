import { describe, expect, it } from 'vitest';
import { detectPlatform, shouldShowInterstitial } from '../src/platform';
import { TelegramAdapter } from '../src/platform/telegram';
import type { TelegramWebAppLike } from '../src/platform/telegram';
import { VKAdapter } from '../src/platform/vk';
import type { VkBridgeApi } from '../src/platform/vk';
import { YandexAdapter } from '../src/platform/yandex';
import type { YandexLeaderboardEntry, YandexLeaderboards, YandexPlayer, YandexSdk } from '../src/platform/yandex';

describe('detectPlatform', () => {
  it('распознаёт Яндекс Игры по URL', () => {
    expect(detectPlatform('https://yandex.ru/games/app/123456', 'Mozilla/5.0')).toBe('yandex');
    expect(detectPlatform('https://games.s3.yandex.net/game/abc/index.html?ysdk_st=1', 'Mozilla/5.0')).toBe('yandex');
    expect(detectPlatform('https://ya.ru/games/app/1', 'Mozilla/5.0')).toBe('yandex');
  });

  it('распознаёт мобильное приложение Яндекса по user-agent', () => {
    expect(detectPlatform('https://example.com/', 'Mozilla/5.0 (Linux; YaApp_Android/23.11)')).toBe('yandex');
  });

  it('распознаёт VK Mini Apps по URL', () => {
    expect(detectPlatform('https://vk.com/app123', 'Mozilla/5.0')).toBe('vk');
    expect(detectPlatform('https://vk.ru/app123', 'Mozilla/5.0')).toBe('vk');
    expect(detectPlatform('https://example.com/?vk_app_id=51234567', 'Mozilla/5.0')).toBe('vk');
    // OK: новые игры публикуются только через VK Mini Apps — запуск с ok.ru
    // обслуживает тот же VK-адаптер.
    expect(detectPlatform('https://ok.ru/game/123', 'Mozilla/5.0')).toBe('vk');
  });

  it('распознаёт Telegram Mini Apps по URL', () => {
    expect(detectPlatform('https://t.me/balda_bot/app', 'Mozilla/5.0')).toBe('telegram');
    expect(detectPlatform('https://example.com/#tgWebAppData=user%3Danya', 'Mozilla/5.0')).toBe('telegram');
  });

  it('остальное — веб', () => {
    expect(detectPlatform('https://example.com/', 'Mozilla/5.0')).toBe('web');
    expect(detectPlatform('https://example.com/', 'Mozilla/5.0 YaBrowser/24.7')).toBe('web');
  });
});

describe('shouldShowInterstitial', () => {
  it('первый показ всегда разрешён', () => {
    expect(shouldShowInterstitial(0, 1000)).toBe(true);
  });

  it('соблюдает минимальный интервал', () => {
    expect(shouldShowInterstitial(1000, 1000 + 179999)).toBe(false);
    expect(shouldShowInterstitial(1000, 1000 + 180000)).toBe(true);
  });
});

describe('TelegramAdapter', () => {
  /** Фейковый WebApp с синхронным CloudStorage. */
  const makeWebApp = (
    store: Record<string, string>,
    user?: { first_name?: string; last_name?: string; username?: string },
  ): TelegramWebAppLike & { events: string[] } => {
    const events: string[] = [];
    return {
      events,
      ready: () => events.push('ready'),
      expand: () => events.push('expand'),
      initDataUnsafe: user === undefined ? undefined : { user },
      CloudStorage: {
        getItem: (key, cb) => {
          events.push('getItem:' + key);
          cb(null, key in store ? store[key] : null);
        },
        setItem: (key, value, cb) => {
          events.push('setItem:' + key);
          store[key] = value;
          cb(null);
        },
        removeItem: (key, cb) => {
          events.push('removeItem:' + key);
          delete store[key];
          cb(null);
        },
      },
    };
  };

  it('ready() вызывает ready и expand, не падает при сбое', async () => {
    const webApp = makeWebApp({});
    await expect(new TelegramAdapter(webApp).ready()).resolves.toBeUndefined();
    expect(webApp.events).toContain('ready');
    expect(webApp.events).toContain('expand');
  });

  it('имя игрока: username, иначе имя + фамилия, иначе null', async () => {
    const withUsername = makeWebApp({}, { first_name: 'Аня', username: 'anya' });
    await expect(new TelegramAdapter(withUsername).getPlayerName()).resolves.toBe('anya');
    const withName = makeWebApp({}, { first_name: 'Аня', last_name: 'Смирнова' });
    await expect(new TelegramAdapter(withName).getPlayerName()).resolves.toBe('Аня Смирнова');
    const anonymous = makeWebApp({});
    await expect(new TelegramAdapter(anonymous).getPlayerName()).resolves.toBeNull();
  });

  it('storage читает и пишет через CloudStorage', async () => {
    const store: Record<string, string> = { best: '120' };
    const adapter = new TelegramAdapter(makeWebApp(store));
    await expect(adapter.storage.get('best')).resolves.toBe('120');
    await adapter.storage.set('games', '7');
    expect(store['games']).toBe('7');
    await adapter.storage.remove('games');
    expect('games' in store).toBe(false);
  });

  it('сбой CloudStorage уходит в фолбэк, не падая', async () => {
    const failing: TelegramWebAppLike = {
      ready: () => undefined,
      CloudStorage: {
        getItem: (_key, cb) => cb(new Error('нет сети'), null),
        setItem: (_key, _value, cb) => cb(new Error('нет сети')),
        removeItem: (_key, cb) => cb(new Error('нет сети')),
      },
    };
    const adapter = new TelegramAdapter(failing);
    await expect(adapter.storage.get('missing')).resolves.toBeNull();
    await expect(adapter.storage.set('k', 'v')).resolves.toBeUndefined();
    await expect(adapter.storage.remove('k')).resolves.toBeUndefined();
  });

  it('молчащий CloudStorage не подвешивает storage (guard-таймаут)', async () => {
    const hanging: TelegramWebAppLike = {
      ready: () => undefined,
      CloudStorage: {
        getItem: () => undefined,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    };
    const adapter = new TelegramAdapter(hanging, 10);
    await expect(adapter.storage.get('k')).resolves.toBeNull();
    await expect(adapter.storage.set('k', 'v')).resolves.toBeUndefined();
    await expect(adapter.storage.remove('k')).resolves.toBeUndefined();
  });

  it('без CloudStorage storage работает через фолбэк', async () => {
    const adapter = new TelegramAdapter(makeWebApp({}));
    await expect(adapter.storage.get('missing')).resolves.toBeNull();
    await expect(adapter.storage.set('k', 'v')).resolves.toBeUndefined();
    await expect(adapter.storage.remove('k')).resolves.toBeUndefined();
  });

  it('showInterstitial — пустая операция (в Telegram нет interstitial API)', async () => {
    await expect(new TelegramAdapter(makeWebApp({})).showInterstitial()).resolves.toBeUndefined();
  });
});

describe('VKAdapter', () => {
  /** Фейковый bridge с хранилищем и управляемыми ответами. */
  const makeBridge = (store: Record<string, string>): VkBridgeApi & {
    events: { event: string; params?: Record<string, unknown> }[];
  } => {
    const events: { event: string; params?: Record<string, unknown> }[] = [];
    return {
      events,
      send: async (event, params) => {
        events.push({ event, params });
        switch (event) {
          case 'VKWebAppInit':
            return true;
          case 'VKWebAppGetUserInfo':
            return { first_name: 'Аня', last_name: 'Смирнова' };
          case 'VKWebAppStorageGet':
            return {
              keys: Object.keys(store).map((k) => ({ key: k, value: store[k] })),
            };
          case 'VKWebAppStorageSet': {
            const key = String((params as { key?: unknown })?.key);
            const value = String((params as { value?: unknown })?.value ?? '');
            if (value === '') delete store[key];
            else store[key] = value;
            return true;
          }
          default:
            return true;
        }
      },
    };
  };

  it('ready() шлёт VKWebAppInit и не падает при сбое', async () => {
    const ok = makeBridge({});
    const adapter = new VKAdapter(ok);
    await expect(adapter.ready()).resolves.toBeUndefined();
    expect(ok.events.some((e) => e.event === 'VKWebAppInit')).toBe(true);

    const failing: VkBridgeApi = {
      send: async () => {
        throw new Error('нет VK');
      },
    };
    await expect(new VKAdapter(failing).ready()).resolves.toBeUndefined();
  });

  it('возвращает имя игрока из VKWebAppGetUserInfo', async () => {
    await expect(new VKAdapter(makeBridge({})).getPlayerName()).resolves.toBe('Аня Смирнова');
  });

  it('сбой или мусор в ответе → null', async () => {
    const failing: VkBridgeApi = {
      send: async () => {
        throw new Error('нет сети');
      },
    };
    await expect(new VKAdapter(failing).getPlayerName()).resolves.toBeNull();
    const garbage: VkBridgeApi = { send: async () => 'не объект' };
    await expect(new VKAdapter(garbage).getPlayerName()).resolves.toBeNull();
  });

  it('storage читает и пишет через VKWebAppStorage', async () => {
    const store: Record<string, string> = { best: '120' };
    const adapter = new VKAdapter(makeBridge(store));
    await expect(adapter.storage.get('best')).resolves.toBe('120');
    await adapter.storage.set('games', '7');
    expect(store['games']).toBe('7');
    await adapter.storage.remove('games');
    expect('games' in store).toBe(false);
  });

  it('пустая строка в VK Storage читается как null', async () => {
    const store: Record<string, string> = { theme: '' };
    const adapter = new VKAdapter(makeBridge(store));
    await expect(adapter.storage.get('theme')).resolves.toBeNull();
  });

  it('сбой storage уходит в фолбэк, не падая', async () => {
    const failing: VkBridgeApi = {
      send: async () => {
        throw new Error('нет VK');
      },
    };
    const adapter = new VKAdapter(failing);
    await expect(adapter.storage.get('missing')).resolves.toBeNull();
    await expect(adapter.storage.set('k', 'v')).resolves.toBeUndefined();
    await expect(adapter.storage.remove('k')).resolves.toBeUndefined();
  });

  it('showInterstitial шлёт VKWebAppShowNativeAds и резолвится', async () => {
    const bridge = makeBridge({});
    const adapter = new VKAdapter(bridge);
    await expect(adapter.showInterstitial()).resolves.toBeUndefined();
    const ad = bridge.events.find((e) => e.event === 'VKWebAppShowNativeAds');
    expect(ad).toBeDefined();
    expect((ad!.params as { ad_format?: unknown }).ad_format).toBe('interstitial');
  });

  it('showInterstitial резолвится по guard-таймауту, если VK не ответил', async () => {
    const hanging: VkBridgeApi = {
      send: () => new Promise(() => undefined),
    };
    // Короткий guard вместо боевых 20 с — тест не должен висеть.
    await expect(new VKAdapter(hanging, 10).showInterstitial()).resolves.toBeUndefined();
  });
});

describe('YandexAdapter', () => {
  const makePlayer = (name: string, store: Record<string, string>): YandexPlayer => ({
    getName: () => name,
    getData: async (keys?: string[]) => {
      const out: Record<string, unknown> = {};
      for (const k of keys ?? []) if (k in store) out[k] = store[k];
      return out;
    },
    setData: async (data: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(data)) {
        if (v === null) delete store[k];
        else store[k] = String(v);
      }
    },
  });

  it('ready() не падает', async () => {
    let readyCalled = false;
    const sdk: YandexSdk = { features: { LoadingAPI: { ready: () => { readyCalled = true; } } } };
    const adapter = new YandexAdapter(sdk);
    await expect(adapter.ready()).resolves.toBeUndefined();
    expect(readyCalled).toBe(true);
  });

  it('возвращает имя игрока', async () => {
    const sdk: YandexSdk = { getPlayer: async () => makePlayer('Аня', {}) };
    await expect(new YandexAdapter(sdk).getPlayerName()).resolves.toBe('Аня');
  });

  it('пустое имя → null', async () => {
    const sdk: YandexSdk = { getPlayer: async () => makePlayer('', {}) };
    await expect(new YandexAdapter(sdk).getPlayerName()).resolves.toBeNull();
  });

  it('без getPlayer → null', async () => {
    await expect(new YandexAdapter({}).getPlayerName()).resolves.toBeNull();
  });

  it('сбой getPlayer → null', async () => {
    const sdk: YandexSdk = {
      getPlayer: async () => {
        throw new Error('нет сети');
      },
    };
    await expect(new YandexAdapter(sdk).getPlayerName()).resolves.toBeNull();
  });

  it('storage читает и пишет через игрока', async () => {
    const store: Record<string, string> = { best: '120' };
    const sdk: YandexSdk = { getPlayer: async () => makePlayer('Аня', store) };
    const adapter = new YandexAdapter(sdk);
    await expect(adapter.storage.get('best')).resolves.toBe('120');
    await adapter.storage.set('games', '7');
    expect(store['games']).toBe('7');
    await adapter.storage.remove('games');
    expect('games' in store).toBe(false);
  });

  it('без игрока storage уходит в фолбэк, не падая', async () => {
    const adapter = new YandexAdapter({});
    await expect(adapter.storage.get('missing')).resolves.toBeNull();
    await expect(adapter.storage.set('k', 'v')).resolves.toBeUndefined();
    await expect(adapter.storage.remove('k')).resolves.toBeUndefined();
  });

  it('showInterstitial резолвится по onClose', async () => {
    const sdk: YandexSdk = {
      adv: {
        showFullscreenAdv: (options) => {
          options?.callbacks?.onClose?.(true);
        },
      },
    };
    await expect(new YandexAdapter(sdk).showInterstitial()).resolves.toBeUndefined();
  });

  it('showInterstitial резолвится по onError', async () => {
    const sdk: YandexSdk = {
      adv: {
        showFullscreenAdv: (options) => {
          options?.callbacks?.onError?.('нет рекламы');
        },
      },
    };
    await expect(new YandexAdapter(sdk).showInterstitial()).resolves.toBeUndefined();
  });

  it('showInterstitial без adv завершается сразу', async () => {
    await expect(new YandexAdapter({}).showInterstitial()).resolves.toBeUndefined();
  });
});

describe('YandexAdapter.leaderboards', () => {
  /** Фейковый API лидербордов с записью вызовов. */
  const makeLb = (overrides: Partial<YandexLeaderboards> = {}): YandexLeaderboards & {
    scores: { name: string; score: number }[];
  } => {
    const scores: { name: string; score: number }[] = [];
    return {
      scores,
      setLeaderboardScore: async (name, score) => {
        scores.push({ name, score });
      },
      getLeaderboardEntries: async () => ({
        // Мусорные записи приходят «снаружи» — эмулируем это через cast.
        entries: [
          { rank: 1, score: 340, player: { publicName: 'Аня' } },
          { rank: 2, score: 210, player: {} },
          { rank: 'мусор', score: 100 },
          { rank: 4, score: 'мусор' },
        ] as unknown as YandexLeaderboardEntry[],
      }),
      ...overrides,
    };
  };

  const makeSdk = (api: YandexLeaderboards | null): YandexSdk =>
    api === null ? {} : { getLeaderboards: async () => api };

  it('submitScore шлёт результат с техническим именем лидерборда', async () => {
    const lb = makeLb();
    const adapter = new YandexAdapter(makeSdk(lb));
    await expect(adapter.leaderboards.submitScore(12.7)).resolves.toBeUndefined();
    expect(lb.scores).toEqual([{ name: 'baldaScore', score: 12 }]);
  });

  it('submitScore с отрицательным результатом шлёт 0', async () => {
    const lb = makeLb();
    const adapter = new YandexAdapter(makeSdk(lb));
    await adapter.leaderboards.submitScore(-5);
    expect(lb.scores).toEqual([{ name: 'baldaScore', score: 0 }]);
  });

  it('без getLeaderboards в SDK submitScore — тихая пустая операция', async () => {
    const adapter = new YandexAdapter({});
    await expect(adapter.leaderboards.submitScore(10)).resolves.toBeUndefined();
    await expect(adapter.leaderboards.getTopScores()).resolves.toBeNull();
  });

  it('сбой getLeaderboards → getTopScores возвращает null', async () => {
    const sdk: YandexSdk = {
      getLeaderboards: async () => {
        throw new Error('нет API');
      },
    };
    const adapter = new YandexAdapter(sdk);
    await expect(adapter.leaderboards.getTopScores()).resolves.toBeNull();
  });

  it('getTopScores маппит записи, мусор отбрасывает', async () => {
    const adapter = new YandexAdapter(makeSdk(makeLb()));
    const rows = await adapter.leaderboards.getTopScores(10);
    expect(rows).toEqual([
      { rank: 1, name: 'Аня', score: 340 },
      { rank: 2, name: '', score: 210 },
    ]);
  });

  it('getTopScores ограничивает limit разумными границами', async () => {
    let captured: { quantityTop?: number } | undefined;
    const lb = makeLb({
      getLeaderboardEntries: async (_name, options) => {
        captured = options;
        return { entries: [] };
      },
    });
    const adapter = new YandexAdapter(makeSdk(lb));
    await adapter.leaderboards.getTopScores(0);
    expect(captured?.quantityTop).toBe(1);
    await adapter.leaderboards.getTopScores(1000);
    expect(captured?.quantityTop).toBe(20);
  });

  it('сбой getLeaderboardEntries (лидерборд не создан) → null', async () => {
    const lb = makeLb({
      getLeaderboardEntries: async () => {
        throw new Error('LEADERBOARD_NOT_FOUND');
      },
    });
    const adapter = new YandexAdapter(makeSdk(lb));
    await expect(adapter.leaderboards.getTopScores()).resolves.toBeNull();
  });
});
