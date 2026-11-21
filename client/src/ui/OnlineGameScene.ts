import { Application, Container, Graphics, Text } from 'pixi.js';
import type { CellPos } from '@balda/shared';
import { SelectionModel } from '../game/SelectionModel';
import type { BoardReader } from '../game/SelectionModel';
import type { NetClient } from '../net/NetClient';
import type { RoomState, ServerMessage } from '../net/protocol';
import { BoardView } from './BoardView';
import { Button } from './Button';
import { sound } from '../audio/Sound';
import { showWordsOverlay } from './DefinitionOverlay';
import { gameOverText } from './gameOverText';
import { HudView } from './HudView';
import { computeGameLayout, keyboardMetricsFor } from './layout';
import { KeyboardView } from './KeyboardView';
import { safeInsets } from './safeArea';
import { shouldReduceMotion } from '../perf';
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
  private readonly btnResign: Button;
  private readonly keyboard: KeyboardView;
  private controlWidth: number;
  private opponentCell: CellPos | null = null;
  private opponentTimer: ReturnType<typeof setTimeout> | null = null;
  private boardX = 0;
  private boardCellSize = 0;
  private previewFits = true;
  private destroyed = false;
  private dragActive = false;
  private popStart = 0;
  private popCell: CellPos | null = null;
  private shakeUntil = 0;
  private shakeActive = false;
  private gameOverShown = false;
  private resignConfirm = false;
  private gameOverOverlay: Container | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private historyLen = 0;
  private lastGameOverMsg: Extract<ServerMessage, { type: 'game-over' }> | null = null;

  constructor(
    app: Application,
    net: NetClient,
    initialState: RoomState,
    callbacks: OnlineGameSceneCallbacks,
  ) {
    this.app = app;
    this.net = net;
    this.callbacks = callbacks;
    this.state = initialState;
    this.board = new StateBoard(initialState);
    this.historyLen = initialState.history.length;
    this.selection = new SelectionModel(
      this.board,
      initialState.size === 3 ? 3 : 4,
      false,
    );

    this.net.setHandlers({
      onMessage: (msg) => this.handleMessage(msg),
      onClose: () => this.scheduleReconnect(),
    });

    this.inputLayer = new Graphics();
    this.inputLayer.eventMode = 'static';
    this.inputLayer.cursor = 'pointer';
    this.view.addChild(this.inputLayer);

    const insets = safeInsets();
    const initialLayout = computeGameLayout({
      width: app.screen.width,
      height: app.screen.height,
      boardSize: initialState.size,
      insets,
      keyboardHeight: keyboardMetricsFor(app.screen.width).height,
      controlCount: 4,
    });

    this.hud = new HudView(app.screen.width, { human: 'Вы', opponent: 'Соперник' });
    this.view.addChild(this.hud);
    // Нажатие на панель игроков — список слов партии и толкования (Викисловарь).
    this.hud.eventMode = 'static';
    this.hud.cursor = 'pointer';
    this.hud.on('pointertap', () => this.openWords());

    this.boardView = new BoardView(initialState.size, initialLayout.cellSize);
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

    this.controlWidth = initialLayout.controlWidth;
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
    this.btnResign = new Button({
      caption: 'Сдаться',
      width: this.controlWidth,
      height: controlHeight,
      color: palette().panel,
      fontSize: 15,
      onTap: () => this.onResign(),
    });
    this.view.addChild(this.btnCancel, this.btnPass, this.btnOk, this.btnResign);

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

  private layout(): void {
    const insets = safeInsets();
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    this.inputLayer.clear();
    this.inputLayer.rect(0, 0, width, height).fill({ color: 0xffffff, alpha: 0 });
    const layout = computeGameLayout({
      width,
      height,
      boardSize: this.state.size,
      insets,
      keyboardHeight: keyboardMetricsFor(width).height,
      controlCount: 4,
    });
    this.hud.layout(width);
    this.hud.position.set(0, layout.hudY);
    this.controlWidth = layout.controlWidth;
    this.btnCancel.setWidth(layout.controlWidth);
    this.btnPass.setWidth(layout.controlWidth);
    this.btnOk.setWidth(layout.controlWidth);
    this.btnResign.setWidth(layout.controlWidth);
    if (layout.cellSize !== this.boardCellSize) {
      this.boardCellSize = layout.cellSize;
      this.boardView.setCellSize(layout.cellSize);
    }
    this.boardX = layout.boardX;
    this.boardView.position.set(layout.boardX, layout.boardY);
    this.timerText.position.set(layout.timerX, layout.timerY);
    this.previewFits = layout.previewFits;
    this.wordPreview.position.set(layout.wordPreviewX, layout.wordPreviewY);
    this.wordPreview.visible = layout.previewFits;
    const gap = layout.controlGap;
    this.btnCancel.position.set(layout.controlX, layout.controlY);
    this.btnPass.position.set(layout.controlX + (layout.controlWidth + gap), layout.controlY);
    this.btnOk.position.set(layout.controlX + (layout.controlWidth + gap) * 2, layout.controlY);
    this.btnResign.position.set(layout.controlX + (layout.controlWidth + gap) * 3, layout.controlY);
    this.keyboard.setWidth(layout.keyboardWidth, layout.keyboardRows);
    this.keyboard.position.set(layout.keyboardX, layout.keyboardY);
  }

  private wordsOpen = false;

  /** Список слов партии; нажатие на слово показывает толкование. */
  private openWords(): void {
    if (this.destroyed || this.gameOverShown || this.wordsOpen) return;
    this.wordsOpen = true;
    showWordsOverlay(this.app, this.view, this.state.history, this.state.you === 0 ? ['Вы', 'Соперник'] : ['Соперник', 'Вы'], () => {
      this.wordsOpen = false;
    });
  }

  private onResize = (): void => {
    this.layout();
    this.refresh();
  };

  private stageMove = (e: { global: { x: number; y: number } }): void => {
    if (!this.dragActive || this.selection.snapshot.phase !== 'building') return;
    const cell = this.hitCell(e.global.x, e.global.y);
    if (cell && this.selection.extendPath(cell.row, cell.col)) sound.play('select', this.selection.snapshot.path.length - 1);
    this.refresh();
  };

  private stageUp = (): void => {
    this.dragActive = false;
  };

  private onTicker = (): void => {
    this.updateTimers();
    this.tickPop();
  };

  private hitCell(x: number, y: number): CellPos | null {
    const localX = x - this.boardX;
    const localY = y - this.boardView.position.y;
    if (localX < 0 || localY < 0) return null;
    const col = Math.floor(localX / this.boardCellSize);
    const row = Math.floor(localY / this.boardCellSize);
    if (row < 0 || col < 0 || row >= this.state.size || col >= this.state.size) return null;
    return { row, col };
  }

  private get isMyTurn(): boolean {
    return this.state.status === 'playing' && this.state.currentPlayer === this.state.you;
  }

  private onPointerDown(e: { global: { x: number; y: number } }): void {
    if (this.gameOverShown || !this.isMyTurn) return;
    this.dragActive = true;
    const cell = this.hitCell(e.global.x, e.global.y);
    if (!cell) return;
    const phase = this.selection.snapshot.phase;
    if (phase === 'building') {
      if (this.selection.extendPath(cell.row, cell.col)) sound.play('select', this.selection.snapshot.path.length - 1);
    } else {
      if (this.selection.tapCell(cell.row, cell.col)) sound.play('tap');
      this.keyboard.visible = this.selection.snapshot.phase === 'choosingLetter';
    }
    this.refresh();
  }

  private onCancel(): void {
    this.selection.reset();
    this.keyboard.visible = false;
    this.refresh();
  }

  /** Сдача: первый тап — подтверждение, второй — leave (resign на сервере). */
  private onResign(): void {
    if (this.gameOverShown) return;
    if (!this.resignConfirm) {
      this.resignConfirm = true;
      this.btnResign.setCaption('Точно?');
      setTimeout(() => {
        if (this.destroyed) return;
        this.resignConfirm = false;
        this.btnResign.setCaption('Сдаться');
      }, 3000);
      return;
    }
    this.resignConfirm = false;
    this.btnResign.setCaption('Сдаться');
    this.net.send({ type: 'leave' });
  }

  private onPass(): void {
    if (!this.isMyTurn || this.gameOverShown) return;
    this.net.send({ type: 'pass' });
  }

  private onSubmit(): void {
    if (!this.isMyTurn || this.gameOverShown) return;
    const move = this.selection.toMove();
    if (!move) return;
    this.net.send({ type: 'move', ...move });
    this.selection.reset();
    this.keyboard.visible = false;
    this.refresh();
  }

  private onLetter(letter: string): void {
    if (this.selection.chooseLetter(letter)) {
      sound.play('place');
      this.keyboard.visible = false;
      this.refresh();
    }
  }

  private handleMessage(msg: ServerMessage): void {
    if (msg.type === 'error') {
      sound.play('error');
      this.triggerShake();
      this.refresh(msg.message);
      return;
    }
    if (msg.type === 'state') {
      this.applyState(msg.state);
      return;
    }
    if (msg.type === 'joined') {
      this.reconnectAttempts = 0;
      this.applyState(msg.state);
      return;
    }
    if (msg.type === 'game-over') {
      this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
      this.lastGameOverMsg = msg;
      this.showGameOver(msg);
    }
  }

  private applyState(state: RoomState): void {
    const prevYou = this.state.you;
    const prevLen = this.historyLen;
    this.state = state;
    this.board.update(state);
    this.historyLen = state.history.length;
    if (state.history.length > prevLen) {
      const mine = state.history[state.history.length - 1];
      if (mine !== undefined && mine.player === prevYou) sound.play('word', mine.word.length);
    }
    if (state.history.length > prevLen && state.currentPlayer === state.you) {
      const last = state.history[state.history.length - 1];
      if (last !== undefined && last.player !== prevYou) {
        this.opponentCell = { row: last.cell.row, col: last.cell.col };
        this.startPop(last.cell);
        sound.play('opponent');
        if (this.opponentTimer !== null) clearTimeout(this.opponentTimer);
        this.opponentTimer = setTimeout(() => {
          this.opponentTimer = null;
          this.opponentCell = null;
          this.refresh();
        }, OPPONENT_REVEAL_MS);
        this.refresh('Соперник: ' + last.word.toUpperCase() + ' (+' + last.points + ')');
        this.selection.reset();
        this.keyboard.visible = false;
        this.reconnectAttempts = 0;
        return;
      }
    }
    this.selection.reset();
    this.keyboard.visible = false;
    this.reconnectAttempts = 0;
    this.refresh();
    if (state.status === 'finished' && !this.gameOverShown && this.lastGameOverMsg) {
      this.showGameOver(this.lastGameOverMsg);
    }
  }

  private startPop(cell: CellPos): void {
    this.popCell = { row: cell.row, col: cell.col };
    this.popStart = performance.now();
  }

  private tickPop(): void {
    if (this.popCell === null) return;
    if (shouldReduceMotion()) {
      this.boardView.setPulse(this.popCell.row, this.popCell.col, 1);
      this.popCell = null;
      return;
    }
    const t = (performance.now() - this.popStart) / POP_MS;
    if (t >= 1) {
      this.boardView.setPulse(this.popCell.row, this.popCell.col, 1);
      this.popCell = null;
      return;
    }
    const scale = 1 + 0.18 * Math.sin(t * Math.PI);
    this.boardView.setPulse(this.popCell.row, this.popCell.col, scale);
  }

  private updateTimers(): void {
    if (this.state.status !== 'playing' || this.state.turnDeadline === null) {
      this.timerText.visible = false;
      return;
    }
    this.timerText.visible = true;
    const left = this.state.turnDeadline - Date.now();
    this.timerText.text = 'На ход: ' + formatClock(left);
    this.timerText.style.fill =
      left <= 10_000 && this.isMyTurn ? palette().danger : palette().textDim;
  }

  private refresh(statusOverride?: string): void {
    const snap = this.selection.snapshot;
    let status = statusOverride ?? '';
    const me = this.state.players[this.state.you] ?? { score: 0, name: 'Вы' };
    const other = this.state.players[this.state.you === 0 ? 1 : 0] ?? { score: 0, name: 'Соперник' };
    if (status === '' && this.state.status === 'waiting') status = 'Ожидание соперника…';
    if (status === '' && this.state.status === 'playing') {
      status = this.isMyTurn ? 'Ваш ход' : 'Ход соперника';
    }
    const word = snap.phase === 'building' && snap.path.length > 0 ? this.selection.currentWord() : '';
    const wordLabel = word === '' ? '' : word.toUpperCase() + '  +' + snap.path.length;
    if (!this.previewFits && wordLabel !== '') status = wordLabel;
    this.hud.update(
      me.score,
      other.score,
      status,
      this.state.status === 'playing' ? (this.isMyTurn ? 'human' : 'opponent') : null,
    );
    this.wordPreview.text = this.previewFits ? wordLabel : '';
    this.wordPreview.visible = this.previewFits && wordLabel !== '';
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
    this.btnOk.setEnabled(active && this.selection.canSubmit());
    this.btnPass.setEnabled(active);
    this.btnCancel.setEnabled(active);
    this.btnResign.setEnabled(!this.gameOverShown);
    this.updateTimers();
  }

  private triggerShake(): void {
    if (shouldReduceMotion()) return;
    this.shakeUntil = performance.now() + SHAKE_MS;
    if (!this.shakeActive) {
      this.shakeActive = true;
      this.app.ticker.add(this.shakeTicker);
    }
  }

  private shakeTicker = (): void => {
    const now = performance.now();
    if (now >= this.shakeUntil) {
      this.boardView.position.x = this.boardX;
      this.shakeActive = false;
      this.app.ticker.remove(this.shakeTicker);
      return;
    }
    const t = (this.shakeUntil - now) / SHAKE_MS;
    this.boardView.position.x = this.boardX + Math.sin(now / 30) * 6 * t;
  };

  private showGameOver(msg: Extract<ServerMessage, { type: 'game-over' }>): void {
    if (this.gameOverShown) return;
    this.gameOverShown = true;
    const you = this.state.you;
    sound.play(msg.winner === null ? 'draw' : msg.winner === you ? 'win' : 'lose');
    const winner = msg.winner;
    const over = gameOverText(winner === null ? null : winner === you ? 0 : 1, msg.reason);
    const titleColor =
      over.tone === 'success' ? palette().success : over.tone === 'danger' ? palette().danger : palette().text;
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const overlay = new Container();
    const dim = new Graphics();
    dim.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.55 });
    overlay.addChild(dim);
    const panelWidth = Math.min(320, width - 32);
    const panelHeight = 220;
    const panelX = (width - panelWidth) / 2;
    const panelY = (height - panelHeight) / 2;
    const panel = new Graphics();
    panel.roundRect(panelX, panelY, panelWidth, panelHeight, 16).fill({ color: palette().panel });
    overlay.addChild(panel);
    const title = new Text({
      text: over.title,
      style: { fontFamily: FONT_FAMILY, fontSize: 30, fill: titleColor, fontWeight: '700' },
    });
    title.anchor.set(0.5, 0);
    title.position.set(width / 2, panelY + 24);
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
    if (over.reason !== '') {
      const reason = new Text({
        text: over.reason,
        style: { fontFamily: FONT_FAMILY, fontSize: 14, fill: palette().textDim },
      });
      reason.anchor.set(0.5);
      reason.position.set(width / 2, panelY + 140);
      overlay.addChild(reason);
    }
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
    this.gameOverOverlay = overlay;
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
