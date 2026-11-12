import { describe, expect, it } from 'vitest';
import { TIME_PRESETS, TimerModel } from '../src/game/TimerModel';

describe('TimerModel', () => {
  it('режим «без таймера» ничего не списывает', () => {
    const timer = new TimerModel(TIME_PRESETS.none);
    timer.startTurn(0, 1000);
    expect(timer.enabled).toBe(false);
    expect(timer.tick(61000)).toBeNull();
    expect(timer.getRemaining(0)).toBe(0);
  });

  it('классика: 2 минуты на ход, просрочка возвращает игрока', () => {
    const timer = new TimerModel(TIME_PRESETS.classic);
    timer.startTurn(0, 0);
    expect(timer.getRemaining(0)).toBe(120000);
    expect(timer.tick(60000)).toBeNull();
    expect(timer.getRemaining(0)).toBe(60000);
    timer.onMoveDone();
    expect(timer.getRemaining(0)).toBe(120000);
    timer.startTurn(1, 60000);
    expect(timer.tick(180001)).toBe(1);
    expect(timer.getActive()).toBe(-1);
    expect(timer.getRemaining(1)).toBe(0);
  });

  it('классика: refill восстанавливает запас после авто-пропуска', () => {
    const timer = new TimerModel(TIME_PRESETS.classic);
    timer.startTurn(0, 0);
    timer.tick(120001);
    expect(timer.getRemaining(0)).toBe(0);
    timer.refill(0);
    expect(timer.getRemaining(0)).toBe(120000);
  });

  it('блиц: общий пул списывается сквозь ходы и не восстанавливается', () => {
    const timer = new TimerModel(TIME_PRESETS.blitz);
    timer.startTurn(0, 0);
    timer.tick(70000);
    timer.onMoveDone();
    expect(timer.getRemaining(0)).toBe(50000);
    timer.startTurn(1, 70000);
    expect(timer.getRemaining(1)).toBe(120000);
    timer.tick(100000);
    expect(timer.getRemaining(1)).toBe(90000);
    timer.startTurn(0, 100000);
    expect(timer.tick(160000)).toBe(0);
    expect(timer.getRemaining(0)).toBe(0);
    timer.onMoveDone();
    expect(timer.getRemaining(0)).toBe(0);
  });

  it('Фишер: 1 минута + 10 секунд за ход, потолок 4 базовых запаса', () => {
    const timer = new TimerModel(TIME_PRESETS.fisher);
    timer.startTurn(0, 0);
    timer.tick(20000);
    timer.onMoveDone();
    expect(timer.getRemaining(0)).toBe(50000);
    timer.startTurn(0, 20000);
    timer.tick(25000);
    timer.onMoveDone();
    expect(timer.getRemaining(0)).toBe(55000);
    let now = 25000;
    for (let i = 0; i < 30; i++) {
      timer.startTurn(0, now);
      timer.tick(now + 1000);
      timer.onMoveDone();
      now += 1000;
    }
    expect(timer.getRemaining(0)).toBe(240000);
  });

  it('тик «назад во времени» не списывает ничего', () => {
    const timer = new TimerModel(TIME_PRESETS.blitz);
    timer.startTurn(0, 5000);
    timer.tick(3000);
    expect(timer.getRemaining(0)).toBe(120000);
  });

  it('skipTo сдвигает точку отсчёта без списания (пауза)', () => {
    const timer = new TimerModel(TIME_PRESETS.blitz);
    timer.startTurn(0, 0);
    timer.tick(10000);
    timer.skipTo(70000);
    expect(timer.tick(70000)).toBeNull();
    expect(timer.getRemaining(0)).toBe(110000);
  });

  it('stop останавливает часы', () => {
    const timer = new TimerModel(TIME_PRESETS.classic);
    timer.startTurn(0, 0);
    timer.stop();
    expect(timer.tick(120000)).toBeNull();
    expect(timer.getRemaining(0)).toBe(120000);
  });
});
