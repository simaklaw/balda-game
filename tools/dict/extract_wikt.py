#!/usr/bin/env python3
"""Из списка заголовков русского Викисловаря (rus_dict_wiktionary: слова с русским разделом, CC BY-SA 4.0)
берёт только пересечение с кандидатами → sources/wikt-witness.txt («второй свидетель» существования слова).
Использование: python3 -I tools/dict/extract_wikt.py /путь/к/russian_dictionary.txt"""
import hashlib, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import SRC, norm, read_words, candidates

titles = {norm(w) for w in read_words(Path(sys.argv[1]))}
w = sorted(candidates(for_extract=True) & titles)
(SRC / "wikt-witness.txt").write_text("".join(x + "\n" for x in w), encoding="utf-8")
print(f"wikt-witness.txt: {len(w)} слов")

meta = SRC / "sources.json"
m = json.loads(meta.read_text(encoding="utf-8")) if meta.exists() else {}
m["wiktionary-titles"] = {"file": "russian_dictionary.txt (EgorTatarnikov/rus_dict_wiktionary: заголовки с русским разделом, дамп ruwiktionary 2026-02)",
                          "license": "CC BY-SA 4.0", "url": "https://github.com/EgorTatarnikov/rus_dict_wiktionary",
                          "rawSha256": hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest()}
meta.write_text(json.dumps(m, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
