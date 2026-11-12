import { Dawg } from '@balda/shared';
import { DEV_WORDS } from './devWords';

export interface LoadedDawg {
  dawg: Dawg;
  size: number;
  source: 'full' | 'dev';
}

const WORD_RE = /^[а-яё]{2,15}$/;

function normalizeList(words: readonly string[]): string[] {
  return words
    .map((w) => w.toLowerCase().trim().replace(/ё/g, 'е'))
    .filter((w) => WORD_RE.test(w));
}

/**
 * Загрузка словаря: words.txt из public/ собирается в DAWG при старте.
 * Если файл недоступен (например, в юнит-тестах), используется встроенный dev-набор.
 */
export async function loadDawg(): Promise<LoadedDawg> {
  try {
    const base = import.meta.env.BASE_URL;
    const url = base.endsWith('/') ? base + 'dict/words.txt' : base + '/dict/words.txt';
    const response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const text = await response.text();
    const words = normalizeList(text.split('\n'));
    if (words.length < 10000) throw new Error('Словарь подозрительно мал: ' + words.length);
    return { dawg: Dawg.fromWords(words), size: words.length, source: 'full' };
  } catch {
    const devWords = normalizeList(DEV_WORDS);
    return { dawg: Dawg.fromWords(devWords), size: devWords.length, source: 'dev' };
  }
}
