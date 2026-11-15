import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Difficulty } from '@balda/shared';
import type { TimeControlKind } from '../game/TimerModel';
import { formatEntry } from '../game/leaderboard';
import type { LeaderboardEntry } from '../game/leaderboard';
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
  onOnline: () => void;
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

const RULES_TEXT =
  '1. Коснитесь пустой клетки рядом с буквами и выберите букву.\n' +
  '2. Составьте слово из соседних букв — цепочка должна проходить через новую букву.\n' +
  '3. Отпустите палец или нажмите OK. Очки равны длине слова.\n' +
  '4. Только нарицательные существительные в единственном числе: от 3 букв на поле 3×3, от 4 — на 5×5. Повторять слова нельзя.\n' +
  '5. Три пропуска подряд завершают партию. В блице и Фишере просрочка часов — поражение.';

const ROW_WIDTH = 104;
const TIME_ROW_WIDTH = 88;
const ROW_GAP = 12;

/** Экран главного меню: сложность, поле, контроль времени, онлайн, правила и тема. */
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
  private readonly btnLeaderboard: Button;
  private readonly btnRules: Button;
  private readonly btnOnline: Button;
  private readonly btnPlay: Button;
  private readonly leaderboard: readonly LeaderboardEntry[];
  private difficulty: Difficulty = 'medium';
  private boardSize: 3 | 5 = 5;
  private timeControl: TimeControlKind = 'classic';

  constructor(
    app: Application,
    callbacks: MenuSceneCallbacks,
    leaderboard: readonly LeaderboardEntry[] = [],
  ) {
    this.app = app;
    this.callbacks = callbacks;
    this.leaderboard = leaderboard;
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

    this.btnRules = new Button({
      caption: 'Правила',
      width: 200,
      height: 44,
      color: palette().panel,
      fontSize: 16,
      onTap: () => this.showRules(),
    });
    this.view.addChild(this.btnRules);

    this.btnLeaderboard = new Button({
      caption: 'Рейтинг',
      width: 200,
      height: 44,
      color: palette().panel,
      fontSize: 16,
      onTap: () => this.showLeaderboard(),
    });
    this.view.addChild(this.btnLeaderboard);

    this.btnOnline = new Button({
      caption: 'Онлайн',
      width: 220,
      height: 44,
      color: palette().panel,
      fontSize: 16,
      onTap: () => {
        setTimeout(() => this.callbacks.onOnline(), 0);
      },
    });
    this.view.addChild(this.btnOnline);

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

  /** Панель с правилами игры. */
  private showRules(): void {
    const insets = safeInsets();
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const overlay = new Container();
    overlay.eventMode = 'static';
    overlay.addChild(new Graphics().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.75 }));
    const panelWidth = Math.min(360, width - 40);
    const panelX = Math.floor((width - panelWidth) / 2);
    const panelY = Math.max(48 + insets.top, Math.floor((height - 340) / 2));
    const panel = new Graphics();
    overlay.addChild(panel);
    const title = new Text({
      text: 'Как играть',
      style: { fontFamily: FONT_FAMILY, fontSize: 22, fill: palette().text },
    });
    title.anchor.set(0.5);
    title.position.set(width / 2, panelY + 34);
    overlay.addChild(title);
    const body = new Text({
      text: RULES_TEXT,
      style: {
        fontFamily: FONT_FAMILY,
        fontSize: 14,
        fill: palette().text,
        wordWrap: true,
        wordWrapWidth: panelWidth - 44,
        lineHeight: 20,
      },
    });
    body.anchor.set(0.5, 0);
    body.position.set(width / 2, panelY + 62);
    overlay.addChild(body);
    const panelHeight = Math.min(height - 80, 62 + Math.ceil(body.height) + 66);
    panel
      .roundRect(panelX, panelY, panelWidth, panelHeight, 16)
      .fill({ color: palette().panel })
      .stroke({ width: 2, color: palette().panelBorder });
    const btnClose = new Button({
      caption: 'Понятно',
      width: panelWidth - 44,
      height: 46,
      color: palette().accent,
      onTap: () => {
        this.view.removeChild(overlay);
        overlay.destroy({ children: true });
      },
    });
    btnClose.position.set(panelX + 22, panelY + panelHeight - 58);
    overlay.addChild(btnClose);
    this.view.addChild(overlay);
  }

  /** Панель локального рейтинга: топ личных результатов оффлайн-партий. */
  private showLeaderboard(): void {
    const insets = safeInsets();
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const lineHeight = 22;
    const fontSize = 15;
    const overlay = new Container();
    overlay.eventMode = 'static';
    overlay.addChild(new Graphics().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.75 }));
    const panelWidth = Math.min(340, width - 40);
    const panelHeight = Math.min(height - 80, 110 + this.leaderboard.length * lineHeight + 64);
    const panelX = Math.floor((width - panelWidth) / 2);
    const panelY = Math.max(48 + insets.top, Math.floor((height - panelHeight) / 2));
    overlay.addChild(
      new Graphics()
        .roundRect(panelX, panelY, panelWidth, panelHeight, 16)
        .fill({ color: palette().panel })
        .stroke({ width: 2, color: palette().panelBorder }),
    );
    const title = new Text({
      text: 'Локальный рейтинг',
      style: { fontFamily: FONT_FAMILY, fontSize: 20, fill: palette().text },
    });
    title.anchor.set(0.5);
    title.position.set(width / 2, panelY + 32);
    overlay.addChild(title);
    if (this.leaderboard.length === 0) {
      const empty = new Text({
        text: 'Сыграйте партию против бота,\nчтобы попасть в рейтинг',
        style: { fontFamily: FONT_FAMILY, fontSize, fill: palette().textDim, align: 'center' },
      });
      empty.anchor.set(0.5);
      empty.position.set(width / 2, panelY + 78);
      overlay.addChild(empty);
    } else {
      this.leaderboard.forEach((entry, i) => {
        const line = new Text({
          text: i + 1 + '. ' + entry.score + '  ·  ' + formatEntry(entry),
          style: { fontFamily: FONT_FAMILY, fontSize, fill: i === 0 ? palette().accent : palette().text, lineHeight },
        });
        line.anchor.set(0.5, 0);
        line.position.set(width / 2, panelY + 58 + i * lineHeight);
        overlay.addChild(line);
      });
    }
    const btnClose = new Button({
      caption: 'Закрыть',
      width: panelWidth - 30,
      height: 46,
      color: palette().panel,
      onTap: () => {
        this.view.removeChild(overlay);
        overlay.destroy({ children: true });
      },
    });
    btnClose.position.set(panelX + 15, panelY + panelHeight - 60);
    overlay.addChild(btnClose);
    this.view.addChild(overlay);
  }

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
    const ultra = availH < 440;
    const s = Math.min(1, Math.max(0.5, availH / 700));

    const diffW = Math.min(ROW_WIDTH, Math.floor((availW - ROW_GAP * 2) / 3));
    const timeW = Math.min(TIME_ROW_WIDTH, Math.floor((availW - ROW_GAP * 3) / 4));
    const rowH = ultra ? 36 : 46;
    const themeH = ultra ? 36 : 44;
    const rulesH = ultra ? 36 : 44;
    const leaderboardH = ultra ? 36 : 44;
    const onlineH = ultra ? 36 : 44;
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
    this.btnRules.setHeight(rulesH);
    this.btnLeaderboard.setHeight(leaderboardH);
    this.btnOnline.setHeight(onlineH);
    this.btnPlay.setHeight(playH);

    const totalH =
      14 +
      titleBlock +
      3 * (labelH + rowH + blockGap) +
      hintH +
      themeH +
      10 +
      rulesH +
      10 +
      leaderboardH +
      10 +
      onlineH +
      12 +
      playH;
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
    y += themeH + 10;
    this.btnRules.setWidth(200);
    this.btnRules.position.set((width - 200) / 2, y);
    y += rulesH + 10;
    this.btnLeaderboard.setWidth(200);
    this.btnLeaderboard.position.set((width - 200) / 2, y);
    y += leaderboardH + 10;
    this.btnOnline.setWidth(220);
    this.btnOnline.position.set((width - 220) / 2, y);
    y += onlineH + 12;
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
