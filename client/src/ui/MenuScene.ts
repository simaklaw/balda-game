import { Application, Container, Text } from 'pixi.js';
import type { Difficulty } from '@balda/shared';
import type { TimeControlKind } from '../game/TimerModel';
import { safeInsets } from './safeArea';
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

  /**
   * Адаптивная потоковая вёрстка: блоки идут сверху вниз и не наезжают
   * друг на друга. Ширины кнопок подстраиваются под экран (ряд из четырёх
   * режимов времени умещается даже на 320px), на маленькой высоте
   * (ландшафт телефона) меню сжимается, подсказка скрывается.
   */
  private layout(): void {
    const insets = safeInsets();
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const availH = Math.max(240, height - insets.top - insets.bottom);
    const availW = Math.max(208, width - insets.left - insets.right - 32);
    const ultra = availH < 400;
    const s = Math.min(1, Math.max(0.5, availH / 640));

    const diffW = Math.min(ROW_WIDTH, Math.floor((availW - ROW_GAP * 2) / 3));
    const timeW = Math.min(TIME_ROW_WIDTH, Math.floor((availW - ROW_GAP * 3) / 4));
    const rowH = ultra ? 36 : 46;
    const themeH = ultra ? 36 : 44;
    const playH = ultra ? 44 : 56;
    const labelFont = Math.max(13, Math.floor(17 * s));
    const titleFont = Math.max(30, Math.floor(56 * s));
    const subFont = Math.max(13, Math.floor(18 * s));
    const labelH = labelFont + 3;
    const blockGap = ultra ? 10 : Math.round(18 * s) + 6;
    const titleBlock = ultra ? titleFont + 4 : titleFont + 6 + subFont + Math.round(16 * s) + 8;
    const hintH = ultra ? 0 : 36;

    this.title.style.fontSize = titleFont;
    this.subtitle.style.fontSize = subFont;
    this.subtitle.visible = !ultra;
    this.hint.visible = !ultra;
    for (const label of [this.diffLabel, this.sizeLabel, this.timeLabel]) {
      label.style.fontSize = labelFont;
    }
    for (const button of this.difficultyButtons) button.setWidth(diffW);
    for (const button of this.sizeButtons) button.setWidth(diffW);
    for (const button of this.timeButtons) button.setWidth(timeW);
    for (const group of [this.difficultyButtons, this.sizeButtons, this.timeButtons]) {
      for (const button of group) button.setHeight(rowH);
    }
    this.btnTheme.setHeight(themeH);
    this.btnPlay.setHeight(playH);

    const totalH = 14 + titleBlock + 3 * (labelH + rowH + blockGap) + hintH + themeH + 12 + playH;
    let y = insets.top + 14 + Math.max(0, Math.floor((availH - totalH) / 2));

    this.title.position.set(width / 2, y + titleFont / 2);
    y += titleFont + (ultra ? 4 : 6);
    if (!ultra) {
      this.subtitle.position.set(width / 2, y + subFont / 2);
      y += subFont + Math.round(16 * s) + 8;
    }

    this.diffLabel.position.set(width / 2, y);
    y += labelH;
    this.layoutRow(this.difficultyButtons, diffW, y);
    y += rowH + blockGap;
    this.sizeLabel.position.set(width / 2, y);
    y += labelH;
    this.layoutRow(this.sizeButtons, diffW, y);
    y += rowH + blockGap;
    this.timeLabel.position.set(width / 2, y);
    y += labelH;
    this.layoutRow(this.timeButtons, timeW, y);
    y += rowH + blockGap;

    if (!ultra) {
      this.hint.position.set(width / 2, y + 2);
    }
    y += hintH;
    this.btnTheme.setWidth(200);
    this.btnTheme.position.set((width - 200) / 2, y);
    y += themeH + 12;
    this.btnPlay.setWidth(220);
    this.btnPlay.position.set((width - 220) / 2, y);
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
