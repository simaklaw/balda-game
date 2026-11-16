import { Board } from './board';
import type { Dawg } from './dawg';
import { normalizeLetter, normalizeWord } from './letters';
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
 * завершение по заполнению поля, отсутствию ходов, лимиту пропусков,
 * сдаче или времени.
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
  /** Сколько игроков пасанули подряд без успешного хода между ними. */
  private consecutivePasses = 0;

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
    this.consecutivePasses = 0;
    this.history.push({
      player: move.player,
      word: word!,
      points: points!,
      // Нормализуем так же, как Board.set: буква в истории совпадает с буквой на поле.
      letter: normalizeLetter(move.letter),
      cell: move.cell,
    });
    this.usedWords.add(word!);
    this.nextTurn();
    this.updateStatus();
    return result;
  }

  /**
   * Пропуск хода. Если все игроки пасанули подряд — ходов больше нет,
   * партия завершается по очкам (no_moves). Лимит пропусков одним игроком —
   * техническое поражение (технические исходы определены для 2 игроков).
   */
  pass(player: number): MoveResult {
    if (this.status !== 'playing') return { ok: false, error: 'GAME_FINISHED' };
    if (player !== this.currentPlayer) return { ok: false, error: 'NOT_PLAYERS_TURN' };
    this.players[player]!.skipsInRow += 1;
    this.consecutivePasses += 1;
    if (this.consecutivePasses >= this.players.length) {
      this.finishByScore('no_moves');
      return { ok: true };
    }
    if (this.players[player]!.skipsInRow >= this.config.maxSkipsInRow) {
      this.finish(this.opponentOf(player), 'skip_limit');
      return { ok: true };
    }
    this.nextTurn();
    return { ok: true };
  }

  /** Поражение по времени: игрок player превысил лимит часов. */
  declareTimeout(player: number): void {
    if (this.status !== 'playing') return;
    this.finish(this.opponentOf(player), 'timeout');
  }

  /** Добровольная сдача: техническое поражение сдавшегося. */
  resign(player: number): void {
    if (this.status !== 'playing') return;
    this.finish(this.opponentOf(player), 'resign');
  }

  /** Оппонент игрока (технические исходы определены для 2 игроков). */
  private opponentOf(player: number): number {
    return (player + 1) % this.players.length;
  }

  private nextTurn(): void {
    this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
  }

  /** Завершить партию по очкам: при равенстве лидеров — ничья (winner = null). */
  private finishByScore(reason: Exclude<EndReason, null>): void {
    const scores = this.players.map((p) => p.score);
    const best = Math.max(...scores);
    const leaders = scores.filter((s) => s === best).length;
    this.finish(leaders === 1 ? scores.indexOf(best) : null, reason);
  }

  private updateStatus(): void {
    if (this.board.isFull()) this.finishByScore('board_full');
  }

  private finish(winner: number | null, reason: Exclude<EndReason, null>): void {
    this.status = 'finished';
    this.winner = winner;
    this.endReason = reason;
  }
}
