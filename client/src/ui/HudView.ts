import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { DISPLAY_FONT, FONT_FAMILY, LETTER_FONT, palette } from '../theme';

export interface HudLabels {
  human?: string;
  opponent?: string;
}

const CARD_H = 34;

/** Обрезает имя до ширины max (с многоточием). */
function fit(full: string, text: Text, max: number): string {
  text.text = full;
  if (text.width <= max) return full;
  let cut = [...full];
  while (cut.length > 1) {
    cut = cut.slice(0, -1);
    text.text = cut.join('') + '…';
    if (text.width <= max) break;
  }
  return text.text;
}

/** Верхняя панель: две карточки игроков со счётом и строка статуса. */
export class HudView extends Container {
  private readonly cards = new Graphics();
  private readonly humanName: Text;
  private readonly humanScore: Text;
  private readonly opponentName: Text;
  private readonly opponentScore: Text;
  private readonly status: Text;
  private readonly humanInitial: Text;
  private readonly opponentInitial: Text;
  private readonly fullNames: [string, string];
  private readonly avatars: [Sprite | null, Sprite | null] = [null, null];
  private readonly avatarMasks: [Graphics | null, Graphics | null] = [null, null];
  private width_ = 0;
  private turn: 'human' | 'opponent' | null = null;

  constructor(width: number, labels: HudLabels = {}) {
    super();
    const name = (text: string, color: number): Text =>
      new Text({ text, style: { fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: '600', fill: color } });
    const score = (color: number): Text =>
      new Text({ text: '0', style: { fontFamily: DISPLAY_FONT, fontSize: 26, fontWeight: '700', fontStyle: 'italic', fill: color } });
    this.humanName = name(labels.human ?? 'Вы', palette().player);
    this.opponentName = name(labels.opponent ?? 'Бот', palette().ai);
    this.humanScore = score(palette().text);
    this.opponentScore = score(palette().text);
    this.fullNames = [labels.human ?? 'Вы', labels.opponent ?? 'Бот'];
    const initial = (text: string): Text =>
      new Text({ text: [...text.trim()][0]?.toUpperCase() ?? '?', style: { fontFamily: LETTER_FONT, fontSize: 16, fontWeight: '700', fill: palette().letterText } });
    this.humanInitial = initial(this.fullNames[0]);
    this.opponentInitial = initial(this.fullNames[1]);
    this.status = new Text({
      text: '',
      style: { fontFamily: FONT_FAMILY, fontSize: 15, fill: palette().textDim },
    });
    this.addChild(this.cards, this.humanInitial, this.opponentInitial, this.humanName, this.humanScore, this.opponentName, this.opponentScore, this.status);
    this.layout(width);
  }

  /** Имя игрока в карточке (0 — вы, 1 — соперник). */
  setName(side: 0 | 1, name: string): void {
    if (this.fullNames[side] === name) return;
    this.fullNames[side] = name;
    const initial = [...name.trim()][0]?.toUpperCase() ?? '?';
    (side === 0 ? this.humanInitial : this.opponentInitial).text = initial;
    this.layout(this.width_);
  }

  /** Аватар игрока из профиля площадки; null — остаётся плитка-инициал. */
  setAvatar(side: 0 | 1, texture: Texture | null): void {
    this.avatars[side]?.destroy();
    this.avatarMasks[side]?.destroy();
    this.avatars[side] = null;
    this.avatarMasks[side] = null;
    if (texture !== null) {
      const sprite = new Sprite(texture);
      const mask = new Graphics();
      this.addChild(mask, sprite);
      sprite.mask = mask;
      this.avatars[side] = sprite;
      this.avatarMasks[side] = mask;
    }
    this.layout(this.width_);
  }

  layout(width: number): void {
    this.width_ = width;
    const cardW = Math.min(150, Math.floor(width / 2) - 18);
    const left = 12;
    const right = width - 12 - cardW;
    this.cards.clear();
    for (const [x, color] of [
      [left, palette().player],
      [right, palette().ai],
    ] as const) {
      this.cards
        .roundRect(x, 2, cardW, CARD_H, 4)
        .fill({ color: palette().panel })
        .stroke({ width: 1, color: palette().frameEdge, alpha: 0.5 });
      // Аватар-литера: бумажная плитка с инициалом и цветной меткой игрока.
      this.cards.roundRect(x + 5, 2 + 5, 24, 24, 3).fill({ color: palette().tileEdge });
      this.cards.roundRect(x + 5, 2 + 5, 24, 21, 3).fill({ color: palette().cell });
      this.cards.rect(x + 7, 2 + 7, 4, 4).fill({ color });
      // Чей ход: киноварная линия-«подчёркивание» по нижней кромке карточки.
      const mine = x === left;
      if ((mine && this.turn === 'human') || (!mine && this.turn === 'opponent')) {
        this.cards.rect(x, 2 + CARD_H - 3, cardW, 3).fill({ color: palette().player });
        this.cards.roundRect(x - 0.5, 1.5, cardW + 1, CARD_H + 1, 4).stroke({ width: 1.5, color: palette().player, alpha: 0.8 });
      }
    }
    const nameMax = cardW - 38 - 44;
    this.humanName.text = fit(this.fullNames[0], this.humanName, nameMax);
    this.opponentName.text = fit(this.fullNames[1], this.opponentName, nameMax);
    [left, right].forEach((x, i) => {
      const sprite = this.avatars[i];
      const mask = this.avatarMasks[i];
      if (sprite === null || sprite === undefined || mask === null || mask === undefined) return;
      sprite.position.set(x + 5, 2 + 5);
      sprite.width = 24;
      sprite.height = 24;
      mask.clear();
      mask.roundRect(x + 5, 2 + 5, 24, 24, 3).fill({ color: 0xffffff });
      mask.roundRect(x + 5, 2 + 5, 24, 24, 3).stroke({ width: 1, color: palette().tileEdge });
    });
    this.humanInitial.visible = this.avatars[0] === null;
    this.opponentInitial.visible = this.avatars[1] === null;
    this.humanInitial.anchor.set(0.5);
    this.humanInitial.position.set(left + 17, 2 + 5 + 10.5);
    this.opponentInitial.anchor.set(0.5);
    this.opponentInitial.position.set(right + 17, 2 + 5 + 10.5);
    this.humanName.anchor.set(0, 0.5);
    this.humanName.position.set(left + 36, 2 + CARD_H / 2);
    this.humanScore.anchor.set(1, 0.5);
    this.humanScore.position.set(left + cardW - 12, 2 + CARD_H / 2);
    this.opponentName.anchor.set(0, 0.5);
    this.opponentName.position.set(right + 36, 2 + CARD_H / 2);
    this.opponentScore.anchor.set(1, 0.5);
    this.opponentScore.position.set(right + cardW - 12, 2 + CARD_H / 2);
    this.status.anchor.set(0.5, 0);
    this.status.position.set(width / 2, CARD_H + 6);
  }

  update(human: number, opponent: number, statusText: string, turn: 'human' | 'opponent' | null = null): void {
    if (turn !== this.turn) {
      this.turn = turn;
      this.layout(this.width_);
    }
    this.humanScore.text = String(human);
    this.opponentScore.text = String(opponent);
    this.status.text = statusText;
  }

  get hudWidth(): number {
    return this.width_;
  }
}
