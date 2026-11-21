import { Application, Container, Graphics, Text } from 'pixi.js';
import { NetClient } from '../net/NetClient';
import type { SessionStore } from '../net/NetClient';
import { detectWsOverride, resolveWsUrl } from '../net/wsUrl';
import type { AuthProvider, PlayerProfile, RoomState, ServerMessage } from '../net/protocol';
import type { PlatformId, PlatformSocial } from '../platform/types';
import { Button } from './Button';
import { KeyboardView } from './KeyboardView';
import { safeInsets } from './safeArea';
import { FONT_FAMILY, palette } from '../theme';

export interface LobbySceneCallbacks {
  onBack: () => void;
  onGameStarted: (client: NetClient, state: RoomState) => void;
}

/** Возможности площадки для игры с друзьями. */
export interface LobbyExtras {
  social?: PlatformSocial;
  /** Код комнаты из ссылки-приглашения: входим автоматически. */
  launchRoom?: string | null;
}

/** Сколько ждём ответ сервера на запрос профиля. */
const PROFILE_TIMEOUT_MS = 5000;

/**
 * Онлайн-лобби: быстрый матч, приватная комната по коду, вход по коду,
 * профиль игрока. Код вводится на кастомной клавиатуре (только буквы —
 * коды сервера буквы и есть).
 */
export class LobbyScene {
  readonly view = new Container();
  private readonly app: Application;
  private readonly callbacks: LobbySceneCallbacks;
  private readonly store: SessionStore | undefined;
  private readonly playerName: string;
  private readonly platformId: PlatformId;
  private readonly title: Text;
  private readonly statusText: Text;
  private readonly btnQuick: Button;
  private readonly btnCreate: Button;
  private readonly btnJoin: Button;
  private readonly btnProfile: Button;
  private readonly btnBack: Button;
  private readonly btnInvite: Button;
  private readonly social: PlatformSocial | undefined;
  private waitingRoom: string | null = null;
  private net: NetClient | null = null;
  private joining = false;
  private codeOverlay: Container | null = null;
  private codeValue = '';
  private profileOverlay: Container | null = null;
  private profileResolve: ((profile: PlayerProfile | null) => void) | null = null;
  private destroyed = false;

  constructor(
    app: Application,
    playerName: string,
    store: SessionStore | undefined,
    callbacks: LobbySceneCallbacks,
    platformId: PlatformId = 'web',
    extras: LobbyExtras = {},
  ) {
    this.social = extras.social;
    this.app = app;
    this.playerName = playerName;
    this.store = store;
    this.callbacks = callbacks;
    this.platformId = platformId;

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
      sfx: 'play',
      shimmer: true,
      width: buttonWidth,
      height: 54,
      fontSize: 20,
      onTap: () => void this.quickMatch(),
    });
    this.btnCreate = new Button({
      caption: 'Создать комнату',
      sfx: 'confirm',
      width: buttonWidth,
      height: 48,
      color: palette().panel,
      fontSize: 17,
      onTap: () => void this.createRoom(),
    });
    this.btnJoin = new Button({
      caption: 'Войти по коду',
      sfx: 'open',
      width: buttonWidth,
      height: 48,
      color: palette().panel,
      fontSize: 17,
      onTap: () => this.showCodeEntry(),
    });
    this.btnProfile = new Button({
      caption: 'Профиль',
      sfx: 'open',
      width: buttonWidth,
      height: 48,
      color: palette().panel,
      fontSize: 17,
      onTap: () => void this.showProfile(),
    });
    this.btnBack = new Button({
      caption: 'Назад',
      sfx: 'back',
      width: buttonWidth,
      height: 44,
      color: palette().panel,
      fontSize: 16,
      onTap: () => {
        setTimeout(() => this.callbacks.onBack(), 0);
      },
    });
    this.btnInvite = new Button({
      caption: 'Пригласить друга',
      sfx: 'confirm',
      width: buttonWidth,
      height: 48,
      fontSize: 17,
      onTap: () => void this.invite(),
    });
    this.btnInvite.visible = false;
    this.view.addChild(
      this.btnInvite,
      this.title,
      this.statusText,
      this.btnQuick,
      this.btnCreate,
      this.btnJoin,
      this.btnProfile,
      this.btnBack,
    );

    window.addEventListener('resize', this.onResize);
    this.layout();
    const launch = extras.launchRoom;
    if (launch !== undefined && launch !== null && launch !== '') {
      setTimeout(() => {
        if (!this.destroyed) void this.joinRoom(launch);
      }, 0);
    }
  }

  private async invite(): Promise<void> {
    const room = this.waitingRoom;
    if (room === null || this.social === undefined) return;
    try {
      const ok = await this.social.invite(room);
      if (!ok) this.setStatus('Комната ' + room + ' — сообщите код другу. Ждём соперника…');
    } catch {
      this.setStatus('Комната ' + room + ' — сообщите код другу. Ждём соперника…');
    }
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
    this.btnProfile.setWidth(buttonWidth);
    this.btnBack.setWidth(buttonWidth);
    this.statusText.style.wordWrapWidth = Math.max(240, width - 60);
    const totalH = 54 + 48 + 48 + 48 + 44 + 12 * 4;
    let y = insets.top + Math.max(24, Math.floor((height - insets.top - insets.bottom - totalH - 140) / 2));
    this.title.position.set(width / 2, y + 22);
    y += 64;
    this.btnQuick.position.set((width - buttonWidth) / 2, y);
    y += 54 + 12;
    this.btnCreate.position.set((width - buttonWidth) / 2, y);
    y += 48 + 12;
    this.btnJoin.position.set((width - buttonWidth) / 2, y);
    y += 48 + 12;
    this.btnProfile.position.set((width - buttonWidth) / 2, y);
    y += 48 + 12;
    this.btnBack.position.set((width - buttonWidth) / 2, y);
    y += 44 + 18;
    this.statusText.position.set(width / 2, y);
    this.btnInvite.setWidth(buttonWidth);
    this.btnInvite.position.set((width - buttonWidth) / 2, y + 52);
  }

  private setStatus(text: string): void {
    this.statusText.text = text;
  }

  private setButtonsEnabled(value: boolean): void {
    this.btnQuick.setEnabled(value);
    this.btnCreate.setEnabled(value);
    this.btnJoin.setEnabled(value);
    this.btnProfile.setEnabled(value);
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

  /**
   * Пока proof/externalId площадок не подключены на клиенте — всегда guest.
   * platformId сохранён для следующего шага (VK/TG/Yandex proof).
   */
  private authProvider(): AuthProvider {
    void this.platformId;
    return 'guest';
  }

  /** Вход перед матчем (сервер требует auth). */
  private async ensureAuth(net: NetClient): Promise<boolean> {
    this.setStatus('Вход…');
    const result = await net.authenticate({
      provider: this.authProvider(),
      name: this.playerName,
    });
    if (!result.ok) {
      this.setStatus(result.message);
      return false;
    }
    return true;
  }

  private async quickMatch(): Promise<void> {
    this.setButtonsEnabled(false);
    const net = await this.ensureConnected();
    if (net === null) {
      this.setButtonsEnabled(true);
      return;
    }
    if (!(await this.ensureAuth(net))) {
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
    if (!(await this.ensureAuth(net))) {
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
      this.waitingRoom = room;
      this.btnInvite.visible = this.social !== undefined;
      return;
    }
    if (msg.type === 'state') {
      const state = msg.state as RoomState;
      if (state.status === 'playing' && this.joining) {
        this.startGame(state);
      }
      return;
    }
    if (msg.type === 'profile') {
      const resolve = this.profileResolve;
      this.profileResolve = null;
      resolve?.(msg.profile);
      return;
    }
    if (msg.type === 'auth-failed') {
      this.joining = false;
      this.setButtonsEnabled(true);
      this.setStatus(String(msg.message));
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

  private async showProfile(): Promise<void> {
    if (this.profileOverlay !== null) return;
    this.setButtonsEnabled(false);
    const net = await this.ensureConnected();
    if (net === null) {
      this.setButtonsEnabled(true);
      return;
    }
    this.setStatus('Загрузка профиля…');
    const profile = await new Promise<PlayerProfile | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), PROFILE_TIMEOUT_MS);
      this.profileResolve = (value) => {
        clearTimeout(timer);
        resolve(value);
      };
      net.send({ type: 'profile', name: this.playerName });
    });
    this.profileResolve = null;
    this.setButtonsEnabled(true);
    if (this.destroyed) return;
    this.setStatus('');
    this.openProfileOverlay(profile);
  }

  private openProfileOverlay(profile: PlayerProfile | null): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const overlay = new Container();
    overlay.eventMode = 'static';
    overlay.addChild(new Graphics().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.75 }));

    const panelWidth = Math.min(320, width - 40);
    const title = new Text({
      text: 'ПРОФИЛЬ',
      style: { fontFamily: FONT_FAMILY, fontSize: 26, fill: palette().text },
    });
    title.anchor.set(0.5, 0);

    let body: string;
    if (profile === null) {
      body = 'Партий пока не было —\nсыграйте онлайн!';
    } else {
      const winrate =
        profile.games > 0 ? Math.round((profile.wins / profile.games) * 100) + '%' : '—';
      body =
        'Рейтинг: ' + profile.rating + '\n' +
        'Фишки: ' + profile.chips + '\n' +
        'Партии: ' + profile.games + '\n' +
        'Победы: ' + profile.wins + '\n' +
        'Винрейт: ' + winrate;
    }
    const bodyText = new Text({
      text: body,
      style: {
        fontFamily: FONT_FAMILY,
        fontSize: 19,
        fill: palette().text,
        lineHeight: 30,
        align: 'center',
      },
    });
    bodyText.anchor.set(0.5, 0);

    const btnClose = new Button({
      caption: 'Закрыть',
      sfx: 'back',
      width: Math.min(200, panelWidth - 40),
      height: 48,
      onTap: () => this.closeProfileOverlay(),
    });

    const titleH = 40;
    const bodyH = profile === null ? 70 : 150;
    const panelH = titleH + bodyH + 48 + 12 * 3;
    const panel = new Graphics()
      .roundRect(0, 0, panelWidth, panelH, 16)
      .fill({ color: palette().bg })
      .stroke({ width: 2, color: palette().panelBorder });
    panel.position.set((width - panelWidth) / 2, (height - panelH) / 2);
    overlay.addChild(panel);
    title.position.set(width / 2, panel.y + 20);
    bodyText.position.set(width / 2, panel.y + titleH + 10);
    btnClose.position.set((width - btnClose.width) / 2, panel.y + panelH - 48 - 12);
    overlay.addChild(title, bodyText, btnClose);

    this.profileOverlay = overlay;
    this.view.addChild(overlay);
  }

  private closeProfileOverlay(): void {
    if (this.profileOverlay === null) return;
    this.view.removeChild(this.profileOverlay);
    this.profileOverlay.destroy({ children: true });
    this.profileOverlay = null;
  }

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
      sfx: 'confirm',
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
      sfx: 'cancel',
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
    if (!(await this.ensureAuth(net))) {
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
