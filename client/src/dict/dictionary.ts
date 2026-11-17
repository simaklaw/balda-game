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

/** Опциональный довесок (Ожегов / неологизмы XXI в.) — сбой не блокирует старт. */
async function loadExtraWords(): Promise<string[]> {
  try {
    const url = new URL('dict/words-extra.txt', document.baseURI).href;
    const response = await fetch(url);
    if (!response.ok) return [];
    return normalizeList((await response.text()).split('\n'));
  } catch {
    return [];
  }
}

/**
 * Загрузка словаря: words.txt (+ words-extra.txt) → DAWG.
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
    const base = normalizeList(text.split('\n'));
    if (base.length < 10000) throw new Error('Словарь подозрительно мал: ' + base.length);

    const extra = await loadExtraWords();
    const words = extra.length === 0 ? base : [...base, ...extra];

    const fromWorker = await buildInWorker(words);
    if (fromWorker !== null) return fromWorker;
    return buildOnMain(words, 'full');
  } catch {
    const devWords = normalizeList(DEV_WORDS);
    return buildOnMain(devWords, 'dev');
  }
}
