import { describe, expect, it } from 'vitest';
import { parseInset } from '../src/ui/safeArea';

describe('parseInset', () => {
  it('парсит пиксели', () => {
    expect(parseInset('0px')).toBe(0);
    expect(parseInset('44px')).toBe(44);
    expect(parseInset('59.5px')).toBe(59.5);
    expect(parseInset('  12px  ')).toBe(12);
  });

  it('отрицательные и неподдерживаемые значения → 0', () => {
    expect(parseInset('-10px')).toBe(0);
    expect(parseInset('')).toBe(0);
    expect(parseInset('12')).toBe(0);
    expect(parseInset('12em')).toBe(0);
    expect(parseInset('env(safe-area-inset-top)')).toBe(0);
    expect(parseInset('calc(1px + 2px)')).toBe(0);
  });
});
