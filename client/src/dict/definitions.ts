/** Толковый словарь: Викисловарь (REST API), загрузка по требованию, кэш в localStorage. */

export interface WordDefinition {
  word: string;
  definitions: string[];
}

const WIKTIONARY_API = 'https://ru.wiktionary.org/api/rest_v1/page/definition/';
const CACHE_PREFIX = 'balda.def.';
const FETCH_TIMEOUT_MS = 4000;
const MAX_DEFINITIONS = 4;
const MAX_DEFINITION_LENGTH = 200;

function normalizeForLookup(word: string): string {
  return word.trim().toLowerCase().replace(/ё/g, 'е');
}

/** Убирает HTML-разметку из фрагмента Викисловаря, оставляя текст. */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

interface DefinitionItem {
  definition?: string;
}

interface ApiSection {
  definitions?: DefinitionItem[];
}

interface ApiPayload {
  ru?: ApiSection[];
}

/** Из ответа API достаёт русские толкования: без дублей, лимит длины и количества. */
export function formatDefinitions(api: unknown): string[] {
  if (api === null || typeof api !== 'object') return [];
  const sections = (api as ApiPayload).ru;
  if (!Array.isArray(sections)) return [];
  const result: string[] = [];
  for (const section of sections) {
    const definitions = section?.definitions;
    if (!Array.isArray(definitions)) continue;
    for (const item of definitions) {
      const raw = typeof item?.definition === 'string' ? item.definition : '';
      if (raw === '') continue;
      const text = stripHtml(raw);
      if (text === '' || result.includes(text)) continue;
      result.push(text.length > MAX_DEFINITION_LENGTH ? text.slice(0, MAX_DEFINITION_LENGTH - 1) + '…' : text);
      if (result.length >= MAX_DEFINITIONS) return result;
    }
  }
  return result;
}

function readCache(word: string): string[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + word);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(word: string, definitions: string[]): void {
  try {
    localStorage.setItem(CACHE_PREFIX + word, JSON.stringify(definitions));
  } catch {
    /* приватный режим или переполнение хранилища — не кэшируем */
  }
}

async function fetchJson(url: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const json = res.ok ? ((await res.json()) as unknown) : null;
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Толкование слова из Викисловаря. Слово в игре хранится с «е» вместо «ё»,
 * поэтому если страница не найдена, пробуем вариант с полным «ё»
 * (ёжик/слёзы). Отрицательный ответ (слова нет) кэшируется; сетевые сбои — нет.
 */
export async function lookupWord(rawWord: string): Promise<WordDefinition | null> {
  const word = normalizeForLookup(rawWord);
  if (word === '') return null;
  const cached = readCache(word);
  if (cached !== null) {
    return cached.length > 0 ? { word, definitions: cached } : null;
  }
  const candidates = word.includes('е') ? [word, word.replace(/е/g, 'ё')] : [word];
  for (const candidate of candidates) {
    const res = await fetchJson(WIKTIONARY_API + encodeURIComponent(candidate));
    if (res.status === 404) continue;
    if (!res.ok) return null;
    const definitions = formatDefinitions(res.json);
    if (definitions.length === 0) continue;
    writeCache(word, definitions);
    return { word, definitions };
  }
  writeCache(word, []);
  return null;
}
