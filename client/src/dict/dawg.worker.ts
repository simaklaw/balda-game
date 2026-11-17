/**
 * Web Worker: сборка DAWG вне UI-потока.
 * Сообщение in:  { words: string[] }
 * Сообщение out: { ok: true, serialized: string } | { ok: false, error: string }
 */
import { Dawg } from '@balda/shared';

interface BuildRequest {
  words: string[];
}

self.onmessage = (ev: MessageEvent<BuildRequest>) => {
  try {
    const words = ev.data?.words;
    if (!Array.isArray(words) || words.length === 0) {
      postMessage({ ok: false, error: 'Пустой список слов' });
      return;
    }
    const dawg = Dawg.fromWords(words);
    postMessage({ ok: true, serialized: dawg.serialize() });
  } catch (err) {
    postMessage({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export {};
