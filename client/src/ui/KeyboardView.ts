import { Container } from 'pixi.js';
import { Button } from './Button';
import { keyboardMetricsFor, PORTRAIT_ROWS } from './layout';
import { palette } from '../theme';

const DEFAULT_ROWS: readonly string[] = PORTRAIT_ROWS;

/**
 * Кастомная экранная клавиатура: 32 буквы (без «ё»), раскладка ЙЦУКЕН.
 * Решает ключевую проблему мобильных версий — системная клавиатура
 * никогда не появляется и не перекрывает игровое поле.
 * Перестраивается под новую ширину экрана (поворот) через setWidth.
 */
export class KeyboardView extends Container {
  private keys: Button[] = [];
  private keyboardHeightValue = 0;
  private readonly onLetter: (letter: string) => void;

  constructor(width: number, onLetter: (letter: string) => void) {
    super();
    this.onLetter = onLetter;
    this.build(width);
  }

  get keyboardHeight(): number {
    return this.keyboardHeightValue;
  }

  /** Перестроить клавиши под новую ширину и набор рядов. */
  setWidth(width: number, rows: readonly string[] = DEFAULT_ROWS): void {
    if (
      this.keys.length > 0 &&
      Math.abs(width - this.builtWidth) < 0.5 &&
      rows.join('') === this.builtRows
    ) {
      return;
    }
    this.build(width, rows);
  }

  private builtWidth = 0;
  private builtRows = '';

  private build(width: number, rows: readonly string[] = DEFAULT_ROWS): void {
    for (const key of this.keys) key.destroy({ children: true });
    this.removeChildren();
    this.keys = [];
    const { keyWidth, keyHeight, gap } = keyboardMetricsFor(width, rows);
    this.builtWidth = width;
    this.builtRows = rows.join('');
    let y = 0;
    for (const row of rows) {
      const letters = row.split('');
      const rowWidth = letters.length * keyWidth + (letters.length - 1) * gap;
      let x = Math.floor((width - rowWidth) / 2);
      for (const letter of letters) {
        const key = new Button({
          caption: letter.toUpperCase(),
          width: keyWidth,
          height: keyHeight,
          color: palette().panel,
          fontSize: Math.max(15, Math.floor(keyHeight * 0.42)),
          sfx: 'key',
          onTap: () => this.onLetter(letter),
        });
        key.position.set(x, y);
        this.addChild(key);
        this.keys.push(key);
        x += keyWidth + gap;
      }
      y += keyHeight + gap;
    }
    this.keyboardHeightValue = Math.max(0, y - gap);
  }
}
