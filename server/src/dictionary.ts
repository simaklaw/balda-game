import { readFileSync } from 'node:fs';
import { Dawg } from '@balda/shared';

const WORD_RE = /^[а-яё]{2,15}$/;

/** Аварийный набор, если файл словаря недоступен (сервер остаётся играбельным). */
const FALLBACK_WORDS: readonly string[] = [
  'балда', 'слово', 'игра', 'поле', 'балет', 'лето', 'лото', 'слоно', 'бок',
  'бал', 'бак', 'лак', 'лук', 'сук', 'сок', 'кот', 'кол', 'ток', 'дом',
  'сало', 'соло', 'полотно', 'молоко', 'молот', 'молоток', 'колобок',
];

export interface LoadedDictionary {
  dawg: Dawg;
  size: number;
  source: 'file' | 'fallback';
}

/**
 * Загружает словарь из файла (по одному слову в строке) и собирает DAWG.
 * При недоступности файла использует встроенный fallback-набор.
 */
export function loadDictionary(path: string): LoadedDictionary {
  let lines: string[];
  let source: LoadedDictionary['source'];
  try {
    lines = readFileSync(path, 'utf8').split('\n');
    source = 'file';
  } catch {
    lines = [...FALLBACK_WORDS];
    source = 'fallback';
  }
  const words = lines
    .map((w) => w.trim().toLowerCase().replace(/ё/g, 'е'))
    .filter((w) => WORD_RE.test(w));
  return { dawg: Dawg.fromWords(words), size: words.length, source };
}
