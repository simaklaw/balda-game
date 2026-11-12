import { Application, Container, Text } from 'pixi.js';
import type { Difficulty } from '@balda/shared';
import type { TimeControlKind } from '../game/TimerModel';
import { Button } from './Button';
import { FONT_FAMILY, palette, setTheme, themeKind } from '../theme';

export interface MenuSelection {
  difficulty: Difficulty;
  boardSize: 3 | 5;
  timeControl: TimeControlKind;
}

export interface MenuSceneCallbacks {
  onStart: (selection: MenuSelection) => void;
  onThemeChange: () => void;
}

const DIFFICULTIES: readonly { id: Difficulty; caption: string }[] = [
  { id: 'easy', caption: 'Легко' },
  { id: 'medium', caption: 'Средне' },
  { id: 'hard', caption: 'Сложно' },
];

const BOARD_SIZES: readonly { id: 3 | 5 | 7; caption: string; disabled: boolean }[] = [
  { id: 3, caption: '3×3', disabled: false },
  { id: 5, caption: '5×5', disabled: false },
  { id: 7, caption: '7×7', disabled: true },
];

const TIME_CONTROLS: readonly { id: TimeControlKind; caption: string }[] = [
  { id: 'none', caption: 'Выкл' },
  { id: 'classic', caption: '2 мин' },
  { id: 'blitz', caption: 'Блиц' },
  { id: 'fisher', caption: 'Фишер' },
];

const ROW_WIDTH = 104;
const TIME_ROW_WIDTH = 88;
const ROW_GAP = 12;

/** Экран главного меню: сложность, поле, контроль времени и тема. */
export class MenuScene {
  readonly view = new Container();
  private readonly app: Application;
  private readonly callbacks: MenuSceneCallbacks;
  private readonly title: Text;
  private readonly subtitle: Text;
  private readonly diffLabel: Text;
  private readonly sizeLabel: Text;
  private readonly timeLabel: Text;
  private readonly hint: Text;
  private readonly difficultyButtons: Button[] = [];
  private readonly sizeButtons: Button[] = [];
  private readonly timeButtons: Button[] = [];
  private readonly btnTheme: Button;
  private readonly btnPlay: Button;
  private difficulty: Difficulty = 'medium';
  private boardSize: 3 | 5 = 5;
  private timeControl: TimeControlKind = 'classic';

  constructor(app: Application, callbacks: MenuSceneCallbacks) {
    this.app = app;
    this.callbacks = callbacks;
    this.title = new Text({
      text: 'БАЛДА',
      style: { fontFamily: FONT_FAMILY, fontSize: 56, fill: palette().text },
    });
    this.title.anchor.set(0.5);
    this.subtitle = new Text({
      text: 'словесная игра',
      style: { fontFamily: FONT_FAMILY, fontSize: 18, fill: palette().textDim },
    });
    this.subtitle.anchor.set(0.5);
    this.diffLabel = new Text({
      text: 'Сложность бота',
      style: { fontFamily: FONT_FAMILY, fontSize: 17, fill: palette().text },
    });
    this.diffLabel.anchor.set(0.5, 0);
    this.sizeLabel = new Text({
      text: 'Размер поля',
      style: { fontFamily: FONT_FAMILY, fontSize: 17, fill: palette().text },
    });
    this.sizeLabel.anchor.set(0.5, 0);
    this.timeLabel = new Text({
      text: 'Контроль времени',
      style: { fontFamily: FONT_FAMILY, fontSize: 17, fill: palette().text },
    });
    this.timeLabel.anchor.set(0.5, 0);
    this.hint = new Text({
      text: '2 мин — на ход · Блиц — 2 мин на партию · Фишер — 1 мин + 10 с за ход',
      style: {
        fontFamily: FONT_FAMILY,
        fontSize: 13,
        fill: palette().textDim,
        wordWrap: true,
        wordWrapWidth: Math.max(240, app.screen.width - 60),
        align: 'center',
      },
    });
    this.hint.anchor.set(0.5, 0);
    this.view.addChild(
      this.title,
      this.subtitle,
      this.diffLabel,
      this.sizeLabel,
      this.timeLabel,
      this.hint,
    );

    for (const option of DIFFICULTIES) {
      const button = new Button({
        caption: option.caption,
        width: ROW_WIDTH,
        height: 46,
        color: palette().panel,
        onTap: () => {
          this.difficulty = option.id;
          this.updateSelectionStyles();
        },
      });
      this.difficultyButtons.push(button);
      this.view.addChild(button);
    }
    for (const option of BOARD_SIZES) {
      const button = new Button({
        caption: option.caption,
        width: ROW_WIDTH,
        height: 46,
        color: palette().panel,
        onTap: () => {
          if (option.disabled) return;
          if (option.id === 3 || option.id === 5) {
            this.boardSize = option.id;
            this.updateSelectionStyles();
          }
        },
      });
      if (option.disabled) button.setEnabled(false);
      this.sizeButtons.push(button);
      this.view.addChild(button);
    }
    for (const option of TIME_CONTROLS) {
      const button = new Button({
        caption: option.caption,
        width: TIME_ROW_WIDTH,
        height: 46,
        color: palette().panel,
        fontSize: 16,
        onTap: () => {
          this.timeControl = option.id;
          this.updateSelectionStyles();
        },
      });
      this.timeButtons.push(button);
      this.view.addChild(button);
    }

    this.btnTheme = new Button({
      caption: 'Тема: ' + (themeKind() === 'dark' ? 'тёмная' : 'светлая'),
      width: 200,
      height: 44,
      color: palette().panel,
      fontSize: 16,
      onTap: () => {
        const next = themeKind() === 'dark' ? 'light' : 'dark';
        setTheme(next);
        try {
          localStorage.setItem('balda.theme', next);
        } catch {
          /* приватный режим — не сохраняем */
        }
        setTimeout(() => this.callbacks.onThemeChange(), 0);
      },
    });
    this.view.addChild(this.btnTheme);

    this.btnPlay = new Button({
      caption: 'Играть',
      width: 220,
      height: 56,
      fontSize: 24,
      onTap: () => {
        setTimeout(
          () =>
            this.callbacks.onStart({
              difficulty: this.difficulty,
              boardSize: this.boardSize,
              timeControl: this.timeControl,
            }),
          0,
        );
      },
    });
    this.view.addChild(this.btnPlay);

    window.addEventListener('resize', this.onResize);
    this.layout();
    this.updateSelectionStyles();
  }

  private readonly onResize = (): void => {
    this.layout();
  };

  private layout(): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const scale = Math.min(1, height / 640);
    this.title.position.set(width / 2, 52 * scale);
    this.subtitle.position.set(width / 2, 100 * scale);
    const diffY = 150 * scale;
    this.diffLabel.position.set(width / 2, diffY);
    this.layoutRow(this.difficultyButtons, ROW_WIDTH, diffY + 28);
    const sizeY = 252 * scale;
    this.sizeLabel.position.set(width / 2, sizeY);
    this.layoutRow(this.sizeButtons, ROW_WIDTH, sizeY + 28);
    const timeY = 354 * scale;
    this.timeLabel.position.set(width / 2, timeY);
    this.layoutRow(this.timeButtons, TIME_ROW_WIDTH, timeY + 28);
    this.hint.position.set(width / 2, 440 * scale);
    this.btnTheme.position.set((width - 200) / 2, 496 * scale);
    this.btnPlay.position.set((width - 220) / 2, 552 * scale);
  }

  private layoutRow(buttons: Button[], buttonWidth: number, y: number): void {
    const width = this.app.screen.width;
    const total = buttons.length * buttonWidth + (buttons.length - 1) * ROW_GAP;
    let x = Math.floor((width - total) / 2);
    for (const button of buttons) {
      button.position.set(x, y);
      x += buttonWidth + ROW_GAP;
    }
  }

  private updateSelectionStyles(): void {
    DIFFICULTIES.forEach((option, index) => {
      const selected = option.id === this.difficulty;
      this.difficultyButtons[index]!.setColor(selected ? palette().accent : palette().panel);
    });
    BOARD_SIZES.forEach((option, index) => {
      const selected = !option.disabled && option.id === this.boardSize;
      this.sizeButtons[index]!.setColor(selected ? palette().accent : palette().panel);
    });
    TIME_CONTROLS.forEach((option, index) => {
      const selected = option.id === this.timeControl;
      this.timeButtons[index]!.setColor(selected ? palette().accent : palette().panel);
    });
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.view.destroy({ children: true });
  }
}
