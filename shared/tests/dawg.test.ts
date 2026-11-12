import { describe, expect, it } from 'vitest';
import { CYRILLIC_LETTERS } from '../src/letters';
import { Dawg, DawgBuilder } from '../src/dawg';

describe('Dawg', () => {
  const dawg = Dawg.fromWords(['бал', 'кот', 'ток', 'око', 'окно']);

  it('находит слова', () => {
    expect(dawg.has('бал')).toBe(true);
    expect(dawg.has('окно')).toBe(true);
    expect(dawg.has('око')).toBe(true);
  });

  it('нормализует регистр и «ё»', () => {
    expect(dawg.has('КОТ')).toBe(true);
    expect(Dawg.fromWords(['ёлка']).has('елка')).toBe(true);
  });

  it('отличает слово от префикса', () => {
    expect(dawg.has('окн')).toBe(false);
    expect(dawg.has('кон')).toBe(false);
    expect(dawg.isPrefix('ок')).toBe(true);
    expect(dawg.isPrefix('я')).toBe(false);
  });

  it('цепочки префиксов', () => {
    const d = Dawg.fromWords(['а', 'аб', 'абв', 'б']);
    expect(d.has('а')).toBe(true);
    expect(d.has('аб')).toBe(true);
    expect(d.has('абв')).toBe(true);
    expect(d.has('б')).toBe(true);
    expect(d.has('абвг')).toBe(false);
  });

  it('сортировка и уникальность входа', () => {
    const d = Dawg.fromWords(['кот', 'кот', 'а']);
    expect(d.has('а')).toBe(true);
    expect(d.has('кот')).toBe(true);
  });

  it('билдер требует возрастающий порядок', () => {
    const b = new DawgBuilder();
    b.insert('я');
    expect(() => b.insert('а')).toThrow();
  });

  it('сериализация проходит полный цикл', () => {
    const rt = Dawg.deserialize(dawg.serialize());
    expect(rt.has('окно')).toBe(true);
    expect(rt.has('бал')).toBe(true);
    expect(rt.has('окн')).toBe(false);
  });

  it('дырявых слов не находит (smoke 10k слов)', () => {
    const map = '0123456789abcdefghijklmnopqrstuv';
    const synthetic = Array.from({ length: 10000 }, (_, i) =>
      i
        .toString(32)
        .split('')
        .map((d) => CYRILLIC_LETTERS[map.indexOf(d)]!)
        .join(''),
    );
    const d = Dawg.fromWords(synthetic);
    expect(stheticCheck(d, synthetic)).toBe(true);
    expect(d.has('яяя')).toBe(false);
  });
});

function stheticCheck(d: Dawg, words: string[]): boolean {
  return words.every((w) => d.has(w));
}
