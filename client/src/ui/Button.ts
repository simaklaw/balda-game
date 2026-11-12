import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, FONT_FAMILY } from '../theme';

export interface ButtonOptions {
  caption: string;
  width: number;
  height: number;
  color?: number;
  textColor?: number;
  fontSize?: number;
  onTap: () => void;
}

/** Кнопка: скруглённый прямоугольник + подпись, реагирует на pointertap. */
export class Button extends Container {
  private readonly bg: Graphics;
  private readonly caption: Text;
  private readonly options: ButtonOptions;
  private enabled = true;

  constructor(options: ButtonOptions) {
    super();
    this.options = options;
    this.bg = new Graphics();
    this.addChild(this.bg);
    this.caption = new Text({
      text: options.caption,
      style: {
        fontFamily: FONT_FAMILY,
        fontSize: options.fontSize ?? Math.max(14, Math.floor(options.height * 0.42)),
        fill: options.textColor ?? COLORS.text,
      },
    });
    this.caption.anchor.set(0.5);
    this.caption.position.set(options.width / 2, options.height / 2);
    this.addChild(this.caption);
    this.draw();
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', () => {
      if (this.enabled) options.onTap();
    });
  }

  private draw(): void {
    this.bg.clear();
    this.bg
      .roundRect(0, 0, this.options.width, this.options.height, 10)
      .fill({ color: this.options.color ?? COLORS.accent })
      .stroke({ width: 2, color: COLORS.panelBorder });
  }

  /** Сменить цвет фона (для выделения выбранной опции). */
  setColor(color: number): void {
    this.options.color = color;
    this.draw();
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    this.alpha = value ? 1 : 0.45;
    this.eventMode = value ? 'static' : 'none';
  }
}
