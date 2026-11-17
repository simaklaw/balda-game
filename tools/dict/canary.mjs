// S0.1: канареечные слова — обязаны присутствовать в words.txt (после ё→е).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dictPath = process.argv[2] ?? join(root, 'client/public/dict/words.txt');
const norm = (w) => w.trim().toLowerCase().replaceAll('ё', 'е');

const CANARY = {
  'еб': ['небо', 'небосвод', 'лебедь', 'хлеб', 'серебро', 'учебник', 'учеба', 'требование', 'потребность', 'жеребенок', 'колебание', 'требуха'],
  'хер': ['херес', 'херувим'],
  'бля': ['бляха'],
  'ху': ['художник', 'худоба', 'хурма', 'хутор', 'художество'],
  'муд': ['мудрость', 'мудрец'],
  'пиз': ['эпизод'],
  'стра/ху': ['страх', 'страховка', 'страхолюдина'],
};

const words = new Set(readFileSync(dictPath, 'utf8').split('\n').map(norm).filter(Boolean));
let missing = 0;
console.log('слово\tподстрока\tстатус');
for (const [sub, list] of Object.entries(CANARY)) {
  for (const w of list) {
    const ok = words.has(norm(w));
    if (!ok) missing++;
    console.log(`${w}\t${sub}\t${ok ? 'присутствует' : 'ОТСУТСТВУЕТ'}`);
  }
}
console.log(`\nсловарь: ${words.size} слов; отсутствуют: ${missing}`);
process.exit(missing ? 1 : 0);
