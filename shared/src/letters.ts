/** Работа с русскими буквами. Внутреннее представление — нижний регистр, «ё» → «е». */

export const CYRILLIC_LETTERS: readonly string[] = 'абвгдежзийклмнопрстуфхцчшщъыьэюя'.split(
  '',
);

const LETTER_SET = new Set(CYRILLIC_LETTERS);

/** Нормализация слова: нижний регистр, «ё» → «е». */
export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/ё/g, 'е');
}

export function normalizeLetter(letter: string): string {
  return normalizeWord(letter);
}

export function isCyrillicLetter(letter: string): boolean {
  return LETTER_SET.has(normalizeLetter(letter));
}
