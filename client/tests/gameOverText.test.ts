import { describe, expect, it } from 'vitest';
import { gameOverText } from '../src/ui/gameOverText';

describe('gameOverText', () => {
  it('равный счёт (winner null) — «Ничья», нейтральный тон (регрессия на баг ничьей)', () => {
    const t = gameOverText(null, 'board_full');
    expect(t.title).toBe('Ничья');
    expect(t.tone).toBe('neutral');
    expect(t.reason).toBe('');
  });

  it('победа игрока', () => {
    const t = gameOverText(0, 'board_full');
    expect(t.title).toBe('Вы одержали победу');
    expect(t.tone).toBe('success');
  });

  it('поражение с причиной', () => {
    const t = gameOverText(1, 'skip_limit');
    expect(t.title).toBe('Вы потерпели поражение');
    expect(t.tone).toBe('danger');
    expect(t.reason).toBe('три пропуска подряд');
  });

  it('тексты причин', () => {
    expect(gameOverText(null, 'timeout').reason).toBe('время вышло');
    expect(gameOverText(null, 'resign').reason).toBe('сдача');
    expect(gameOverText(null, 'no_moves').reason).toBe('ходов больше нет');
    expect(gameOverText(null, 'skip_limit').reason).toBe('три пропуска подряд');
    expect(gameOverText(null, 'board_full').reason).toBe('');
  });
});
