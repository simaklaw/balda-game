import { describe, expect, it } from 'vitest';
import { sound } from '../src/audio/Sound';
import type { SoundName } from '../src/audio/Sound';
import { DARK, LIGHT, luminance, mix } from '../src/theme';

describe('звук', () => {
  it('все сигналы безопасны без аудиоконтекста', () => {
    const names: SoundName[] = [
      'tap', 'key', 'select', 'place', 'word', 'error', 'opponent', 'win', 'lose', 'draw',
      'play', 'confirm', 'back', 'cancel', 'skip', 'open', 'choose', 'toggle',
    ];
    for (const n of names) expect(() => sound.play(n, 2)).not.toThrow();
  });
});

describe('тема', () => {
  it('mix смешивает цвета и ограничивает t', () => {
    expect(mix(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mix(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mix(0x000000, 0xff0000, 0.5)).toBe(0x800000);
    expect(mix(0x102030, 0x102030, 3)).toBe(0x102030);
  });
  it('текст читается на фоне в обеих темах', () => {
    for (const p of [DARK, LIGHT]) {
      const a = luminance(p.text);
      const b = luminance(p.bg);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      expect(ratio).toBeGreaterThan(7);
      const d = luminance(p.textDim);
      const rd = (Math.max(d, b) + 0.05) / (Math.min(d, b) + 0.05);
      expect(rd).toBeGreaterThan(3.5);
    }
  });
  it('у палитры есть перламутровый градиент из трёх тонов', () => {
    expect(DARK.sheen).toHaveLength(3);
    expect(LIGHT.sheen).toHaveLength(3);
  });
});
