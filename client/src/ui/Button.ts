import { Container, Graphics, Text } from 'pixi.js';
import { FONT_FAMILY, luminance, palette, shade } from '../theme';
import { sound } from '../audio/Sound';

export interface ButtonOptions {
  caption: string;
  width: number;
  height: number;
  color?: number;
  textColor?: number;
  fontSize?: number;
  /** Звук нажатия: 'tap' (по умолчанию), 'key' (клавиши) или 'none'. */
  sfx?: 'tap' | 'key' | 'none';
  onTap: () => void;
}

/** Толщина «нижней грани» кнопки (объём). */
const LIP = 2;

/**
 * Кнопка с объёмом: верхняя грань + тёмная нижняя кромка + блик.
 * При нажатии грань «утапливается», при отпускании возвращается; тап озвучен.
 */
export class Button extends Container {
  private readonly bg: Graphics;
  private readonly face: Container;
  private readonly caption: Text;
  private readonly options: ButtonOptions;
  private enabled = true;
  private pressed = false;

  constructor(options: ButtonOptions) {
    super();
    this.options = options;
    this.bg = new Graphics();
    this.face = new Container();
    this.addChild(this.bg, this.face);
    this.caption = new Text({
      text: options.caption,
      style: {
        fontFamily: FONT_FAMILY,
        fontSize: options.fontSize ?? Math.max(14, Math.floor(options.height * 0.42)),
        fontWeight: '600',
        fill: options.textColor ?? Button.textOn(options.color ?? palette().accent),
      },
    });
    this.caption.anchor.set(0.5);
    this.face.addChild(this.caption);
    this.layoutCaption();
    this.draw();
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', () => this.setPressed(true));
    this.on('pointerup', () => this.setPressed(false));
    this.on('pointerupoutside', () => this.setPressed(false));
    this.on('pointerout', () => this.setPressed(false));
    this.on('pointertap', () => {
      if (!this.enabled) return;
      const sfx = options.sfx ?? 'tap';
      if (sfx !== 'none') sound.play(sfx);
      options.onTap();
    });
  }

  /** Цвет подписи: тёмные чернила на светлой (латунной) заливке, слоновая кость на тёмной. */
  private static textOn(fill: number): number {
    return luminance(fill) > 0.28 ? 0x1a1509 : 0xf6efdc;
  }

  private layoutCaption(): void {
    this.caption.position.set(this.options.width / 2, (this.options.height - LIP) / 2);
  }

  private setPressed(value: boolean): void {
    if (this.pressed === value || !this.enabled) return;
    this.pressed = value;
    this.face.y = value ? LIP - 1 : 0;
    this.draw();
  }

  private draw(): void {
    const { width, height } = this.options;
    const base = this.enabled ? (this.options.color ?? palette().accent) : palette().panel;
    const bright = luminance(base) > 0.28;
    const faceH = height - LIP;
    const radius = Math.min(11, faceH / 2.6);
    this.bg.clear();
    // Тонкая тёмная кромка снизу: объём без глянца.
    this.bg.roundRect(0, LIP, width, faceH, radius).fill({ color: 0x000000, alpha: 0.45 });
    const top = this.pressed ? shade(base, -0.1) : base;
    const g = this.face;
    g.removeChildren();
    const face = new Graphics();
    face.roundRect(0, 0, width, faceH, radius).fill({ color: top });
    // Волосяная кромка: светлая у светлых кнопок, латунная у тёмных.
    face
      .roundRect(0.5, 0.5, width - 1, faceH - 1, radius)
      .stroke({ width: 1, color: bright ? shade(base, 0.3) : palette().frameEdge, alpha: bright ? 0.9 : 0.55 });
    this.caption.style.fill = this.enabled ? (this.options.textColor ?? Button.textOn(base)) : palette().textDim;
    g.addChild(face, this.caption);
  }

  /** Сменить цвет фона (для выделения выбранной опции). */
  setColor(color: number): void {
    this.options.color = color;
    this.draw();
  }

  setCaption(text: string): void {
    this.caption.text = text;
  }

  /** Сменить ширину — адаптация к размеру экрана без пересоздания. */
  setWidth(width: number): void {
    this.options.width = width;
    this.layoutCaption();
    this.draw();
  }

  /** Сменить высоту — компактные экраны. */
  setHeight(height: number): void {
    this.options.height = height;
    this.layoutCaption();
    this.draw();
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    this.alpha = value ? 1 : 0.7;
    this.eventMode = value ? 'static' : 'none';
    this.draw();
  }
}
