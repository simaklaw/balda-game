import { createHmac, timingSafeEqual } from 'node:crypto';
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
      case 'ok':
      case 'yandex':
        return { ok: false, error: 'Провайдер пока не подключён' };
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
}

export interface TelegramUser {
  id: string;
  firstName?: string;
  lastName?: string;
  username?: string;
}

/**
 * Проверка подписи Telegram WebApp initData.
 * 1) parse query-string, extract hash
 * 2) sort remaining key=value by key, join with \n
 * 3) secret = HMAC_SHA256(key="WebAppData", data=botToken)
 * 4) computed = hex(HMAC_SHA256(key=secret, data=data_check_string))
 * 5) timingSafeEqual(computed, hash)
 * 6) auth_date within 24h (5 min clock skew)
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
    return { ok: false, error: 'Нет auth_date' };
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
