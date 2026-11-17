import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AccountStore,
  hashSecret,
  sanitizeDisplayName,
  verifySecretHash,
} from '../src/accounts';

const dirs: string[] = [];
afterEach(() => {
  /* temp dirs — OS чистит */
});

function tmpStore(max = 1000): AccountStore {
  const dir = mkdtempSync(join(tmpdir(), 'balda-acc-'));
  dirs.push(dir);
  const store = new AccountStore(join(dir, 'accounts.json'), max, 0);
  store.load();
  return store;
}

describe('sanitizeDisplayName', () => {
  it('обрезает до 24 и убирает zero-width / bidi', () => {
    expect(sanitizeDisplayName('  Боб\u200B  ')).toBe('Боб');
    expect(sanitizeDisplayName('\u202Ehack')).toBe('hack');
    expect(sanitizeDisplayName('а'.repeat(30)).length).toBe(24);
  });
});

describe('secret hash', () => {
  it('verifySecretHash принимает верный секрет', () => {
    const secret = 'test-secret-value';
    const h = hashSecret(secret);
    expect(verifySecretHash(secret, h)).toBe(true);
    expect(verifySecretHash('other', h)).toBe(false);
  });
});

describe('AccountStore', () => {
  it('create guest: secret один раз, rated false', () => {
    const store = tmpStore();
    const { account, secret } = store.create('guest', 'ext-1', 'Алиса', {
      rated: false,
      withSecret: true,
    });
    expect(secret).toBeTruthy();
    expect(account.rated).toBe(false);
    expect(account.provider).toBe('guest');
    expect(store.findByExternal('guest', 'ext-1')?.id).toBe(account.id);
    expect(store.verifySecret(account, secret!)).toBe(true);
    expect(store.verifySecret(account, 'wrong')).toBe(false);
    store.dispose();
  });

  it('два одинаковых displayName, разные externalId → разные аккаунты', () => {
    const store = tmpStore();
    const a = store.create('guest', 'id-a', 'БОБ', { withSecret: true }).account;
    const b = store.create('guest', 'id-b', 'боб', { withSecret: true }).account;
    expect(a.id).not.toBe(b.id);
    expect(store.size).toBe(2);
    store.dispose();
  });

  it('один externalId, разные имена → один аккаунт', () => {
    const store = tmpStore();
    const first = store.create('telegram', '42', 'Иван', { withSecret: false }).account;
    const second = store.create('telegram', '42', 'Иванка', { withSecret: false }).account;
    expect(second.id).toBe(first.id);
    expect(second.displayName).toBe('Иванка');
    expect(store.size).toBe(1);
    store.dispose();
  });

  it('VK и Telegram с одним externalId → разные аккаунты', () => {
    const store = tmpStore();
    const vk = store.create('vk', '100', 'Игрок', { withSecret: false }).account;
    const tg = store.create('telegram', '100', 'Игрок', { withSecret: false }).account;
    expect(vk.id).not.toBe(tg.id);
    store.dispose();
  });

  it('applyResult: rated=false не меняет рейтинг, но считает партии', () => {
    const store = tmpStore();
    const { account } = store.create('guest', 'g1', 'G', { rated: false, withSecret: true });
    store.applyResult(account.id, 1200, true);
    const updated = store.findById(account.id)!;
    expect(updated.rating).toBe(1000);
    expect(updated.games).toBe(1);
    expect(updated.wins).toBe(1);
    expect(updated.chips).toBeGreaterThan(0);
    store.dispose();
  });

  it('лимит MAX_ACCOUNTS', () => {
    const store = tmpStore(1);
    store.create('guest', '1', 'A', { withSecret: true });
    expect(() => store.create('guest', '2', 'B', { withSecret: true })).toThrow(/лимит/);
    expect(store.accountsFullTotal).toBe(1);
    store.dispose();
  });

  it('persist + reload', () => {
    const dir = mkdtempSync(join(tmpdir(), 'balda-acc-'));
    const path = join(dir, 'accounts.json');
    const store = new AccountStore(path, 1000, 0);
    store.load();
    const { account, secret } = store.create('guest', 'persist', 'P', { withSecret: true });
    store.flush();
    const raw = readFileSync(path, 'utf8');
    expect(raw).toContain(account.id);

    const store2 = new AccountStore(path, 1000, 0);
    store2.load();
    const loaded = store2.findById(account.id);
    expect(loaded).not.toBeNull();
    expect(store2.verifySecret(loaded!, secret!)).toBe(true);
    store.dispose();
    store2.dispose();
  });
});
