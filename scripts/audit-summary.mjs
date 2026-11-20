// Сводка npm audit: пакет, severity, прямая/транзитивная, где используется (prod/dev), есть ли исправление, advisory.
// Использование: node scripts/audit-summary.mjs audit-all.json audit-prod.json
import { readFileSync } from 'node:fs';

const [allPath, prodPath] = process.argv.slice(2);
const read = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};
const all = read(allPath);
const prod = read(prodPath);
if (!all?.vulnerabilities) {
  console.log('Нет данных аудита (реестр недоступен?)');
  process.exit(0);
}
const prodNames = new Set(Object.keys(prod?.vulnerabilities ?? {}));
const order = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
const rows = Object.values(all.vulnerabilities).sort(
  (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || a.name.localeCompare(b.name),
);
console.log('metadata:', JSON.stringify(all.metadata?.vulnerabilities));
console.log('production-only:', JSON.stringify(prod?.metadata?.vulnerabilities ?? null));
for (const v of rows) {
  const advisories = (v.via ?? []).filter((x) => typeof x === 'object').map((x) => `${x.title} (${x.url ?? x.source}) range=${x.range}`);
  const through = (v.via ?? []).filter((x) => typeof x === 'string');
  const fix = v.fixAvailable === false ? 'нет' : typeof v.fixAvailable === 'object' ? `${v.fixAvailable.name}@${v.fixAvailable.version}${v.fixAvailable.isSemVerMajor ? ' (MAJOR)' : ''}` : 'да';
  console.log(
    `[${v.severity}] ${v.name} range=${v.range} direct=${v.isDirect} prod=${prodNames.has(v.name)} fix=${fix} effects=${(v.effects ?? []).join(',')} via-pkg=${through.join(',')}`,
  );
  for (const a of advisories) console.log('    ' + a);
}
