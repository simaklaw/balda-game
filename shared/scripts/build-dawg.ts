import { readFileSync, writeFileSync } from 'node:fs';
import { Dawg } from '../src/dawg';
import { normalizeWord } from '../src/letters';

/**
 * Сборка DAWG из текстового word-list (одно слово на строку).
 * Использование: npm run build:dawg -- <word-list.txt> <out.dawg.json>
 * О правилах отбора слов см. docs/DICTIONARY.md.
 */
const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('Usage: npm run build:dawg -- <word-list.txt> <out.dawg.json>');
  process.exit(1);
}

const words = readFileSync(inPath, 'utf8')
  .split(/?
/)
  .map((w) => normalizeWord(w.trim()))
  .filter((w) => w.length > 0);

const dawg = Dawg.fromWords(words);
writeFileSync(outPath, dawg.serialize());
console.log('DAWG built: ' + words.length + ' words, ' + dawg.size + ' nodes -> ' + outPath);
