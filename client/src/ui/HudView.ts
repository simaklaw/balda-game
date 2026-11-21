import { Container, Graphics, Text } from 'pixi.js';
import { DISPLAY_FONT, FONT_FAMILY, palette } from '../theme';

export interface HudLabels {
  human?: string;
  opponent?: string;
}

const CARD_H = 34;

/** Верхняя панель: две карточки игроков со счётом и строка статуса. */
export class HudView extends Container {
  private readonly cards = new Graphics();
  private readonly humanName: Text;
  private readonly humanScore: Text;
  private readonly opponentName: Text;
  private readonly opponentScore: Text;
  private readonly status: Text;
  private width_ = 0;

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
    this.status = new Text({
      text: '',
      style: { fontFamily: FONT_FAMILY, fontSize: 15, fill: palette().textDim },
    });
    this.addChild(this.cards, this.humanName, this.humanScore, this.opponentName, this.opponentScore, this.status);
    this.layout(width);
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
      this.cards.rect(x + 9, 2 + CARD_H / 2 - 3.5, 7, 7).fill({ color });
    }
    this.humanName.anchor.set(0, 0.5);
    this.humanName.position.set(left + 22, 2 + CARD_H / 2);
    this.humanScore.anchor.set(1, 0.5);
    this.humanScore.position.set(left + cardW - 12, 2 + CARD_H / 2);
    this.opponentName.anchor.set(0, 0.5);
    this.opponentName.position.set(right + 22, 2 + CARD_H / 2);
    this.opponentScore.anchor.set(1, 0.5);
    this.opponentScore.position.set(right + cardW - 12, 2 + CARD_H / 2);
    this.status.anchor.set(0.5, 0);
    this.status.position.set(width / 2, CARD_H + 6);
  }

  update(human: number, opponent: number, statusText: string): void {
    this.humanScore.text = String(human);
    this.opponentScore.text = String(opponent);
    this.status.text = statusText;
  }

  get hudWidth(): number {
    return this.width_;
  }
}
