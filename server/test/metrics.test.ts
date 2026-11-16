import { describe, expect, it } from 'vitest';
import { Metrics } from '../src/metrics';

describe('Metrics', () => {
  it('счётчики копятся и читаются', () => {
    const m = new Metrics();
    expect(m.get('balda_moves_total')).toBe(0);
    m.inc('balda_moves_total');
    m.inc('balda_moves_total', 4);
    expect(m.get('balda_moves_total')).toBe(5);
  });

  it('нечисловая дельта игнорируется', () => {
    const m = new Metrics();
    m.inc('x', Number.NaN);
    expect(m.get('x')).toBe(0);
  });

  it('render выдаёт формат Prometheus', () => {
    const m = new Metrics();
    m.inc('balda_moves_total', 3);
    m.gauge('balda_rooms_current', () => 2);
    const text = m.render();
    expect(text).toContain('# TYPE balda_moves_total counter');
    expect(text).toContain('balda_moves_total 3');
    expect(text).toContain('# TYPE balda_rooms_current gauge');
    expect(text).toContain('balda_rooms_current 2');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('сломанный датчик даёт 0, не ломая выгрузку', () => {
    const m = new Metrics();
    m.gauge('bad', () => {
      throw new Error('упс');
    });
    m.inc('good', 1);
    const text = m.render();
    expect(text).toContain('bad 0');
    expect(text).toContain('good 1');
  });

  it('пустые метрики — пустая строка', () => {
    expect(new Metrics().render()).toBe('');
  });
});
