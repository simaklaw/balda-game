// Проверка dist: в index.html нет абсолютных путей к ассетам, словарь скопирован.
// Абсолютные пути ломают игру на площадках с вложенным хостингом (Яндекс/VK/OK).
import { readFileSync, existsSync, statSync } from 'node:fs';

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

// Бюджеты размеров (фаза F ужесточит: precompress + gzip-бюджет).
const wordsBytes = statSync('client/dist/dict/words.txt').size;
if (wordsBytes > 1024 * 1024) {
  console.error('words.txt больше бюджета 1 МБ: ' + wordsBytes + ' байт');
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
    Math.round(wordsBytes / 1024) + ' КБ), JS ' +
    Math.round(jsTotal / 1024) + ' КБ',
);
