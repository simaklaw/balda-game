import { Application, Container, Graphics, Text } from 'pixi.js';
import type { CellPos } from '@balda/shared';
import { SelectionModel } from '../game/SelectionModel';
import type { BoardReader } from '../game/SelectionModel';
import type { NetClient } from '../net/NetClient';
import type { RoomState, ServerMessage } from '../net/protocol';
import { BoardView } from './BoardView';
import { Button } from './Button';
import { HudView } from './HudView';
import { KeyboardView } from './KeyboardView';
import { safeInsets } from './safeArea';
import type { SafeInsets } from './safeArea';
import { FONT_FAMILY, palette } from '../theme';

export interface OnlineGameSceneCallbacks {
  onMenu: () => void;
}

const OPPONENT_REVEAL_MS = 900;
const POP_MS = 180;
const SHAKE_MS = 320;
const RECONNECT_DELAY_MS = 1500;
const MAX_RECONNECT_ATTEMPTS = 3;

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

/** Адаптер снимка RoomState под BoardReader для SelectionModel. */
class StateBoard implements BoardReader {
  private state: RoomState;

  constructor(state: RoomState) {
    this.state = state;
  }

  update(state: RoomState): void {
    this.state = state;
  }

  get size(): number {
    return this.state.size;
  }

  get(row: number, col: number): string {
    return this.state.board[row]?.[col] ?? '';
  }

  isEmpty(row: number, col: number): boolean {
    return this.get(row, col) === '';
  }
}

/** Онлайн-партия: состояние приходит от сервера, клиент только вводит ход. */
export class OnlineGameScene {
  readonly view = new Container();
  private readonly app: Application;
  private readonly net: NetClient;
  private readonly callbacks: OnlineGameSceneCallbacks;
  private state: RoomState;
  private readonly board: StateBoard;
  private readonly selection: SelectionModel;
  private readonly inputLayer: Graphics;
  private readonly hud: HudView;
  private readonly boardView: BoardView;
  private readonly timerText: Text;
  private readonly wordPreview: Text;
  private readonly btnCancel: Button;
  private readonly btnPass: Button;
  private readonly btnOk: Button;
  private readonly keyboard: KeyboardView;
  private controlWidth: number;
  private opponentCell: CellPos | null = null;
  private opponentTimer: ReturnType<typeof setTimeout> | null = null;
  private popCell: CellPos | null = null;
  private popStart = 0;
  private shakeActive = false;
  private shakeStart = 0;
  private boardX = 0;
  private destroyed = false;
  private dragActive = false;
  private dragMoved = false;
  private gameOverShown = false;
  private historyLen = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    app: Application,
    net: NetClient,
    initialState: RoomState,
    callbacks: OnlineGameSceneCallbacks,
  ) {
    this.app = app;
    this.net = net;
    this.callbacks = callbacks;
    // Сцена приходит на смену лобби — переадресуем обработчики NetClient себе.
    net.setHandlers({
      onMessage: (msg) => this.handleMessage(msg),
      onClose: () => this.scheduleReconnect(),
    });
    this.state = initialState;
    this.historyLen = initialState.history.length;
    this.board = new StateBoard(initialState);
    this.selection = new SelectionModel(this.board, initialState.size === 3 ? 3 : 4, false);

    const insets = safeInsets();
    this.inputLayer = new Graphics()
      .rect(0, 0, app.screen.width, app.screen.height)
      .fill({ color: 0xffffff, alpha: 0 });
    this.inputLayer.eventMode = 'static';
    this.view.addChild(this.inputLayer);

    this.hud = new HudView(app.screen.width, { human: 'Вы', opponent: 'Соперник' });
    this.view.addChild(this.hud);

    const cellSize = this.computeCellSize(app.screen.width, app.screen.height, initialState.size, insets);
    this.boardView = new BoardView(initialState.size, cellSize);
    this.view.addChild(this.boardView);

    this.timerText = new Text({
      text: '',
      style: { fontFamily: FONT_FAMILY, fontSize: 15, fill: palette().textDim },
    });
    this.timerText.anchor.set(0.5, 0);
    this.view.addChild(this.timerText);

    this.wordPreview = new Text({
      text: '',
      style: { fontFamily: FONT_FAMILY, fontSize: 20, fill: palette().text },
    });
    this.wordPreview.anchor.set(0.5, 0);
    this.view.addChild(this.wordPreview);

    this.controlWidth = this.computeControlWidth(app.screen.width, insets);
    const controlHeight = 46;
    this.btnCancel = new Button({
      caption: 'Отмена',
      width: this.controlWidth,
      height: controlHeight,
      color: palette().panel,
      fontSize: 16,
      onTap: () => this.onCancel(),
    });
    this.btnPass = new Button({
      caption: 'Пропуск',
      width: this.controlWidth,
      height: controlHeight,
      color: palette().panel,
      fontSize: 16,
      onTap: () => this.onPass(),
    });
    this.btnOk = new Button({
      caption: 'OK',
      width: this.controlWidth,
      height: controlHeight,
      color: palette().accent,
      onTap: () => this.onSubmit(),
    });
    this.view.addChild(this.btnCancel, this.btnPass, this.btnOk);

    this.keyboard = new KeyboardView(app.screen.width, (letter) => this.onLetter(letter));
    this.keyboard.visible = false;
    this.view.addChild(this.keyboard);

    this.layout();

    this.inputLayer.on('pointerdown', (e) => this.onPointerDown(e));
    app.stage.on('pointermove', this.stageMove);
    app.stage.on('pointerup', this.stageUp);
    app.stage.on('pointerupoutside', this.stageUp);
    window.addEventListener('resize', this.onResize);
    app.ticker.add(this.onTicker);
    this.refresh();
  }

  private computeCellSize(width: number, height: number, boardSize: number, insets: SafeInsets): number {
    const reservedTop = 84 + insets.top;
    const reservedBottom = 216 + insets.bottom;
    const cell = Math.min(
      Math.floor((width - 20 - insets.left - insets.right) / boardSize),
      Math.floor((height - reservedTop - reservedBottom) / boardSize),
    );
    return Math.max(34, Math.min(110, cell));
  }

  private computeControlWidth(width: number, insets: SafeInsets): number {
    const availW = width - 32 - insets.left - insets.right;
    return Math.min(118, Math.max(64, Math.floor((availW - 16) / 3)));
  }

  private layout(): void {
    const insets = safeInsets();
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    this.inputLayer.clear();
    this.inputLayer.rect(0, 0, width, height).fill({ color: 0xffffff, alpha: 0 });
    this.hud.layout(width);
    this.hud.position.set(0, insets.top);
    this.controlWidth = this.computeControlWidth(width, insets);
    this.btnCancel.setWidth(this.controlWidth);
    this.btnPass.setWidth(this.controlWidth);
    this.btnOk.setWidth(this.controlWidth);
    const boardPx = this.boardView.boardPixelSize;
    const boardY = 84 + insets.top;
    this.boardX = Math.max(insets.left, Math.floor((width - boardPx) / 2));
    this.boardView.position.set(this.boardX, boardY);
    this.timerText.position.set(width / 2, 60 + insets.top);
    this.wordPreview.position.set(width / 2, boardY + boardPx + 8);
    const gap = 8;
    const total = this.controlWidth * 3 + gap * 2;
    const controlY = height - 58 - insets.bottom;
    const startX = Math.floor((width - total) / 2);
    this.btnCancel.position.set(startX, controlY);
    this.btnPass.position.set(startX + (this.controlWidth + gap), controlY);
    this.btnOk.position.set(startX + (this.controlWidth + gap) * 2, controlY);
    this.keyboard.position.set(0, height - 64 - insets.bottom - this.keyboard.keyboardHeight);
  }

  private get isMyTurn(): boolean {
    return (
      this.state.status === 'playing' &&
      this.state.currentPlayer === this.state.you &&
      this.state.players[this.state.you]?.connected === true
    );
  }

  private get opponentConnected(): boolean {
    const other = this.state.you === 0 ? 1 : 0;
    return this.state.players[other]?.connected === true;
  }

  private onPointerDown(e: { global: { x: number; y: number } }): void {
    if (!this.isMyTurn || this.gameOverShown) return;
    const local = this.boardView.toLocal(e.global);
    const cell = this.boardView.cellAt(local.x, local.y);
    if (cell === null) return;
    this.dragActive = true;
    const phase = this.selection.snapshot.phase;
    if (phase === 'building') {
      this.selection.extendPath(cell.row, cell.col);
    } else {
      this.selection.tapCell(cell.row, cell.col);
      this.keyboard.visible = this.selection.snapshot.phase === 'choosingLetter';
    }
    this.refresh();
  }

  private readonly stageMove = (e: { global: { x: number; y: number } }): void => {
    if (!this.dragActive || this.selection.snapshot.phase !== 'building') return;
    const local = this.boardView.toLocal(e.global);
    const cell = this.boardView.cellAt(local.x, local.y);
    if (cell === null) return;
    if (this.selection.extendPath(cell.row, cell.col)) {
      this.dragMoved = true;
      this.refresh();
    }
  };

  private readonly stageUp = (): void => {
    const wasDragging = this.dragActive;
    const moved = this.dragMoved;
    this.dragActive = false;
    this.dragMoved = false;
    if (wasDragging && moved && this.selection.canSubmit()) this.onSubmit();
  };

  private readonly onResize = (): void => {
    this.layout();
  };

  private readonly onTicker = (): void => {
    if (this.destroyed) return;
    const now = performance.now();
    this.updateTimerDisplay();
    if (this.popCell !== null) {
      const t = (now - this.popStart) / POP_MS;
      if (t >= 1) {
        this.boardView.setPulse(this.popCell.row, this.popCell.col, 1);
        this.popCell = null;
      } else {
        const scale = 1 + 0.16 * Math.sin(Math.PI * t);
        this.boardView.setPulse(this.popCell.row, this.popCell.col, scale);
      }
    }
  };

  private onLetter(letter: string): void {
    if (!this.isMyTurn || this.gameOverShown) return;
    if (this.selection.chooseLetter(letter)) {
      this.keyboard.visible = false;
      this.refresh();
    }
  }

  private onCancel(): void {
    this.selection.reset();
    this.keyboard.visible = false;
    this.refresh();
  }

  private onPass(): void {
    if (!this.isMyTurn || this.gameOverShown) return;
    this.selection.reset();
    this.keyboard.visible = false;
    this.net.send({ type: 'pass' });
    this.refresh('Ход отправлен…');
  }

  private onSubmit(): void {
    if (!this.isMyTurn || this.gameOverShown) return;
    const move = this.selection.toMove();
    if (move === null) {
      this.shakeBoard();
      this.refresh('Выделите слово, включая новую букву');
      return;
    }
    this.net.send({ type: 'move', path: move.path, cell: move.cell, letter: move.letter });
    this.selection.reset();
    this.keyboard.visible = false;
    this.refresh('Ход отправлен…');
  }

  private handleMessage(msg: ServerMessage): void {
    if (this.destroyed) return;
    if (msg.type === 'state') {
      this.applyState(msg.state);
      return;
    }
    if (msg.type === 'error') {
      this.shakeBoard();
      this.refresh(msg.message);
      return;
    }
    if (msg.type === 'game-over') {
      this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
      if (this.state.status !== 'finished') {
        this.state = {
          ...this.state,
          status: 'finished',
          winner: msg.winner,
          endReason: msg.reason,
        };
      }
      this.refresh();
      this.showGameOver(msg);
    }
  }

  private applyState(state: RoomState): void {
    const prevLen = this.historyLen;
    const prevYou = this.state.you;
    this.state = state;
    this.board.update(state);
    this.historyLen = state.history.length;
    this.reconnectAttempts = 0;
    if (state.history.length > prevLen && state.currentPlayer === state.you) {
      const last = state.history[state.history.length - 1];
      if (last !== undefined && last.player !== prevYou) {
        this.opponentCell = { row: last.cell.row, col: last.cell.col };
        this.startPop(last.cell);
        if (this.opponentTimer !== null) clearTimeout(this.opponentTimer);
        this.opponentTimer = setTimeout(() => {
          this.opponentTimer = null;
          if (this.destroyed) return;
          this.opponentCell = null;
          this.refresh();
        }, OPPONENT_REVEAL_MS);
        this.refresh('Соперник: ' + last.word.toUpperCase() + ' (+' + last.points + ')');
        return;
      }
    }
    this.refresh();
  }

  private refresh(statusOverride?: string): void {
    const snap = this.selection.snapshot;
    let status: string;
    if (statusOverride !== undefined) {
      status = statusOverride;
    } else if (this.state.status === 'finished') {
      status = 'Партия окончена';
    } else if (!this.opponentConnected) {
      status = 'Ожидание соперника…';
    } else if (!this.isMyTurn) {
      status = 'Ход соперника…';
    } else if (snap.phase === 'idle') {
      status = 'Ваш ход: коснитесь клетки с «+»';
    } else if (snap.phase === 'choosingLetter') {
      status = 'Выберите букву';
    } else {
      status = 'Выделите слово и нажмите OK';
    }
    const me = this.state.players[this.state.you] ?? { score: 0 };
    const other = this.state.players[this.state.you === 0 ? 1 : 0] ?? { score: 0 };
    this.hud.update(me.score, other.score, status);
    const word = snap.phase === 'building' && snap.path.length > 0 ? this.selection.currentWord() : '';
    this.wordPreview.text = word === '' ? '' : word.toUpperCase() + '  +' + snap.path.length;
    this.boardView.sync(
      (row, col) => this.board.get(row, col),
      {
        newCell: snap.newCell,
        previewLetter: snap.previewLetter,
        path: snap.path,
        aiCell: this.opponentCell,
        aiPath: [],
        showPlaceable: this.isMyTurn && snap.phase === 'idle',
      },
    );
    const active = this.isMyTurn && !this.gameOverShown;
    this.btnCancel.setEnabled(active && snap.phase !== 'idle');
    this.btnPass.setEnabled(active);
    this.btnOk.setEnabled(active && this.selection.canSubmit());
    this.updateTimerDisplay();
  }

  private updateTimerDisplay(): void {
    if (this.state.status !== 'playing' || this.state.turnDeadline === null) {
      this.timerText.visible = false;
      return;
    }
    this.timerText.visible = true;
    const left = this.state.turnDeadline - Date.now();
    const text = 'На ход: ' + formatClock(left);
    if (this.timerText.text !== text) this.timerText.text = text;
    this.timerText.style.fill = left <= 10_000 && this.isMyTurn ? palette().danger : palette().textDim;
  }

  private startPop(cell: CellPos): void {
    this.popCell = { row: cell.row, col: cell.col };
    this.popStart = performance.now();
  }

  private shakeBoard(): void {
    if (this.shakeActive || this.destroyed) return;
    this.shakeActive = true;
    this.shakeStart = performance.now();
    this.app.ticker.add(this.shakeTicker);
  }

  private readonly shakeTicker = (): void => {
    const t = performance.now() - this.shakeStart;
    if (t >= SHAKE_MS || this.destroyed) {
      this.shakeActive = false;
      this.app.ticker.remove(this.shakeTicker);
      if (!this.destroyed) this.boardView.position.x = this.boardX;
      return;
    }
    const amplitude = 5 * (1 - t / SHAKE_MS);
    this.boardView.position.x = this.boardX + Math.sin(t / 28) * amplitude;
  };

  private showGameOver(msg: Extract<ServerMessage, { type: 'game-over' }>): void {
    if (this.gameOverShown) return;
    this.gameOverShown = true;
    this.keyboard.visible = false;
    const insets = safeInsets();
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const overlay = new Container();
    overlay.eventMode = 'static';
    overlay.addChild(new Graphics().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.75 }));
    const panelWidth = Math.min(340, width - 40);
    const panelX = Math.floor((width - panelWidth) / 2);
    const panelY = Math.max(48 + insets.top, Math.floor((height - 300) / 2));
    overlay.addChild(
      new Graphics()
        .roundRect(panelX, panelY, panelWidth, 240, 16)
        .fill({ color: palette().panel })
        .stroke({ width: 2, color: palette().panelBorder }),
    );
    const you = this.state.you;
    const winner = msg.winner;
    const title = new Text({
      text: winner === null ? 'Ничья' : winner === you ? 'Победа!' : 'Поражение',
      style: { fontFamily: FONT_FAMILY, fontSize: 30, fill: palette().text },
    });
    title.anchor.set(0.5);
    title.position.set(width / 2, panelY + 48);
    overlay.addChild(title);
    const score = msg.scores[you] ?? 0;
    const opponentScore = msg.scores[you === 0 ? 1 : 0] ?? 0;
    const rating = msg.deltaRating[you] ?? 0;
    const chips = msg.deltaChips[you] ?? 0;
    const details = new Text({
      text:
        score + ' : ' + opponentScore +
        '\nРейтинг: ' + (rating >= 0 ? '+' : '') + rating +
        (chips > 0 ? '  ·  +' + chips + ' фишек' : ''),
      style: { fontFamily: FONT_FAMILY, fontSize: 18, fill: palette().textDim, align: 'center', lineHeight: 26 },
    });
    details.anchor.set(0.5, 0);
    details.position.set(width / 2, panelY + 84);
    overlay.addChild(details);
    const btnMenu = new Button({
      caption: 'В меню',
      width: panelWidth - 44,
      height: 48,
      fontSize: 20,
      onTap: () => {
        setTimeout(() => this.callbacks.onMenu(), 0);
      },
    });
    btnMenu.position.set(panelX + 22, panelY + 160);
    overlay.addChild(btnMenu);
    this.view.addChild(overlay);
  }

  /** Обрыв связи: сервер держит слот 45 секунд — пробуем вернуться. */
  private scheduleReconnect(): void {
    if (this.destroyed || this.gameOverShown) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.refresh('Соединение потеряно. Обновите страницу.');
      return;
    }
    this.reconnectAttempts += 1;
    this.refresh('Соединение потеряно, переподключение…');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.destroyed || this.gameOverShown) return;
      void this.net.reconnect();
    }, RECONNECT_DELAY_MS);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.opponentTimer !== null) clearTimeout(this.opponentTimer);
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    if (this.shakeActive) {
      this.shakeActive = false;
      this.app.ticker.remove(this.shakeTicker);
    }
    this.app.ticker.remove(this.onTicker);
    this.app.stage.off('pointermove', this.stageMove);
    this.app.stage.off('pointerup', this.stageUp);
    this.app.stage.off('pointerupoutside', this.stageUp);
    window.removeEventListener('resize', this.onResize);
    this.view.destroy({ children: true });
  }
}
