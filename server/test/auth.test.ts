import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AccountStore } from '../src/accounts';
import { Authenticator, verifyTelegramInitData } from '../src/auth';

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
