#!/usr/bin/env python3
"""Генерирует shared/src/startWords.ts — пулы стартовых слов (по размеру поля 3/5/7) из ИГРОВОГО словаря.
Детерминирован. Критерии слова:
  * есть в client/public/dict/words.txt;
  * лемма-существительное ед.ч. по OpenCorpora (noun-ok, не Pltm) — никаких форм, мн.ч., имён;
  * входит в частотный прокси OpenRussian (порядок строк nouns.csv), ранг < RANK_LIMIT; отбираются самые частотные;
  * не в blocklist.txt и не в start_exclude.txt (тематика, неуместная для ценза 6+);
  * нет «ъ»; гласных ≥ 1 (3 буквы) / ≥ 2 (5 и 7 букв).
Размер пулов ограничен (бюджет бандла): 3 → 150, 5 → 1200, 7 → 600."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import HERE, ROOT, SRC, norm, read_words

POOLS = {3: 150, 5: 1200, 7: 600}
RANK_LIMIT = {3: 9000, 5: 14000, 7: 14000}
VOWELS = set("аеиоуыэюя")
OUT = ROOT / "shared/src/startWords.ts"


def read_list(p: Path) -> set[str]:
    return {norm(t) for l in p.read_text(encoding="utf-8").split("\n") if not l.startswith("#")
            for t in l.split("#")[0].split()}


def generate() -> str:
    words = set(read_words(ROOT / "client/public/dict/words.txt"))
    oc = {}
    for line in (SRC / "oc-extract.tsv").read_text(encoding="utf-8").split("\n"):
        if line:
            w, st, d = line.split("\t")
            oc[w] = (st, d)
    ranks = []
    for line in (SRC / "openrussian-nouns.tsv").read_text(encoding="utf-8").split("\n"):
        if line:
            r, w, f = line.split("\t")
            ranks.append((int(r), w, f))
    bad = read_list(HERE / "blocklist.txt") | read_list(HERE / "start_exclude.txt")
    out = {}
    for size, limit in POOLS.items():
        need_vowels = 1 if size == 3 else 2
        pool = []
        for r, w, f in ranks:
            if r >= RANK_LIMIT[size] or len(w) != size or w in pool:
                continue
            if w not in words or w in bad or oc.get(w) != ("noun-ok", "sing") or "p" in f:
                continue
            if "ъ" in w or sum(c in VOWELS for c in w) < need_vowels:
                continue
            pool.append(w)
            if len(pool) == limit:
                break
        out[size] = pool
    lines = [
        "// ФАЙЛ СГЕНЕРИРОВАН: python3 tools/dict/start_words.py — не править руками.",
        "// Пулы стартовых слов по размеру поля: частотные нарицательные существительные из игрового словаря.",
        "",
        "export const START_WORDS: Record<number, readonly string[]> = {",
    ]
    for size, pool in out.items():
        lines.append(f"  {size}: [")
        for i in range(0, len(pool), 10):
            lines.append("    " + ", ".join(f"'{w}'" for w in pool[i:i + 10]) + ",")
        lines.append("  ],")
    lines += [
        "};",
        "",
        "/** Случайное стартовое слово для поля size; для неизвестного размера — ошибка. */",
        "export function pickStartWord(size: number, rnd: () => number = Math.random): string {",
        "  const pool = START_WORDS[size];",
        "  if (pool === undefined || pool.length === 0) {",
        "    throw new Error('Нет стартовых слов для поля ' + size + '×' + size);",
        "  }",
        "  const word = pool[Math.floor(rnd() * pool.length)]!;",
        "  if (word.length !== size) {",
        "    throw new Error('Стартовое слово \"' + word + '\" не подходит для поля ' + size + '×' + size);",
        "  }",
        "  return word;",
        "}",
        "",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    text = generate()
    if "--check" in sys.argv:
        ok = OUT.read_text(encoding="utf-8") == text
        print("OK: startWords.ts актуален" if ok else "FAIL: startWords.ts устарел — запустите start_words.py")
        sys.exit(0 if ok else 1)
    OUT.write_text(text, encoding="utf-8")
    print("startWords.ts записан,", len(text), "байт")
