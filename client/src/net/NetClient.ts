import { parseServerMessage } from './protocol';
import type { ClientMessage, ServerMessage } from './protocol';

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
}
