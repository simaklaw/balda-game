import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Difficulty } from '@balda/shared';
import type { TimeControlKind } from '../game/TimerModel';
import { formatEntry } from '../game/leaderboard';
import type { LeaderboardEntry } from '../game/leaderboard';
import type { LeaderboardRow } from '../platform/types';
import { safeInsets } from './safeArea';
import { Button } from './Button';
import { prefersReducedMotion, spring, stepSpring } from './spring';
import { FONT_FAMILY, LETTER_FONT, palette, setTheme, shade, themeKind } from '../theme';
import { sound } from '../audio/Sound';

export interface MenuSelection {
  difficulty: Difficulty;
  boardSize: 3 | 5 | 7;
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
  { id: 7, caption: '7×7', disabled: false },
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

const HINT_TEXT =
  '2 мин — на ход · Блиц — 2 мин на партию · Фишер — 1 мин + 10 с за ход';

const ROW_WIDTH = 104;
const TIME_ROW_WIDTH = 88;
const ROW_GAP = 12;

/** Экран главного меню: сложность, поле, контроль времени, онлайн, правила и тема. */
/** Заголовок, набранный пятью литерами: каждая слегка скошена, как набрана вручную. */
class TitleSorts extends Container {
  private readonly word: string;
  private size_ = 0;

  constructor(word: string) {
    super();
    this.word = word;
  }

  setSize(size: number): void {
    if (size === this.size_) return;
    this.size_ = size;
    for (const child of [...this.children]) child.destroy({ children: true });
    const side = Math.round(size * 0.98);
    const gap = Math.max(4, Math.round(size * 0.08));
    const lip = Math.max(3, Math.round(side * 0.1));
    const total = this.word.length * side + (this.word.length - 1) * gap;
    const tilts = [-0.035, 0.025, -0.015, 0.03, -0.025];
    [...this.word].forEach((ch, i) => {
      const tile = new Container();
      const g = new Graphics();
      g.roundRect(-side / 2 - 1, -side / 2 + lip + 4, side + 2, side - lip, 4).fill({ color: 0x000000, alpha: 0.3 });
      g.roundRect(-side / 2, -side / 2 + lip, side, side - lip, 3).fill({ color: palette().tileEdge });
      g.roundRect(-side / 2, -side / 2, side, side - lip, 3).fill({ color: palette().cell });
      g.roundRect(-side / 2 + 4, -side / 2 + 4, side - 8, side - lip - 8, 1.5).stroke({ width: 1, color: palette().tileEdge, alpha: 0.55 });
      g.rect(-side / 2 + 4, -side / 2 + 4, 5, 5).fill({ color: palette().player });
      const t = new Text({
        text: ch,
        style: { fontFamily: LETTER_FONT, fontSize: Math.round(side * 0.62), fontWeight: '700', fill: i === 4 ? shade(palette().accent, -0.1) : palette().letterText },
      });
      t.anchor.set(0.5);
      t.position.set(0, -lip / 2);
      tile.addChild(g, t);
      tile.position.set(-total / 2 + side / 2 + i * (side + gap), 0);
      tile.rotation = tilts[i % tilts.length]!;
      this.addChild(tile);
    });
  }
}

export class MenuScene {
  readonly view = new Container();
  private readonly app: Application;
  private readonly callbacks: MenuSceneCallbacks;
  private readonly title: TitleSorts;
  private readonly subtitle: Text;
  private readonly diffLabel: Text;
  private readonly sizeLabel: Text;
  private readonly timeLabel: Text;
  private readonly hint: Text;
  private readonly difficultyButtons: Button[] = [];
  private readonly sizeButtons: Button[] = [];
  private readonly timeButtons: Button[] = [];
  private readonly btnTheme: Button;
  private readonly btnSound: Button;
  private readonly btnLeaderboard: Button;
  private readonly btnRules: Button;
  private readonly btnOnline: Button;
  private readonly btnPlay: Button;
  private readonly magnet = {
    bx: spring(0, 170, 13),
    by: spring(0, 170, 13),
    lx: spring(0, 220, 15),
    ly: spring(0, 220, 15),
    sc: spring(1, 400, 18),
    px: null as number | null,
    py: null as number | null,
  };
  private readonly onPointerMove = (e: { global: { x: number; y: number } }): void => {
    this.magnet.px = e.global.x;
    this.magnet.py = e.global.y;
  };
  private readonly onPointerLeave = (): void => {
    this.magnet.px = null;
    this.magnet.py = null;
  };
  private readonly onMagnetTick = (): void => {
    const m = this.magnet;
    const dt = Math.min(this.app.ticker.deltaMS / 1000, 1 / 30);
    const { width, height } = this.btnPlay.buttonSize;
    const o = this.btnPlay.getGlobalPosition();
    const cx = o.x + width / 2;
    const cy = o.y + height / 2;
    const R = 130;
    let pull = 0;
    let dx = 0;
    let dy = 0;
    if (m.px !== null && m.py !== null) {
      dx = m.px - cx;
      dy = m.py - cy;
      const d = Math.hypot(dx, dy);
      // Притяжение действует в радиусе R от границы кнопки.
      const edge = Math.max(0, d - Math.min(width, height) / 2);
      pull = edge < R ? 1 - (edge / R) * 0.35 : 0;
    }
    m.bx.t = dx * 0.32 * pull;
    m.by.t = dy * 0.38 * pull;
    m.lx.t = dx * 0.14 * pull;
    m.ly.t = dy * 0.18 * pull;
    m.sc.t = 1 + 0.06 * pull;
    const lim = (v: number, a: number): number => Math.max(-a, Math.min(a, v));
    for (const s of [m.bx, m.by, m.lx, m.ly, m.sc]) stepSpring(s, dt);
    this.btnPlay.setMagnet(lim(m.bx.x, 22), lim(m.by.x, 14), m.sc.x, lim(m.lx.x, 10), lim(m.ly.x, 6));
  };
  private readonly leaderboard: readonly LeaderboardEntry[];
  private readonly nativeTop: readonly LeaderboardRow[];
  /** Строка о словаре в подвале меню («Словарь: 49 312 слов» / «Словарь: ограниченный»). */
  private readonly dictInfo: string;
  private difficulty: Difficulty = 'medium';
  private boardSize: 3 | 5 | 7 = 5;
  private timeControl: TimeControlKind = 'classic';

  constructor(
    app: Application,
    callbacks: MenuSceneCallbacks,
    leaderboard: readonly LeaderboardEntry[] = [],
    nativeTop: readonly LeaderboardRow[] = [],
    dictInfo = '',
  ) {
    this.app = app;
    this.callbacks = callbacks;
    this.leaderboard = leaderboard;
    this.nativeTop = nativeTop;
    this.dictInfo = dictInfo;
    this.title = new TitleSorts('БАЛДА');
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
      text: this.dictInfo === '' ? HINT_TEXT : HINT_TEXT + '\n' + this.dictInfo,
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
      caption: 'Тема',
      icon: themeKind() === 'dark' ? 'moon' : 'sun',
      width: 94,
      height: 44,
      color: palette().panel,
      fontSize: 15,
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

    this.btnSound = new Button({
      caption: 'Звук',
      icon: sound.enabled ? 'volume_2' : 'volume_x',
      width: 94,
      height: 44,
      color: palette().panel,
      fontSize: 15,
      sfx: 'none',
      onTap: () => {
        sound.setEnabled(!sound.enabled);
        this.btnSound.setIcon(sound.enabled ? 'volume_2' : 'volume_x');
        if (sound.enabled) sound.play('word', 4);
      },
    });
    this.view.addChild(this.btnSound);

    this.btnRules = new Button({
      caption: 'Правила',
      icon: 'book_open',
      width: 200,
      height: 44,
      color: palette().panel,
      fontSize: 16,
      onTap: () => this.showRules(),
    });
    this.view.addChild(this.btnRules);

    this.btnLeaderboard = new Button({
      caption: 'Рейтинг',
      icon: 'trophy',
      width: 200,
      height: 44,
      color: palette().panel,
      fontSize: 16,
      onTap: () => this.showLeaderboard(),
    });
    this.view.addChild(this.btnLeaderboard);

    this.btnOnline = new Button({
      caption: 'Онлайн',
      icon: 'globe',
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
      icon: 'play',
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
    if (!prefersReducedMotion()) {
      this.app.stage.on('globalpointermove', this.onPointerMove);
      this.app.stage.on('pointerleave', this.onPointerLeave);
      this.app.ticker.add(this.onMagnetTick);
    }

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

  /**
   * Панель рейтинга: локальный топ оффлайн-партий и, если площадка
   * предоставляет нативный лидерборд (Яндекс), топ площадки под ним.
   */
  private showLeaderboard(): void {
    const insets = safeInsets();
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const lineHeight = 22;
    const fontSize = 15;
    const nativeCount = this.nativeTop.length;
    const nativeBlock = nativeCount > 0 ? 34 + nativeCount * lineHeight : 0;
    const overlay = new Container();
    overlay.eventMode = 'static';
    overlay.addChild(new Graphics().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.75 }));
    const panelWidth = Math.min(340, width - 40);
    const panelHeight = Math.min(
      height - 80,
      110 + this.leaderboard.length * lineHeight + nativeBlock + 64,
    );
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
    if (nativeCount > 0) {
      const nativeY = panelY + 58 + this.leaderboard.length * lineHeight;
      const caption = new Text({
        text: 'Топ площадки',
        style: { fontFamily: FONT_FAMILY, fontSize: 13, fill: palette().textDim },
      });
      caption.anchor.set(0.5, 0);
      caption.position.set(width / 2, nativeY);
      overlay.addChild(caption);
      this.nativeTop.forEach((row, i) => {
        const label = row.name === '' ? 'Игрок' : row.name;
        const line = new Text({
          text: row.rank + '. ' + label + ' — ' + row.score,
          style: { fontFamily: FONT_FAMILY, fontSize, fill: palette().text, lineHeight },
        });
        line.anchor.set(0.5, 0);
        line.position.set(width / 2, nativeY + 24 + i * lineHeight);
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
    if (width > height && availH < 560) {
      this.layoutLandscape(insets, width, availH);
      return;
    }
    this.hint.visible = true;
    this.subtitle.visible = true;
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
    // Строка о словаре добавляет вторую строку подсказки.
    const hintH = ultra ? 0 : this.dictInfo === '' ? 36 : 64;

    this.title.setSize(titleFont);
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
    this.btnSound.setHeight(themeH);
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
    const halfW = Math.min(94, Math.floor((availW - ROW_GAP) / 2));
    this.btnTheme.setWidth(halfW);
    this.btnSound.setWidth(halfW);
    this.btnTheme.position.set(Math.floor((width - (halfW * 2 + ROW_GAP)) / 2), y);
    this.btnSound.position.set(Math.floor((width - (halfW * 2 + ROW_GAP)) / 2) + halfW + ROW_GAP, y);
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

  /** Горизонтальный экран: слева заголовок и настройки, справа кнопки и «Играть». */
  private layoutLandscape(insets: { top: number; bottom: number; left: number; right: number }, width: number, availH: number): void {
    const gap = 8;
    const innerW = width - insets.left - insets.right - 32;
    const colW = Math.min(400, Math.floor((innerW - 28) / 2));
    const leftCx = insets.left + 16 + colW / 2;
    const rightCx = width - insets.right - 16 - colW / 2;
    const rowH = Math.max(30, Math.min(40, Math.floor(availH * 0.105)));
    const labelFont = 13;
    const labelH = labelFont + 4;
    const titleFont = Math.max(34, Math.min(50, Math.floor(availH * 0.13)));

    this.subtitle.visible = false;
    this.hint.visible = false;
    this.title.setSize(titleFont);
    for (const label of [this.diffLabel, this.sizeLabel, this.timeLabel]) label.style.fontSize = labelFont;

    const diffW = Math.floor((colW - ROW_GAP * 2) / 3);
    const timeW = Math.floor((colW - ROW_GAP * 3) / 4);
    for (const b of this.difficultyButtons) b.setWidth(diffW);
    for (const b of this.sizeButtons) b.setWidth(diffW);
    for (const b of this.timeButtons) b.setWidth(timeW);
    for (const group of [this.difficultyButtons, this.sizeButtons, this.timeButtons]) {
      for (const b of group) b.setHeight(rowH);
    }

    const leftH = titleFont + 12 + 3 * (labelH + rowH + 10);
    let y = insets.top + Math.max(8, Math.floor((availH - leftH) / 2));
    this.title.position.set(leftCx, y + titleFont / 2);
    y += titleFont + 12;
    const block = (label: Text, buttons: Button[], w: number): void => {
      label.position.set(leftCx, y);
      y += labelH;
      this.layoutRow(buttons, w, y, leftCx);
      y += rowH + 10;
    };
    block(this.diffLabel, this.difficultyButtons, diffW);
    block(this.sizeLabel, this.sizeButtons, diffW);
    block(this.timeLabel, this.timeButtons, timeW);

    const btnH = Math.max(32, Math.min(42, Math.floor(availH * 0.11)));
    const playH = Math.max(40, Math.min(54, Math.floor(availH * 0.14)));
    for (const b of [this.btnTheme, this.btnSound, this.btnRules, this.btnLeaderboard, this.btnOnline]) b.setHeight(btnH);
    this.btnPlay.setHeight(playH);
    const rightH = btnH * 4 + playH + gap * 3 + 14;
    let ry = insets.top + Math.max(8, Math.floor((availH - rightH) / 2));
    const half = Math.floor((colW - gap) / 2);
    this.btnTheme.setWidth(half);
    this.btnSound.setWidth(half);
    this.btnTheme.position.set(Math.round(rightCx - colW / 2), ry);
    this.btnSound.position.set(Math.round(rightCx - colW / 2) + half + gap, ry);
    ry += btnH + gap;
    for (const b of [this.btnRules, this.btnLeaderboard, this.btnOnline]) {
      b.setWidth(colW);
      b.position.set(Math.round(rightCx - colW / 2), ry);
      ry += btnH + gap;
    }
    ry += 6;
    this.btnPlay.setWidth(colW);
    this.btnPlay.position.set(Math.round(rightCx - colW / 2), ry);
  }

  private layoutRow(buttons: Button[], buttonWidth: number, y: number, cx: number = this.app.screen.width / 2): void {
    const total = buttons.length * buttonWidth + (buttons.length - 1) * ROW_GAP;
    let x = Math.floor(cx - total / 2);
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
    this.app.stage.off('globalpointermove', this.onPointerMove);
    this.app.stage.off('pointerleave', this.onPointerLeave);
    this.app.ticker.remove(this.onMagnetTick);
    this.view.destroy({ children: true });
  }
}
