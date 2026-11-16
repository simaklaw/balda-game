/** Базовые типы игрового ядра «Балды». */

export interface CellPos {
  row: number;
  col: number;
}

/** Конфигурация партии. */
export interface GameConfig {
  boardSize: 3 | 5 | 7;
  /** Диагональное соседство букв в слове. */
  allowDiagonal: boolean;
  /** Минимальная длина слова (в классике — 4). */
  minWordLength: number;
  /** Техническое поражение после этого числа пропусков подряд. */
  maxSkipsInRow: number;
}

/** Минимальная длина слова зависит от размера поля: на 3×3 слов из 4 букв почти нет. */
export function minWordLengthFor(boardSize: 3 | 5 | 7): number {
  return boardSize === 3 ? 3 : 4;
}

/** Конфигурация по умолчанию для поля данного размера. */
export function defaultConfigFor(boardSize: 3 | 5 | 7, allowDiagonal = false): GameConfig {
  return { boardSize, allowDiagonal, minWordLength: minWordLengthFor(boardSize), maxSkipsInRow: 3 };
}

export const DEFAULT_CONFIG: GameConfig = defaultConfigFor(5);

/** Ход игрока: буква, клетка её размещения и путь слова (обязательно включает cell). */
export interface MoveInput {
  letter: string;
  cell: CellPos;
  path: CellPos[];
}

export type MoveErrorCode =
  | 'INVALID_LETTER'
  | 'OUT_OF_BOUNDS'
  | 'CELL_OCCUPIED'
  | 'NO_NEIGHBOR_LETTERS'
  | 'PATH_EMPTY'
  | 'PATH_OUT_OF_BOUNDS'
  | 'PATH_REVISITS_CELL'
  | 'PATH_MISSING_NEW_CELL'
  | 'PATH_EMPTY_CELL'
  | 'PATH_NOT_CONTIGUOUS'
  | 'WORD_TOO_SHORT'
  | 'WORD_UNKNOWN'
  | 'WORD_ALREADY_USED'
  | 'NOT_PLAYERS_TURN'
  | 'GAME_FINISHED';

export interface MoveResult {
  ok: boolean;
  /** Длина слова = очки за ход. */
  points?: number;
  /** Слово, прочитанное по пути хода. */
  word?: string;
  error?: MoveErrorCode;
}

export interface MoveHistoryEntry {
  player: number;
  word: string;
  points: number;
  letter: string;
  cell: CellPos;
}

export type GameStatus = 'playing' | 'finished';

/**
 * Причина завершения партии: board_full — поле заполнено, skip_limit — лимит
 * пропусков одним игроком, timeout — поражение по времени, resign — сдача,
 * no_moves — у обоих игроков нет ходов (все пасанули подряд).
 */
export type EndReason = 'board_full' | 'skip_limit' | 'timeout' | 'resign' | 'no_moves' | null;
