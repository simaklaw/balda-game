import { Dawg } from '@balda/shared';
import { DEV_WORDS } from './devWords';

export interface LoadedDawg {
  dawg: Dawg;
  size: number;
  source: 'full' | 'dev';
}

const WORD_RE = /^[а-яё]{2,15}$/;

/** Таймаут сборки DAWG в Worker (мс). Дальше — fallback на main. */
const WORKER_BUILD_MS = 30_000;

function normalizeList(words: readonly string[]): string[] {
  return words
    .map((w) => w.toLowerCase().trim().replace(/ё/g, 'е'))
    .filter((w) => WORD_RE.test(w));
}

function buildOnMain(words: string[], source: 'full' | 'dev'): LoadedDawg {
  return { dawg: Dawg.fromWords(words), size: words.length, source };
}

/**
 * Сборка DAWG в Web Worker. null — Worker недоступен / ошибка / таймаут.
 * Игра обязана уметь стартовать без Worker (синхронный fallback).
 */
function buildInWorker(words: string[]): Promise<LoadedDawg | null> {
  return new Promise((resolve) => {
    if (typeof Worker === 'undefined') {
      resolve(null);
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(new URL('./dawg.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      resolve(null);
      return;
    }

    let settled = false;
    const finish = (value: LoadedDawg | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        worker.terminate();
      } catch {
        /* already dead */
      }
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), WORKER_BUILD_MS);

    worker.onmessage = (ev: MessageEvent<{ ok?: boolean; serialized?: string }>) => {
      const data = ev.data;
      if (data?.ok === true && typeof data.serialized === 'string') {
        try {
          finish({
            dawg: Dawg.deserialize(data.serialized),
            size: words.length,
            source: 'full',
          });
          return;
        } catch {
          finish(null);
          return;
        }
      }
      finish(null);
    };
    worker.onerror = () => finish(null);

    try {
      worker.postMessage({ words });
    } catch {
      finish(null);
    }
  });
}

/** Минимальный размер словаря, если MANIFEST.json недоступен. */
const MIN_WORDS_FALLBACK = 10_000;

/** Доля от counts.total манифеста, ниже которой файл считается усечённым. */
const MIN_WORDS_RATIO = 0.9;

/** Ожидаемое число слов из dict/MANIFEST.json (counts.total); null — манифест недоступен. */
async function loadExpectedTotal(): Promise<number | null> {
  try {
    const url = new URL('dict/MANIFEST.json', document.baseURI).href;
    const response = await fetch(url);
    if (!response.ok) return null;
    const manifest = (await response.json()) as { counts?: { total?: unknown } };
    const total = manifest.counts?.total;
    return typeof total === 'number' && total > 0 ? total : null;
  } catch {
    return null;
  }
}

/**
 * Загрузка словаря: единый words.txt (собирается скриптом tools/dict/build.py) → DAWG.
 * Тяжёлая сборка — в Worker; при отказе Worker — синхронно на main.
 * Если основной файл недоступен (юнит-тесты) — встроенный dev-набор.
 */
export async function loadDawg(): Promise<LoadedDawg> {
  try {
    // Относительный URL от базового адреса документа: работает при base:'./',
    // при вложенном хостинге площадок и в dev-режиме. document может отсутствовать
    // в тестовой среде — ошибка ловится ниже и даёт откат на dev-набор.
    const url = new URL('dict/words.txt', document.baseURI).href;
    const response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const text = await response.text();
    const words = normalizeList(text.split('\n'));
    // Порог привязан к манифесту: усечённый на ~10 % файл не должен считаться «полным».
    const expected = await loadExpectedTotal();
    const minWords = expected === null ? MIN_WORDS_FALLBACK : Math.floor(expected * MIN_WORDS_RATIO);
    if (words.length < minWords) throw new Error('Словарь подозрительно мал: ' + words.length);

    const fromWorker = await buildInWorker(words);
    if (fromWorker !== null) return fromWorker;
    return buildOnMain(words, 'full');
  } catch {
    const devWords = normalizeList(DEV_WORDS);
    return buildOnMain(devWords, 'dev');
  }
}
