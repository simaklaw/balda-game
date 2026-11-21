/** Крошечная пружина (жёсткость k, затухание c) для «живых» интерфейсных движений. */
export interface Spring {
  x: number;
  v: number;
  t: number;
  k: number;
  c: number;
}

export const spring = (x: number, k = 400, c = 30): Spring => ({ x, v: 0, t: x, k, c });

export function stepSpring(s: Spring, dt: number): void {
  const a = -s.k * (s.x - s.t) - s.c * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}

/** Предпочтение «уменьшить анимации» — тогда движение мгновенное. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
