import { describe, expect, it } from 'vitest';
import { detectPlatform, shouldShowInterstitial } from '../src/platform';
import { YandexAdapter } from '../src/platform/yandex';
import type { YandexPlayer, YandexSdk } from '../src/platform/yandex';

describe('detectPlatform', () => {
  it('распознаёт Яндекс Игры по URL', () => {
    expect(detectPlatform('https://yandex.ru/games/app/123456', 'Mozilla/5.0')).toBe('yandex');
    expect(detectPlatform('https://games.s3.yandex.net/game/abc/index.html?ysdk_st=1', 'Mozilla/5.0')).toBe('yandex');
    expect(detectPlatform('https://ya.ru/games/app/1', 'Mozilla/5.0')).toBe('yandex');
  });

  it('распознаёт мобильное приложение Яндекса по user-agent', () => {
    expect(detectPlatform('https://example.com/', 'Mozilla/5.0 (Linux; YaApp_Android/23.11)')).toBe('yandex');
  });

  it('остальное — веб', () => {
    expect(detectPlatform('https://example.com/', 'Mozilla/5.0')).toBe('web');
    expect(detectPlatform('https://example.com/', 'Mozilla/5.0 YaBrowser/24.7')).toBe('web');
    expect(detectPlatform('https://vk.com/app123', 'Mozilla/5.0')).toBe('web');
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
