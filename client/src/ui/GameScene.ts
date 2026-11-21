import { Application, Container, FederatedPointerEvent, Graphics, Text } from 'pixi.js';
import type { CellPos, Dawg, Difficulty, MoveErrorCode } from '@balda/shared';
import { defaultConfigFor, pickStartWord } from '@balda/shared';
import { LocalGameController } from '../game/LocalGameController';
import { SelectionModel } from '../game/SelectionModel';
import { TIME_PRESETS, TimerModel } from '../game/TimerModel';
import type { TimeControlKind } from '../game/TimerModel';
import { showDefinitionOverlay } from './DefinitionOverlay';
import { BoardView } from './BoardView';
import { Button } from './Button';
import { sound } from '../audio/Sound';
import { gameOverText } from './gameOverText';
import { HudView } from './HudView';
import { computeGameLayout, keyboardMetricsFor } from './layout';
import { KeyboardView } from './KeyboardView';
import { safeInsets } from './safeArea';
import { FONT_FAMILY, palette } from '../theme';
import { shouldReduceMotion } from '../perf';

export interface GameSceneOptions {
  dawg: Dawg;
  difficulty: Difficulty;
  boardSize: 3 | 5 | 7;
  timeControl: TimeControlKind;
}

export interface GameSceneCallbacks {
  onMenu: () => void;
  onRestart: (options: GameSceneOptions) => void;
  /** Партия завершена; аргумент — очки игрока (для локального рейтинга). */
  onGameOver?: (score: number) => void;
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

const AI_MOVE_DELAY_MS = 700;
/** Сколько показывать ход бота (подсветка пути + слово в статусе). */
const AI_REVEAL_MS = 900;
const POP_MS = 320;
const SHAKE_MS = 320;

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
  private aiPath: CellPos[] = [];
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private aiThinking = false;
  private destroyed = false;
  private dragActive = false;
  private dragMoved = false;
  private gameOverShown = false;
  private historyOpen = false;
  private boardX = 0;
  private boardCellSize = 0;
  private gameOverOverlay: Container | null = null;
  private popCell: CellPos | null = null;
  private popStart = 0;
  private shakeActive = false;
  private shakeStart = 0;

  constructor(app: Application, options: GameSceneOptions, callbacks: GameSceneCallbacks) {
    this.app = app;
    this.options = options;
    this.callbacks = callbacks;

    // Минимальная длина слова зависит от размера поля (см. defaultConfigFor).
    const config = defaultConfigFor(options.boardSize);
    this.controller = new LocalGameController(options.dawg, config, pickStartWord(options.boardSize), {
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

    const initialLayout = computeGameLayout({
      width: app.screen.width,
      height: app.screen.height,
      boardSize: options.boardSize,
      insets,
      keyboardHeight: keyboardMetricsFor(app.screen.width).height,
      controlCount: 4,
    });
    this.boardCellSize = initialLayout.cellSize;
    this.boardView = new BoardView(options.boardSize, initialLayout.cellSize);
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

    this.controlWidth = initialLayout.controlWidth;
    const controlHeight = 46;
    this.btnCancel = new Button({
      caption: 'Отмена',
      icon: 'undo_2',
      width: this.controlWidth,
      height: controlHeight,
      color: palette().panel,
      fontSize: 16,
      onTap: () => this.onCancel(),
    });
    this.btnPass = new Button({
      caption: 'Пропуск',
      icon: 'skip_forward',
      width: this.controlWidth,
      height: controlHeight,
      color: palette().panel,
      fontSize: 16,
      onTap: () => this.onPass(),
    });
    this.btnHistory = new Button({
      caption: 'История',
      icon: 'scroll_text',
      width: this.controlWidth,
      height: controlHeight,
      color: palette().panel,
      fontSize: 16,
      onTap: () => this.showHistory(),
    });
    this.btnOk = new Button({
      caption: 'OK',
      icon: 'check',
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

    (window as unknown as { __scene: GameScene }).__scene = this;
    this.timer.startTurn(0, performance.now());
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
      boardSize: this.options.boardSize,
      insets,
      keyboardHeight: keyboardMetricsFor(width).height,
      controlCount: 4,
    });
    this.hud.layout(width);
    this.hud.position.set(0, layout.hudY);
    this.controlWidth = layout.controlWidth;
    this.btnCancel.setWidth(layout.controlWidth);
    this.btnPass.setWidth(layout.controlWidth);
    this.btnHistory.setWidth(layout.controlWidth);
    this.btnOk.setWidth(layout.controlWidth);
    if (layout.cellSize !== this.boardCellSize) {
      this.boardCellSize = layout.cellSize;
      this.boardView.setCellSize(layout.cellSize);
    }
    this.boardX = layout.boardX;
    this.boardView.position.set(layout.boardX, layout.boardY);
    this.timerText.position.set(width / 2, layout.timerY);
    this.wordPreview.position.set(width / 2, layout.wordPreviewY);
    const gap = layout.controlGap;
    const total = layout.controlWidth * 4 + gap * 3;
    const startX = Math.floor((width - total) / 2);
    this.btnCancel.position.set(startX, layout.controlY);
    this.btnPass.position.set(startX + (layout.controlWidth + gap), layout.controlY);
    this.btnHistory.position.set(startX + (layout.controlWidth + gap) * 2, layout.controlY);
    this.btnOk.position.set(startX + (layout.controlWidth + gap) * 3, layout.controlY);
    this.keyboard.setWidth(width);
    this.keyboard.position.set(0, layout.keyboardY);
    // Оверлей конца партии перестраивается под новые размеры экрана.
    if (this.gameOverOverlay !== null) {
      this.view.removeChild(this.gameOverOverlay);
      this.gameOverOverlay.destroy({ children: true });
      this.gameOverOverlay = null;
      this.buildGameOverOverlay();
    }
  }

  private onPointerDown(e: FederatedPointerEvent): void {
    if (!this.controller.isHumanTurn || this.aiThinking || this.historyOpen) return;
    const local = this.boardView.toLocal(e.global);
    const cell = this.boardView.cellAt(local.x, local.y);
    if (cell === null) return;
    this.dragActive = true;
    const phase = this.selection.snapshot.phase;
    if (phase === 'building') {
      if (this.selection.extendPath(cell.row, cell.col)) this.playSelect();
    } else {
      if (this.selection.tapCell(cell.row, cell.col)) sound.play('tap');
      this.keyboard.visible = this.selection.snapshot.phase === 'choosingLetter';
    }
    this.refresh();
  }

  private readonly stageMove = (e: FederatedPointerEvent): void => {
    if (!this.dragActive || this.selection.snapshot.phase !== 'building') return;
    const local = this.boardView.toLocal(e.global);
    const cell = this.boardView.cellAt(local.x, local.y);
    if (cell === null) return;
    if (this.selection.extendPath(cell.row, cell.col)) {
      this.playSelect();
      this.dragMoved = true;
      this.refresh();
    }
  };

  private readonly stageUp = (): void => {
    const wasDragging = this.dragActive;
    const moved = this.dragMoved;
    this.dragActive = false;
    this.dragMoved = false;
    // Обвёл слово пальцем и отпустил — слово отправляется сразу, без OK.
    if (wasDragging && moved && this.selection.canSubmit()) this.onSubmit();
  };

  private readonly onResize = (): void => {
    this.layout();
    if (!this.destroyed && !this.gameOverShown) this.refresh();
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
    
    if (!shouldReduceMotion() && this.popCell !== null) {
      const t = (now - this.popStart) / POP_MS;
      if (t >= 1) {
        this.boardView.setPulse(this.popCell.row, this.popCell.col, 1);
        this.popCell = null;
      } else {
        // Оттиск литеры: сильный «удар» (1.4×) с быстрой посадкой и лёгким отскоком.
        const scale = 1 + 0.4 * Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 0.9);
        this.boardView.setPulse(this.popCell.row, this.popCell.col, scale);
      }
    } else if (shouldReduceMotion() && this.popCell !== null && now - this.popStart >= POP_MS) {
      this.boardView.setPulse(this.popCell.row, this.popCell.col, 1);
      this.popCell = null;
    }
  };

  private onLetter(letter: string): void {
    if (!this.controller.isHumanTurn || this.aiThinking || this.historyOpen) return;
    if (this.selection.chooseLetter(letter)) {
      sound.play('place');
      this.keyboard.visible = false;
      this.refresh();
    }
  }

  /** Нота пентатоники растёт с длиной выбранной цепочки. */
  private playSelect(): void {
    sound.play('select', this.selection.snapshot.path.length - 1);
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
      sound.play('error');
      this.shakeBoard();
      this.refresh('Выделите слово, включая новую букву');
      return;
    }
    const result = this.controller.applyHumanMove(move);
    if (!result.ok) {
      sound.play('error');
      this.shakeBoard();
      this.refresh(ERROR_TEXT[result.error ?? 'GAME_FINISHED']);
      return;
    }
    sound.play('word', move.path.length);
    this.selection.reset();
    this.keyboard.visible = false;
    this.aiCell = null;
    this.aiPath = [];
    this.startPop(move.cell);
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
      const outcome = this.controller.playAiMove();
      this.aiThinking = false;
      this.timer.onMoveDone();
      this.timer.startTurn(0, performance.now());
      if (this.controller.isFinished) {
        this.refresh();
        this.showGameOver();
        return;
      }
      if (outcome.moved && outcome.cell !== undefined && outcome.path !== undefined) {
        // Показываем ход бота: подсветка пути, слово в статусе, pop буквы.
        this.aiCell = { row: outcome.cell.row, col: outcome.cell.col };
        this.aiPath = outcome.path;
        this.startPop(outcome.cell);
        sound.play('opponent');
        this.refresh('Бот: ' + (outcome.word ?? '').toUpperCase() + ' (+' + (outcome.points ?? 0) + ')');
        this.aiTimer = setTimeout(() => {
          this.aiTimer = null;
          if (this.destroyed || this.gameOverShown) return;
          this.aiPath = [];
          this.refresh();
        }, AI_REVEAL_MS);
        return;
      }
      this.aiCell = null;
      this.aiPath = [];
      this.refresh('Бот пропустил ход');
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
      status = 'Ваш ход: коснитесь клетки с «+»';
    } else if (snap.phase === 'choosingLetter') {
      status = 'Выберите букву';
    } else {
      status = 'Выделите слово и нажмите OK';
    }
    this.hud.update(
      game.players[0]!.score,
      game.players[1]!.score,
      status,
      this.controller.isFinished ? null : this.controller.isHumanTurn ? 'human' : 'opponent',
    );
    const word = snap.phase === 'building' && snap.path.length > 0 ? this.selection.currentWord() : '';
    this.wordPreview.text = word === '' ? '' : word.toUpperCase() + '  +' + snap.path.length;
    this.boardView.sync(
      (row, col) => game.board.get(row, col),
      {
        newCell: snap.newCell,
        previewLetter: snap.previewLetter,
        path: snap.path,
        aiCell: this.aiCell,
        aiPath: this.aiPath,
        showPlaceable: this.controller.isHumanTurn && !this.aiThinking && snap.phase === 'idle',
      },
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

  private startPop(cell: CellPos): void {
    this.popCell = { row: cell.row, col: cell.col };
    this.popStart = performance.now();
  }

  /** Тряска поля при неверном слове. */
  private shakeBoard(): void {
    if (this.shakeActive || this.destroyed) return;
    this.shakeActive = true;
    this.shakeStart = performance.now();
    this.app.ticker.add(this.shakeTicker);
  }

  private readonly shakeTicker = (): void => {
    const t = performance.now() - this.shakeStart;
    if (t >= SHAKE_MS || this.destroyed || shouldReduceMotion()) {
      this.shakeActive = false;
      this.app.ticker.remove(this.shakeTicker);
      if (!this.destroyed) this.boardView.position.x = this.boardX;
      return;
    }
    const amplitude = 5 * (1 - t / SHAKE_MS);
    this.boardView.position.x = this.boardX + Math.sin(t / 28) * amplitude;
  };

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
      visible.forEach((entry, i) => {
        const lineText =
          firstIndex +
          i +
          1 +
          '. ' +
          (entry.player === 0 ? 'Вы: ' : 'Бот: ') +
          entry.word.toUpperCase() +
          ' (+' +
          entry.points +
          ')';
        const line = new Text({
          text: lineText,
          style: { fontFamily: FONT_FAMILY, fontSize, fill: palette().text, lineHeight },
        });
        line.anchor.set(0.5, 0);
        line.position.set(width / 2, panelY + 60 + i * lineHeight);
        line.eventMode = 'static';
        line.cursor = 'pointer';
        line.on('pointertap', () => this.showDefinition(entry.word));
        overlay.addChild(line);
      });
      const tapHint = new Text({
        text: 'Нажмите на ход, чтобы увидеть толкование слова',
        style: { fontFamily: FONT_FAMILY, fontSize: 12, fill: palette().textDim },
      });
      tapHint.anchor.set(0.5);
      tapHint.position.set(width / 2, panelY + panelHeight - 78);
      overlay.addChild(tapHint);
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

  /** Толкование слова из Викисловаря (по нажатию на ход в истории). */
  private showDefinition(word: string): void {
    if (this.destroyed || this.gameOverShown) return;
    showDefinitionOverlay(this.app, this.view, word);
  }

  private showGameOver(): void {
    if (this.gameOverShown) return;
    this.gameOverShown = true;
    {
      const [me, bot] = [this.controller.game.players[0]!.score, this.controller.game.players[1]!.score];
      sound.play(me > bot ? 'win' : me < bot ? 'lose' : 'draw');
    }
    this.timer.stop();
    // Результат фиксируется один раз, до показа оверлея (для локального рейтинга).
    this.callbacks.onGameOver?.(this.controller.game.players[0]!.score);
    this.buildGameOverOverlay();
  }

  /** Оверлей конца партии; вызывается также из layout() при повороте экрана. */
  private buildGameOverOverlay(): void {
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
    const over = gameOverText(game.winner, game.endReason);
    const titleColor =
      over.tone === 'success' ? palette().success : over.tone === 'danger' ? palette().danger : palette().text;
    const titleText = new Text({
      text: over.title,
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
    if (over.reason !== '') {
      const reason = new Text({
        text: over.reason,
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
    this.gameOverOverlay = overlay;
    this.view.addChild(overlay);
  }

  destroy(): void {
    this.destroyed = true;
    this.timer.stop();
    if (this.aiTimer !== null) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    if (this.shakeActive) {
      this.shakeActive = false;
      this.app.ticker.remove(this.shakeTicker);
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

