import { Container } from 'pixi.js';
import { Button } from './Button';
import { palette } from '../theme';

const ROWS: readonly string[] = ['йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю'];

/**
 * Кастомная экранная клавиатура: 32 буквы (без «ё»), раскладка ЙЦУКЕН.
 * Решает ключевую проблему мобильных версий — системная клавиатура
 * никогда не появляется и не перекрывает игровое поле.
 */
export class KeyboardView extends Container {
  readonly keyboardHeight: number;

  constructor(width: number, onLetter: (letter: string) => void) {
    super();
    const gap = 5;
    const keyCount = Math.max(...ROWS.map((r) => r.length));
    const keyWidth = Math.max(18, Math.floor((width - gap * (keyCount - 1)) / keyCount));
    // Высота не масштабируется по ширине на широких экранах, иначе клавиши
    // перекрывают поле; минимальная высота — крупный тап-таргет.
    const keyHeight = Math.min(64, Math.max(42, Math.floor(keyWidth * 1.15)));
    let y = 0;
    for (const row of ROWS) {
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
          onTap: () => onLetter(letter),
        });
        key.position.set(x, y);
        this.addChild(key);
        x += keyWidth + gap;
      }
      y += keyHeight + gap;
    }
    this.keyboardHeight = y - gap;
  }
}
