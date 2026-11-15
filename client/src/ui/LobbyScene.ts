import { Application, Container, Graphics, Text } from 'pixi.js';
import { NetClient } from '../net/NetClient';
import type { SessionStore } from '../net/NetClient';
import { detectWsOverride, resolveWsUrl } from '../net/wsUrl';
import type { RoomState, ServerMessage } from '../net/protocol';
import { Button } from './Button';
import { KeyboardView } from './KeyboardView';
import { safeInsets } from './safeArea';
import { FONT_FAMILY, palette } from '../theme';

export interface LobbySceneCallbacks {
  onBack: () => void;
  onGameStarted: (client: NetClient, state: RoomState) => void;
}

/**
 * Онлайн-лобби: быстрый матч, приватная комната по коду, вход по коду.
 * Код вводится на кастомной клавиатуре (только буквы — коды сервера буквы и есть).
 */
export class LobbyScene {
  readonly view = new Container();
  private readonly app: Application;
  private readonly callbacks: LobbySceneCallbacks;
  private readonly store: SessionStore | undefined;
  private readonly playerName: string;
  private readonly title: Text;
  private readonly statusText: Text;
  private readonly btnQuick: Button;
  private readonly btnCreate: Button;
  private readonly btnJoin: Button;
  private readonly btnBack: Button;
  private net: NetClient | null = null;
  private joining = false;
  private codeOverlay: Container | null = null;
  private codeValue = '';
  private destroyed = false;

  constructor(app: Application, playerName: string, store: SessionStore | undefined, callbacks: LobbySceneCallbacks) {
    this.app = app;
    this.playerName = playerName;
    this.store = store;
    this.callbacks = callbacks;

    this.title = new Text({
      text: 'ОНЛАЙН',
      style: { fontFamily: FONT_FAMILY, fontSize: 44, fill: palette().text },
    });
    this.title.anchor.set(0.5);

    this.statusText = new Text({
      text: '',
      style: {
        fontFamily: FONT_FAMILY,
        fontSize: 15,
        fill: palette().textDim,
        wordWrap: true,
        wordWrapWidth: Math.max(240, app.screen.width - 60),
        align: 'center',
      },
    });
    this.statusText.anchor.set(0.5, 0);

    const width = app.screen.width;
    const buttonWidth = Math.min(260, width - 40);
    this.btnQuick = new Button({
      caption: 'Быстрая игра',
      width: buttonWidth,
      height: 54,
      fontSize: 20,
      onTap: () => void this.quickMatch(),
    });
    this.btnCreate = new Button({
      caption: 'Создать комнату',
      width: buttonWidth,
      height: 48,
      color: palette().panel,
      fontSize: 17,
      onTap: () => void this.createRoom(),
    });
    this.btnJoin = new Button({
      caption: 'Войти по коду',
      width: buttonWidth,
      height: 48,
      color: palette().panel,
      fontSize: 17,
      onTap: () => this.showCodeEntry(),
    });
    this.btnBack = new Button({
      caption: 'Назад',
      width: buttonWidth,
      height: 44,
      color: palette().panel,
      fontSize: 16,
      onTap: () => {
        setTimeout(() => this.callbacks.onBack(), 0);
      },
    });
    this.view.addChild(this.title, this.statusText, this.btnQuick, this.btnCreate, this.btnJoin, this.btnBack);

    window.addEventListener('resize', this.onResize);
    this.layout();
  }

  private readonly onResize = (): void => {
    this.layout();
  };

  private layout(): void {
    const insets = safeInsets();
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const buttonWidth = Math.min(260, width - 40);
    this.btnQuick.setWidth(buttonWidth);
    this.btnCreate.setWidth(buttonWidth);
    this.btnJoin.setWidth(buttonWidth);
    this.btnBack.setWidth(buttonWidth);
    this.statusText.style.wordWrapWidth = Math.max(240, width - 60);
    const totalH = 54 + 48 + 48 + 44 + 12 * 3;
    let y = insets.top + Math.max(24, Math.floor((height - insets.top - insets.bottom - totalH - 140) / 2));
    this.title.position.set(width / 2, y + 22);
    y += 64;
    this.btnQuick.position.set((width - buttonWidth) / 2, y);
    y += 54 + 12;
    this.btnCreate.position.set((width - buttonWidth) / 2, y);
    y += 48 + 12;
    this.btnJoin.position.set((width - buttonWidth) / 2, y);
    y += 48 + 12;
    this.btnBack.position.set((width - buttonWidth) / 2, y);
    y += 44 + 18;
    this.statusText.position.set(width / 2, y);
  }

  private setStatus(text: string): void {
    this.statusText.text = text;
  }

  private setButtonsEnabled(value: boolean): void {
    this.btnQuick.setEnabled(value);
    this.btnCreate.setEnabled(value);
    this.btnJoin.setEnabled(value);
  }

  private async ensureConnected(): Promise<NetClient | null> {
    if (this.net !== null && this.net.connected) return this.net;
    this.setStatus('Подключение…');
    const url = resolveWsUrl(window.location.protocol, window.location.host, detectWsOverride());
    const net = new NetClient(
      url,
      { onMessage: (msg) => this.onMessage(msg), onClose: () => this.onNetClose() },
      this.store,
    );
    try {
      await net.connect();
    } catch {
      this.setStatus('Сервер недоступен. Попробуйте позже.');
      return null;
    }
    this.net = net;
    return net;
  }

  private async quickMatch(): Promise<void> {
    this.setButtonsEnabled(false);
    const net = await this.ensureConnected();
    if (net === null) {
      this.setButtonsEnabled(true);
      return;
    }
    this.joining = true;
    this.setStatus('Ищем соперника…');
    net.send({ type: 'quick-match', name: this.playerName });
  }

  private async createRoom(): Promise<void> {
    this.setButtonsEnabled(false);
    const net = await this.ensureConnected();
    if (net === null) {
      this.setButtonsEnabled(true);
      return;
    }
    this.joining = true;
    this.setStatus('Создаём комнату…');
    net.send({ type: 'create-room', name: this.playerName });
  }

  private onMessage(msg: ServerMessage): void {
    if (this.destroyed) return;
    if (msg.type === 'joined') {
      const state = msg.state as RoomState;
      if (state.status === 'playing') {
        this.startGame(state);
        return;
      }
      const room = String(msg.roomId);
      this.setStatus('Комната ' + room + ' — ждём соперника…');
      return;
    }
    if (msg.type === 'state') {
      const state = msg.state as RoomState;
      if (state.status === 'playing' && this.joining) {
        this.startGame(state);
      }
      return;
    }
    if (msg.type === 'error') {
      this.joining = false;
      this.setButtonsEnabled(true);
      this.setStatus(String(msg.message));
    }
  }

  private onNetClose(): void {
    if (this.destroyed) return;
    this.joining = false;
    this.net = null;
    this.setButtonsEnabled(true);
    this.setStatus('Соединение потеряно.');
  }

  private startGame(state: RoomState): void {
    if (this.net === null) return;
    const net = this.net;
    this.net = null;
    this.destroyed = true;
    window.removeEventListener('resize', this.onResize);
    setTimeout(() => this.callbacks.onGameStarted(net, state), 0);
  }

  /** Ввод кода комнаты на кастомной клавиатуре. */
  private showCodeEntry(): void {
    if (this.codeOverlay !== null) return;
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const overlay = new Container();
    overlay.eventMode = 'static';
    overlay.addChild(new Graphics().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.75 }));
    const codeText = new Text({
      text: '—',
      style: { fontFamily: FONT_FAMILY, fontSize: 40, fill: palette().text },
    });
    codeText.anchor.set(0.5);
    codeText.position.set(width / 2, height * 0.22);
    overlay.addChild(codeText);
    const keyboard = new KeyboardView(width, (letter) => {
      if (this.codeValue.length < 5) {
        this.codeValue += letter.toUpperCase();
        codeText.text = this.codeValue;
      }
    });
    keyboard.position.set(0, height - 24 - keyboard.keyboardHeight);
    overlay.addChild(keyboard);
    const buttonWidth = Math.min(200, width - 40);
    const btnOk = new Button({
      caption: 'Войти',
      width: buttonWidth,
      height: 48,
      onTap: () => {
        const code = this.codeValue;
        this.closeCodeEntry();
        if (code.length >= 3) void this.joinRoom(code);
      },
    });
    btnOk.position.set(width / 2 - buttonWidth - 10, height - 40 - keyboard.keyboardHeight - 56);
    overlay.addChild(btnOk);
    const btnCancel = new Button({
      caption: 'Отмена',
      width: buttonWidth,
      height: 48,
      color: palette().panel,
      onTap: () => this.closeCodeEntry(),
    });
    btnCancel.position.set(width / 2 + 10, height - 40 - keyboard.keyboardHeight - 56);
    overlay.addChild(btnCancel);
    this.codeValue = '';
    this.codeOverlay = overlay;
    this.view.addChild(overlay);
  }

  private closeCodeEntry(): void {
    if (this.codeOverlay === null) return;
    this.view.removeChild(this.codeOverlay);
    this.codeOverlay.destroy({ children: true });
    this.codeOverlay = null;
    this.codeValue = '';
  }

  private async joinRoom(code: string): Promise<void> {
    this.setButtonsEnabled(false);
    const net = await this.ensureConnected();
    if (net === null) {
      this.setButtonsEnabled(true);
      return;
    }
    this.joining = true;
    this.setStatus('Входим в комнату ' + code.toUpperCase() + '…');
    net.send({ type: 'join-room', name: this.playerName, roomId: code.toUpperCase() });
  }

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener('resize', this.onResize);
    this.net?.close();
    this.net = null;
    this.view.destroy({ children: true });
  }
}
