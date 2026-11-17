import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CHIPS_PER_WIN } from './elo';

/** Стартовый рейтинг нового аккаунта. */
export const START_RATING = 1000;

/** Провайдеры входа. guest — локальный TOFU без площадки. */
export type Provider = 'vk' | 'ok' | 'telegram' | 'yandex' | 'guest';

export interface Account {
  id: string;
  provider: Provider;
  externalId: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  chips: number;
  games: number;
  wins: number;
  /** guest и yandex-lite → false: не попадают в рейтинговый ладдер. */
  rated: boolean;
  /** sha256(secret) для TOFU-провайдеров; null если площадка даёт proof. */
  secretHash: string | null;
  banned: boolean;
  createdAt: number;
  lastSeenAt: number;
}

const PROVIDERS: ReadonlySet<Provider> = new Set(['vk', 'ok', 'telegram', 'yandex', 'guest']);

export function isProvider(v: unknown): v is Provider {
  return typeof v === 'string' && PROVIDERS.has(v as Provider);
}

/** Убрать zero-width / bidi-override и обрезать до 24. */
export function sanitizeDisplayName(name: string): string {
  const cleaned = name
    .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g, '')
    .trim()
    .slice(0, 24);
  return cleaned.length > 0 ? cleaned : 'Игрок';
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function generateSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Сравнение секрета с хешем без утечки по времени. */
export function verifySecretHash(secret: string, secretHash: string): boolean {
  const a = Buffer.from(hashSecret(secret), 'utf8');
  const b = Buffer.from(secretHash, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function externalKey(provider: Provider, externalId: string): string {
  return provider + ':' + externalId;
}

function isAccount(value: unknown): value is Account {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    isProvider(v.provider) &&
    typeof v.externalId === 'string' &&
    typeof v.displayName === 'string' &&
    (v.avatarUrl === null || typeof v.avatarUrl === 'string') &&
    typeof v.rating === 'number' &&
    typeof v.chips === 'number' &&
    typeof v.games === 'number' &&
    typeof v.wins === 'number' &&
    typeof v.rated === 'boolean' &&
    (v.secretHash === null || typeof v.secretHash === 'string') &&
    typeof v.banned === 'boolean' &&
    typeof v.createdAt === 'number' &&
    typeof v.lastSeenAt === 'number'
  );
}

/**
 * Файловое хранилище аккаунтов, привязанных к площадкам.
 * Ключ идентичности: (provider, externalId). Имя — только кэш.
 * Атомарная запись (tmp + rename), дебаунс flush.
 */
export class AccountStore {
  private accounts = new Map<string, Account>();
  private byExternal = new Map<string, string>();
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxAccounts: number;
  private readonly debounceMs: number;
  private fullCount = 0;

  constructor(
    private readonly path: string,
    maxAccounts?: number,
    debounceMs = 250,
  ) {
    this.maxAccounts = maxAccounts ?? Number(process.env.MAX_ACCOUNTS ?? 100_000);
    this.debounceMs = debounceMs;
  }

  load(): void {
    this.accounts.clear();
    this.byExternal.clear();
    try {
      if (!existsSync(this.path)) return;
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return;
      for (const value of Object.values(parsed as Record<string, unknown>)) {
        if (!isAccount(value)) continue;
        this.accounts.set(value.id, value);
        this.byExternal.set(externalKey(value.provider, value.externalId), value.id);
      }
    } catch {
      this.accounts.clear();
      this.byExternal.clear();
    }
  }

  findById(id: string): Account | null {
    return this.accounts.get(id) ?? null;
  }

  findByExternal(provider: Provider, externalId: string): Account | null {
    const id = this.byExternal.get(externalKey(provider, externalId));
    return id === undefined ? null : (this.accounts.get(id) ?? null);
  }

  create(
    provider: Provider,
    externalId: string,
    name: string,
    options?: { rated?: boolean; avatarUrl?: string | null; withSecret?: boolean },
  ): { account: Account; secret: string | null } {
    const existing = this.findByExternal(provider, externalId);
    if (existing !== null) {
      existing.displayName = sanitizeDisplayName(name);
      existing.lastSeenAt = Date.now();
      this.scheduleFlush();
      return { account: existing, secret: null };
    }
    if (this.accounts.size >= this.maxAccounts) {
      this.fullCount += 1;
      throw new Error('Достигнут лимит аккаунтов');
    }
    const withSecret = options?.withSecret ?? (provider === 'guest' || provider === 'yandex');
    const secret = withSecret ? generateSecret() : null;
    const now = Date.now();
    const account: Account = {
      id: crypto.randomUUID(),
      provider,
      externalId,
      displayName: sanitizeDisplayName(name),
      avatarUrl: options?.avatarUrl ?? null,
      rating: START_RATING,
      chips: 0,
      games: 0,
      wins: 0,
      rated: options?.rated ?? provider !== 'guest',
      secretHash: secret === null ? null : hashSecret(secret),
      banned: false,
      createdAt: now,
      lastSeenAt: now,
    };
    this.accounts.set(account.id, account);
    this.byExternal.set(externalKey(provider, externalId), account.id);
    this.scheduleFlush();
    return { account, secret };
  }

  verifySecret(account: Account, secret: string): boolean {
    if (account.secretHash === null) return false;
    return verifySecretHash(secret, account.secretHash);
  }

  touch(id: string): void {
    const a = this.accounts.get(id);
    if (a === undefined) return;
    a.lastSeenAt = Date.now();
    this.scheduleFlush();
  }

  rename(id: string, name: string): void {
    const a = this.accounts.get(id);
    if (a === undefined) return;
    a.displayName = sanitizeDisplayName(name);
    a.lastSeenAt = Date.now();
    this.scheduleFlush();
  }

  setBanned(id: string, banned: boolean): void {
    const a = this.accounts.get(id);
    if (a === undefined) return;
    a.banned = banned;
    this.scheduleFlush();
  }

  applyResult(id: string, newRating: number, won: boolean): void {
    const a = this.accounts.get(id);
    if (a === undefined) return;
    if (a.rated) {
      a.rating = Math.round(newRating);
    }
    a.games += 1;
    if (won) {
      a.wins += 1;
      a.chips += CHIPS_PER_WIN;
    }
    a.lastSeenAt = Date.now();
    this.scheduleFlush();
  }

  get size(): number {
    return this.accounts.size;
  }

  get accountsFullTotal(): number {
    return this.fullCount;
  }

  flush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.dirty && this.accounts.size === 0 && !existsSync(this.path)) return;
    this.dirty = false;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = this.path + '.tmp';
      const obj: Record<string, Account> = {};
      for (const [id, acc] of this.accounts) obj[id] = acc;
      writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
      renameSync(tmp, this.path);
    } catch {
      /* диск недоступен */
    }
  }

  dispose(): void {
    this.flush();
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.debounceMs);
  }
}
