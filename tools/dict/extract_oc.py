#!/usr/bin/env python3
"""Извлекает из сырого дампа OpenCorpora (dictionary.txt, формат Kaggle/OpenCorpora, CC BY-SA)
компактную выжимку sources/oc-extract.tsv: леммы-существительные + морфоанализ кандидатов контура B.
Использование: python3 -I tools/dict/extract_oc.py /путь/к/dictionary.txt
Строки: слово \t статус \t деталь. Статусы:
  noun-ok        sing|Pltm    лемма-существительное без исключающих граммем
  noun-plur      -            лемма-сущ. во мн.ч. без Pltm (не берём)
  noun-excluded  <граммемы>   только Name/Surn/Patr/Geox/Orgn/Trad/Abbr/Erro/Dist/Init
  nonnoun        <POS,...>    лемма только другой части речи
  form           лемма:POS:теги|...  слово-форма другой леммы (не лемма сама)"""
import hashlib, json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import SRC, WORD_RE, norm, candidates

EXC = {"Name", "Surn", "Patr", "Geox", "Orgn", "Trad", "Abbr", "Erro", "Dist", "Init"}
SPLIT = re.compile(r"[ ,]")


def main(path: str):
    cand = candidates(for_extract=True)
    ok, plur, excl, nonnoun, forms = {}, set(), {}, {}, {}
    with open(path, encoding="utf-8") as f:
        state, lemma = 0, ""
        for line in f:
            line = line.rstrip("\n")
            if not line:
                state = 0
                continue
            if state == 0:
                state = 1
                continue
            w, _, tags = line.partition("\t")
            wn = norm(w)
            if state == 1:
                state, lemma = 2, wn
                gs = set(SPLIT.split(tags))
                pos = tags.split(",")[0].split(" ")[0]
                if not WORD_RE.fullmatch(wn):
                    continue
                if pos == "NOUN":
                    bad = sorted(gs & EXC)
                    if bad:
                        excl.setdefault(wn, bad[0])
                    elif "Pltm" in gs:
                        ok[wn] = "Pltm"
                    elif "plur" in gs:
                        plur.add(wn)
                    else:
                        ok.setdefault(wn, "sing")
                else:
                    nonnoun.setdefault(wn, set()).add(pos)
            elif wn in cand and wn != lemma:
                fl = forms.setdefault(wn, [])
                rec = f"{lemma}:{tags.split(',')[0].split(' ')[0]}:{tags}"
                if len(fl) < 3 and rec not in fl:
                    fl.append(rec)
    rows = [(w, "noun-ok", v) for w, v in ok.items()]
    for w in cand - set(ok):
        if w in plur:
            rows.append((w, "noun-plur", "-"))
        elif w in excl:
            rows.append((w, "noun-excluded", excl[w]))
        elif w in nonnoun:
            rows.append((w, "nonnoun", ",".join(sorted(nonnoun[w]))))
        elif w in forms:
            rows.append((w, "form", "|".join(forms[w])))
    rows.sort()
    (SRC / "oc-extract.tsv").write_text("".join("\t".join(r) + "\n" for r in rows), encoding="utf-8")
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    meta = SRC / "sources.json"
    m = json.loads(meta.read_text(encoding="utf-8")) if meta.exists() else {}
    m["opencorpora"] = {"file": "dictionary.txt (Kaggle rtatman/opencorpora-russian, дамп OpenCorpora 2019)",
                        "license": "CC BY-SA 3.0 (по данным проекта OpenCorpora; лицензию набора на Kaggle проверить)",
                        "url": "https://opencorpora.org/", "rawSha256": h.hexdigest(), "rawBytes": Path(path).stat().st_size}
    meta.write_text(json.dumps(m, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"oc-extract.tsv: {len(rows)} строк; noun-ok={len(ok)}")


if __name__ == "__main__":
    main(sys.argv[1])
