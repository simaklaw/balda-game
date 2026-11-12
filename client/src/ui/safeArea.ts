/** Безопасные зоны (вырез, «челка», жест-бар): читаются из CSS-переменных. */

export interface SafeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const NO_INSETS: SafeInsets = { top: 0, bottom: 0, left: 0, right: 0 };

/** «12px» → 12; пусто, calc() и прочее без env-поддержки → 0. */
export function parseInset(raw: string): number {
  const value = raw.trim();
  if (value === '') return 0;
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  return match !== null ? Math.max(0, parseFloat(match[1]!)) : 0;
}

function readInset(style: CSSStyleDeclaration, name: string): number {
  return parseInset(style.getPropertyValue(name));
}

/** Текущие insets в CSS-пикселях (0 на десктопе и без DOM). */
export function safeInsets(): SafeInsets {
  try {
    const style = getComputedStyle(document.documentElement);
    return {
      top: readInset(style, '--safe-top'),
      bottom: readInset(style, '--safe-bottom'),
      left: readInset(style, '--safe-left'),
      right: readInset(style, '--safe-right'),
    };
  } catch {
    return NO_INSETS;
  }
}
