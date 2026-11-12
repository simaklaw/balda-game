import { describe, expect, it } from 'vitest';
import { Dawg } from '../src/dawg';
import { Game } from '../src/game';
import type { CellPos, GameConfig } from '../src/types';

const p = (row: number, col: number): CellPos => ({ row, col });

const cfg5: GameConfig = { boardSize: 5, allowDiagonal: false, minWordLength: 4, maxSkipsInRow: 3 };
const cfg3: GameConfig = { boardSize: 3, allowDiagonal: false, minWordLength: 3, maxSkipsInRow: 3 };

describe('Game', () => {
  it('принимает ход, обновляет счёт и передаёт очередь', () => {
    const game = new Game(Dawg.fromWords(['балда', 'садл']), cfg5, 'балда');
    const r = game.submitMove({
      player: 0,
      letter: 'с',
      cell: p(1, 4),
      path: [p(1, 4), p(2, 4), p(2, 3), p(2, 2)],
    });
    expect(r.ok).toBe(true);
    expect(game.players[0]!.score).toBe(4);
    expect(game.board.get(1, 4)).toBe('с');
    expect(game.currentPlayer).toBe(1);
    expect(game.history).toHaveLength(1);
    expect(game.history[0]!.word).toBe('садл');
  });

  it('после хода слово считается использованным', () => {
    const game = new Game(Dawg.fromWords(['балда', 'садл']), cfg5, 'балда');
    game.submitMove({ player: 0, letter: 'с', cell: p(1, 4), path: [p(1, 4), p(2, 4), p(2, 3), p(2, 2)] });
    const r2 = game.submitMove({ player: 1, letter: 'с', cell: p(3, 4), path: [p(3, 4), p(2, 4), p(2, 3), p(2, 2)] });
    expect(r2.error).toBe('WORD_ALREADY_USED');
  });

  it('отклоняет ход не того игрока', () => {
    const game = new Game(Dawg.fromWords(['балда', 'садл']), cfg5, 'балда');
    const r = game.submitMove({ player: 1, letter: 'с', cell: p(1, 4), path: [p(1, 4), p(2, 4), p(2, 3), p(2, 2)] });
    expect(r.error).toBe('NOT_PLAYERS_TURN');
  });

  it('лимит пропусков — техническое поражение', () => {
    const game = new Game(Dawg.fromWords(['кот']), cfg3, 'кот');
    expect(game.pass(0).ok).toBe(true);
    expect(game.pass(1).ok).toBe(true);
    expect(game.pass(0).ok).toBe(true);
    expect(game.pass(1).ok).toBe(true);
    expect(game.status).toBe('playing');
    expect(game.players[0]!.skipsInRow).toBe(2);
    game.pass(0);
    expect(game.status).toBe('finished');
    expect(game.winner).toBe(1);
    expect(game.endReason).toBe('skip_limit');
    expect(game.pass(1).error).toBe('GAME_FINISHED');
  });

  it('заполнение поля завершает партию победой по счёту', () => {
    const cfg: GameConfig = { ...cfg3, minWordLength: 1 };
    const game = new Game(Dawg.fromWords(['кот', 'хт']), cfg, 'кот');
    for (const [r, c] of [[0, 0], [0, 1], [2, 0], [2, 1], [2, 2]] as const) {
      game.board.set(r, c, 'м');
    }
    const res = game.submitMove({ player: 0, letter: 'х', cell: p(0, 2), path: [p(0, 2), p(1, 2)] });
    expect(res.ok).toBe(true);
    expect(game.status).toBe('finished');
    expect(game.endReason).toBe('board_full');
    expect(game.winner).toBe(0);
  });

  it('поражение по времени завершает партию', () => {
    const game = new Game(Dawg.fromWords(['кот']), cfg3, 'кот');
    game.declareTimeout(1);
    expect(game.status).toBe('finished');
    expect(game.winner).toBe(0);
    expect(game.endReason).toBe('timeout');
    game.declareTimeout(0);
    expect(game.winner).toBe(0);
  });
});
