import { describe, expect, it } from 'vitest';
import { buildInviteLink, fetchProfile, parseLaunchRoom } from '../src/platform';
import { VKAdapter } from '../src/platform/vk';
import type { VkBridgeApi } from '../src/platform/vk';
import { YandexAdapter } from '../src/platform/yandex';
import type { YandexPlayer, YandexSdk } from '../src/platform/yandex';
import { WebAdapter } from '../src/platform/web';

describe('parseLaunchRoom', () => {
  it('читает код из хэша, параметра и vk_request_key', () => {
    expect(parseLaunchRoom('https://x.app/#room=abcd')).toBe('ABCD');
    expect(parseLaunchRoom('https://x.app/#roomWXYZ')).toBe('WXYZ');
    expect(parseLaunchRoom('https://x.app/?room=7391')).toBe('7391');
    expect(parseLaunchRoom('https://x.app/?vk_app_id=1&vk_request_key=roomKLMN')).toBe('KLMN');
  });
  it('игнорирует мусор и слишком длинные коды', () => {
    expect(parseLaunchRoom('https://x.app/')).toBeNull();
    expect(parseLaunchRoom('https://x.app/#room=')).toBeNull();
    expect(parseLaunchRoom('https://x.app/?room=<script>')).toBeNull();
    expect(parseLaunchRoom('https://x.app/?room=123456789012')).toBeNull();
  });
});

describe('buildInviteLink', () => {
  it('для VK строит ссылку на мини-приложение', () => {
    expect(buildInviteLink('https://prod.example/?vk_app_id=5123&sign=1', 'abcd')).toBe('https://vk.com/app5123#room=ABCD');
  });
  it('для остальных меняет хэш текущего адреса', () => {
    expect(buildInviteLink('https://game.example/play?x=1#old', 'qwer')).toBe('https://game.example/play?x=1#room=QWER');
  });
});

describe('профиль игрока', () => {
  it('VK: имя, фото и id из VKWebAppGetUserInfo', async () => {
    const bridge: VkBridgeApi = {
      send: async () => ({ id: 42, first_name: 'Анна', last_name: 'Ким', photo_200: 'https://vk.example/a.jpg' }),
    };
    const profile = await new VKAdapter(bridge).getProfile();
    expect(profile).toEqual({ id: '42', name: 'Анна Ким', avatarUrl: 'https://vk.example/a.jpg' });
  });
  it('VK: http-аватар отбрасывается', async () => {
    const bridge: VkBridgeApi = { send: async () => ({ id: 1, first_name: 'Ян', photo_100: 'http://insecure/a.jpg' }) };
    expect((await new VKAdapter(bridge).getProfile())?.avatarUrl).toBeNull();
  });
  it('VK: приглашение — окно приглашений, при сбое — Share со ссылкой', async () => {
    const calls: string[] = [];
    const bridge: VkBridgeApi = {
      send: async (event) => {
        calls.push(event);
        if (event === 'VKWebAppShowInviteBox') throw new Error('unsupported');
        return {};
      },
    };
    expect(await new VKAdapter(bridge).social.invite('ABCD')).toBe(true);
    expect(calls).toEqual(['VKWebAppShowInviteBox', 'VKWebAppShare']);
  });
  it('Яндекс: имя, фото large и уникальный id', async () => {
    const player: YandexPlayer = {
      getName: () => 'Simak',
      getPhoto: (size) => 'https://avatars.example/' + size,
      getUniqueID: () => 'uid-1',
      getData: async () => ({}),
      setData: async () => {},
    };
    const sdk = { getPlayer: async () => player } as unknown as YandexSdk;
    expect(await new YandexAdapter(sdk).getProfile()).toEqual({
      id: 'uid-1',
      name: 'Simak',
      avatarUrl: 'https://avatars.example/large',
    });
  });
  it('fetchProfile: без getProfile берёт имя, при сбое возвращает null', async () => {
    const web = new WebAdapter();
    expect(await fetchProfile(web)).toBeNull();
    const named = Object.assign(new WebAdapter(), { getPlayerName: async () => 'Гость' });
    expect(await fetchProfile(named)).toEqual({ id: null, name: 'Гость', avatarUrl: null });
    const broken = Object.assign(new WebAdapter(), { getPlayerName: async () => { throw new Error('x'); } });
    expect(await fetchProfile(broken)).toBeNull();
  });
});
