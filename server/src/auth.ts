import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Account, AccountStore, Provider } from './accounts';
import { isProvider, sanitizeDisplayName } from './accounts';

export interface AuthRequest {
  provider: Provider;
  externalId?: string;
  /** telegram: initData; vk/ok: launch params string */
  proof?: string;
  /** TOFU: повторный вход */
  accountId?: string;
  secret?: string;
  name: string;
}

export interface AuthResult {
  ok: boolean;
  account?: Account;
  /** Только при первом создании TOFU-аккаунта. */
  secret?: string;
  error?: string;
}

export interface AuthEnv {
  telegramBotToken?: string;
  vkAppSecret?: string;
  okAppSecret?: string;
}

/**
 * Верификация входа по площадкам.
 * Провайдер без секрета в env — выключен (не «пускаем без проверки»).
 */
export class Authenticator {
  constructor(
    private readonly store: AccountStore,
    private readonly env: AuthEnv = {},
  ) {}

  authenticate(req: AuthRequest): AuthResult {
    if (!isProvider(req.provider)) {
      return { ok: false, error: 'Неизвестный провайдер' };
    }
    const name = sanitizeDisplayName(req.name);

    switch (req.provider) {
      case 'guest':
        return this.authGuest(req, name);
      case 'telegram':
        return this.authTelegram(req, name);
      case 'vk':
        return this.authVk(req, name);
      case 'ok':
        return this.authOk(req, name);
      case 'yandex':
        return this.authYandex(req, name);
      default:
        return { ok: false, error: 'Неизвестный провайдер' };
    }
  }

  private authGuest(req: AuthRequest, name: string): AuthResult {
    if (req.accountId !== undefined && req.secret !== undefined) {
      const acc = this.store.findById(req.accountId);
      if (acc === null || acc.provider !== 'guest') {
        return { ok: false, error: 'Аккаунт не найден' };
      }
      if (acc.banned) return { ok: false, error: 'Аккаунт заблокирован' };
      if (!this.store.verifySecret(acc, req.secret)) {
        return { ok: false, error: 'Неверный секрет' };
      }
      this.store.rename(acc.id, name);
      this.store.touch(acc.id);
      return { ok: true, account: acc };
    }

    const externalId =
      typeof req.externalId === 'string' && req.externalId.length > 0
        ? req.externalId.slice(0, 64)
        : crypto.randomUUID();
    try {
      const { account, secret } = this.store.create('guest', externalId, name, {
        rated: false,
        withSecret: true,
      });
      if (account.banned) return { ok: false, error: 'Аккаунт заблокирован' };
      return {
        ok: true,
        account,
        secret: secret ?? undefined,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Не удалось создать аккаунт',
      };
    }
  }

  /**
   * Telegram WebApp initData.
   * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
   */
  private authTelegram(req: AuthRequest, name: string): AuthResult {
    const botToken = this.env.telegramBotToken;
    if (botToken === undefined || botToken.length === 0) {
      return { ok: false, error: 'Telegram-вход выключен' };
    }
    const proof = req.proof;
    if (typeof proof !== 'string' || proof.length === 0 || proof.length > 4096) {
      return { ok: false, error: 'Нет данных Telegram' };
    }

    const verified = verifyTelegramInitData(proof, botToken);
    if (!verified.ok) {
      return { ok: false, error: verified.error };
    }

    const displayName =
      name !== 'Игрок'
        ? name
        : sanitizeDisplayName(
            [verified.user.firstName, verified.user.lastName].filter(Boolean).join(' ') ||
              verified.user.username ||
              'Telegram',
          );

    try {
      const existing = this.store.findByExternal('telegram', verified.user.id);
      if (existing !== null) {
        if (existing.banned) return { ok: false, error: 'Аккаунт заблокирован' };
        this.store.rename(existing.id, displayName);
        this.store.touch(existing.id);
        return { ok: true, account: existing };
      }
      const { account } = this.store.create('telegram', verified.user.id, displayName, {
        rated: true,
        withSecret: false,
      });
      return { ok: true, account };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Не удалось создать аккаунт',
      };
    }
  }

  /**
   * VK Mini Apps launch params.
   * @see https://dev.vk.com/ru/mini-apps/development/launch-params-sign
   */
  private authVk(req: AuthRequest, name: string): AuthResult {
    const appSecret = this.env.vkAppSecret;
    if (appSecret === undefined || appSecret.length === 0) {
      return { ok: false, error: 'VK-вход выключен' };
    }
    const proof = req.proof;
    if (typeof proof !== 'string' || proof.length === 0 || proof.length > 4096) {
      return { ok: false, error: 'Нет данных VK' };
    }
    const verified = verifyVkLaunchParams(proof, appSecret);
    if (!verified.ok) {
      return { ok: false, error: verified.error };
    }
    const displayName = name !== 'Игрок' ? name : 'VK';
    try {
      const existing = this.store.findByExternal('vk', verified.userId);
      if (existing !== null) {
        if (existing.banned) return { ok: false, error: 'Аккаунт заблокирован' };
        this.store.rename(existing.id, displayName);
        this.store.touch(existing.id);
        return { ok: true, account: existing };
      }
      const { account } = this.store.create('vk', verified.userId, displayName, {
        rated: true,
        withSecret: false,
      });
      return { ok: true, account };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Не удалось создать аккаунт',
      };
    }
  }

  /**
   * OK Games launch params.
   * Алгоритм auth_sig (НЕ копировать VK): MD5(logged_user_id + session_key + application_secret_key).
   * @see https://apiok.ru/dev/app/ — параметр auth_sig
   */
  private authOk(req: AuthRequest, name: string): AuthResult {
    const appSecret = this.env.okAppSecret;
    if (appSecret === undefined || appSecret.length === 0) {
      return { ok: false, error: 'OK-вход выключен' };
    }
    const proof = req.proof;
    if (typeof proof !== 'string' || proof.length === 0 || proof.length > 4096) {
      return { ok: false, error: 'Нет данных OK' };
    }
    const verified = verifyOkLaunchParams(proof, appSecret);
    if (!verified.ok) {
      return { ok: false, error: verified.error };
    }
    const displayName = name !== 'Игрок' ? name : 'OK';
    try {
      const existing = this.store.findByExternal('ok', verified.userId);
      if (existing !== null) {
        if (existing.banned) return { ok: false, error: 'Аккаунт заблокирован' };
        this.store.rename(existing.id, displayName);
        this.store.touch(existing.id);
        return { ok: true, account: existing };
      }
      const { account } = this.store.create('ok', verified.userId, displayName, {
        rated: true,
        withSecret: false,
      });
      return { ok: true, account };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Не удалось создать аккаунт',
      };
    }
  }

  /**
   * Яндекс Игры — TOFU по uniqueID (как guest).
   * client передаёт externalId = player.getUniqueID() (или getID()).
   * Подпись player.signature (signed: true) требует ключ после инапов — пока не верифицируем.
   * rated: false — не попадает в общий рейтинговый ладдер.
   */
  private authYandex(req: AuthRequest, name: string): AuthResult {
    if (req.accountId !== undefined && req.secret !== undefined) {
      const acc = this.store.findById(req.accountId);
      if (acc === null || acc.provider !== 'yandex') {
        return { ok: false, error: 'Аккаунт не найден' };
      }
      if (acc.banned) return { ok: false, error: 'Аккаунт заблокирован' };
      if (!this.store.verifySecret(acc, req.secret)) {
        return { ok: false, error: 'Неверный секрет' };
      }
      this.store.rename(acc.id, name);
      this.store.touch(acc.id);
      return { ok: true, account: acc };
    }

    const externalId =
      typeof req.externalId === 'string' ? req.externalId.trim().slice(0, 64) : '';
    if (externalId.length === 0) {
      return { ok: false, error: 'Нет идентификатора Яндекс' };
    }

    try {
      const existing = this.store.findByExternal('yandex', externalId);
      if (existing !== null) {
        if (existing.banned) return { ok: false, error: 'Аккаунт заблокирован' };
        if (req.secret !== undefined && req.secret.length > 0) {
          if (!this.store.verifySecret(existing, req.secret)) {
            return { ok: false, error: 'Неверный секрет' };
          }
          this.store.rename(existing.id, name);
          this.store.touch(existing.id);
          return { ok: true, account: existing };
        }
        return { ok: false, error: 'Нужен секрет для повторного входа' };
      }

      const { account, secret } = this.store.create('yandex', externalId, name, {
        rated: false,
        withSecret: true,
      });
      if (account.banned) return { ok: false, error: 'Аккаунт заблокирован' };
      return { ok: true, account, secret: secret ?? undefined };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Не удалось создать аккаунт',
      };
    }
  }
}

export interface TelegramUser {
  id: string;
  firstName?: string;
  lastName?: string;
  username?: string;
}

/**
 * Проверка подписи Telegram WebApp initData.
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  nowMs: number = Date.now(),
): { ok: true; user: TelegramUser } | { ok: false; error: string } {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, error: 'Некорректный initData' };
  }
  const hash = params.get('hash');
  if (hash === null || hash.length === 0) {
    return { ok: false, error: 'Нет hash' };
  }
  params.delete('hash');

  const pairs: string[] = [];
  for (const key of [...params.keys()].sort()) {
    pairs.push(key + '=' + (params.get(key) ?? ''));
  }
  const dataCheckString = pairs.join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(hash, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: 'Подпись неверна' };
  }

  const authDateRaw = params.get('auth_date');
  if (authDateRaw === null) {
    return { ok: false, error: 'Некорректный auth_date' };
  }
  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate)) {
    return { ok: false, error: 'Некорректный auth_date' };
  }
  const authMs = authDate * 1000;
  const skew = 5 * 60 * 1000;
  if (authMs > nowMs + skew) {
    return { ok: false, error: 'auth_date в будущем' };
  }
  if (nowMs - authMs > 24 * 60 * 60 * 1000) {
    return { ok: false, error: 'auth_date устарел' };
  }

  const userRaw = params.get('user');
  if (userRaw === null) {
    return { ok: false, error: 'Нет user' };
  }
  let userJson: unknown;
  try {
    userJson = JSON.parse(userRaw);
  } catch {
    return { ok: false, error: 'Некорректный user' };
  }
  if (typeof userJson !== 'object' || userJson === null) {
    return { ok: false, error: 'Некорректный user' };
  }
  const u = userJson as Record<string, unknown>;
  if (typeof u.id !== 'number' && typeof u.id !== 'string') {
    return { ok: false, error: 'Нет user.id' };
  }
  return {
    ok: true,
    user: {
      id: String(u.id),
      firstName: typeof u.first_name === 'string' ? u.first_name : undefined,
      lastName: typeof u.last_name === 'string' ? u.last_name : undefined,
      username: typeof u.username === 'string' ? u.username : undefined,
    },
  };
}

/**
 * Проверка подписи параметров запуска VK.
 * @see https://dev.vk.com/ru/mini-apps/development/launch-params-sign
 */
export function verifyVkLaunchParams(
  query: string,
  appSecret: string,
): { ok: true; userId: string } | { ok: false; error: string } {
  let params: URLSearchParams;
  try {
    const q = query.includes('?') ? query.slice(query.indexOf('?') + 1) : query;
    params = new URLSearchParams(q);
  } catch {
    return { ok: false, error: 'Некорректные параметры VK' };
  }
  const sign = params.get('sign');
  if (sign === null || sign.length === 0) {
    return { ok: false, error: 'Нет sign' };
  }

  const vkPairs: [string, string][] = [];
  for (const [key, value] of params.entries()) {
    if (key.startsWith('vk_')) vkPairs.push([key, value]);
  }
  if (vkPairs.length === 0) {
    return { ok: false, error: 'Нет vk_* параметров' };
  }
  vkPairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const dataCheckString = vkPairs
    .map(([k, v]) => k + '=' + encodeURIComponent(v).replace(/%20/g, '+'))
    .join('&');

  const digest = createHmac('sha256', appSecret).update(dataCheckString).digest();
  const computed = digest
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(sign, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: 'Подпись VK неверна' };
  }

  const userId = params.get('vk_user_id');
  if (userId === null || userId.length === 0) {
    return { ok: false, error: 'Нет vk_user_id' };
  }
  return { ok: true, userId };
}

/**
 * Проверка auth_sig параметров запуска Одноклассников.
 * Алгоритм (НЕ VK): auth_sig = md5(logged_user_id + session_key + application_secret_key).
 * @see https://apiok.ru/dev/app/ — поле auth_sig
 */
export function verifyOkLaunchParams(
  query: string,
  appSecret: string,
): { ok: true; userId: string } | { ok: false; error: string } {
  let params: URLSearchParams;
  try {
    const q = query.includes('?') ? query.slice(query.indexOf('?') + 1) : query;
    params = new URLSearchParams(q);
  } catch {
    return { ok: false, error: 'Некорректные параметры OK' };
  }
  const authSig = params.get('auth_sig');
  const userId = params.get('logged_user_id');
  const sessionKey = params.get('session_key');
  if (authSig === null || authSig.length === 0) {
    return { ok: false, error: 'Нет auth_sig' };
  }
  if (userId === null || userId.length === 0) {
    return { ok: false, error: 'Нет logged_user_id' };
  }
  if (sessionKey === null) {
    return { ok: false, error: 'Нет session_key' };
  }

  const computed = createHash('md5')
    .update(userId + sessionKey + appSecret, 'utf8')
    .digest('hex');

  const a = Buffer.from(computed.toLowerCase(), 'utf8');
  const b = Buffer.from(authSig.toLowerCase(), 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: 'Подпись OK неверна' };
  }
  return { ok: true, userId };
}
