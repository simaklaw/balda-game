import { Application, Container, FederatedPointerEvent, Graphics, Text } from 'pixi.js';
import type { CellPos, Dawg, Difficulty, MoveErrorCode } from '@balda/shared';
import { LocalGameController } from '../game/LocalGameController';
import { SelectionModel } from '../game/SelectionModel';
import { BoardView } from './BoardView';
import { Button } from './Button';
import { HudView } from './HudView';
import { KeyboardView } from './KeyboardView';
import { COLORS, FONT_FAMILY } from '../theme';

export interface GameSceneOptions {
  dawg: Dawg;
  difficulty: Difficulty;
  boardSize: 3 | 5;
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

/** Экран партии: поле, кастомная клавиатура, drag-to-select, ходы против ИИ. */
export class GameScene {
  readonly view = new Container();
  private readonly app: Application;
  private readonly options: GameSceneOptions;
  private readonly callbacks: GameSceneCallbacks;
  private readonly controller: LocalGameController;
  private readonly selection: SelectionModel;
  private readonly inputLayer: Graphics;
  private readonly hud: HudView;
  private readonly boardView: BoardView;
  private readonly wordPreview: Text;
  private readonly btnCancel: Button;
  private readonly btnPass: Button;
  private readonly btnOk: Button;
  private readonly keyboard: KeyboardView;
  private readonly controlWidth: number;
  private aiCell: CellPos | null = null;
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private aiThinking = false;
  private destroyed = false;
  private dragActive = false;

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

    this.inputLayer = new Graphics()
      .rect(0, 0, app.screen.width, app.screen.height)
      .fill({ color: 0xffffff, alpha: 0 });
    this.inputLayer.eventMode = 'static';
    this.view.addChild(this.inputLayer);

    this.hud = new HudView(app.screen.width);
    this.view.addChild(this.hud);

    const cellSize = this.computeCellSize(app.screen.width, app.screen.height, options.boardSize);
    this.boardView = new BoardView(options.boardSize, cellSize);
    this.view.addChild(this.boardView);

    this.wordPreview = new Text({
      text: '',
      style: { fontFamily: FONT_FAMILY, fontSize: 20, fill: COLORS.text },
    });
    this.wordPreview.anchor.set(0.5, 0);
    this.view.addChild(this.wordPreview);

    this.controlWidth = Math.min(150, Math.max(100, Math.floor((app.screen.width - 40) / 3)));
    const controlHeight = 46;
    this.btnCancel = new Button({
      caption: 'Отмена',
      width: this.controlWidth,
      height: controlHeight,
      color: COLORS.panel,
      onTap: () => this.onCancel(),
    });
    this.btnPass = new Button({
      caption: 'Пропустить',
      width: this.controlWidth,
      height: controlHeight,
      color: COLORS.panel,
      onTap: () => this.onPass(),
    });
    this.btnOk = new Button({
      caption: 'OK',
      width: this.controlWidth,
      height: controlHeight,
      color: COLORS.accent,
      onTap: () => this.onSubmit(),
    });
    this.view.addChild(this.btnCancel, this.btnPass, this.btnOk);

    this.keyboard = new KeyboardView(app.screen.width, (letter) => this.onLetter(letter));
    this.keyboard.visible = false;
    this.view.addChild(this.keyboard);

    this.layout();

    this.inputLayer.on('pointerdown', (e: FederatedPointerEvent) => this.onPointerDown(e));
    app.stage.on('pointermove', this.stageMove);
    app.stage.on('pointerup', this.stageUp);
    app.stage.on('pointerupoutside', this.stageUp);
    window.addEventListener('resize', this.onResize);

    this.refresh();
  }

  private computeCellSize(width: number, height: number, boardSize: number): number {
    const reservedTop = 76;
    const reservedBottom = 180;
    const cell = Math.min(
      Math.floor((width - 20) / boardSize),
      Math.floor((height - reservedTop - reservedBottom) / boardSize),
    );
    return Math.max(34, Math.min(110, cell));
  }

  private layout(): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    this.inputLayer.clear();
    this.inputLayer.rect(0, 0, width, height).fill({ color: 0xffffff, alpha: 0 });
    this.hud.layout(width);
    const boardPx = this.boardView.boardPixelSize;
    this.boardView.position.set(Math.floor((width - boardPx) / 2), 84);
    this.wordPreview.position.set(width / 2, 84 + boardPx + 8);
    const gap = 10;
    const total = this.controlWidth * 3 + gap * 2;
    const controlY = height - 58;
    this.btnCancel.position.set(Math.floor((width - total) / 2), controlY);
    this.btnPass.position.set(Math.floor((width - total) / 2) + this.controlWidth + gap, controlY);
    this.btnOk.position.set(Math.floor((width - total) / 2) + (this.controlWidth + gap) * 2, controlY);
    this.keyboard.position.set(0, height - 64 - this.keyboard.keyboardHeight);
  }

  private onPointerDown(e: FederatedPointerEvent): void {
    if (!this.controller.isHumanTurn || this.aiThinking) return;
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

  private onLetter(letter: string): void {
    if (!this.controller.isHumanTurn || this.aiThinking) return;
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
      this.showGameOver();
      return;
    }
    if (!this.controller.isAiTurn) return;
    this.aiThinking = true;
    this.setControlsEnabled(false);
    this.refresh('Бот думает…');
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      if (this.destroyed) return;
      this.controller.playAiMove();
      this.aiThinking = false;
      const history = this.controller.game.history;
      const last = history.length > 0 ? history[history.length - 1] : null;
      this.aiCell = last !== null && last.player === 1 ? { row: last.cell.row, col: last.cell.col } : null;
      if (this.controller.isFinished) {
        this.refresh();
        this.showGameOver();
        return;
      }
      this.setControlsEnabled(true);
      this.refresh();
    }, AI_MOVE_DELAY_MS);
  }

  private setControlsEnabled(value: boolean): void {
    this.btnCancel.setEnabled(value && this.selection.snapshot.phase !== 'idle');
    this.btnPass.setEnabled(value);
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
      this.btnOk.setEnabled(this.selection.canSubmit());
    }
  }

  private showGameOver(): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const overlay = new Container();
    overlay.eventMode = 'static';
    const dim = new Graphics().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.75 });
    overlay.addChild(dim);
    const panelWidth = Math.min(340, width - 40);
    const panelHeight = 280;
    const panelX = (width - panelWidth) / 2;
    const panelY = (height - panelHeight) / 2;
    const panel = new Graphics()
      .roundRect(panelX, panelY, panelWidth, panelHeight, 16)
      .fill({ color: COLORS.panel })
      .stroke({ width: 2, color: COLORS.panelBorder });
    overlay.addChild(panel);
    const game = this.controller.game;
    const human = game.players[0]!.score;
    const ai = game.players[1]!.score;
    const title = game.winner === 0 ? 'Победа!' : game.winner === 1 ? 'Поражение' : 'Ничья';
    const titleColor = game.winner === 0 ? COLORS.success : game.winner === 1 ? COLORS.danger : COLORS.text;
    const titleText = new Text({
      text: title,
      style: { fontFamily: FONT_FAMILY, fontSize: 32, fill: titleColor, fontWeight: 'bold' },
    });
    titleText.anchor.set(0.5);
    titleText.position.set(width / 2, panelY + 60);
    overlay.addChild(titleText);
    const scoreText = new Text({
      text: human + ' : ' + ai,
      style: { fontFamily: FONT_FAMILY, fontSize: 28, fill: COLORS.text },
    });
    scoreText.anchor.set(0.5);
    scoreText.position.set(width / 2, panelY + 108);
    overlay.addChild(scoreText);
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
    btnAgain.position.set(panelX + 15, panelY + 150);
    overlay.addChild(btnAgain);
    const btnMenu = new Button({
      caption: 'Меню',
      width: buttonWidth,
      height: 48,
      fontSize: 20,
      color: COLORS.panel,
      onTap: () => {
        setTimeout(() => this.callbacks.onMenu(), 0);
      },
    });
    btnMenu.position.set(panelX + 15, panelY + 210);
    overlay.addChild(btnMenu);
    this.view.addChild(overlay);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.aiTimer !== null) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    this.app.stage.off('pointermove', this.stageMove);
    this.app.stage.off('pointerup', this.stageUp);
    this.app.stage.off('pointerupoutside', this.stageUp);
    window.removeEventListener('resize', this.onResize);
    this.view.destroy({ children: true });
  }
}
