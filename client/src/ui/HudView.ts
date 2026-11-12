import { Container, Text } from 'pixi.js';
import { FONT_FAMILY, palette } from '../theme';

/** Верхняя панель: счёт игрока и бота, строка статуса. */
export class HudView extends Container {
  private readonly humanScore: Text;
  private readonly aiScore: Text;
  private readonly status: Text;

  constructor(width: number) {
    super();
    this.humanScore = new Text({
      text: 'Вы: 0',
      style: { fontFamily: FONT_FAMILY, fontSize: 20, fill: palette().accent },
    });
    this.aiScore = new Text({
      text: 'Бот: 0',
      style: { fontFamily: FONT_FAMILY, fontSize: 20, fill: palette().ai },
    });
    this.status = new Text({
      text: '',
      style: { fontFamily: FONT_FAMILY, fontSize: 15, fill: palette().textDim },
    });
    this.addChild(this.humanScore, this.aiScore, this.status);
    this.layout(width);
  }

  layout(width: number): void {
    this.humanScore.anchor.set(0, 0);
    this.humanScore.position.set(12, 8);
    this.aiScore.anchor.set(1, 0);
    this.aiScore.position.set(width - 12, 8);
    this.status.anchor.set(0.5, 0);
    this.status.position.set(width / 2, 34);
  }

  update(human: number, ai: number, statusText: string): void {
    this.humanScore.text = 'Вы: ' + human;
    this.aiScore.text = 'Бот: ' + ai;
    this.status.text = statusText;
  }
}
