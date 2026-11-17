import { parseServerMessage } from './protocol';
import type { AuthProvider, ClientMessage, ServerMessage } from './protocol';

/** Хранилище сессии (PlatformStorage адаптера платформы). */
export interface SessionStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface StoredSession {
  roomId: string;
  playerId: string;
  token: string;
}

export const SESSION_KEY = 'balda.online.session';
export const ACCOUNT_KEY = 'balda.online.account';

export interface AccountCredentials {
  accountId: string;
  secret: string;
  provider: AuthProvider;
}

type MessageHandler = (msg: ServerMessage) => void;

export interface NetClientOptions {
  onMessage: MessageHandler;
  onClose?: () => void;
}

/**
 * Обёртка WebSocket: сессия комнаты (roomId + playerId + секрет-токен)
 * сохраняется в хранилище платформы и используется для reconnect.
 */
export class NetClient {
  private ws: WebSocket | null = null;
  private session: StoredSession | null = null;
  private account: AccountCredentials | null = null;
  private closedByUser = false;

  constructor(
    private readonly url: string,
    private handlers: NetClientOptions,
    private readonly store: SessionStore | undefined,
  ) {}

  /**
   * Заменить обработчики сообщений (при смене сцены лобби → партия
   * тот же NetClient продолжает работать, но сообщения идут новой сцене).
   */
  setHandlers(next: Partial<NetClientOptions>): void {
    this.handlers = { ...this.handlers, ...next };
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Не удалось подключиться'));
        return;
      }
      this.closedByUser = false;
      this.ws = ws;
      let settled = false;
      ws.onopen = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Сервер недоступен'));
        }
      };
      ws.onclose = () => {
        this.ws = null;
        if (!settled) {
          settled = true;
          reject(new Error('Соединение закрыто'));
        }
        if (!this.closedByUser) this.handlers.onClose?.();
      };
      ws.onmessage = (ev: MessageEvent) => {
        const msg = parseServerMessage(String(ev.data));
        if (msg !== null) this.handleMessage(msg);
      };
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws !== null && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === 1;
  }

  get hasSession(): boolean {
    return this.session !== null;
  }

  /**
   * Вход на сервер. Guest: создаёт TOFU-аккаунт или восстанавливает по secret.
   * Сохраняет secret в platform storage.
   */
  authenticate(opts: {
    provider: AuthProvider;
    name: string;
    externalId?: string;
    proof?: string;
  }): Promise<{ ok: true; accountId: string; name: string } | { ok: false; message: string }> {
    return new Promise((resolve) => {
      if (!this.connected) {
        resolve({ ok: false, message: 'Нет соединения' });
        return;
      }
      let settled = false;
      const prev = this.handlers.onMessage;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.handlers.onMessage = prev;
        resolve({ ok: false, message: 'Таймаут входа' });
      }, 8000);

      this.handlers.onMessage = (msg) => {
        if (msg.type === 'auth-ok') {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.handlers.onMessage = prev;
          if (typeof msg.secret === 'string' && msg.secret.length > 0) {
            this.account = {
              accountId: msg.accountId,
              secret: msg.secret,
              provider: opts.provider,
            };
            void this.persistAccount();
          } else if (this.account?.accountId === msg.accountId) {
            /* secret уже есть */
          } else {
            this.account = {
              accountId: msg.accountId,
              secret: this.account?.secret ?? '',
              provider: opts.provider,
            };
          }
          resolve({ ok: true, accountId: msg.accountId, name: msg.name });
          return;
        }
        if (msg.type === 'auth-failed' || msg.type === 'error') {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.handlers.onMessage = prev;
          resolve({ ok: false, message: msg.message });
          return;
        }
        prev(msg);
      };

      void this.restoreAccount().then((saved) => {
        const payload: ClientMessage = {
          type: 'auth',
          provider: opts.provider,
          name: opts.name,
          externalId: opts.externalId,
          proof: opts.proof,
        };
        if (
          saved !== null &&
          saved.provider === opts.provider &&
          saved.secret.length > 0
        ) {
          payload.accountId = saved.accountId;
          payload.secret = saved.secret;
        }
        this.send(payload);
      });
    });
  }

  get accountId(): string | null {
    return this.account?.accountId ?? null;
  }

  /** Переподключиться и восстановить слот по сохранённой сессии. */
  async reconnect(): Promise<boolean> {
    if (this.session === null) {
      this.session = await this.restoreSession();
    }
    if (this.session === null) return false;
    const saved = this.session;
    try {
      await this.connect();
    } catch {
      return false;
    }
    this.send({ type: 'reconnect', roomId: saved.roomId, playerId: saved.playerId, token: saved.token });
    return true;
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
  }

  private handleMessage(msg: ServerMessage): void {
    if (msg.type === 'joined') {
      this.session = { roomId: msg.roomId, playerId: msg.playerId, token: msg.token };
      void this.persistSession();
    } else if (msg.type === 'game-over') {
      this.session = null;
      void this.clearSession();
    }
    this.handlers.onMessage(msg);
  }

  private async restoreSession(): Promise<StoredSession | null> {
    if (this.store === undefined) return null;
    try {
      const raw = await this.store.get(SESSION_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw) as Partial<StoredSession>;
      if (
        typeof parsed.roomId === 'string' &&
        typeof parsed.playerId === 'string' &&
        typeof parsed.token === 'string'
      ) {
        return { roomId: parsed.roomId, playerId: parsed.playerId, token: parsed.token };
      }
    } catch {
      /* битая сессия — начинаем с чистого листа */
    }
    return null;
  }

  private async persistSession(): Promise<void> {
    if (this.store === undefined || this.session === null) return;
    try {
      await this.store.set(SESSION_KEY, JSON.stringify(this.session));
    } catch {
      /* хранилище недоступно — reconnect будет невозможен, игра продолжается */
    }
  }

  private async clearSession(): Promise<void> {
    if (this.store === undefined) return;
    try {
      await this.store.remove(SESSION_KEY);
    } catch {
      /* не критично */
    }
  }

  private async restoreAccount(): Promise<AccountCredentials | null> {
    if (this.account !== null) return this.account;
    if (this.store === undefined) return null;
    try {
      const raw = await this.store.get(ACCOUNT_KEY);
      if (raw === null) return null;
      const parsed = JSON.parse(raw) as Partial<AccountCredentials>;
      if (
        typeof parsed.accountId === 'string' &&
        typeof parsed.secret === 'string' &&
        typeof parsed.provider === 'string'
      ) {
        this.account = {
          accountId: parsed.accountId,
          secret: parsed.secret,
          provider: parsed.provider as AuthProvider,
        };
        return this.account;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  private async persistAccount(): Promise<void> {
    if (this.store === undefined || this.account === null) return;
    try {
      await this.store.set(ACCOUNT_KEY, JSON.stringify(this.account));
    } catch {
      /* не критично */
    }
  }
}
