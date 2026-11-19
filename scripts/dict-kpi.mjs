// KPI качества игрового словаря (фаза S4). Без зависимостей. Запуск: node scripts/dict-kpi.mjs
// Блокирующие метрики роняют скрипт; информирующие — только печатаются.
// Морфокорректность (все слова получены правилом или allow-листом) проверяет python3 tools/dict/verify.py:
// он пересобирает словарь из закоммиченных источников и сверяет sha256 побайтово.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const DICT = 'client/public/dict/words.txt';
const MANIFEST = 'client/public/dict/MANIFEST.json';
const norm = (w) => w.trim().toLowerCase().replaceAll('ё', 'е');
const lines = (p) => readFileSync(p, 'utf8').split('\n');
const listFile = (p) => lines(p).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const listWithComments = (p) => new Set(listFile(p).map((l) => norm(l.split('#')[0])));

const raw = readFileSync(DICT);
const text = raw.toString('utf8');
const body = text.split('\n');
const words = body.slice(0, -1);
const set = new Set(words);

const results = [];
const check = (name, ok, detail, blocking = true) => results.push({ name, ok, detail, blocking });

check('Файл: LF, финальный перевод строки, без BOM', body[body.length - 1] === '' && !text.includes('\r') && text.charCodeAt(0) !== 0xfeff, '');
check('Формат [а-яе]{2,15}', words.every((w) => /^[а-яе]{2,15}$/.test(w)), `${words.filter((w) => !/^[а-яе]{2,15}$/.test(w)).length} нарушений`);
check('Дубли и порядок (отсортирован, без повторов)', words.length === set.size && words.every((w, i) => i === 0 || words[i - 1] < w), `${words.length - set.size} дублей`);

const must = (file) => listFile(file).map(norm);
const canaryMissing = must('tools/dict/fixtures.canary.txt').filter((w) => !set.has(w));
check('Канареечные слова присутствуют 100 %', canaryMissing.length === 0, canaryMissing.join(', ') || 'все на месте');
const posMissing = must('tools/dict/fixtures.positive.txt').filter((w) => !set.has(w));
check('Позитивный набор присутствует 100 %', posMissing.length === 0, posMissing.join(', ') || 'все на месте');
const negPresent = must('tools/dict/fixtures.negative.txt').filter((w) => set.has(w));
check('Негативный набор отсутствует 100 %', negPresent.length === 0, negPresent.join(', ') || 'ни одного');

const allow = listWithComments('tools/dict/allowlist.txt');
const blockPresent = [...listWithComments('tools/dict/blocklist.txt')].filter((w) => !allow.has(w) && set.has(w));
check('Блок-лист (точные формы): 0 слов в словаре', blockPresent.length === 0, blockPresent.join(', ') || '0');

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const sha = createHash('sha256').update(raw).digest('hex');
check('MANIFEST: sha256 и число слов совпадают с файлом', manifest.outputSha256 === sha && manifest.counts.total === words.length, `манифест ${String(manifest.outputSha256).slice(0, 12)}, файл ${sha.slice(0, 12)}`);

const gz = gzipSync(raw, { level: 9 }).length;
check('Размер words.txt ≤ 1,4 МБ (gzip ≤ 300 КБ)', raw.length <= 1400 * 1024 && gz <= 300 * 1024, `${Math.round(raw.length / 1024)} КБ, gzip ${Math.round(gz / 1024)} КБ`);

// Информирующие: частотный список НКРЯ/FrequencyWords в репозитории отсутствует (лицензия/доступ) — метрики не подделываем.
check('coverage@5000 (полнота по частотному списку)', false, 'НЕ ВЫЧИСЛЕНА: частотный список недоступен в CI', false);
check('noise@20000 (доля слов вне top-20000)', false, 'НЕ ВЫЧИСЛЕНА: частотный список недоступен в CI', false);

let failed = 0;
for (const r of results) {
  const mark = r.ok ? '✅' : r.blocking ? '❌' : '⚠️';
  if (!r.ok && r.blocking) failed++;
  console.log(`${mark} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
}
console.log(`\nслов: ${words.length}; блокирующих нарушений: ${failed}`);
process.exit(failed ? 1 : 0);
