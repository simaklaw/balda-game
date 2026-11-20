#!/usr/bin/env python3
"""Из nouns.csv проекта OpenRussian (Badestrand/russian-dictionary, CC BY-SA 4.0) делает sources/openrussian-nouns.tsv:
порядковый номер (файл отсортирован по частотности — это ПРОКСИ частотности, не НКРЯ), слово, флаги.
Использование: python3 -I tools/dict/extract_openrussian.py /путь/к/nouns.csv
Колонки: rank \t word \t flags, flags: p=pl_only, s=sg_only, i=indeclinable, a=animate ('-' если нет)."""
import csv, hashlib, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import SRC, WORD_RE, norm

path = Path(sys.argv[1])
rows = list(csv.DictReader(path.open(encoding="utf-8"), delimiter="\t"))
out, seen = [], set()
for i, r in enumerate(rows):
    w = norm(r["bare"])
    if not WORD_RE.fullmatch(w) or w in seen:
        continue
    seen.add(w)
    flags = "".join(c for c, k in (("p", "pl_only"), ("s", "sg_only"), ("i", "indeclinable"), ("a", "animate")) if r.get(k) == "1") or "-"
    out.append(f"{i}\t{w}\t{flags}\n")
(SRC / "openrussian-nouns.tsv").write_text("".join(out), encoding="utf-8")
meta = SRC / "sources.json"
m = json.loads(meta.read_text(encoding="utf-8")) if meta.exists() else {}
m["openrussian"] = {"file": "nouns.csv (Badestrand/russian-dictionary; порядок строк = частотность)", "license": "CC BY-SA 4.0",
                    "url": "https://github.com/Badestrand/russian-dictionary", "rawSha256": hashlib.sha256(path.read_bytes()).hexdigest()}
meta.write_text(json.dumps(m, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(f"openrussian-nouns.tsv: {len(out)} слов")
