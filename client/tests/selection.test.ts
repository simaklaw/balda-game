import { describe, expect, it } from 'vitest';
import { Board } from '@balda/shared';
import { SelectionModel } from '../src/game/SelectionModel';

describe('SelectionModel', () => {
  const board = new Board(5, 'балда');

  it('сценарий «балл»: тап по клетке → буква → цепочка → ход', () => {
    const model = new SelectionModel(board, 4, false);
    expect(model.tapCell(2, 0)).toBe(false); // занятая клетка
    expect(model.tapCell(0, 0)).toBe(false); // нет соседей-букв
    expect(model.tapCell(1, 2)).toBe(true); // пустая, рядом «а» и «л»
    expect(model.chooseLetter('л')).toBe(true);
    expect(model.extendPath(2, 0)).toBe(true); // б
    expect(model.extendPath(2, 1)).toBe(true); // а
    expect(model.extendPath(2, 2)).toBe(true); // л
    expect(model.extendPath(1, 2)).toBe(true); // новая л
    expect(model.currentWord()).toBe('балл');
    expect(model.canSubmit()).toBe(true);
    const move = model.toMove();
    expect(move).not.toBeNull();
    expect(move?.letter).toBe('л');
    expect(move?.cell).toEqual({ row: 1, col: 2 });
    expect(move?.path).toHaveLength(4);
    expect(model.extendPath(2, 1)).toBe(false); // клетка уже в цепочке
    expect(model.extendPath(2, 4)).toBe(false); // не соседняя
    expect(model.extendPath(2, 2)).toBe(true); // drag-back снимает последнюю букву
    expect(model.currentWord()).toBe('бал');
    expect(model.canSubmit()).toBe(false);
  });

  it('повторный тап по выбранной клетке отменяет выделение, тап по другой — переносит', () => {
    const model = new SelectionModel(board, 4, false);
    expect(model.tapCell(1, 2)).toBe(true);
    expect(model.tapCell(1, 2)).toBe(true);
    expect(model.snapshot.phase).toBe('idle');
    expect(model.tapCell(1, 3)).toBe(true);
    expect(model.snapshot.newCell).toEqual({ row: 1, col: 3 });
  });

  it('слово без новой буквы нельзя отправить', () => {
    const model = new SelectionModel(board, 4, false);
    model.tapCell(1, 2);
    model.chooseLetter('л');
    model.extendPath(2, 0);
    model.extendPath(2, 1);
    model.extendPath(2, 2);
    model.extendPath(2, 3);
    expect(model.currentWord()).toBe('балд');
    expect(model.canSubmit()).toBe(false);
    expect(model.toMove()).toBeNull();
  });
});
