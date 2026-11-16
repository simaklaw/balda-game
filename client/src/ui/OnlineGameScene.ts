import { Application, Container, Graphics, Text } from 'pixi.js';
import type { CellPos } from '@balda/shared';
import { SelectionModel } from '../game/SelectionModel';
import type { BoardReader } from '../game/SelectionModel';
import type { NetClient } from '../net/NetClient';
import type { RoomState, ServerMessage } from '../net/protocol';
import { BoardView } from './BoardView';
import { Button } from './Button';
import { HudView } from './HudView';
import { computeGameLayout, keyboardMetricsFor } from './layout';
import { KeyboardView } from './KeyboardView';
import { safeInsets } from './safeArea';
import { FONT_FAMILY, palette } from '../theme';

export interface OnlineGameSceneCallbacks {
  onMenu: () => void;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

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

/** Онлайн-партия: состояние с сервера, клиент только вводит ход. */
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
  private boardX = 0;
  private boardCellSize = 0;
  private previewFits = true;
  private destroyed = false;
  private dragActive = false;

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
    this.selection = new SelectionModel(
      this.board,
      initialState.size === 3 ? 3 : 4,
      false,
    );

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
      controlCount: 3,
    });

    this.hud = new HudView(app.screen.width, { human: 'Вы', opponent: 'Соперник' });
    this.view.addChild(this.hud);

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
      controlCount: 3,
    });
    this.hud.layout(width);
    this.hud.position.set(0, layout.hudY);
    this.controlWidth = layout.controlWidth;
    this.btnCancel.setWidth(layout.controlWidth);
    this.btnPass.setWidth(layout.controlWidth);
    this.btnOk.setWidth(layout.controlWidth);
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
    this.keyboard.setWidth(layout.keyboardWidth, layout.keyboardRows);
    this.keyboard.position.set(layout.keyboardX, layout.keyboardY);
  }

  private onResize = (): void => {
    this.layout();
    this.refresh();
  };

  private stageMove = (e: { global: { x: number; y: number } }): void => {
    if (!this.dragActive || this.selection.snapshot.phase !== 'building') return;
    const cell = this.hitCell(e.global.x, e.global.y);
    if (cell) this.selection.extendPath(cell.row, cell.col);
    this.refresh();
  };

  private stageUp = (): void => {
    this.dragActive = false;
  };

  private onTicker = (): void => {
    this.updateTimers();
  };

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.ticker.remove(this.onTicker);
    this.app.stage.off('pointermove', this.stageMove);
    this.app.stage.off('pointerup', this.stageUp);
    this.app.stage.off('pointerupoutside', this.stageUp);
    window.removeEventListener('resize', this.onResize);
    this.view.destroy({ children: true });
  }

  private hitCell(x: number, y: number): CellPos | null {
    const localX = x - this.boardX;
    const localY = y - this.boardView.position.y;
    if (localX < 0 || localY < 0) return null;
    const col = Math.floor(localX / this.boardCellSize);
    const row = Math.floor(localY / this.boardCellSize);
    if (row < 0 || col < 0 || row >= this.state.size || col >= this.state.size) return null;
    return { row, col };
  }

  private onPointerDown(e: { global: { x: number; y: number } }): void {
    this.dragActive = true;
    const cell = this.hitCell(e.global.x, e.global.y);
    if (!cell) return;
    const phase = this.selection.snapshot.phase;
    if (phase === 'building') {
      this.selection.extendPath(cell.row, cell.col);
    } else {
      this.selection.tapCell(cell.row, cell.col);
      this.keyboard.visible = this.selection.snapshot.phase === 'choosingLetter';
    }
    this.refresh();
  }

  private onCancel(): void {
    this.selection.reset();
    this.keyboard.visible = false;
    this.refresh();
  }

  private onPass(): void {
    this.net.send({ type: 'pass' });
  }

  private onSubmit(): void {
    const move = this.selection.toMove();
    if (!move) return;
    this.net.send({ type: 'move', ...move });
    this.selection.reset();
    this.keyboard.visible = false;
    this.refresh();
  }

  private onLetter(letter: string): void {
    if (this.selection.chooseLetter(letter)) {
      this.keyboard.visible = false;
      this.refresh();
    }
  }

  private updateTimers(): void {
    const clocks = this.state.clocksMs;
    if (!clocks) {
      this.timerText.text = '';
      return;
    }
    const mine = clocks[this.state.you] ?? 0;
    const theirs = clocks[this.state.you === 0 ? 1 : 0] ?? 0;
    this.timerText.text = formatClock(mine) + ' / ' + formatClock(theirs);
  }

  private refresh(): void {
    const snap = this.selection.snapshot;
    let status = '';
    const me = this.state.players[this.state.you] ?? { score: 0 };
    const other = this.state.players[this.state.you === 0 ? 1 : 0] ?? { score: 0 };
    const word = snap.phase === 'building' && snap.path.length > 0 ? this.selection.currentWord() : '';
    const wordLabel = word === '' ? '' : word.toUpperCase() + '  +' + snap.path.length;
    if (!this.previewFits && wordLabel !== '') status = wordLabel;
    this.hud.update(me.score, other.score, status);
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
        showPlaceable: false,
      },
    );
    this.btnOk.setEnabled(this.selection.canSubmit());
    this.updateTimers();
  }

  onServerMessage(msg: ServerMessage): void {
    if (msg.type === 'state') {
      this.state = msg.state;
      this.board.update(msg.state);
      this.selection.reset();
      this.keyboard.visible = false;
      this.refresh();
    }
  }
}
