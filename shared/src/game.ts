import { Board } from './board';
import type { Dawg } from './dawg';
import { normalizeWord } from './letters';
import { validateMove } from './rules';
import type {
  EndReason,
  GameConfig,
  GameStatus,
  MoveHistoryEntry,
  MoveInput,
  MoveResult,
} from './types';

/**
 * Партия «Балды»: ходы, пропуск, счёт, история использованных слов,
 * завершение по заполнению поля или лимиту пропусков.
 */
export class Game {
  readonly config: GameConfig;
  readonly board: Board;
  readonly dawg: Dawg;
  players: { score: number; skipsInRow: number }[];
  history: MoveHistoryEntry[] = [];
  usedWords: Set<string>;
  currentPlayer = 0;
  status: GameStatus = 'playing';
  winner: number | null = null;
  endReason: EndReason = null;

  constructor(
    dawg: Dawg,
    config: GameConfig,
    initialWord: string,
    playerCount = 2,
  ) {
    this.dawg = dawg;
    this.config = config;
    this.board = new Board(config.boardSize, initialWord);
    this.usedWords = new Set([normalizeWord(initialWord)]);
    this.players = Array.from({ length: playerCount }, () => ({ score: 0, skipsInRow: 0 }));
  }

  /** Принять ход игрока. При успехе обновляет поле, счёт и передаёт ход. */
  submitMove(move: MoveInput & { player: number }): MoveResult {
    if (this.status !== 'playing') return { ok: false, error: 'GAME_FINISHED' };
    if (move.player !== this.currentPlayer) return { ok: false, error: 'NOT_PLAYERS_TURN' };
    const result = validateMove(this.board, this.dawg, this.config, this.usedWords, move);
    if (!result.ok) return result;

    const { points, word } = result;
    this.board.set(move.cell.row, move.cell.col, move.letter);
    const player = this.players[move.player]!;
    player.score += points!;
    player.skipsInRow = 0;
    this.history.push({
      player: move.player,
      word: word!,
      points: points!,
      letter: move.letter,
      cell: move.cell,
    });
    this.usedWords.add(word!);
    this.nextTurn();
    this.updateStatus();
    return result;
  }

  /** Пропуск хода. Достигнут лимит пропусков — техническое поражение. */
  pass(player: number): MoveResult {
    if (this.status !== 'playing') return { ok: false, error: 'GAME_FINISHED' };
    if (player !== this.currentPlayer) return { ok: false, error: 'NOT_PLAYERS_TURN' };
    this.players[player]!.skipsInRow += 1;
    if (this.players[player]!.skipsInRow >= this.config.maxSkipsInRow) {
      this.finish(player === 0 ? 1 : 0, 'skip_limit');
      return { ok: true };
    }
    this.nextTurn();
    return { ok: true };
  }

  private nextTurn(): void {
    this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
  }

  private updateStatus(): void {
    if (this.board.isFull()) {
      const scores = this.players.map((pl) => pl.score);
      let winner = 0;
      for (let i = 1; i < scores.length; i++) {
        if (scores[i]! > scores[winner]!) winner = i;
      }
      this.finish(winner, 'board_full');
    }
  }

  private finish(winner: number | null, reason: Exclude<EndReason, null>): void {
    this.status = 'finished';
    this.winner = winner;
    this.endReason = reason;
  }
}
