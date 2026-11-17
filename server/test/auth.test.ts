import { createHash, createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AccountStore } from '../src/accounts';
import {
  Authenticator,
  verifyOkLaunchParams,
  verifyTelegramInitData,
  verifyVkLaunchParams,
} from '../src/auth';

function tmpStore(): AccountStore {
  const dir = mkdtempSync(join(tmpdir(), 'balda-auth-'));
  const store = new AccountStore(join(dir, 'accounts.json'), 1000, 0);
  store.load();
  return store;
}

function buildTelegramInitData(
  botToken: string,
  user: object,
  authDate: number,
): string {
  const userJson = JSON.stringify(user);
  const pairs: Record<string, string> = {
    auth_date: String(authDate),
    user: userJson,
  };
  const dataCheckString = Object.keys(pairs)
    .sort()
    .map((k) => k + '=' + pairs[k])
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  const params = new URLSearchParams({ ...pairs, hash });
  return params.toString();
}

/** Собрать подписанный query параметров запуска VK (алгоритм из доки). */
function buildVkLaunchParams(
  secret: string,
  params: Record<string, string>,
): string {
  const vkKeys = Object.keys(params)
    .filter((k) => k.startsWith('vk_'))
    .sort();
  const dataCheck = vkKeys
    .map((k) => k + '=' + encodeURIComponent(params[k]!).replace(/%20/g, '+'))
    .join('&');
  const sign = createHmac('sha256', secret)
    .update(dataCheck)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return (
    Object.entries(params)
      .map(([k, v]) => k + '=' + v)
      .join('&') +
    '&sign=' +
    sign
  );
}

describe('verifyTelegramInitData', () => {
  const token = '123456:ABC-DEF';

  it('принимает валидную подпись', () => {
    const now = Math.floor(Date.now() / 1000);
    const init = buildTelegramInitData(token, { id: 42, first_name: 'Ann' }, now);
    const r = verifyTelegramInitData(init, token);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.id).toBe('42');
  });

  it('отклоняет подделанный hash', () => {
    const now = Math.floor(Date.now() / 1000);
    let init = buildTelegramInitData(token, { id: 1 }, now);
    init = init.replace(/hash=[^&]+/, 'hash=' + 'ab'.repeat(32));
    const r = verifyTelegramInitData(init, token);
    expect(r.ok).toBe(false);
  });

  it('отклоняет изменённое поле при том же hash', () => {
    const now = Math.floor(Date.now() / 1000);
    const init = buildTelegramInitData(token, { id: 1 }, now);
    const params = new URLSearchParams(init);
    params.set('auth_date', String(now - 10));
    const r = verifyTelegramInitData(params.toString(), token);
    expect(r.ok).toBe(false);
  });

  it('auth_date старше 24ч → отказ', () => {
    const old = Math.floor(Date.now() / 1000) - 25 * 60 * 60;
    const init = buildTelegramInitData(token, { id: 7 }, old);
    const r = verifyTelegramInitData(init, token);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/устарел/);
  });
});

describe('Authenticator', () => {
  it('guest: создание возвращает секрет; верный секрет → успех', () => {
    const store = tmpStore();
    const auth = new Authenticator(store, {});
    const first = auth.authenticate({ provider: 'guest', name: 'Тест' });
    expect(first.ok).toBe(true);
    expect(first.secret).toBeTruthy();
    expect(first.account?.rated).toBe(false);

    const again = auth.authenticate({
      provider: 'guest',
      name: 'Тест2',
      accountId: first.account!.id,
      secret: first.secret,
    });
    expect(again.ok).toBe(true);
    expect(again.account!.id).toBe(first.account!.id);
    expect(again.secret).toBeUndefined();
    store.dispose();
  });

  it('guest: неверный секрет / чужой accountId → отказ', () => {
    const store = tmpStore();
    const auth = new Authenticator(store, {});
    const first = auth.authenticate({ provider: 'guest', name: 'A' });
    expect(
      auth.authenticate({
        provider: 'guest',
        name: 'A',
        accountId: first.account!.id,
        secret: 'wrong',
      }).ok,
    ).toBe(false);
    expect(
      auth.authenticate({
        provider: 'guest',
        name: 'A',
        accountId: '00000000-0000-0000-0000-000000000000',
        secret: first.secret,
      }).ok,
    ).toBe(false);
    store.dispose();
  });

  it('telegram без токена в env → отказ', () => {
    const store = tmpStore();
    const auth = new Authenticator(store, {});
    const r = auth.authenticate({
      provider: 'telegram',
      name: 'X',
      proof: 'hash=abc',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/выключен/);
    store.dispose();
  });

  it('telegram: валидный initData → аккаунт rated', () => {
    const store = tmpStore();
    const token = '999:TOKEN';
    const auth = new Authenticator(store, { telegramBotToken: token });
    const now = Math.floor(Date.now() / 1000);
    const proof = buildTelegramInitData(token, { id: 99, first_name: 'Tg' }, now);
    const r = auth.authenticate({ provider: 'telegram', name: 'Игрок', proof });
    expect(r.ok).toBe(true);
    expect(r.account?.provider).toBe('telegram');
    expect(r.account?.rated).toBe(true);
    expect(r.account?.externalId).toBe('99');
    expect(r.secret).toBeUndefined();
    store.dispose();
  });

  it('имя с U+202E санитизируется', () => {
    const store = tmpStore();
    const auth = new Authenticator(store, {});
    const r = auth.authenticate({ provider: 'guest', name: '\u202Ehacked' });
    expect(r.ok).toBe(true);
    expect(r.account!.displayName.includes('\u202E')).toBe(false);
    store.dispose();
  });
});

describe('verifyVkLaunchParams', () => {
  // Алгоритм: https://dev.vk.com/ru/mini-apps/development/launch-params-sign
  const secret = 'wvl68m4dR1UpLrVRli';
  const query = buildVkLaunchParams(secret, {
    vk_user_id: '494075',
    vk_app_id: '6736218',
    vk_is_app_user: '1',
    vk_are_notifications_enabled: '1',
    vk_language: 'ru',
    vk_access_token_settings: '',
    vk_platform: 'android',
  });

  it('принимает валидную подпись VK', () => {
    const r = verifyVkLaunchParams(query, secret);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.userId).toBe('494075');
  });

  it('отклоняет подделанный sign', () => {
    const broken = query.replace(/sign=[^&]+/, 'sign=AAAA');
    expect(verifyVkLaunchParams(broken, secret).ok).toBe(false);
  });

  it('отклоняет изменённое поле при том же sign', () => {
    const broken = query.replace('vk_user_id=494075', 'vk_user_id=1');
    expect(verifyVkLaunchParams(broken, secret).ok).toBe(false);
  });

  it('провайдер без секрета → отказ', () => {
    const store = tmpStore();
    const auth = new Authenticator(store, {});
    const r = auth.authenticate({ provider: 'vk', name: 'X', proof: query });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/выключен/);
    store.dispose();
  });
});

describe('verifyOkLaunchParams', () => {
  // @see https://apiok.ru/dev/app/ — auth_sig = md5(logged_user_id+session_key+secret)
  const secret = 'ok-app-secret';
  const userId = '123456';
  const sessionKey = 'sess-abc';
  const authSig = createHash('md5')
    .update(userId + sessionKey + secret, 'utf8')
    .digest('hex');
  const query =
    'logged_user_id=' +
    userId +
    '&session_key=' +
    sessionKey +
    '&auth_sig=' +
    authSig +
    '&application_key=pub';

  it('принимает валидный auth_sig', () => {
    const r = verifyOkLaunchParams(query, secret);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.userId).toBe(userId);
  });

  it('отклоняет подделанный auth_sig', () => {
    const broken = query.replace(authSig, 'deadbeef');
    expect(verifyOkLaunchParams(broken, secret).ok).toBe(false);
  });

  it('VK и OK с одним displayName → разные аккаунты', () => {
    const store = tmpStore();
    const auth = new Authenticator(store, {
      vkAppSecret: secret,
      okAppSecret: secret,
    });
    const vkProof = buildVkLaunchParams(secret, {
      vk_user_id: '99',
      vk_app_id: '1',
      vk_platform: 'web',
    });
    const vk = auth.authenticate({ provider: 'vk', name: 'Игрок', proof: vkProof });
    const okRes = auth.authenticate({ provider: 'ok', name: 'Игрок', proof: query });
    expect(vk.ok).toBe(true);
    expect(okRes.ok).toBe(true);
    expect(vk.account!.id).not.toBe(okRes.account!.id);
    store.dispose();
  });
});

describe('Authenticator yandex TOFU', () => {
  it('создание возвращает секрет; rated=false', () => {
    const store = tmpStore();
    const auth = new Authenticator(store, {});
    const first = auth.authenticate({
      provider: 'yandex',
      name: 'YaPlayer',
      externalId: 'ya-uid-1',
    });
    expect(first.ok).toBe(true);
    expect(first.secret).toBeTruthy();
    expect(first.account?.provider).toBe('yandex');
    expect(first.account?.rated).toBe(false);
    expect(first.account?.externalId).toBe('ya-uid-1');
    store.dispose();
  });

  it('повторный вход с секретом → тот же аккаунт', () => {
    const store = tmpStore();
    const auth = new Authenticator(store, {});
    const first = auth.authenticate({
      provider: 'yandex',
      name: 'A',
      externalId: 'ya-uid-2',
    });
    const again = auth.authenticate({
      provider: 'yandex',
      name: 'B',
      accountId: first.account!.id,
      secret: first.secret,
    });
    expect(again.ok).toBe(true);
    expect(again.account!.id).toBe(first.account!.id);
    expect(again.secret).toBeUndefined();
    store.dispose();
  });

  it('без externalId и без secret → отказ', () => {
    const store = tmpStore();
    const auth = new Authenticator(store, {});
    const r = auth.authenticate({ provider: 'yandex', name: 'X' });
    expect(r.ok).toBe(false);
    store.dispose();
  });

  it('известный externalId без секрета → отказ (защита от угона)', () => {
    const store = tmpStore();
    const auth = new Authenticator(store, {});
    auth.authenticate({ provider: 'yandex', name: 'A', externalId: 'ya-uid-3' });
    const r = auth.authenticate({ provider: 'yandex', name: 'Hacker', externalId: 'ya-uid-3' });
    expect(r.ok).toBe(false);
    store.dispose();
  });
});
