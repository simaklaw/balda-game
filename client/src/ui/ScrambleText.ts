import { Container, Graphics, Text, Ticker } from 'pixi.js';
import { prefersReducedMotion } from './spring';

export interface ScrambleOptions {
  text: string;
  fontFamily: string;
  fontSize: number;
  /** Макс. ширина строки: шрифт уменьшается, если надпись не помещается. */
  maxWidth: number;
  /** Цвет «расшифрованных» букв и ещё не установившихся. */
  color: number;
  dimColor: number;
  /** Цвет каретки в конце строки. */
  caretColor: number;
  italic?: boolean;
}

const GLYPHS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯабвгдежзиклмнопрстуфхцчэюя0123456789#%&*+=/<>';
const FLICKER = 0.055;

interface Cell {
  glyph: Text;
  to: string;
  at: number;
  tick: number;
  done: boolean;
  cx: number;
}

/**
 * Надпись, которая «расшифровывается»: каждая буква мерцает случайными знаками
 * и по очереди встаёт на место слева направо. Раскладка считается по итоговой
 * строке, поэтому строка не «дрожит» по ширине. Идея — Scramble Text (DesignBookmark).
 */
export class ScrambleText extends Container {
  private readonly cells: Cell[] = [];
  private readonly caret = new Graphics();
  private clock = 0;
  private finishedAt = -1;
  private readonly ticker: Ticker;
  private readonly onTick = (): void => this.tick(this.ticker.deltaMS / 1000);
  private readonly lineHeight: number;
  private readonly caretW: number;

  constructor(private readonly options: ScrambleOptions, ticker: Ticker) {
    super();
    this.ticker = ticker;
    const make = (size: number, text: string, fill: number): Text =>
      new Text({
        text,
        style: {
          fontFamily: options.fontFamily,
          fontSize: size,
          fontWeight: '700',
          fontStyle: options.italic === true ? 'italic' : 'normal',
          fill,
        },
      });
    const chars = [...options.text];
    // Подбираем размер шрифта под максимальную ширину.
    let size = options.fontSize;
    let widths: number[] = [];
    for (let i = 0; i < 12; i++) {
      widths = chars.map((ch) => {
        const probe = make(size, ch === ' ' ? 'н' : ch, 0);
        const w = ch === ' ' ? probe.width * 0.7 : probe.width;
        probe.destroy();
        return w;
      });
      const total = widths.reduce((a, b) => a + b, 0) + size * 0.5;
      if (total <= options.maxWidth || size <= 12) break;
      size = Math.max(12, Math.floor(size * (options.maxWidth / total)) - 1);
    }
    this.lineHeight = size * 1.25;
    this.caretW = size * 0.42;
    const total = widths.reduce((a, b) => a + b, 0);
    let x = -(total + this.caretW * 1.4) / 2;
    const reduce = prefersReducedMotion();
    chars.forEach((ch, i) => {
      const w = widths[i] ?? 0;
      const glyph = make(size, reduce ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0] ?? ch, options.dimColor);
      glyph.anchor.set(0.5, 0.5);
      glyph.position.set(x + w / 2, 0);
      if (ch === ' ') glyph.text = ' ';
      if (reduce) glyph.style.fill = options.color;
      this.addChild(glyph);
      this.cells.push({
        glyph,
        to: ch,
        at: reduce ? 0 : 0.18 + i * 0.035 + Math.random() * 0.28,
        tick: 0,
        done: reduce,
        cx: x + w / 2,
      });
      x += w;
    });
    this.caret.position.set(x + this.caretW * 0.5, 0);
    this.addChild(this.caret);
    this.drawCaret(reduce ? 0 : 1);
    if (reduce) {
      this.finishedAt = 0;
    } else {
      this.ticker.add(this.onTick);
    }
  }

  private drawCaret(alpha: number): void {
    this.caret.clear();
    if (alpha <= 0) return;
    this.caret
      .roundRect(0, -this.lineHeight * 0.4, this.caretW, this.lineHeight * 0.8, 2)
      .fill({ color: this.options.caretColor, alpha });
  }

  private tick(dt: number): void {
    this.clock += Math.min(dt, 1 / 20);
    let left = 0;
    for (const cell of this.cells) {
      if (cell.done) continue;
      if (this.clock >= cell.at) {
        cell.done = true;
        cell.glyph.text = cell.to;
        cell.glyph.style.fill = this.options.color;
      } else {
        left++;
        if (cell.to === ' ') {
          cell.glyph.text = ' ';
        } else if (this.clock >= cell.tick) {
          cell.glyph.text = GLYPHS[(Math.random() * GLYPHS.length) | 0] ?? cell.to;
          cell.tick = this.clock + FLICKER;
        }
      }
    }
    if (left === 0 && this.finishedAt < 0) this.finishedAt = this.clock;
    if (this.finishedAt >= 0) {
      // Каретка мигает ещё пару раз и гаснет.
      const since = this.clock - this.finishedAt;
      if (since > 1.6) {
        this.drawCaret(0);
        this.ticker.remove(this.onTick);
      } else {
        this.drawCaret((since * 2.6) % 2 < 1 ? 1 : 0);
      }
    }
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.ticker.remove(this.onTick);
    super.destroy(options);
  }
}
