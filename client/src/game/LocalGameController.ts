import { Game, findAiMove } from '@balda/shared';
import type { Dawg, Difficulty, GameConfig, MoveInput, MoveResult } from '@balda/shared';

export interface AiConfig {
  difficulty: Difficulty;
  /** Инъекция генератора случайных чисел (для тестов). */
  rng?: () => number;
}

/** Оффлайн-партия: игрок 0 — человек, игрок 1 — ИИ. */
export class LocalGameController {
  readonly game: Game;

  constructor(
    dawg: Dawg,
    config: GameConfig,
    initialWord: string,
    private readonly ai: AiConfig,
  ) {
    this.game = new Game(dawg, config, initialWord, 2);
  }

  get isHumanTurn(): boolean {
    return this.game.status === 'playing' && this.game.currentPlayer === 0;
  }

  get isAiTurn(): boolean {
    return this.game.status === 'playing' && this.game.currentPlayer === 1;
  }

  get isFinished(): boolean {
    return this.game.status === 'finished';
  }

  /** Ход человека; валидацию выполняет игровое ядро. */
  applyHumanMove(move: MoveInput): MoveResult {
    if (!this.isHumanTurn) return { ok: false, error: 'NOT_PLAYERS_TURN' };
    return this.game.submitMove({ ...move, player: 0 });
  }

  /** Пропуск хода человеком. */
  passHuman(): MoveResult {
    if (!this.isHumanTurn) return { ok: false, error: 'NOT_PLAYERS_TURN' };
    return this.game.pass(0);
  }

  /** Ход ИИ; при отсутствии вариантов — авто-пропуск. */
  playAiMove(): { moved: boolean; word?: string; points?: number } {
    if (!this.isAiTurn) return { moved: false };
    const candidate = findAiMove(
      this.game.board,
      this.game.dawg,
      this.game.config,
      this.game.usedWords,
      this.ai.difficulty,
      this.ai.rng,
    );
    if (candidate === null) {
      this.game.pass(1);
      return { moved: false };
    }
    const result = this.game.submitMove({
      letter: candidate.letter,
      cell: candidate.cell,
      path: candidate.path,
      player: 1,
    });
    return result.ok ? { moved: true, word: result.word, points: result.points } : { moved: false };
  }
}
