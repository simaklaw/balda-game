// Проверка dist: в index.html нет абсолютных путей к ассетам, словарь скопирован.
// Абсолютные пути ломают игру на площадках с вложенным хостингом (Яндекс/VK/OK).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const htmlPath = 'client/dist/index.html';
if (!existsSync(htmlPath)) {
  console.error('dist не собран: нет ' + htmlPath);
  process.exit(1);
}
const html = readFileSync(htmlPath, 'utf8');
const bad = [...html.matchAll(/(?:src|href)="(\/[^/][^"]*)"/g)].map((m) => m[1]);
if (bad.length) {
  console.error('Абсолютные пути в dist:', bad);
  process.exit(1);
}
if (!existsSync('client/dist/dict/words.txt')) {
  console.error('Словарь не скопирован в dist');
  process.exit(1);
}

if (!existsSync('client/dist/LICENSES/Harrix-Russian-Nouns-MIT.txt')) {
  console.error('В dist нет LICENSES/Harrix-Russian-Nouns-MIT.txt');
  process.exit(1);
}

for (const lic of ['LICENSE-DATA.txt']) {
  if (!existsSync('client/dist/LICENSES/' + lic)) {
    console.error('В dist нет LICENSES/' + lic + ' (лицензия данных словаря, CC BY-SA)');
    process.exit(1);
  }
}

// Бюджеты размеров (фаза F ужесточит: precompress + gzip-бюджет).
// Словарь вырос с 49 тыс. до ~67 тыс. слов (OpenCorpora + Harrix): сырой файл ≤ 1,4 МБ, gzip ≤ 300 КБ.
const wordsBytes = statSync('client/dist/dict/words.txt').size;
if (wordsBytes > 1400 * 1024) {
  console.error('words.txt больше бюджета 1,4 МБ: ' + wordsBytes + ' байт');
  process.exit(1);
}
const wordsRaw = readFileSync('client/dist/dict/words.txt');
const wordsGzip = gzipSync(wordsRaw, { level: 9 }).length;
if (wordsGzip > 300 * 1024) {
  console.error('words.txt (gzip) больше бюджета 300 КБ: ' + wordsGzip + ' байт');
  process.exit(1);
}
// Манифест обязан соответствовать файлу: число слов и тот же файл, что собран пайплайном.
if (!existsSync('client/dist/dict/MANIFEST.json')) {
  console.error('В dist нет dict/MANIFEST.json');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync('client/dist/dict/MANIFEST.json', 'utf8'));
const wordCount = wordsRaw.toString('utf8').split('\n').filter(Boolean).length;
if (manifest.counts?.total !== wordCount) {
  console.error('MANIFEST.counts.total (' + manifest.counts?.total + ') != число слов в words.txt (' + wordCount + ')');
  process.exit(1);
}
if (existsSync('client/dist/dict/words-extra.txt')) {
  console.error('words-extra.txt больше не используется: словарь собирается в один words.txt');
  process.exit(1);
}
const jsFiles = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => 'client/dist/' + m[1]);
let jsTotal = 0;
for (const file of jsFiles) {
  // Внешние скрипты (CDN площадок, например telegram-web-app.js) не считаем.
  if (!existsSync(file)) continue;
  jsTotal += statSync(file).size;
}
// В фазе B — предупреждение; жёсткий падающий бюджет вводится в фазе F.
if (jsTotal > 700 * 1024) {
  console.warn('ПРЕДУПРЕЖДЕНИЕ: JS-бандл больше бюджета 700 КБ: ' + jsTotal + ' байт');
}

console.log(
  'dist OK: относительные пути, словарь на месте (' +
    Math.round(wordsBytes / 1024) + ' КБ, gzip ' + Math.round(wordsGzip / 1024) + ' КБ, ' + wordCount + ' слов), JS ' +
    Math.round(jsTotal / 1024) + ' КБ',
);
