import { Container, FillGradient, Graphics, Text, Ticker } from 'pixi.js';
import { FONT_FAMILY, luminance, mix, palette, shade } from '../theme';
import { sound } from '../audio/Sound';
import type { SoundName } from '../audio/Sound';
import { prefersReducedMotion } from './spring';
import { iconSvg } from './icons';
import type { IconName } from './icons';

export interface ButtonOptions {
  caption: string;
  width: number;
  height: number;
  color?: number;
  textColor?: number;
  fontSize?: number;
  /** Иконка Lucide слева от подписи (скрывается, если не помещается). */
  icon?: IconName;
  /** Звук нажатия: у каждой роли кнопки свой (по умолчанию 'tap'); 'none' — без звука. */
  sfx?: SoundName | 'none';
  /** Параметр звука (например, высота ноты у выбора варианта). */
  sfxArg?: number;
  /** Перламутровый блик, периодически пробегающий по главной кнопке. */
  shimmer?: boolean;
  onTap: () => void;
}

/** Толщина «нижней грани» кнопки (объём). */
const LIP = 3;
const RADIUS = 7;

const gradients = new Map<string, FillGradient>();

/** Линейный градиент в локальных координатах фигуры (кэшируется по ключу). */
function gradient(key: string, vertical: boolean, stops: Array<[number, number]>): FillGradient {
  let g = gradients.get(key);
  if (g === undefined) {
    g = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: vertical ? { x: 0, y: 1 } : { x: 1, y: 1 },
      colorStops: stops.map(([offset, color]) => ({ offset, color })),
      textureSpace: 'local',
    });
    gradients.set(key, g);
  }
  return g;
}

/**
 * Кнопка с объёмом: верхняя грань + тёмная нижняя кромка + блик.
 * При нажатии грань «утапливается», при отпускании возвращается; тап озвучен.
 */
export class Button extends Container {
  private readonly bg: Graphics;
  private readonly face: Container;
  private readonly caption: Text;
  private iconGfx: Graphics | null = null;
  private readonly options: ButtonOptions;
  private enabled = true;
  private pressed = false;
  private magX = 0;
  private magY = 0;
  private magS = 1;
  private sheenGfx: Graphics | null = null;
  private sheenClock = Math.random() * 3;
  private readonly onSheenTick = (ticker: Ticker): void => {
    const g = this.sheenGfx;
    if (g === null || !this.enabled) return;
    this.sheenClock += ticker.deltaMS / 1000;
    const cycle = 4.6;
    const t = (this.sheenClock % cycle) / 1.0;
    const { width } = this.options;
    if (t > 1) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const e = t * t * (3 - 2 * t);
    g.x = -width * 0.35 + e * width * 1.7;
  };

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
    if (options.shimmer === true && !prefersReducedMotion()) Ticker.shared.add(this.onSheenTick);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', () => this.setPressed(true));
    this.on('pointerup', () => this.setPressed(false));
    this.on('pointerupoutside', () => this.setPressed(false));
    this.on('pointerout', () => this.setPressed(false));
    this.on('pointertap', () => {
      if (!this.enabled) return;
      const sfx = options.sfx ?? 'tap';
      if (sfx !== 'none') sound.play(sfx, options.sfxArg ?? 0);
      options.onTap();
    });
  }

  /** Цвет подписи: тёмные чернила на светлой (латунной) заливке, слоновая кость на тёмной. */
  private static textOn(fill: number): number {
    return luminance(fill) > 0.28 ? 0x1a1509 : 0xf6efdc;
  }

  private layoutCaption(): void {
    const { width, height, icon } = this.options;
    const cy = (height - LIP) / 2;
    this.iconGfx?.destroy();
    this.iconGfx = null;
    const baseFont = this.options.fontSize ?? Math.max(14, Math.floor(height * 0.42));
    this.caption.style.fontSize = baseFont;
    const size = Math.round(Math.min(22, Math.max(14, height * 0.4)));
    const gap = 7;
    this.caption.anchor.set(0.5);
    if (icon === undefined) {
      this.caption.position.set(width / 2, cy);
      return;
    }
    const g = new Graphics().svg(iconSvg(icon));
    this.iconGfx = g;
    if (this.caption.width + size + gap + 16 <= width) {
      // Иконка слева от подписи.
      g.scale.set(size / 24);
      const total = size + gap + this.caption.width;
      const left = (width - total) / 2;
      g.position.set(left, cy - size / 2);
      this.caption.anchor.set(0, 0.5);
      this.caption.position.set(left + size + gap, cy);
    } else {
      // Узкая кнопка: иконка над мелкой подписью.
      const small = Math.max(11, Math.round(baseFont * 0.72));
      this.caption.style.fontSize = small;
      const iconSize = 17;
      g.scale.set(iconSize / 24);
      g.position.set((width - iconSize) / 2, cy - iconSize / 2 - 7);
      this.caption.position.set(width / 2, cy + 12);
    }
  }

  private setPressed(value: boolean): void {
    if (this.pressed === value || !this.enabled) return;
    this.pressed = value;
    this.applyFace();
    this.draw();
  }

  private applyFace(): void {
    const { width, height } = this.options;
    const faceH = height - LIP;
    this.face.pivot.set(width / 2, faceH / 2);
    this.face.position.set(width / 2 + this.magX, faceH / 2 + this.magY + (this.pressed ? LIP - 1 : 0));
    this.face.scale.set(this.magS);
  }

  /** «Магнитное» смещение грани к курсору: dx/dy в пикселях, подпись смещается чуть дальше. */
  setMagnet(dx: number, dy: number, scale: number, labelDx: number, labelDy: number): void {
    this.magX = dx;
    this.magY = dy;
    this.magS = scale;
    this.caption.pivot.set(-labelDx / scale, -labelDy / scale);
    this.applyFace();
  }

  get buttonSize(): { width: number; height: number } {
    return { width: this.options.width, height: this.options.height };
  }

  private draw(): void {
    const { width, height } = this.options;
    const p = palette();
    const base = this.enabled ? (this.options.color ?? p.accent) : p.panel;
    const bright = luminance(base) > 0.28;
    const accentLike = this.enabled && luminance(base) < 0.2 && (base === p.accent || base === p.accentDark || this.options.color === p.accent);
    const faceH = height - LIP;
    this.bg.clear();
    // Нижняя грань: тёмная кромка цвета кнопки + мягкая тень под ней.
    this.bg.roundRect(-1, LIP + 2, width + 2, faceH, RADIUS + 1).fill({ color: 0x000000, alpha: 0.28 });
    this.bg.roundRect(0, LIP, width, faceH, RADIUS).fill({ color: shade(base, -0.62), alpha: 1 });
    const g = this.face;
    g.removeChildren();
    this.sheenGfx = null;
    // Светлые кнопки (дневная тема) — мягкий перепад, чтобы низ не серел.
    const top = shade(base, this.pressed ? -0.03 : bright ? 0.12 : 0.17);
    const bottom = shade(base, this.pressed ? (bright ? -0.2 : -0.34) : bright ? -0.09 : -0.24);
    const face = new Graphics();
    face
      .roundRect(0, 0, width, faceH, RADIUS)
      .fill(gradient('v' + top + '-' + bottom, true, [[0, top], [1, bottom]]));
    // Верхний блик: тонкая светлая линия по верхней кромке.
    face
      .moveTo(RADIUS, 1.5)
      .lineTo(width - RADIUS, 1.5)
      .stroke({ width: 1, color: 0xffffff, alpha: bright ? 0.45 : 0.2 });
    // Наружная кромка: перламутровый (шампань → розовое золото → лаванда) волосок.
    const rim = accentLike || bright
      ? gradient('rimA' + p.sheen.join('-'), false, [[0, p.sheen[0]], [0.5, p.sheen[1]], [1, p.sheen[2]]])
      : gradient('rimP' + p.frameEdge + p.panelBorder, false, [[0, p.frameEdge], [0.55, p.panelBorder], [1, mix(p.frameEdge, p.sheen[2], 0.5)]]);
    face
      .roundRect(0.5, 0.5, width - 1, faceH - 1, RADIUS)
      .stroke({ width: 1, fill: rim, alpha: this.enabled ? (accentLike ? 0.95 : 0.7) : 0.25 });
    // Внутренняя линия: «гравировка» как на фирменной бумаге.
    if (this.enabled && width >= 96 && faceH >= 38) {
      face
        .roundRect(3.5, 3.5, width - 7, faceH - 7, Math.max(2, RADIUS - 3))
        .stroke({ width: 1, color: p.sheen[0], alpha: accentLike ? 0.3 : 0.14 });
    }
    // Ромбы-«типографские вставки» по краям главных кнопок.
    if (accentLike && width >= 180 && faceH >= 46) {
      for (const x of [15, width - 15]) {
        face
          .poly([x, faceH / 2 - 3.5, x + 3.5, faceH / 2, x, faceH / 2 + 3.5, x - 3.5, faceH / 2])
          .fill({ color: p.sheen[0], alpha: 0.85 });
      }
    }
    this.caption.style.fill = this.enabled ? (this.options.textColor ?? Button.textOn(base)) : p.textDim;
    const ink = this.enabled ? (this.options.textColor ?? Button.textOn(base)) : p.textDim;
    if (this.iconGfx !== null) this.iconGfx.tint = ink;
    g.addChild(face);
    if (this.options.shimmer === true && this.enabled) {
      const mask = new Graphics().roundRect(0, 0, width, faceH, RADIUS).fill({ color: 0xffffff });
      const band = new Graphics();
      const bw = Math.max(26, width * 0.16);
      const skew = faceH * 0.5;
      band.poly([0, 0, bw, 0, bw - skew, faceH, -skew, faceH]).fill({ color: 0xffffff, alpha: 0.13 });
      band
        .poly([bw * 0.3, 0, bw * 0.7, 0, bw * 0.7 - skew, faceH, bw * 0.3 - skew, faceH])
        .fill({ color: p.sheen[1], alpha: 0.16 });
      band.x = -width;
      band.mask = mask;
      g.addChild(mask, band);
      this.sheenGfx = band;
    }
    if (this.iconGfx !== null) g.addChild(this.iconGfx);
    g.addChild(this.caption);
    this.applyFace();
  }

  /** Сменить цвет фона (для выделения выбранной опции). */
  setColor(color: number): void {
    this.options.color = color;
    this.draw();
  }

  setCaption(text: string): void {
    this.caption.text = text;
    this.layoutCaption();
    this.draw();
  }

  /** Сменить иконку (например, звук вкл/выкл). */
  setIcon(icon: IconName | undefined): void {
    this.options.icon = icon;
    this.layoutCaption();
    this.draw();
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

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    Ticker.shared.remove(this.onSheenTick);
    super.destroy(options);
  }
}
