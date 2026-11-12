import { Application, Container, Text } from 'pixi.js';
import type { Difficulty } from '@balda/shared';
import { Button } from './Button';
import { COLORS, FONT_FAMILY } from '../theme';

export interface MenuSelection {
  difficulty: Difficulty;
  boardSize: 3 | 5;
}

export interface MenuSceneCallbacks {
  onStart: (selection: MenuSelection) => void;
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

const ROW_WIDTH = 104;
const ROW_GAP = 12;

/** Экран главного меню: сложность бота и размер поля. */
export class MenuScene {
  readonly view = new Container();
  private readonly app: Application;
  private readonly callbacks: MenuSceneCallbacks;
  private readonly title: Text;
  private readonly subtitle: Text;
  private readonly diffLabel: Text;
  private readonly sizeLabel: Text;
  private readonly difficultyButtons: Button[] = [];
  private readonly sizeButtons: Button[] = [];
  private readonly btnPlay: Button;
  private difficulty: Difficulty = 'medium';
  private boardSize: 3 | 5 = 5;

  constructor(app: Application, callbacks: MenuSceneCallbacks) {
    this.app = app;
    this.callbacks = callbacks;
    this.title = new Text({
      text: 'БАЛДА',
      style: { fontFamily: FONT_FAMILY, fontSize: 56, fill: COLORS.text, fontWeight: 'bold' },
    });
    this.title.anchor.set(0.5);
    this.subtitle = new Text({
      text: 'словесная игра',
      style: { fontFamily: FONT_FAMILY, fontSize: 18, fill: COLORS.textDim },
    });
    this.subtitle.anchor.set(0.5);
    this.diffLabel = new Text({
      text: 'Сложность бота',
      style: { fontFamily: FONT_FAMILY, fontSize: 17, fill: COLORS.text },
    });
    this.diffLabel.anchor.set(0.5, 0);
    this.sizeLabel = new Text({
      text: 'Размер поля',
      style: { fontFamily: FONT_FAMILY, fontSize: 17, fill: COLORS.text },
    });
    this.sizeLabel.anchor.set(0.5, 0);
    this.view.addChild(this.title, this.subtitle, this.diffLabel, this.sizeLabel);

    for (const option of DIFFICULTIES) {
      const button = new Button({
        caption: option.caption,
        width: ROW_WIDTH,
        height: 46,
        color: COLORS.panel,
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
        color: COLORS.panel,
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

    this.btnPlay = new Button({
      caption: 'Играть',
      width: 220,
      height: 56,
      fontSize: 24,
      onTap: () => {
        setTimeout(
          () => this.callbacks.onStart({ difficulty: this.difficulty, boardSize: this.boardSize }),
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
    this.title.position.set(width / 2, height * 0.16);
    this.subtitle.position.set(width / 2, height * 0.16 + 44);
    const diffY = height * 0.36;
    this.diffLabel.position.set(width / 2, diffY);
    this.layoutRow(this.difficultyButtons, diffY + 30);
    const sizeY = height * 0.53;
    this.sizeLabel.position.set(width / 2, sizeY);
    this.layoutRow(this.sizeButtons, sizeY + 30);
    this.btnPlay.position.set((width - 220) / 2, height * 0.72);
  }

  private layoutRow(buttons: Button[], y: number): void {
    const width = this.app.screen.width;
    const total = buttons.length * ROW_WIDTH + (buttons.length - 1) * ROW_GAP;
    let x = Math.floor((width - total) / 2);
    for (const button of buttons) {
      button.position.set(x, y);
      x += ROW_WIDTH + ROW_GAP;
    }
  }

  private updateSelectionStyles(): void {
    DIFFICULTIES.forEach((option, index) => {
      const selected = option.id === this.difficulty;
      this.difficultyButtons[index]!.setColor(selected ? COLORS.accent : COLORS.panel);
    });
    BOARD_SIZES.forEach((option, index) => {
      const selected = !option.disabled && option.id === this.boardSize;
      this.sizeButtons[index]!.setColor(selected ? COLORS.accent : COLORS.panel);
    });
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.view.destroy({ children: true });
  }
}
