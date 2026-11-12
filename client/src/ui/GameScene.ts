import { Application, Container, FederatedPointerEvent, Graphics, Text } from 'pixi.js';
import type { CellPos, Dawg, Difficulty, MoveErrorCode } from '@balda/shared';
import { LocalGameController } from '../game/LocalGameController';
import { SelectionModel } from '../game/SelectionModel';
import { TIME_PRESETS, TimerModel } from '../game/TimerModel';
import type { TimeControlKind } from '../game/TimerModel';
import { BoardView } from './BoardView';
import { Button } from './Button';
import { HudView } from './HudView';
import { KeyboardView } from './KeyboardView';
import { safeInsets } from './safeArea';
import type { SafeInsets } from './safeArea';
import { FONT_FAMILY, palette } from '../theme';

export interface GameSceneOptions {
  dawg: Dawg;
  difficulty: Difficulty;
  boardSize: 3 | 5;
  timeControl: TimeControlKind;
}

export interface GameSceneCallbacks {
  onMenu: () => void;
  onRestart: (options: GameSceneOptions) => void;
}

const ERROR_TEXT: Record<MoveErrorCode, string> = {
  INVALID_LETTER: 'Недопустимая буква',
  OUT_OF_BOUNDS: 'Клетка вне поля',
  CELL_OCCUPIED: 'Клетка занята',
  NO_NEIGHBOR_LETTERS: 'Рядом с клеткой нет букв',
  PATH_EMPTY: 'Слово не выделено',
  PATH_OUT_OF_BOUNDS: 'Путь выходит за пределы поля',
  PATH_REVISITS_CELL: 'Буква используется дважды',
  PATH_MISSING_NEW_CELL: 'Не использована новая буква',
  PATH_EMPTY_CELL: 'Путь проходит через пустую клетку',
  PATH_NOT_CONTIGUOUS: 'Буквы в слове не соседние',
  WORD_TOO_SHORT: 'Слово слишком короткое',
  WORD_UNKNOWN: 'Такого слова нет в словаре',
  WORD_ALREADY_USED: 'Это слово уже использовано',
  NOT_PLAYERS_TURN: 'Сейчас не ваш ход',
  GAME_FINISHED: 'Партия окончена',
};

const INITIAL_WORDS: Record<3 | 5, string> = { 3: 'бал', 5: 'балда' };

const AI_MOVE_DELAY_MS = 700;

function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

/** Экран партии: поле, кастомная клавиатура, drag-to-select, часы, история ходов. */
export class GameScene {
  readonly view = new Container();
  private readonly app: Application;
  private readonly options: GameSceneOptions;
  private readonly callbacks: GameSceneCallbacks;
  private readonly controller: LocalGameController;
  private readonly selection: SelectionModel;
  private readonly timer: TimerModel;
  private readonly inputLayer: Graphics;
  private readonly hud: HudView;
  private readonly boardView: BoardView;
  private readonly timerText: Text;
  private readonly wordPreview: Text;
  private readonly btnCancel: Button;
  private readonly btnPass: Button;
  private readonly btnHistory: Button;
  private readonly btnOk: Button;
  private readonly keyboard: KeyboardView;
  private controlWidth: number;
  private aiCell: CellPos | null = null;
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private aiThinking = false;
  private destroyed = false;
  private dragActive = false;
  private gameOverShown = false;
  private historyOpen = false;

  constructor(app: Application, options: GameSceneOptions, callbacks: GameSceneCallbacks) {
    this.app = app;
    this.options = options;
    this.callbacks = callbacks;

    const config = {
      boardSize: options.boardSize,
      allowDiagonal: false,
      minWordLength: options.boardSize === 3 ? 3 : 4,
      maxSkipsInRow: 3,
    };
    this.controller = new LocalGameController(options.dawg, config, INITIAL_WORDS[options.boardSize], {
      difficulty: options.difficulty,
    });
    this.selection = new SelectionModel(this.controller.game.board, config.minWordLength, false);
    this.timer = new TimerModel(TIME_PRESETS[options.timeControl]);

    const insets = safeInsets();
    this.inputLayer = new Graphics()
      .rect(0, 0, app.screen.width, app.screen.height)
      .fill({ color: 0xffffff, alpha: 0 });
    this.inputLayer.eventMode = 'static';
    this.view.addChild(this.inputLayer);

    this.hud = new HudView(app.screen.width);
    this.view.addChild(this.hud);

    const cellSize = this.computeCellSize(app.screen.width, app.screen.height, options.boardSize, insets);
    this.boardView = new BoardView(options.boardSize, cellSize);
    this.view.addChild(this.boardView);

    this.timerText = new Text({
      text: '',
      style: { fontFamily: FONT_FAMILY, fontSize: 15, fill: palette().textDim },
    });
    this.timerText.anchor.set(0.5, 0);
    this.timerText.visible = false;
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
    this.btnHistory = new Button({
      caption: 'История',
      width: this.controlWidth,
      height: controlHeight,
      color: palette().panel,
      fontSize: 16,
      onTap: () => this.showHistory(),
    });
    this.btnOk = new Button({
      caption: 'OK',
      width: this.controlWidth,
      height: controlHeight,
      color: palette().accent,
      onTap: () => this.onSubmit(),
    });
    this.view.addChild(this.btnCancel, this.btnPass, this.btnHistory, this.btnOk);

    this.keyboard = new KeyboardView(app.screen.width, (letter) => this.onLetter(letter));
    this.keyboard.visible = false;
    this.view.addChild(this.keyboard);

    this.layout();

    this.inputLayer.on('pointerdown', (e: FederatedPointerEvent) => this.onPointerDown(e));
    app.stage.on('pointermove', this.stageMove);
    app.stage.on('pointerup', this.stageUp);
    app.stage.on('pointerupoutside', this.stageUp);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.timer.startTurn(0, performance.now());
    app.ticker.add(this.onTicker);
    this.refresh();
  }

  private computeCellSize(width: number, height: number, boardSize: number, insets: SafeInsets): number {
    // Резервы: сверху HUD и часы, снизу клавиатура и панель управления.
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
    return Math.min(118, Math.max(64, Math.floor((availW - 24) / 4)));
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
    this.btnHistory.setWidth(this.controlWidth);
    this.btnOk.setWidth(this.controlWidth);
    const boardPx = this.boardView.boardPixelSize;
    const boardY = 84 + insets.top;
    this.boardView.position.set(
      Math.max(insets.left, Math.floor((width - boardPx) / 2)),
      boardY,
    );
    this.timerText.position.set(width / 2, 60 + insets.top);
    this.wordPreview.position.set(width / 2, boardY + boardPx + 8);
    const gap = 8;
    const total = this.controlWidth * 4 + gap * 3;
    const controlY = height - 58 - insets.bottom;
    const startX = Math.floor((width - total) / 2);
    this.btnCancel.position.set(startX, controlY);
    this.btnPass.position.set(startX + (this.controlWidth + gap), controlY);
    this.btnHistory.position.set(startX + (this.controlWidth + gap) * 2, controlY);
    this.btnOk.position.set(startX + (this.controlWidth + gap) * 3, controlY);
    this.keyboard.position.set(0, height - 64 - insets.bottom - this.keyboard.keyboardHeight);
  }

  private onPointerDown(e: FederatedPointerEvent): void {
    if (!this.controller.isHumanTurn || this.aiThinking || this.historyOpen) return;
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

  private readonly stageMove = (e: FederatedPointerEvent): void => {
    if (!this.dragActive || this.selection.snapshot.phase !== 'building') return;
    const local = this.boardView.toLocal(e.global);
    const cell = this.boardView.cellAt(local.x, local.y);
    if (cell === null) return;
    if (this.selection.extendPath(cell.row, cell.col)) this.refresh();
  };

  private readonly stageUp = (): void => {
    this.dragActive = false;
  };

  private readonly onResize = (): void => {
    this.layout();
  };

  /**
   * Сворачивание приложения не должно съедать время: rAF стоит, и после
   * возврата один «гигантский» тик списал бы весь остаток. Часы
   * перематываются на момент события — скрытое время не списывается.
   */
  private readonly onVisibility = (): void => {
    this.timer.skipTo(performance.now());
  };

  private readonly onTicker = (): void => {
    if (this.destroyed || this.gameOverShown) return;
    const now = performance.now();
    if (this.historyOpen) {
      this.timer.skipTo(now);
      return;
    }
    const expired = this.timer.tick(now);
    this.updateTimerDisplay();
    if (expired !== null) this.handleExpire(expired);
  };

  private onLetter(letter: string): void {
    if (!this.controller.isHumanTurn || this.aiThinking || this.historyOpen) return;
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
    if (!this.controller.isHumanTurn || this.aiThinking) return;
    this.selection.reset();
    this.keyboard.visible = false;
    const result = this.controller.passHuman();
    if (!result.ok) {
      this.refresh(ERROR_TEXT[result.error ?? 'GAME_FINISHED']);
      return;
    }
    this.refresh();
    this.scheduleAi();
  }

  private onSubmit(): void {
    if (!this.controller.isHumanTurn || this.aiThinking) return;
    const move = this.selection.toMove();
    if (move === null) {
      this.refresh('Выделите слово, включая новую букву');
      return;
    }
    const result = this.controller.applyHumanMove(move);
    if (!result.ok) {
      this.refresh(ERROR_TEXT[result.error ?? 'GAME_FINISHED']);
      return;
    }
    this.selection.reset();
    this.keyboard.visible = false;
    this.aiCell = null;
    this.refresh();
    this.scheduleAi();
  }

  private scheduleAi(): void {
    if (this.controller.isFinished) {
      this.refresh();
      this.showGameOver();
      return;
    }
    if (!this.controller.isAiTurn) return;
    this.timer.onMoveDone();
    this.timer.startTurn(1, performance.now());
    this.aiThinking = true;
    this.setControlsEnabled(false);
    this.refresh('Бот думает…');
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      if (this.destroyed || this.gameOverShown) return;
      this.controller.playAiMove();
      this.aiThinking = false;
      const history = this.controller.game.history;
      const last = history.length > 0 ? history[history.length - 1] : null;
      this.aiCell = last !== null && last.player === 1 ? { row: last.cell.row, col: last.cell.col } : null;
      this.timer.onMoveDone();
      this.timer.startTurn(0, performance.now());
      if (this.controller.isFinished) {
        this.refresh();
        this.showGameOver();
        return;
      }
      this.refresh();
    }, AI_MOVE_DELAY_MS);
  }

  /** Истечение часов: классика — авто-пропуск, блиц/Фишер — поражение по времени. */
  private handleExpire(player: 0 | 1): void {
    const kind = this.options.timeControl;
    if (kind === 'blitz' || kind === 'fisher') {
      this.controller.game.declareTimeout(player);
      this.refresh();
      this.showGameOver();
      return;
    }
    if (player === 0) {
      this.selection.reset();
      this.keyboard.visible = false;
      const result = this.controller.passHuman();
      if (!result.ok) return;
      this.timer.refill(0);
      if (this.controller.isFinished) {
        this.refresh();
        this.showGameOver();
        return;
      }
      this.refresh('Время вышло — пропуск хода');
      this.scheduleAi();
    } else {
      const result = this.controller.game.pass(1);
      if (!result.ok) return;
      this.timer.refill(1);
      if (this.controller.isFinished) {
        this.refresh();
        this.showGameOver();
        return;
      }
      this.refresh('Бот просрочил ход — пропуск');
    }
  }

  private setControlsEnabled(value: boolean): void {
    this.btnCancel.setEnabled(value && this.selection.snapshot.phase !== 'idle');
    this.btnPass.setEnabled(value);
    this.btnHistory.setEnabled(value);
    this.btnOk.setEnabled(value && this.selection.canSubmit());
  }

  private refresh(statusOverride?: string): void {
    const game = this.controller.game;
    const snap = this.selection.snapshot;
    let status: string;
    if (statusOverride !== undefined) {
      status = statusOverride;
    } else if (this.controller.isFinished) {
      status = 'Партия окончена';
    } else if (!this.controller.isHumanTurn) {
      status = 'Ход бота…';
    } else if (snap.phase === 'idle') {
      status = 'Ваш ход: коснитесь пустой клетки';
    } else if (snap.phase === 'choosingLetter') {
      status = 'Выберите букву';
    } else {
      status = 'Выделите слово и нажмите OK';
    }
    this.hud.update(game.players[0]!.score, game.players[1]!.score, status);
    const word = snap.phase === 'building' && snap.path.length > 0 ? this.selection.currentWord() : '';
    this.wordPreview.text = word.toUpperCase();
    this.boardView.sync(
      (row, col) => game.board.get(row, col),
      { newCell: snap.newCell, previewLetter: snap.previewLetter, path: snap.path, aiCell: this.aiCell },
    );
    if (this.controller.isHumanTurn && !this.aiThinking) {
      this.btnCancel.setEnabled(snap.phase !== 'idle');
      this.btnPass.setEnabled(true);
      this.btnHistory.setEnabled(true);
      this.btnOk.setEnabled(this.selection.canSubmit());
    }
    this.updateTimerDisplay();
  }

  private updateTimerDisplay(): void {
    if (!this.timer.enabled) {
      this.timerText.visible = false;
      return;
    }
    this.timerText.visible = true;
    const text = 'Вы ' + formatClock(this.timer.getRemaining(0)) + ' · Бот ' + formatClock(this.timer.getRemaining(1));
    if (this.timerText.text !== text) this.timerText.text = text;
    const humanLow = this.controller.isHumanTurn && this.timer.getRemaining(0) <= 10000;
    this.timerText.style.fill = humanLow ? palette().danger : palette().textDim;
  }

  private showHistory(): void {
    if (this.gameOverShown || this.historyOpen) return;
    this.historyOpen = true;
    const insets = safeInsets();
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const history = this.controller.game.history;
    const lineHeight = 22;
    const fontSize = 15;
    const maxVisible = Math.max(4, Math.floor((height - 280) / lineHeight));
    const visible = history.slice(-maxVisible);
    const overlay = new Container();
    overlay.eventMode = 'static';
    overlay.addChild(new Graphics().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.75 }));
    const panelWidth = Math.min(340, width - 40);
    const panelHeight = Math.min(height - 80, 120 + visible.length * lineHeight + 64);
    const panelX = Math.floor((width - panelWidth) / 2);
    const panelY = Math.max(48 + insets.top, Math.floor((height - panelHeight) / 2));
    const panel = new Graphics()
      .roundRect(panelX, panelY, panelWidth, panelHeight, 16)
      .fill({ color: palette().panel })
      .stroke({ width: 2, color: palette().panelBorder });
    overlay.addChild(panel);
    const title = new Text({
      text: 'История ходов',
      style: { fontFamily: FONT_FAMILY, fontSize: 20, fill: palette().text },
    });
    title.anchor.set(0.5);
    title.position.set(width / 2, panelY + 32);
    overlay.addChild(title);
    if (visible.length === 0) {
      const empty = new Text({
        text: 'Ходов ещё не было',
        style: { fontFamily: FONT_FAMILY, fontSize, fill: palette().textDim },
      });
      empty.anchor.set(0.5);
      empty.position.set(width / 2, panelY + 76);
      overlay.addChild(empty);
    } else {
      const firstIndex = history.length - visible.length;
      const body = visible
        .map(
          (entry, i) =>
            firstIndex +
            i +
            1 +
            '. ' +
            (entry.player === 0 ? 'Вы: ' : 'Бот: ') +
            entry.word.toUpperCase() +
            ' (+' +
            entry.points +
            ')',
        )
        .join('\n');
      const list = new Text({
        text: body,
        style: { fontFamily: FONT_FAMILY, fontSize, fill: palette().text, lineHeight },
      });
      list.anchor.set(0.5, 0);
      list.position.set(width / 2, panelY + 60);
      overlay.addChild(list);
    }
    const btnClose = new Button({
      caption: 'Закрыть',
      width: panelWidth - 30,
      height: 46,
      color: palette().panel,
      onTap: () => {
        this.historyOpen = false;
        this.view.removeChild(overlay);
        overlay.destroy({ children: true });
        this.timer.skipTo(performance.now());
        this.refresh();
      },
    });
    btnClose.position.set(panelX + 15, panelY + panelHeight - 60);
    overlay.addChild(btnClose);
    this.view.addChild(overlay);
  }

  private showGameOver(): void {
    if (this.gameOverShown) return;
    this.gameOverShown = true;
    this.timer.stop();
    const insets = safeInsets();
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const overlay = new Container();
    overlay.eventMode = 'static';
    overlay.addChild(new Graphics().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.75 }));
    const panelWidth = Math.min(340, width - 40);
    const panelHeight = 280;
    const panelX = Math.floor((width - panelWidth) / 2);
    const panelY = Math.max(48 + insets.top, Math.floor((height - panelHeight) / 2));
    overlay.addChild(
      new Graphics()
        .roundRect(panelX, panelY, panelWidth, panelHeight, 16)
        .fill({ color: palette().panel })
        .stroke({ width: 2, color: palette().panelBorder }),
    );
    const game = this.controller.game;
    const human = game.players[0]!.score;
    const ai = game.players[1]!.score;
    const title = game.winner === 0 ? 'Победа!' : game.winner === 1 ? 'Поражение' : 'Ничья';
    const titleColor =
      game.winner === 0 ? palette().success : game.winner === 1 ? palette().danger : palette().text;
    const titleText = new Text({
      text: title,
      style: { fontFamily: FONT_FAMILY, fontSize: 32, fill: titleColor },
    });
    titleText.anchor.set(0.5);
    titleText.position.set(width / 2, panelY + 60);
    overlay.addChild(titleText);
    const scoreText = new Text({
      text: human + ' : ' + ai,
      style: { fontFamily: FONT_FAMILY, fontSize: 28, fill: palette().text },
    });
    scoreText.anchor.set(0.5);
    scoreText.position.set(width / 2, panelY + 104);
    overlay.addChild(scoreText);
    const reasonText =
      game.endReason === 'timeout'
        ? 'время вышло'
        : game.endReason === 'skip_limit'
          ? 'три пропуска подряд'
          : '';
    if (reasonText !== '') {
      const reason = new Text({
        text: reasonText,
        style: { fontFamily: FONT_FAMILY, fontSize: 15, fill: palette().textDim },
      });
      reason.anchor.set(0.5);
      reason.position.set(width / 2, panelY + 134);
      overlay.addChild(reason);
    }
    const buttonWidth = panelWidth - 30;
    const btnAgain = new Button({
      caption: 'Ещё раз',
      width: buttonWidth,
      height: 48,
      fontSize: 20,
      onTap: () => {
        setTimeout(() => this.callbacks.onRestart(this.options), 0);
      },
    });
    btnAgain.position.set(panelX + 15, panelY + 156);
    overlay.addChild(btnAgain);
    const btnMenu = new Button({
      caption: 'Меню',
      width: buttonWidth,
      height: 48,
      fontSize: 20,
      color: palette().panel,
      onTap: () => {
        setTimeout(() => this.callbacks.onMenu(), 0);
      },
    });
    btnMenu.position.set(panelX + 15, panelY + 212);
    overlay.addChild(btnMenu);
    this.view.addChild(overlay);
  }

  destroy(): void {
    this.destroyed = true;
    this.timer.stop();
    if (this.aiTimer !== null) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    this.app.ticker.remove(this.onTicker);
    this.app.stage.off('pointermove', this.stageMove);
    this.app.stage.off('pointerup', this.stageUp);
    this.app.stage.off('pointerupoutside', this.stageUp);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.view.destroy({ children: true });
  }
}
