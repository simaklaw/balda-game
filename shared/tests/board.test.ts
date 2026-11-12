import { describe, expect, it } from 'vitest';
import { Board } from '../src/board';

describe('Board', () => {
  it('раскладывает начальное слово по средней строке', () => {
    const b = new Board(5, 'балда');
    expect(b.get(2, 0)).toBe('б');
    expect(b.get(2, 1)).toBe('а');
    expect(b.get(2, 2)).toBe('л');
    expect(b.get(2, 3)).toBe('д');
    expect(b.get(2, 4)).toBe('а');
    expect(b.size).toBe(5);
  });

  it('требует длину начального слова равной размеру поля', () => {
    expect(() => new Board(3, 'балда')).toThrow();
  });

  it('соседство: центр, угол, диагональный режим', () => {
    const b = new Board(5, 'балда');
    expect(b.neighbors(2, 2, false)).toHaveLength(4);
    expect(b.neighbors(0, 0, false)).toHaveLength(2);
    expect(b.neighbors(0, 0, true)).toHaveLength(3);
  });

  it('клон независим от оригинала', () => {
    const b = new Board(3, 'кот');
    const c = b.clone();
    c.set(0, 0, 'с');
    expect(b.isEmpty(0, 0)).toBe(true);
    expect(c.get(0, 0)).toBe('с');
  });

  it('сериализация восстанавливает поле', () => {
    const b = new Board(3, 'кот');
    b.set(0, 0, 'с');
    const rt = Board.deserialize(b.serialize());
    expect(rt.get(1, 1)).toBe('о');
    expect(rt.get(0, 0)).toBe('с');
    expect(rt.isEmpty(2, 2)).toBe(true);
    expect(() => Board.deserialize(JSON.stringify({ size: 3, cells: ['а'] }))).toThrow();
  });

  it('нормализует буквы при установке', () => {
    const b = new Board(3, 'кот');
    b.set(0, 0, 'Ё');
    expect(b.get(0, 0)).toBe('е');
  });

  it('isFull', () => {
    const b = new Board(3, 'кот');
    expect(b.isFull()).toBe(false);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (b.isEmpty(r, c)) b.set(r, c, 'м');
    expect(b.isFull()).toBe(true);
  });
});
