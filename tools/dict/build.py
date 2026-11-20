#!/usr/bin/env python3
"""Сборка игрового словаря: sources/* + blocklist/allowlist -> client/public/dict/words.txt, MANIFEST.json, rejected.tsv.
Детерминирован (тот же вход -> тот же выход побайтово), без сети и без LLM.

Источники (все закоммичены в tools/dict/sources/, получены скриптами extract_*.py из сырых дампов):
  oc-extract.tsv      OpenCorpora: леммы-существительные (контур A) + морфоанализ кандидатов (контур B)
  harrix-russian_nouns.txt, extra-candidates.txt   кандидаты контура B (сырые, без разметки части речи)
  wikt-witness.txt    кандидаты, найденные среди заголовков русского Викисловаря («второй свидетель»)
Правила решения для слова w (первое сработавшее):
  format            не [а-яе]{2,15} после ё→е                              -> отказ
  allowlist         есть в allowlist.txt (ручная вычитка, с обоснованием)   -> принято
  blocklist         есть в blocklist.txt (ТОЧНАЯ форма, не подстрока)       -> отказ
  oc-lemma          лемма-сущ. в OpenCorpora без Name/Surn/Patr/Geox/Orgn/Trad/Abbr/Erro/Dist/Init,
                    ед.ч. или Pltm                                         -> принято (контур A)
  --- далее только кандидаты контура B ---
  noun-plur         лемма-сущ. во мн.ч. без Pltm                           -> отказ
  proper-or-abbr    в OC только как имя/топоним/аббревиатура/ошибка        -> отказ
  not-noun-lemma    в OC только лемма другой части речи                    -> отказ
  variant-nom       И.п. ед.ч. орфографического варианта леммы (счастье) + свидетель Викисловаря -> принято
  form-of           падежная/числовая форма другой леммы                    -> отказ
  harrix+wikt       OC слова не знает, но есть в Викисловаре                -> принято
  unverified        OC слова не знает и в Викисловаре нет                   -> отказ (очередь вычитки)"""
import hashlib, json, sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import HERE, ROOT, SRC, WORD_RE, norm, read_words, candidates

OUT_DIR = ROOT / "client/public/dict"
MIN_LEN = 2


def read_list(p: Path) -> dict[str, str]:
    d = {}
    for line in p.read_text(encoding="utf-8").split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        word, _, why = line.partition("#")
        d[norm(word)] = why.strip()
    return d


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def load_oc() -> dict[str, tuple[str, str]]:
    oc = {}
    for line in (SRC / "oc-extract.tsv").read_text(encoding="utf-8").split("\n"):
        if line:
            w, st, detail = line.split("\t")
            oc[w] = (st, detail)
    return oc


def is_variant_nom(detail: str) -> bool:
    for rec in detail.split("|"):
        _, pos, tags = rec.split(":", 2)
        gs = set(tags.replace(",", " ").split())
        if pos == "NOUN" and {"sing", "nomn"} <= gs:
            return True
    return False


def decide(w, oc, wikt, block, allow):
    """-> (accepted: bool, reason: str)"""
    if not WORD_RE.fullmatch(w) or len(w) < MIN_LEN:
        return False, "format"
    if w in allow:
        return True, "allowlist"
    if w in block:
        return False, "blocklist"
    st, detail = oc.get(w, (None, ""))
    if st == "noun-ok":
        return True, "oc-lemma"
    if st == "noun-plur":
        return False, "noun-plur"
    if st == "noun-excluded":
        return False, f"proper-or-abbr:{detail}"
    if st == "nonnoun":
        return False, f"not-noun-lemma:{detail}"
    if st == "form":
        if w in wikt and is_variant_nom(detail):
            return True, "variant-nom"
        return False, "form-of:" + detail.split("|")[0].split(":")[0]
    return (True, "harrix+wikt") if w in wikt else (False, "unverified")


def build():
    oc = load_oc()
    wikt = {l for l in (SRC / "wikt-witness.txt").read_text(encoding="utf-8").split("\n") if l}
    block, allow = read_list(HERE / "blocklist.txt"), read_list(HERE / "allowlist.txt")
    cand = candidates()
    universe = set(cand) | {w for w, (st, _) in oc.items() if st == "noun-ok"} | set(allow)
    words, acc, rej, rejected = set(), Counter(), Counter(), []
    for w in sorted(universe):
        ok, why = decide(w, oc, wikt, block, allow)
        key = why.split(":")[0]
        if ok:
            words.add(w)
            acc[key] += 1
        else:
            rej[key] += 1
            rejected.append((w, why))
    out = ("\n".join(sorted(words)) + "\n").encode("utf-8")
    meta = json.loads((SRC / "sources.json").read_text(encoding="utf-8"))
    files = {n: sha((SRC / n).read_bytes()) for n in
             ("oc-extract.tsv", "wikt-witness.txt", "harrix-russian_nouns.txt", "extra-candidates.txt", "openrussian-nouns.tsv")}
    files.update({"blocklist.txt": sha((HERE / "blocklist.txt").read_bytes()),
                  "allowlist.txt": sha((HERE / "allowlist.txt").read_bytes())})
    manifest = {
        "sources": [
            {"name": "OpenCorpora (контур A: леммы + морфология)", "license": meta["opencorpora"]["license"],
             "url": meta["opencorpora"]["url"], "rawSha256": meta["opencorpora"]["rawSha256"],
             "committedExtract": "tools/dict/sources/oc-extract.tsv", "sha256": files["oc-extract.tsv"]},
            {"name": "Harrix/Russian-Nouns (кандидаты; основа — ODict/Ефремова)", "license": "MIT",
             "url": "https://github.com/Harrix/Russian-Nouns",
             "file": "tools/dict/sources/harrix-russian_nouns.txt", "sha256": files["harrix-russian_nouns.txt"]},
            {"name": "Русский Викисловарь — заголовки (свидетель существования)", "license": meta["wiktionary-titles"]["license"],
             "url": meta["wiktionary-titles"]["url"], "rawSha256": meta["wiktionary-titles"]["rawSha256"],
             "committedExtract": "tools/dict/sources/wikt-witness.txt", "sha256": files["wikt-witness.txt"]},
            {"name": "Неологизмы (кандидаты, принимаются только при подтверждении OC/Викисловарём)", "license": "факты (список слов)",
             "file": "tools/dict/sources/extra-candidates.txt", "sha256": files["extra-candidates.txt"]},
            {"name": "OpenRussian (только частотный прокси: порядок строк; не источник приёмки слов)", "license": meta["openrussian"]["license"],
             "url": meta["openrussian"]["url"], "rawSha256": meta["openrussian"]["rawSha256"],
             "committedExtract": "tools/dict/sources/openrussian-nouns.tsv", "sha256": files["openrussian-nouns.tsv"]},
        ],
        "rules": {"minLen": MIN_LEN, "maxLen": 15, "format": "^[а-яе]{2,15}$ после ё→е", "pos": ["NOUN"], "case": "nomn",
                  "number": "sing|Pltm",
                  "exclude": ["Name", "Surn", "Patr", "Geox", "Orgn", "Trad", "Abbr", "Erro", "Dist", "Init"],
                  "blocklist": "точные формы (tools/dict/blocklist.txt)", "allowlist": "tools/dict/allowlist.txt (приоритет над блок-листом)",
                  "decisionOrder": "см. docstring tools/dict/build.py"},
        "counts": {"total": len(words), "accepted": dict(sorted(acc.items())), "rejected": dict(sorted(rej.items()))},
        "inputSha256": dict(sorted(files.items())),
        "outputSha256": sha(out),
    }
    return out, manifest, rejected


def main():
    out, manifest, rejected = build()
    OUT_DIR.joinpath("words.txt").write_bytes(out)
    OUT_DIR.joinpath("MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    HERE.joinpath("rejected.tsv").write_text("".join(f"{w}\t{r}\n" for w, r in rejected), encoding="utf-8")
    c = manifest["counts"]
    print(f"words.txt: {c['total']} слов ({len(out)} Б); принято: {c['accepted']}; отклонено: {c['rejected']}; sha256 {manifest['outputSha256'][:12]}")


if __name__ == "__main__":
    main()
