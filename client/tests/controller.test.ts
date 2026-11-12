import { describe, expect, it } from 'vitest';
import { Dawg, findAiMove } from '@balda/shared';
import { LocalGameController } from '../src/game/LocalGameController';

const TEST_WORDS = ['балда', 'балл', 'лад', 'клад', 'кладь', 'сад', 'склад', 'оса'];

const CONFIG = {
  boardSize: 5,
  allowDiagonal: false,
  minWordLength: 4,
  maxSkipsInRow: 3,
} as const;

function makeRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const HUMAN_MOVE_BAL_L = {
  letter: 'л',
  cell: { row: 1, col: 2 },
  path: [
    { row: 2, col: 0 },
    { row: 2, col: 1 },
    { row: 2, col: 2 },
    { row: 1, col: 2 },
  ],
};

describe('LocalGameController', () => {
  it('ход человека «балл» приносит 4 очка и передаёт ход боту', () => {
    const ctrl = new LocalGameController(Dawg.fromWords(TEST_WORDS), CONFIG, 'балда', {
      difficulty: 'hard',
      rng: () => 0,
    });
    const result = ctrl.applyHumanMove(HUMAN_MOVE_BAL_L);
    expect(result.ok).toBe(true);
    expect(result.points).toBe(4);
    expect(result.word).toBe('балл');
    expect(ctrl.game.players[0]!.score).toBe(4);
    expect(ctrl.isAiTurn).toBe(true);
  });

  it('ход не в свою очередь отклоняется', () => {
    const ctrl = new LocalGameController(Dawg.fromWords(TEST_WORDS), CONFIG, 'балда', {
      difficulty: 'hard',
      rng: () => 0,
    });
    ctrl.applyHumanMove(HUMAN_MOVE_BAL_L);
    const result = ctrl.applyHumanMove({
      letter: 'л',
      cell: { row: 1, col: 3 },
      path: [
        { row: 2, col: 0 },
        { row: 2, col: 1 },
        { row: 2, col: 2 },
        { row: 1, col: 3 },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('NOT_PLAYERS_TURN');
  });

  it('партия до конца: счёт согласован с историей ходов', () => {
    const dawg = Dawg.fromWords(TEST_WORDS);
    const ctrl = new LocalGameController(dawg, CONFIG, 'балда', {
      difficulty: 'medium',
      rng: makeRng(42),
    });
    let guard = 0;
    while (!ctrl.isFinished && guard < 60) {
      guard++;
      if (ctrl.isHumanTurn) {
        const candidate = findAiMove(
          ctrl.game.board,
          dawg,
          ctrl.game.config,
          ctrl.game.usedWords,
          'medium',
          makeRng(7 + guard),
        );
        if (candidate === null) {
          ctrl.passHuman();
        } else {
          const result = ctrl.applyHumanMove({
            letter: candidate.letter,
            cell: candidate.cell,
            path: candidate.path,
          });
          expect(result.ok).toBe(true);
        }
      } else {
        ctrl.playAiMove();
      }
    }
    expect(ctrl.isFinished).toBe(true);
    const [human, ai] = ctrl.game.players.map((p) => p.score);
    const historySum = ctrl.game.history.reduce((sum, entry) => sum + entry.points, 0);
    expect(human + ai).toBe(historySum);
    expect(ctrl.game.winner).not.toBeNull();
  });

  it('три пропуска подряд — техническое поражение', () => {
    const ctrl = new LocalGameController(Dawg.fromWords(TEST_WORDS), CONFIG, 'балда', {
      difficulty: 'hard',
      rng: () => 0,
    });
    for (let i = 0; i < 3 && !ctrl.isFinished; i++) {
      ctrl.passHuman();
      ctrl.playAiMove();
    }
    expect(ctrl.isFinished).toBe(true);
    expect(ctrl.game.winner).toBe(1);
    expect(ctrl.game.endReason).toBe('skip_limit');
  });
});
