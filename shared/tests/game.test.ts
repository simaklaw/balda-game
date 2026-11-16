import { describe, expect, it } from 'vitest';
import { Dawg } from '../src/dawg';
import { Game } from '../src/game';
import { minWordLengthFor } from '../src/types';
import type { CellPos, GameConfig } from '../src/types';

const p = (row: number, col: number): CellPos => ({ row, col });

const cfg5: GameConfig = { boardSize: 5, allowDiagonal: false, minWordLength: 4, maxSkipsInRow: 3 };
const cfg3: GameConfig = { boardSize: 3, allowDiagonal: false, minWordLength: 3, maxSkipsInRow: 3 };
const cfg3m2: GameConfig = { boardSize: 3, allowDiagonal: false, minWordLength: 2, maxSkipsInRow: 3 };

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

  // Старый тест «лимит пропусков — техническое поражение» (2 игрока) переписан:
  // при 2 игроках два паса подряд завершают партию по очкам (no_moves) раньше,
  // чем кто-то наберёт 3 пропуска — прежнее ожидание закрепляло устаревшее
  // поведение (пат кончался техпоражением первого игрока). skip_limit теперь
  // достижим, только когда соперники между пасами делают ходы (здесь — 3 игрока).
  it('лимит пропусков одним игроком — техническое поражение (3 игрока)', () => {
    // 'мо' нужно для хода игрока 2: 'м' над 'о' средней строки (слово читается сверху вниз).
    const game = new Game(Dawg.fromWords(['кот', 'ак', 'мо', 'от', 'км']), cfg3m2, 'кот', 3);
    // Игрок 0 пасует три своих хода, соперники между ними ходят.
    expect(game.pass(0).ok).toBe(true);
    expect(game.submitMove({ player: 1, letter: 'а', cell: p(0, 0), path: [p(0, 0), p(1, 0)] }).ok).toBe(true);
    expect(game.submitMove({ player: 2, letter: 'м', cell: p(0, 1), path: [p(0, 1), p(1, 1)] }).ok).toBe(true);
    expect(game.pass(0).ok).toBe(true);
    expect(game.submitMove({ player: 1, letter: 'о', cell: p(0, 2), path: [p(0, 2), p(1, 2)] }).ok).toBe(true);
    expect(game.submitMove({ player: 2, letter: 'м', cell: p(2, 0), path: [p(1, 0), p(2, 0)] }).ok).toBe(true);
    game.pass(0);
    expect(game.status).toBe('finished');
    expect(game.winner).toBe(1);
    expect(game.endReason).toBe('skip_limit');
    expect(game.pass(1).error).toBe('GAME_FINISHED');
  });

  it('заполнение поля завершает партию победой по счёту', () => {
    const cfg: GameConfig = { ...cfg3, minWordLength: 3 };
    const game = new Game(Dawg.fromWords(['кот', 'хтм']), cfg, 'кот');
    for (const [r, c] of [[0, 0], [0, 1], [2, 0], [2, 1]] as const) {
      game.board.set(r, c, 'м');
    }
    game.board.set(0, 2, 'х');
    const res = game.submitMove({ player: 0, letter: 'м', cell: p(2, 2), path: [p(0, 2), p(1, 2), p(2, 2)] });
    expect(res.ok).toBe(true);
    expect(game.status).toBe('finished');
    expect(game.endReason).toBe('board_full');
    expect(game.winner).toBe(0);
  });

  it('заполнение поля: победа второго игрока, если его счёт выше', () => {
    const cfg: GameConfig = { ...cfg3, minWordLength: 3 };
    const game = new Game(Dawg.fromWords(['кот', 'хтм']), cfg, 'кот');
    for (const [r, c] of [[0, 0], [0, 1], [2, 0], [2, 1]] as const) {
      game.board.set(r, c, 'м');
    }
    game.board.set(0, 2, 'х');
    expect(game.pass(0).ok).toBe(true);
    expect(game.submitMove({ player: 1, letter: 'м', cell: p(2, 2), path: [p(0, 2), p(1, 2), p(2, 2)] }).ok).toBe(true);
    expect(game.endReason).toBe('board_full');
    expect(game.winner).toBe(1);
  });

  it('ничья при равном счёте: winner null (регрессия: раньше побеждал игрок 0)', () => {
    const cfg: GameConfig = { ...cfg3, minWordLength: 2 };
    const game = new Game(Dawg.fromWords(['кот', 'хт', 'мт']), cfg, 'кот');
    for (const [r, c] of [[0, 0], [0, 1], [2, 0], [2, 1]] as const) {
      game.board.set(r, c, 'м');
    }
    expect(game.submitMove({ player: 0, letter: 'х', cell: p(0, 2), path: [p(0, 2), p(1, 2)] }).ok).toBe(true);
    expect(game.submitMove({ player: 1, letter: 'м', cell: p(2, 2), path: [p(2, 2), p(1, 2)] }).ok).toBe(true);
    expect(game.status).toBe('finished');
    expect(game.endReason).toBe('board_full');
    expect(game.players.map((pl) => pl.score)).toEqual([2, 2]);
    expect(game.winner).toBeNull();
  });

  it('два паса подряд (по одному от каждого) — партия завершается по очкам (no_moves)', () => {
    const game = new Game(Dawg.fromWords(['кот', 'хт']), cfg3m2, 'кот');
    expect(game.submitMove({ player: 0, letter: 'х', cell: p(0, 2), path: [p(0, 2), p(1, 2)] }).ok).toBe(true);
    expect(game.pass(1).ok).toBe(true);
    expect(game.pass(0).ok).toBe(true);
    expect(game.status).toBe('finished');
    expect(game.endReason).toBe('no_moves');
    expect(game.winner).toBe(0);
  });

  it('два паса подряд при равном счёте — ничья', () => {
    const game = new Game(Dawg.fromWords(['кот']), cfg3, 'кот');
    expect(game.pass(0).ok).toBe(true);
    expect(game.pass(1).ok).toBe(true);
    expect(game.status).toBe('finished');
    expect(game.endReason).toBe('no_moves');
    expect(game.winner).toBeNull();
  });

  it('успешный ход сбрасывает счётчик идущих пасов', () => {
    const game = new Game(Dawg.fromWords(['кот', 'хт']), cfg3m2, 'кот');
    expect(game.pass(0).ok).toBe(true);
    expect(game.submitMove({ player: 1, letter: 'х', cell: p(0, 2), path: [p(0, 2), p(1, 2)] }).ok).toBe(true);
    // После хода бота один пас не завершает партию.
    expect(game.pass(0).ok).toBe(true);
    expect(game.status).toBe('playing');
  });

  it('resign — техническое поражение сдавшегося', () => {
    const game = new Game(Dawg.fromWords(['кот']), cfg3, 'кот');
    game.resign(0);
    expect(game.status).toBe('finished');
    expect(game.winner).toBe(1);
    expect(game.endReason).toBe('resign');
    game.resign(1);
    expect(game.winner).toBe(1);
  });

  it('буква в истории нормализована так же, как на поле («Ё» → «е»)', () => {
    const game = new Game(Dawg.fromWords(['кот', 'ет']), cfg3m2, 'кот');
    expect(game.submitMove({ player: 0, letter: 'Ё', cell: p(0, 2), path: [p(0, 2), p(1, 2)] }).ok).toBe(true);
    expect(game.board.get(0, 2)).toBe('е');
    expect(game.history[0]!.letter).toBe('е');
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

  it('минимальная длина слова зависит от размера поля', () => {
    expect(minWordLengthFor(3)).toBe(3);
    expect(minWordLengthFor(5)).toBe(4);
    expect(minWordLengthFor(7)).toBe(4);
  });
});
