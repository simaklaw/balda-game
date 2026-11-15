import { Container, Text } from 'pixi.js';
import { FONT_FAMILY, palette } from '../theme';

export interface HudLabels {
  human?: string;
  opponent?: string;
}

/** Верхняя панель: счёт обоих игроков, строка статуса. */
export class HudView extends Container {
  private readonly humanScore: Text;
  private readonly opponentScore: Text;
  private readonly status: Text;
  private humanLabel: string;
  private opponentLabel: string;

  constructor(width: number, labels: HudLabels = {}) {
    super();
    this.humanLabel = labels.human ?? 'Вы';
    this.opponentLabel = labels.opponent ?? 'Бот';
    this.humanScore = new Text({
      text: this.humanLabel + ': 0',
      style: { fontFamily: FONT_FAMILY, fontSize: 20, fill: palette().accent },
    });
    this.opponentScore = new Text({
      text: this.opponentLabel + ': 0',
      style: { fontFamily: FONT_FAMILY, fontSize: 20, fill: palette().ai },
    });
    this.status = new Text({
      text: '',
      style: { fontFamily: FONT_FAMILY, fontSize: 15, fill: palette().textDim },
    });
    this.addChild(this.humanScore, this.opponentScore, this.status);
    this.layout(width);
  }

  layout(width: number): void {
    this.humanScore.anchor.set(0, 0);
    this.humanScore.position.set(12, 8);
    this.opponentScore.anchor.set(1, 0);
    this.opponentScore.position.set(width - 12, 8);
    this.status.anchor.set(0.5, 0);
    this.status.position.set(width / 2, 34);
  }

  update(human: number, opponent: number, statusText: string): void {
    this.humanScore.text = this.humanLabel + ': ' + human;
    this.opponentScore.text = this.opponentLabel + ': ' + opponent;
    this.status.text = statusText;
  }
}
