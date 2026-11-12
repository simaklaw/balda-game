import type { Board } from './board';
import type { Dawg } from './dawg';
import { CYRILLIC_LETTERS } from './letters';
import type { CellPos, GameConfig, MoveInput } from './types';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface AiCandidate extends MoveInput {
  word: string;
  points: number;
}

/**
 * Поиск хода ИИ: для каждой свободной клетки и каждой буквы алфавита —
 * обход в глубину по DAWG (перебор обрезается по префиксам).
 * Возвращает лучший ход по уровню сложности или null, если ходов нет.
 *
 * TODO(этап 2): для поля 7×7 заменить на двусторонний обход от новой клетки.
 */
export function findAiMove(
  board: Board,
  dawg: Dawg,
  config: GameConfig,
  usedWords: Set<string>,
  difficulty: Difficulty,
  rng: () => number = Math.random,
): AiCandidate | null {
  const byWord = new Map<string, AiCandidate>();
  const root = dawg.rootId;

  for (let row = 0; row < board.size; row++) {
    for (let col = 0; col < board.size; col++) {
      if (!board.isEmpty(row, col)) continue;
      const cell: CellPos = { row, col };
      const hasNeighbor = board
        .neighbors(row, col, config.allowDiagonal)
        .some((n) => !board.isEmpty(n.row, n.col));
      if (!hasNeighbor) continue;

      for (const letter of CYRILLIC_LETTERS) {
        const get = (pos: CellPos): string =>
          pos.row === cell.row && pos.col === cell.col ? letter : board.get(pos.row, pos.col);

        const dfs = (pos: CellPos, path: CellPos[], word: string, node: number): void => {
          const isNewInPath = path.some((c) => c.row === cell.row && c.col === cell.col);
          if (
            isNewInPath &&
            dawg.isWord(node) &&
            word.length >= config.minWordLength &&
            !usedWords.has(word)
          ) {
            if (!byWord.has(word)) {
              byWord.set(word, { letter, cell, path: [...path], word, points: word.length });
            }
          }
          for (const n of board.neighbors(pos.row, pos.col, config.allowDiagonal)) {
            if (path.some((c) => c.row === n.row && c.col === n.col)) continue;
            const ch = get(n);
            if (ch === '') continue;
            const next = dawg.next(node, ch);
            if (next === -1) continue;
            dfs(n, [...path, n], word + ch, next);
          }
        };

        for (let sr = 0; sr < board.size; sr++) {
          for (let sc = 0; sc < board.size; sc++) {
            const start: CellPos = { row: sr, col: sc };
            const ch = get(start);
            if (ch === '') continue;
            const startNode = dawg.next(root, ch);
            if (startNode === -1) continue;
            dfs(start, [start], ch, startNode);
          }
        }
      }
    }
  }

  const candidates = [...byWord.values()].sort((a, b) => b.points - a.points);
  if (candidates.length === 0) return null;

  if (difficulty === 'hard') {
    const best = candidates[0]!.points;
    const top = candidates.filter((c) => c.points === best);
    return top[Math.floor(rng() * top.length)]!;
  }
  if (difficulty === 'medium') {
    const poolSize = Math.max(1, Math.ceil(candidates.length * 0.3));
    const pool = candidates.slice(0, poolSize);
    return pool[Math.floor(rng() * pool.length)]!;
  }
  return candidates[Math.floor(rng() * candidates.length)]!;
}
